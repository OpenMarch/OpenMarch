import { Description as DialogDescription } from "@radix-ui/react-dialog";
import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { useTolgee } from "@tolgee/react";
import { useWebWelcomeStore } from "@/stores/WebWelcomeStore";

/**
 * Explains the web build. Opens once per device when the app first starts,
 * and again from the "Web" badge in the title bar.
 */
export default function WebWelcomeModal() {
    const { t } = useTolgee();
    const { open, setOpen } = useWebWelcomeStore();
    const save = window.electron.isMacOS ? "⌘S" : "Ctrl+S";

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="w-[40rem]">
                <DialogTitle>{t("welcome.title")}</DialogTitle>
                <div className="text-text-subtitle flex flex-col gap-16 text-sm">
                    <DialogDescription asChild>
                        <p className="text-text">{t("web.welcome.intro")}</p>
                    </DialogDescription>
                    <section className="flex flex-col gap-4">
                        <h3 className="text-text font-medium">
                            {t("web.welcome.savedTitle")}
                        </h3>
                        <p>{t("web.welcome.savedBody")}</p>
                    </section>
                    <section className="flex flex-col gap-4">
                        <h3 className="text-text font-medium">
                            {t("web.welcome.backUpTitle")}
                        </h3>
                        <p>{t("web.welcome.backUpBody", { save })}</p>
                    </section>
                    <section className="flex flex-col gap-4">
                        <h3 className="text-text font-medium">
                            {t("web.welcome.desktopTitle")}
                        </h3>
                        <p>{t("web.welcome.desktopBody")}</p>
                    </section>
                    <div className="flex justify-end pt-16">
                        <Button onClick={() => setOpen(false)}>
                            {t("web.gotIt")}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
