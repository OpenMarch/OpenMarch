import ThemeSwitcher from "../titlebar/ThemeSwitcher";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "../ui/Dialog";
import { GearSix } from "@phosphor-icons/react";

export default function SettingsModal() {
    return (
        <Dialog>
            <DialogTrigger
                asChild
                className="titlebar-button flex cursor-pointer items-center gap-6 outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
            >
                <GearSix size={18} />
            </DialogTrigger>
            <DialogContent className="w-[10rem]">
                <DialogTitle>Settings</DialogTitle>
                <div className="flex flex-col gap-48">
                    <div className="flex flex-col gap-16">
                        <div className="flex w-full items-center justify-between gap-16">
                            <p className="text-body">Theme</p>
                            <ThemeSwitcher />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
