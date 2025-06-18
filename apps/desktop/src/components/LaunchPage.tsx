import { Button } from "@openmarch/ui";
import BugReport from "./titlebar/BugReport";
import ThemeSwitcher from "./titlebar/ThemeSwitcher";
import TitleBar from "./titlebar/TitleBar";
import clsx from "clsx";
import { FolderIcon, PlusIcon } from "@phosphor-icons/react";

interface LaunchPageProps {
    setDatabaseIsReady: (isReady: boolean) => void;
}

export default function LaunchPage({ setDatabaseIsReady }: LaunchPageProps) {
    return (
        <div className="from-bg-1 to-accent flex h-screen w-screen flex-col bg-linear-to-br from-[60%] to-[150%]">
            <TitleBar />
            <div
                className={clsx(
                    "text-text z-10 flex h-full min-h-0 w-full min-w-0 gap-8 p-8",
                )}
            >
                <Sidebar setDatabaseIsReady={setDatabaseIsReady} />
            </div>
        </div>
    );
}

function Sidebar({ setDatabaseIsReady }: LaunchPageProps) {
    async function handleCreateNew() {
        const dataBaseIsReady = await window.electron.databaseCreate();
        setDatabaseIsReady(dataBaseIsReady > 0);
    }

    async function handleOpenExisting() {
        const dataBaseIsReady = await window.electron.databaseLoad();
        setDatabaseIsReady(dataBaseIsReady > 0);
    }
    return (
        <div className="bg-fg-2 border-stroke rounded-6 flex h-full w-[300px] flex-col justify-between border p-12">
            <div className="flex flex-col gap-12">
                <p className="text-body text-text/60">Launch Page</p>
                <div className="flex gap-8">
                    <Button
                        className="h-fit w-full px-8 leading-none whitespace-nowrap"
                        onClick={handleCreateNew}
                    >
                        <PlusIcon size={24} />{" "}
                        <span className="h-fit leading-none whitespace-nowrap">
                            New File
                        </span>
                    </Button>
                    <Button
                        onClick={handleOpenExisting}
                        className="h-fit w-full px-8 leading-none whitespace-nowrap"
                        variant="secondary"
                    >
                        <FolderIcon size={24} />
                        <span className="h-fit leading-none whitespace-nowrap">
                            Open File
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
