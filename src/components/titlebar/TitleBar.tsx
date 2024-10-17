import { Minus, Square, List, X } from "@phosphor-icons/react";
import FileControls from "./FileControls";
import ThemeSwitcher from "./ThemeSwitcher";

export default function TitleBar() {
    const isMacOS = window.electron.isMacOS;

    return (
        <div className="main-app-titlebar flex h-fit w-full items-center justify-between text-text">
            <div
                className={`flex items-center gap-20 px-24 py-8 ${isMacOS && "ml-64"}`}
            >
                {!isMacOS && (
                    <button
                        className="titlebar-button cursor-pointer outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4"
                        onClick={() => {
                            window.electron.openMenu();
                        }}
                    >
                        <List size={18} />
                    </button>
                )}
                <div className="flex gap-12">
                    <p className="text-body leading-none">OpenMarch</p>
                    <p className="text-body leading-none opacity-50">0.0.2</p>
                </div>
                <FileControls />
                <ThemeSwitcher />
            </div>
            {!isMacOS && (
                <div className="titlebar-button flex">
                    <button
                        className="cursor-pointer px-16 py-8 outline-none duration-150 ease-out hover:text-accent focus-visible:text-accent"
                        onClick={() => {
                            window.electron.minimizeWindow();
                        }}
                    >
                        <Minus size={20} />
                    </button>
                    <button
                        className="cursor-pointer px-16 py-8 outline-none duration-150 ease-out hover:text-accent focus-visible:text-accent"
                        onClick={() => {
                            window.electron.maximizeWindow();
                        }}
                    >
                        <Square size={20} />
                    </button>
                    <button
                        className="cursor-pointer px-16 py-8 pr-24 outline-none duration-150 ease-out hover:text-red focus-visible:text-red"
                        onClick={() => {
                            window.electron.closeWindow();
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
