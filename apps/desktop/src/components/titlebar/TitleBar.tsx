import { MinusIcon, SquareIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import BugReport from "./BugReport";
import { SealWarningIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { version as currentVersion } from "../../../package.json";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    Button,
} from "@openmarch/ui";
import VersionChecker from "../VersionCheck";
import FileControls from "./FileControls";
import { T } from "@tolgee/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import MarcherLogo from "@/components/MarcherLogo";

// eslint-disable-next-line max-lines-per-function
export default function TitleBar({ showControls }: { showControls?: boolean }) {
    const isMacOS = window.electron.isMacOS;
    const { uiSettings } = useUiSettingsStore();

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

        void fetchDbPath();
    }, []);

    const displayDbPath = uiSettings.showFullDatabasePath
        ? dbPath
        : (dbPath
              .split(/[/\\]/)
              .filter((segment) => segment.length > 0)
              .pop() ?? dbPath);

    return (
        <>
            <AlertDialog open={dbPathError}>
                <AlertDialogContent>
                    <div className="flex flex-col items-center gap-12">
                        <SealWarningIcon size={48} className="text-red" />
                        <AlertDialogTitle>
                            <T keyName="titlebar.databasePathError" />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <T keyName="titlebar.databasePathError.description" />
                        </AlertDialogDescription>
                        <AlertDialogAction>
                            <Button
                                variant="primary"
                                onClick={() => setDbPathError(false)}
                            >
                                <T keyName="titlebar.databasePathError.dismiss" />
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
                            <ListIcon size={18} />
                        </button>
                    )}
                    <div className="flex items-center gap-12">
                        <MarcherLogo
                            width={8}
                            height={21}
                            className="text-accent"
                        />
                        <p className="text-body min-w-0 leading-none">
                            OpenMarch
                        </p>
                        <p className="text-body leading-none opacity-50">
                            {currentVersion}
                        </p>
                        <VersionChecker />
                        {showControls && <FileControls />}
                    </div>
                </div>
                <p className="text-sub absolute top-1/2 left-1/2 w-[30%] -translate-x-1/2 -translate-y-1/2 text-center">
                    {displayDbPath}
                </p>
                <div
                    className={`titlebar-button flex gap-12 ${isMacOS ? "pr-24" : ""}`}
                >
                    <BugReport />
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
            </div>
        </>
    );
}
