import SettingsContent from "../launchpage/settings/SettingsContent";
import { T } from "@tolgee/react";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { useAppDialogStore } from "@/stores/AppDialogStore";

/** The settings dialog. Mount once; open it with the openSettings action. */
export default function SettingsModal() {
    const { settingsOpen, setSettingsOpen } = useAppDialogStore();
    return (
        <>
            <style>{`.settings-modal + [data-radix-popper-content-wrapper],
                .settings-modal ~ [data-radix-popper-content-wrapper]{z-index:10000 !important;}`}</style>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="settings-modal overflow-y-auto">
                    <div className="flex w-full items-center justify-between">
                        <DialogTitle>
                            <T keyName="settings.title" />
                        </DialogTitle>
                    </div>
                    <SettingsContent />
                </DialogContent>
            </Dialog>
        </>
    );
}
