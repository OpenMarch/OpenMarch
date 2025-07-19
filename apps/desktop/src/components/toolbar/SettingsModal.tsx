import { GearSixIcon } from "@phosphor-icons/react";
import SettingsContent from "../launchpage/settings/SettingsContent";
import { T } from "@tolgee/react";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
} from "@openmarch/ui";

export default function SettingsModal() {
    return (
        <Dialog>
            <DialogTrigger className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                <GearSixIcon size={24} />
                <T keyName={"toolbar.settings"} />
            </DialogTrigger>

            <DialogContent className="max-h-[36rem] overflow-y-auto">
                <div className="flex w-full items-center justify-between">
                    <DialogTitle>
                        <T keyName="settings.title" />
                    </DialogTitle>
                </div>
                <SettingsContent />
            </DialogContent>
        </Dialog>
    );
}
