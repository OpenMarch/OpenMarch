import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { useTranslate } from "@tolgee/react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    shouldHintInspector,
    type InspectorLayout,
} from "@/utilities/inspectorLayout";

const NO_MARCHERS: never[] = [];

/** How long the tab glows after a selection while the Inspector is closed. */
const HINT_MS = 2500;

/**
 * Places the Inspector by `layout` (see utilities/inspectorLayout.ts), with
 * a tab on the right edge, at mid-height, that shows and hides it, within
 * reach of a thumb holding the tablet.
 *
 * - `"fixed"`: just the Inspector beside the field, as on the desktop.
 * - `"side"`: beside the field; the tab hangs on the field's right edge.
 * - `"drawer"`: over the field and the timeline from the right, with a
 *   shade behind it. Tapping the shade only closes it (it never reaches the
 *   field), as do the tab and Escape. Opening it never resizes the field.
 *
 * Render it inside a `relative` box covering the content area (for the
 * drawer), after the field. The shade and drawer are z-50, after the field
 * in the page, so they cover the field's floating controls (z-50 at most);
 * menus and dialogs portaled to the end of the page still open above.
 */
export default function InspectorDock({
    layout,
    onOpenChange,
    className,
    children,
}: {
    layout: InspectorLayout;
    onOpenChange: (open: boolean) => void;
    /** Added to the panel and its tab (e.g. dimming). */
    className?: string;
    children: ReactNode;
}) {
    const { presentation, open } = layout;
    const drawer = presentation === "drawer";
    const hint = useSelectionHint(layout);

    useEffect(() => {
        if (!drawer || !open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onOpenChange(false);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [drawer, open, onOpenChange]);

    return (
        <>
            {drawer && open && (
                <div
                    data-testid="inspector-scrim"
                    aria-hidden
                    onClick={() => onOpenChange(false)}
                    className="animate-fade-in absolute inset-0 z-50 touch-none bg-black/20"
                />
            )}
            <div
                id="inspector-dock"
                data-presentation={presentation}
                className={clsx(
                    className,
                    presentation === "fixed" && "contents",
                    presentation === "side" &&
                        clsx("relative flex shrink-0", !open && "-ml-8"),
                    drawer &&
                        clsx(
                            // Full height but only its tab and panel take
                            // presses, so it never covers what's under it at
                            // the screen's edge (e.g. the timeline zoom)
                            "pointer-events-none absolute top-0 bottom-8 z-50 flex items-center *:pointer-events-auto",
                            open ? "right-8" : "right-0",
                        ),
                )}
            >
                {presentation !== "fixed" && (
                    <InspectorTab
                        open={open}
                        hint={hint}
                        onToggle={() => onOpenChange(!open)}
                        className={clsx(
                            presentation === "side" &&
                                "absolute top-1/2 right-full z-30 -translate-y-1/2",
                        )}
                    />
                )}
                {/* Hidden rather than unmounted, so edits in it survive */}
                <div
                    id="inspector-panel"
                    className={clsx(
                        !open && "hidden",
                        drawer &&
                            // bg-fg-1 is see-through; the drawer is over the field
                            "shadow-modal rounded-6 bg-bg-1 animate-scale-in h-full self-stretch",
                    )}
                >
                    {children}
                </div>
            </div>
        </>
    );
}

/**
 * Whether to draw attention to the tab: briefly, when marchers get selected
 * while the Inspector is closed, so people find where their details are.
 */
function useSelectionHint(layout: InspectorLayout): boolean {
    const selectedMarchers =
        useSelectedMarchers()?.selectedMarchers ?? NO_MARCHERS;
    const previous = useRef<number[]>([]);
    const [hint, setHint] = useState(false);
    useEffect(() => {
        const ids = selectedMarchers.map((marcher) => marcher.id);
        const show = shouldHintInspector(previous.current, ids, layout);
        previous.current = ids;
        if (!show) return;
        setHint(true);
        const timer = setTimeout(() => setHint(false), HINT_MS);
        return () => clearTimeout(timer);
        // Only a new selection starts a hint
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMarchers]);
    useEffect(() => {
        if (layout.open) setHint(false);
    }, [layout.open]);
    return hint;
}

function InspectorTab({
    open,
    hint,
    onToggle,
    className,
}: {
    open: boolean;
    hint: boolean;
    onToggle: () => void;
    className?: string;
}) {
    const { t } = useTranslate();
    const label = open
        ? t("layout.hideInspector", "Hide inspector")
        : t("layout.showInspector", "Show inspector");
    const Icon = open ? CaretRightIcon : CaretLeftIcon;
    return (
        // The button is the finger-sized hit area; the tab inside is what shows.
        <button
            type="button"
            onClick={onToggle}
            aria-label={label}
            aria-expanded={open}
            aria-controls="inspector-panel"
            title={label}
            data-testid="inspector-tab"
            data-hint={hint || undefined}
            className={clsx(
                "group touch:min-h-88 touch:w-44 touch:h-auto touch:py-8 flex h-64 w-20 shrink-0 items-center justify-end",
                className,
            )}
        >
            <span
                className={clsx(
                    "border-stroke bg-bg-1 bg-fg-1 text-text group-hover:text-accent group-focus-visible:outline-accent touch:h-auto touch:w-32 touch:flex-col touch:gap-6 touch:py-12 rounded-l-8 relative flex h-56 w-20 items-center justify-center border border-r-0 shadow-sm transition-colors",
                    hint &&
                        "border-accent text-accent ring-accent/40 animate-pulse ring-4",
                )}
            >
                <Icon size={16} weight="bold" />
                {/* In touch mode the tab says what it opens, written down the edge */}
                <span className="text-sub touch:block hidden font-medium [writing-mode:vertical-rl]">
                    {t("inspector.title", "Inspector")}
                </span>
                {hint && (
                    <span className="bg-accent absolute top-6 left-4 size-6 rounded-full" />
                )}
            </span>
        </button>
    );
}
