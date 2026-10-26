import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslate } from "@tolgee/react";
import { XIcon } from "@phosphor-icons/react";
import { SettingsBody } from "@/settings/SettingsWindow";
import { OPEN_SETTINGS_EVENT } from "@/utilities/settingsSheet";

/**
 * Settings in the web editor: a full-screen sheet over the app, where
 * Electron opens a settings window. It shows the same sections; changes
 * apply at once, since they go to the same stores in the same page.
 */
export default function WebSettingsSheet() {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onOpen = () => setOpen(true);
        window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
    }, []);

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/30" />
                <Dialog.Content
                    aria-describedby={undefined}
                    // Keys typed here are for the settings, not the app's
                    // shortcuts behind the sheet (e.g. Space to play).
                    onKeyDown={(event) => event.stopPropagation()}
                    onEscapeKeyDown={(event) => {
                        // A shortcut being recorded takes its own Escape
                        if (event.defaultPrevented) event.preventDefault();
                    }}
                    className="app-frame bg-bg-1 text-text animate-scale-in fixed inset-0 z-50 flex flex-col font-sans outline-hidden"
                >
                    <header className="flex shrink-0 items-center justify-between gap-12 py-8 pr-8 pl-24">
                        <Dialog.Title className="text-h4">
                            {t("settings.title", "Settings")}
                        </Dialog.Title>
                        <Dialog.Close
                            aria-label={t(
                                "layout.closeSettings",
                                "Close settings",
                            )}
                            className="text-text-subtitle hover:text-text hover:bg-fg-1 rounded-6 focus-visible:ring-accent touch:size-44 flex size-32 items-center justify-center focus-visible:ring-1"
                        >
                            <XIcon size={20} />
                        </Dialog.Close>
                    </header>
                    <SettingsBody />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
