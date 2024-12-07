import { Minus, Square, List, X } from "@phosphor-icons/react";
import FileControls from "./FileControls";
import SettingsModal from "../settings/SettingsModal";
import { useEffect, useState } from "react";

export default function TitleBar({ noControls }: { noControls?: boolean }) {
    const isMacOS = window.electron.isMacOS;

    const [dbPath, setDbPath] = useState("");

    useEffect(() => {
        const fetchDbPath = async () => {
            try {
                const path = await window.electron.databaseGetPath();
                setDbPath(path);
            } catch (error) {
                setDbPath("Failed to fetch database path");
                console.error("Error fetching database path:", error);
            }
        };

        fetchDbPath();
    }, []);

    return (
        <div className="main-app-titlebar relative flex h-fit w-full items-center justify-between text-text">
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
                    <p className="text-body leading-none opacity-50">0.0.5b</p>
                </div>
                {!noControls && (
                    <>
                        <FileControls />
                        <SettingsModal />
                    </>
                )}
            </div>
            <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-sub">
                {dbPath}
            </p>
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
