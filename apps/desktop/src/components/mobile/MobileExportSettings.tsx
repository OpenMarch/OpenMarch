import {
    Dialog,
    DialogTrigger,
    Button,
    DialogContent,
    DialogTitle,
    Select,
} from "@openmarch/ui";
import { GearSixIcon } from "@phosphor-icons/react";
import DetachButton from "./DetachButton";
import MobileAudioFileSelector from "./MobileAudioFileSelector";

export const MobileExportSettingsDialog = () => {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="secondary">
                    <GearSixIcon size={16} /> Settings
                </Button>
            </DialogTrigger>
            <DialogContent className="flex h-fit w-full max-w-[512px] flex-col gap-16">
                <DialogTitle>Mobile app settings</DialogTitle>
                <MobileExportSettingsContent />
            </DialogContent>
        </Dialog>
    );
};

const MobileExportSettingsContent = () => {
    return (
        <div className="flex flex-col gap-16">
            <MobileAudioFileSelector />
            {/* Settings content will go here */}
            <DetachButton variant="secondary" />
        </div>
    );
};
