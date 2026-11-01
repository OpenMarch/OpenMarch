import { type RefObject, useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { T, useTolgee } from "@tolgee/react";
import {
    ArrowsOutIcon,
    MinusIcon,
    SquareIcon,
    XIcon,
} from "@phosphor-icons/react";
import Keycaps from "@/components/ui/Keycaps";
import { isTextEntry } from "@/hooks/useOnScreenKeyboard";
import { formatBindingKeys } from "@/shortcuts/bindings";
import { isMacPlatform } from "@/shortcuts/platform";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { isWebBuild } from "@/utilities/webBuild";
import {
    isWindowTooSmall,
    MIN_WINDOW_HEIGHT,
    MIN_WINDOW_WIDTH,
} from "@/utilities/windowTooSmall";

/** How long the window stays too small before the notice shows, so a resize
 * or a tablet turning doesn't flash it. */
const SHOW_DELAY_MS = 300;

/** Whether a text field has focus, kept current. */
function useTextEntryFocused() {
    const [focused, setFocused] = useState(() =>
        isTextEntry(document.activeElement),
    );
    useEffect(() => {
        const update = () => setFocused(isTextEntry(document.activeElement));
        // focusout fires before focus lands on the next element
        const onFocusOut = () => setTimeout(update);
        document.addEventListener("focusin", update);
        document.addEventListener("focusout", onFocusOut);
        return () => {
            document.removeEventListener("focusin", update);
            document.removeEventListener("focusout", onFocusOut);
        };
    }, []);
    return focused;
}

/** Radix's open dialogs and alert dialogs (src/shortcuts/context.ts) */
const OPEN_DIALOG_SELECTOR =
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * Keeps the notice the top layer while it shows: a dialog that opens after
 * it (an error, a menu's Open) would otherwise take focus and the keyboard
 * from behind it, unseen. Returns a key that changes to mount the notice
 * again, on top.
 */
function useStaysTopLayer(
    shown: boolean,
    contentRef: RefObject<HTMLDivElement | null>,
) {
    const [layer, setLayer] = useState(0);
    useEffect(() => {
        if (!shown) return;
        const observer = new MutationObserver(() => {
            const open = document.querySelectorAll(OPEN_DIALOG_SELECTOR);
            const top = open[open.length - 1];
            if (top && contentRef.current && !contentRef.current.contains(top))
                setLayer((n) => n + 1);
        });
        observer.observe(document.body, { childList: true });
        return () => observer.disconnect();
    }, [shown, contentRef]);
    return layer;
}

/**
 * Covers the app while the window is too small to edit in, and says how to
 * make room. It is a modal alert dialog, so it sits above every other layer
 * and the app's shortcuts and focus stay out of reach behind it. The app
 * stays mounted underneath, so nothing is lost and it comes straight back
 * when the window grows.
 */
export default function WindowTooSmallNotice({
    size,
}: {
    size: { width: number; height: number };
}) {
    const { t } = useTolgee(["language"]);
    const isTouchMode = useIsTouchMode();
    const textEntryFocused = useTextEntryFocused();
    // A tablet's on-screen keyboard can make the window shorter while typing
    const keyboardMayBeOpen = isTouchMode && textEntryFocused;
    const tooSmall = isWindowTooSmall(size.width, size.height, {
        keyboardMayBeOpen,
    });
    const [shown, setShown] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!tooSmall) {
            setShown(false);
            return;
        }
        const timer = setTimeout(() => setShown(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [tooSmall]);

    const layer = useStaysTopLayer(shown, contentRef);

    // In the desktop app the window can't be smaller than the minimum, so
    // zoom is what made it too small
    const zoomedIn = !isWebBuild && window.electron.getZoomFactor() > 1;
    // The View menu's Zoom Out (electron/main/application-menu.ts)
    const zoomOut = formatBindingKeys("$mod+Minus", isMacPlatform());
    const hintKey = isWebBuild
        ? "layout.windowTooSmall.hintWeb"
        : zoomedIn
          ? "layout.windowTooSmall.hintZoomed"
          : "layout.windowTooSmall.hintDesktop";

    return (
        <AlertDialog.Root key={layer} open={shown}>
            <AlertDialog.Portal>
                <AlertDialog.Content
                    ref={contentRef}
                    data-testid="window-too-small"
                    // An alert dialog focuses its Cancel button, and this has none
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        contentRef.current?.focus();
                    }}
                    onEscapeKeyDown={(event) => event.preventDefault()}
                    className="bg-bg-1 text-text fixed inset-0 z-[1000000000] flex overflow-auto p-24 pt-48 font-sans outline-hidden"
                >
                    <WindowControls />
                    <div className="m-auto flex max-w-[26rem] flex-col items-center gap-12 text-center">
                        <ArrowsOutIcon size={40} className="text-accent" />
                        <AlertDialog.Title className="text-h4">
                            {t("layout.windowTooSmall.title")}
                        </AlertDialog.Title>
                        <AlertDialog.Description className="text-body">
                            {t("layout.windowTooSmall.body", {
                                minWidth: MIN_WINDOW_WIDTH,
                                minHeight: MIN_WINDOW_HEIGHT,
                            })}
                        </AlertDialog.Description>
                        <p className="text-body text-text-subtitle">
                            <T
                                keyName={hintKey}
                                params={{
                                    keys: () => <Keycaps keys={zoomOut} />,
                                }}
                            />
                        </p>
                        {/* Zoomed in, the size in page pixels isn't the window's */}
                        {!zoomedIn && (
                            <p className="text-sub text-text-subtitle">
                                {t("layout.windowTooSmall.current", {
                                    width: size.width,
                                    height: size.height,
                                })}
                            </p>
                        )}
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}

/**
 * The desktop app's window is frameless and the notice covers the title
 * bar, so it brings a drag strip and the title bar's window buttons along
 * (macOS draws its own traffic lights).
 */
function WindowControls() {
    const { t } = useTolgee(["language"]);
    if (isWebBuild) return null;
    return (
        <div className="main-app-titlebar fixed inset-x-0 top-0 flex h-40 justify-end">
            {!window.electron.isMacOS && (
                <div className="titlebar-button flex">
                    <button
                        className="hover:text-accent focus-visible:text-accent cursor-pointer px-16 py-8 outline-hidden"
                        aria-label={t("layout.windowTooSmall.minimize")}
                        onClick={() => window.electron.minimizeWindow()}
                    >
                        <MinusIcon size={20} />
                    </button>
                    <button
                        className="hover:text-accent focus-visible:text-accent cursor-pointer px-16 py-8 outline-hidden"
                        aria-label={t("layout.windowTooSmall.maximize")}
                        onClick={() => window.electron.maximizeWindow()}
                    >
                        <SquareIcon size={20} />
                    </button>
                    <button
                        className="hover:text-red focus-visible:text-red cursor-pointer px-16 py-8 pr-24 outline-hidden"
                        aria-label={t("layout.windowTooSmall.close")}
                        onClick={() => window.electron.closeWindow()}
                    >
                        <XIcon size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
