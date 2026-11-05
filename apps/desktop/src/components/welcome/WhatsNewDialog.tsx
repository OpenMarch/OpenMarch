import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { useTranslate } from "@tolgee/react";
import { useActionHandler } from "@/shortcuts/useActionHandler";
import { useWhatsNewDialogStore } from "@/stores/WhatsNewDialogStore";
import WhatsNewTour from "./steps/WhatsNewTour";

/**
 * What's new at any time: the welcome flow's walkthrough, alone, in a dialog
 * over the launch page or the editor. Opened by the `showWhatsNew` action
 * (Help › What's new on the desktop, the title bar's menu on the web, the
 * command palette). It only shows the slides, and closing it saves nothing.
 * Mounted once for the whole app.
 */
export default function WhatsNewDialog() {
    const { t } = useTranslate();
    const open = useWhatsNewDialogStore((s) => s.open);
    const setOpen = useWhatsNewDialogStore((s) => s.setOpen);
    useActionHandler("showWhatsNew", () => setOpen(true));
    const close = () => setOpen(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {open && (
                <DialogContent
                    // The kit caps dialogs at 36rem tall; the slides need the window's height
                    className="max-h-[calc(100dvh-2rem)]! w-[min(50rem,calc(100vw-2rem))]"
                    aria-describedby={undefined}
                    data-testid="whats-new-dialog"
                >
                    {/* Mounted only while open, so it starts on the first slide each time */}
                    <WhatsNewTour
                        variant="dialog"
                        header={
                            <DialogTitle>{t("menu.help.whatsNew")}</DialogTitle>
                        }
                        onDone={close}
                        onSkip={close}
                        finishKey="welcomeFlow.whatsNew.done"
                    />
                </DialogContent>
            )}
        </Dialog>
    );
}
