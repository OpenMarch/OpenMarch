import ThemeSwitcher from "../titlebar/ThemeSwitcher";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "../ui/Dialog";
import { GearSix } from "@phosphor-icons/react";

export default function SettingsModal() {
    function SettingsModalContents() {
        return (
            <div className="flex flex-col gap-48">
                <div className="flex flex-col gap-16">
                    <div className="flex w-full items-center justify-between gap-16">
                        <p className="text-body">Theme</p>
                        <ThemeSwitcher />
                    </div>
                    <div className="flex w-full items-center justify-between gap-16">
                        <p className="text-body">Language</p>
                        <select className="rounded-md border-border bg-background h-32 w-full border px-16 text-body outline-none duration-150 ease-out focus-visible:-translate-y-4 focus-visible:border-accent focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50">
                            <option value="en-US">
                                English (United States)
                            </option>
                            <option value="jp">Japanese</option>
                        </select>
                    </div>
                </div>
            </div>
        );
    }

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
                <SettingsModalContents />
            </DialogContent>
        </Dialog>
    );
}
