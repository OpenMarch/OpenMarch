import { Minus, Square, List, X, SealWarning } from "@phosphor-icons/react";
import FileControls from "./FileControls";
import SettingsModal from "../settings/SettingsModal";
import { useEffect, useState } from "react";
import { version as currentVersion } from "../../../package.json";
import VersionChecker from "../ui/VersionCheck";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    Button,
} from "@openmarch/ui";

export default function TitleBar({ noControls }: { noControls?: boolean }) {
    const isMacOS = window.electron.isMacOS;

    const [dbPath, setDbPath] = useState<string>("");
    const [dbPathError, setDbPathError] = useState<boolean>(false);

    useEffect(() => {
        const fetchDbPath = async () => {
            try {
                const path = await window.electron.databaseGetPath();
                setDbPath(path);
            } catch (error) {
                setDbPath(
                    "Failed to fetch .dots file path! Fully quit the app and try again. If the issue persists, please reach out to support",
                );
                setDbPathError(true);
                console.error("Error fetching database path:", error);
            }
        };

        fetchDbPath();
    }, []);

    return (
        <>
            <AlertDialog open={dbPathError}>
                <AlertDialogContent>
                    <div className="flex flex-col items-center gap-12">
                        <SealWarning size={48} className="text-red" />
                        <AlertDialogTitle>Database Path Error</AlertDialogTitle>
                        <AlertDialogDescription>
                            Failed to fetch .dots file path!
                            <br />
                            Please fully quit the app and try again.
                            <br />
                            If the issue persists, please reach out to support.
                        </AlertDialogDescription>
                        <AlertDialogAction>
                            <Button
                                variant="primary"
                                onClick={() => setDbPathError(false)}
                            >
                                Dismiss
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
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
                            <List size={18} />
                        </button>
                    )}
                    <div className="flex gap-12">
                        <p className="text-body leading-none">OpenMarch</p>
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
                            <Minus size={20} />
                        </button>
                        <button
                            className="hover:text-accent focus-visible:text-accent cursor-pointer px-16 py-8 outline-hidden duration-150 ease-out"
                            onClick={() => {
                                window.electron.maximizeWindow();
                            }}
                        >
                            <Square size={20} />
                        </button>
                        <button
                            className="hover:text-red focus-visible:text-red cursor-pointer px-16 py-8 pr-24 outline-hidden duration-150 ease-out"
                            onClick={() => {
                                window.electron.closeWindow();
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
