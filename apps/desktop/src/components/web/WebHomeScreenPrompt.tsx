import { Button, Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { Description as DialogDescription } from "@radix-ui/react-dialog";
import { ExportIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { useWebLibraryStore } from "@/stores/WebLibraryStore";

/**
 * Once, in Safari on an iPad: how to add OpenMarch to the Home Screen, so
 * the iPad keeps the shows (see utilities/homeScreen.ts). Shown in place of
 * the welcome on that visit.
 */
export default function WebHomeScreenPrompt() {
    const { t } = useTolgee(["language"]);
    const open = useWebLibraryStore((state) => state.homeScreenPromptOpen);
    const set = useWebLibraryStore((state) => state.set);
    const close = () => set({ homeScreenPromptOpen: false });
    return (
        <Dialog open={open} onOpenChange={(next) => !next && close()}>
            <DialogContent className="w-[32rem]">
                <DialogTitle>{t("web.homeScreen.title")}</DialogTitle>
                <DialogDescription className="text-body text-text-subtitle">
                    {t("web.homeScreen.why")}
                </DialogDescription>
                <ol className="text-body flex list-decimal flex-col gap-8 pl-24">
                    <li>
                        {t("web.homeScreen.step1")}{" "}
                        <ExportIcon
                            size={18}
                            aria-hidden
                            className="text-accent inline align-text-bottom"
                        />
                    </li>
                    <li>{t("web.homeScreen.step2")}</li>
                    <li>{t("web.homeScreen.step3")}</li>
                </ol>
                <p className="text-sub text-text-subtitle">
                    {t("web.homeScreen.note")}
                </p>
                <div className="flex justify-end">
                    <Button onClick={close}>{t("web.gotIt")}</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
