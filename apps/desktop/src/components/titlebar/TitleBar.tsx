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
import clsx from "clsx";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import MarcherLogo from "@/components/MarcherLogo";
import { isWebBuild, webChannel } from "@/utilities/webBuild";
import WebFileMenu from "./WebFileMenu";
import { useWebWelcomeStore } from "@/stores/WebWelcomeStore";

/** Page zoom changes the viewport's CSS size, so it always fires a resize. */
function usePageZoomFactor() {
    const [zoomFactor, setZoomFactor] = useState(() =>
        window.electron.getZoomFactor(),
    );
    useEffect(() => {
        const update = () => setZoomFactor(window.electron.getZoomFactor());
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);
    return zoomFactor;
}

type TitleBarProps =
    | {
          showControls?: boolean;
          /** "settings" is a minimal bar: no version, update check, file controls or file path. */
          variant?: "main" | "settings";
          windowTitle?: undefined;
      }
    | {
          /** A secondary window's title, such as the 3D View's. */
          windowTitle: string;
          isMacOS: boolean;
      };

/**
 * The app's title bar. With `windowTitle` it renders the slim bar for a
 * secondary window (the 3D View): the logo and the title, with the window
 * controls drawn by the system. That bar doesn't touch `window.electron`,
 * which secondary windows don't have, and makes no network requests.
 */
export default function TitleBar(props: TitleBarProps) {
    if (props.windowTitle !== undefined) {
        return (
            <SecondaryWindowTitleBar
                title={props.windowTitle}
                isMacOS={props.isMacOS}
            />
        );
    }
    return (
        <EditorTitleBar
            showControls={props.showControls}
            variant={props.variant}
        />
    );
}

function SecondaryWindowTitleBar({
    title,
    isMacOS,
}: {
    title: string;
    isMacOS: boolean;
}) {
    return (
        <div
            className="main-app-titlebar text-text relative flex h-fit w-full items-center"
            // Leave room for the system's window controls overlay.
            style={{
                paddingRight:
                    "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))",
            }}
        >
            <div
                className={`flex min-w-0 items-center gap-12 px-24 py-8 ${isMacOS ? "ml-64" : ""}`}
            >
                <MarcherLogo width={8} height={21} className="text-accent" />
                <p className="text-body min-w-0 truncate leading-none">
                    {title}
                </p>
            </div>
        </div>
    );
}

// eslint-disable-next-line max-lines-per-function
function EditorTitleBar({
    showControls,
    variant = "main",
}: {
    showControls?: boolean;
    variant?: "main" | "settings";
}) {
    const showFilePath = variant === "main";
    // In a browser there are no traffic lights, native menu or window buttons.
    const isMacOS = window.electron.isMacOS && !isWebBuild;
    const showWindowControls = !isMacOS && !isWebBuild;
    const showFullDatabasePath = useUiSettingsStore(
        (s) => s.uiSettings.showFullDatabasePath,
    );
    const zoomFactor = usePageZoomFactor();
    const openWebWelcome = useWebWelcomeStore((state) => state.setOpen);

    const [dbPath, setDbPath] = useState<string>("");
    const [dbPathError, setDbPathError] = useState<boolean>(false);

    useEffect(() => {
        if (!showFilePath) return;
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
    }, [showFilePath]);

    const displayDbPath = showFullDatabasePath
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
            <div
                className={clsx(
                    "main-app-titlebar text-text grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-12",
                    isMacOS && "titlebar-mac",
                )}
                // The traffic lights ignore page zoom, so the bar does too or they drift apart.
                style={isMacOS ? { zoom: 1 / zoomFactor } : undefined}
            >
                <div className="titlebar-leading flex items-center gap-20 px-24 py-8">
                    {isWebBuild && variant === "main" && <WebFileMenu />}
                    {showWindowControls && (
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
                        {variant === "main" && (
                            <>
                                <p className="text-body leading-none opacity-50">
                                    {currentVersion}
                                    {webChannel === "nightly" && " nightly"}
                                </p>
                                {isWebBuild && (
                                    <button
                                        type="button"
                                        className="bg-accent hover:bg-accent/80 focus-visible:ring-accent cursor-pointer rounded-full px-8 py-2 text-xs leading-none font-medium text-white outline-hidden duration-150 ease-out focus-visible:ring-2"
                                        onClick={() => openWebWelcome(true)}
                                    >
                                        Web
                                    </button>
                                )}
                                {!isWebBuild && <VersionChecker />}
                                {showControls && <FileControls />}
                            </>
                        )}
                    </div>
                </div>
                <p className="text-sub truncate text-center">
                    {showFilePath ? displayDbPath : null}
                </p>
                <div
                    className={`titlebar-button flex gap-12 ${isMacOS ? "pr-24" : ""}`}
                >
                    <BugReport />
                    {showWindowControls && (
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
