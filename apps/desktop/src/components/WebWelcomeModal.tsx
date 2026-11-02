import Shortcut from "@/components/ui/Shortcut";
import { Description as DialogDescription } from "@radix-ui/react-dialog";
import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { formatBinding } from "@/shortcuts/bindings";
import { useWebWelcomeStore } from "@/stores/WebWelcomeStore";
import { useWelcomeFlowStore } from "@/stores/WelcomeFlowStore";
import { webChannel } from "@/utilities/webBuild";

/**
 * Explains the web build. Opens once per device when the app first starts,
 * and again from the "Web" badge in the title bar. It waits while the welcome
 * flow is on screen.
 */
export default function WebWelcomeModal() {
    const { t } = useTolgee();
    const { open, setOpen } = useWebWelcomeStore();
    const welcomeFlowShowing = useWelcomeFlowStore((s) => s.showing);

    return (
        <Dialog open={open && !welcomeFlowShowing} onOpenChange={setOpen}>
            <DialogContent className="w-[40rem]">
                <DialogTitle>{t("welcome.title")}</DialogTitle>
                <div className="text-text-subtitle flex flex-col gap-16 text-sm">
                    <DialogDescription asChild>
                        <p className="text-text">{t("web.welcome.intro")}</p>
                    </DialogDescription>
                    {webChannel === "lab" && (
                        <p>
                            This is a test build of a feature that is still in
                            development, so expect rough edges. It opens with an
                            example show.
                        </p>
                    )}
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
                        <p>
                            <T
                                keyName="web.welcome.backUpBody"
                                params={{
                                    save: formatBinding(
                                        "$mod+S",
                                        window.electron.isMacOS,
                                    ),
                                    keys: () => (
                                        <Shortcut action="launchSaveFileDialogue" />
                                    ),
                                }}
                            />
                        </p>
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
