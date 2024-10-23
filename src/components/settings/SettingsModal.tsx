import ThemeSwitcher from "../titlebar/ThemeSwitcher";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "../ui/Dialog";
import FieldPropertiesSettings from "./FieldPropertiesSettings";
import { GearSix } from "@phosphor-icons/react";

export default function SettingsModal() {
    function SettingsModalContents() {
        return (
            <div className="flex flex-col gap-48">
                <FieldPropertiesSettings />
                <div className="flex flex-col gap-16">
                    <h4 className="text-h4">App Settings</h4>
                    <div className="flex w-full items-center justify-between gap-16">
                        <p className="text-body">Theme</p>
                        <ThemeSwitcher />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <Dialog>
            <DialogTrigger className="titlebar-button cursor-pointer outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50">
                <GearSix size={18} />
            </DialogTrigger>
            <DialogContent className="w-[50rem]">
                <DialogTitle>Project Settings</DialogTitle>
                <SettingsModalContents />
            </DialogContent>
        </Dialog>
    );
}
