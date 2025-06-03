import { MinusIcon, SquareIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import FileControls from "./FileControls";
import SettingsModal from "../settings/SettingsModal";
import { useEffect, useState } from "react";
import { version as currentVersion } from "../../../package.json";
import VersionChecker from "../VersionCheck";

export default function TitleBar({ noControls }: { noControls?: boolean }) {
    const isMacOS = window.electron.isMacOS;

    const [dbPath, setDbPath] = useState<string>("");

    useEffect(() => {
        const fetchDbPath = async () => {
            try {
                const path = await window.electron.databaseGetPath();
                setDbPath(path);
            } catch (error) {
                setDbPath(
                    "Failed to fetch .dots file path! Please reach out to support",
                );
                console.error("Error fetching database path:", error);
            }
        };

        fetchDbPath();
    }, []);

    return (
        <div className="main-app-titlebar text-text relative flex h-fit w-full items-center justify-between">
            <div
                className={`flex items-center gap-20 px-24 py-8 ${isMacOS && "ml-64"}`}
            >
                {!isMacOS && (
                    <button
                        className="titlebar-button hover:text-accent cursor-pointer outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                        onClick={() => {
                            window.electron.openMenu();
                        }}
                    >
                        <ListIcon size={18} />
                    </button>
                )}
                <div className="flex gap-12">
                    <p className="text-body min-w-0 leading-none">OpenMarch</p>
                    <p className="text-body leading-none opacity-50">
                        {currentVersion}
                    </p>
                    <VersionChecker />
                </div>
                {!noControls && (
                    <>
                        <FileControls />
                        <SettingsModal />
                    </>
                )}
            </div>
            <p className="text-sub absolute top-1/2 left-1/2 w-[30%] -translate-x-1/2 -translate-y-1/2 text-center">
                {dbPath}
            </p>
            {!isMacOS && (
                <div className="titlebar-button flex">
                    <button
                        className="hover:text-accent focus-visible:text-accent cursor-pointer px-16 py-8 outline-hidden duration-150 ease-out"
                        onClick={() => {
                            window.electron.minimizeWindow();
                        }}
                    >
                        <MinusIcon size={20} />
                    </button>
                    <button
                        className="hover:text-accent focus-visible:text-accent cursor-pointer px-16 py-8 outline-hidden duration-150 ease-out"
                        onClick={() => {
                            window.electron.maximizeWindow();
                        }}
                    >
                        <SquareIcon size={20} />
                    </button>
                    <button
                        className="hover:text-red focus-visible:text-red cursor-pointer px-16 py-8 pr-24 outline-hidden duration-150 ease-out"
                        onClick={() => {
                            window.electron.closeWindow();
                        }}
                    >
                        <XIcon size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
