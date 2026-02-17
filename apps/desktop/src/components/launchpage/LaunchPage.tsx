import { Button, ListItem } from "@openmarch/ui";
import TitleBar from "../titlebar/TitleBar";
import clsx from "clsx";
import {
    DiscordLogoIcon,
    FolderIcon,
    GearSixIcon,
    GithubLogoIcon,
    LightbulbIcon,
    PatreonLogoIcon,
    PlusIcon,
    TShirtIcon,
} from "@phosphor-icons/react";
import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";
import SettingsContent from "./settings/SettingsContent";
import { T } from "@tolgee/react";
import FilesContent from "./files/FilesContent";
import LearnContent from "./learn/LearnContent";
import Toaster from "../ui/Toaster";

interface LaunchPageProps {
    setDatabaseIsReady: (isReady: boolean) => void;
}

export default function LaunchPage({ setDatabaseIsReady }: LaunchPageProps) {
    const [selectedTab, setSelectedTab] = useState("files");

    return (
        <div className="from-bg-1 to-accent flex h-screen w-screen flex-col bg-linear-to-br from-[60%] to-[150%]">
            <TitleBar />
            <Tabs.Root
                value={selectedTab}
                onValueChange={setSelectedTab}
                className={clsx(
                    "text-text z-10 flex h-full min-h-0 w-full min-w-0 gap-8 p-8",
                )}
            >
                <Sidebar
                    setDatabaseIsReady={setDatabaseIsReady}
                    selectedTab={selectedTab}
                />
                <FilesContent />
                <LearnContent />
                <Tabs.Content
                    value="settings"
                    className="flex w-full min-w-0 flex-col items-center overflow-y-auto p-6 select-text"
                >
                    <h3 className="text-h3 w-[512px] pb-16">
                        <T keyName="settings.title" />
                    </h3>
                    <SettingsContent />
                </Tabs.Content>
            </Tabs.Root>

            <Toaster />
        </div>
    );
}

function Sidebar({
    setDatabaseIsReady,
    selectedTab,
}: LaunchPageProps & { selectedTab: string }) {
    async function handleCreateNew() {
        console.log("Creating new file...");
        try {
            const dataBaseIsReady = await window.electron.databaseCreate();
            console.log("Database create result:", dataBaseIsReady);

            // If database creation was successful, update the state
            if (dataBaseIsReady === 200) {
                setDatabaseIsReady(true);
            }
        } catch (error) {
            console.error("Error creating new file:", error);
        }
    }

    async function handleOpenExisting() {
        console.log("Opening existing file...");
        try {
            const dataBaseIsReady = await window.electron.databaseLoad();
            console.log("Database load result:", dataBaseIsReady);

            // If database loading was successful, update the state
            if (dataBaseIsReady === 200) {
                setDatabaseIsReady(true);
            }
        } catch (error) {
            console.error("Error opening existing file:", error);
        }
    }
    return (
        <Tabs.List className="bg-fg-1 border-stroke rounded-6 flex h-full w-[350px] flex-col justify-between border p-12">
            <section className="flex flex-col gap-12">
                <p className="text-body text-text/60">
                    <T keyName="launchpage.title" />
                </p>
                <div className="flex min-w-0 gap-8">
                    <Button
                        className="h-fit w-full min-w-0 flex-shrink px-8 leading-tight"
                        onClick={handleCreateNew}
                    >
                        <PlusIcon size={24} className="flex-shrink-0" />
                        <span className="h-fit min-w-0 leading-tight break-words">
                            <T keyName="launchpage.files.createNew" />
                        </span>
                    </Button>
                    <Button
                        onClick={handleOpenExisting}
                        className="h-fit w-full min-w-0 flex-shrink px-8 leading-tight"
                        variant="secondary"
                    >
                        <FolderIcon size={24} className="flex-shrink-0" />
                        <span className="h-fit min-w-0 leading-tight break-words">
                            <T keyName="launchpage.files.openFile" />
                        </span>
                    </Button>
                </div>
                <div className="flex min-w-0 flex-col">
                    <Tabs.Trigger value="files">
                        <ListItem selected={selectedTab === "files"}>
                            <FolderIcon size={24} className="flex-shrink-0" />
                            <span className="min-w-0 break-words">
                                <T keyName="launchpage.files.title" />
                            </span>
                        </ListItem>
                    </Tabs.Trigger>
                    <Tabs.Trigger value="learn">
                        <ListItem selected={selectedTab === "learn"}>
                            <LightbulbIcon
                                size={24}
                                className="flex-shrink-0"
                            />
                            <span className="min-w-0 break-words">
                                <T keyName="launchpage.learn.title" />
                            </span>
                        </ListItem>
                    </Tabs.Trigger>
                </div>
            </section>
            <section className="flex flex-col gap-8">
                <div className="flex flex-col">
                    <div className="flex gap-8">
                        <a
                            href="https://discord.gg/eTsQ98uZzq"
                            target="_blank"
                            rel="noreferrer"
                            className={`rounded-6 border-stroke text-text bg-fg-2 hover:border-accent relative mb-8 flex h-[2.5rem] w-full items-center justify-center gap-8 overflow-clip border px-12 duration-150 ease-out`}
                        >
                            <DiscordLogoIcon size={24} />
                        </a>
                        <a
                            href="https://github.com/OpenMarch/OpenMarch"
                            target="_blank"
                            rel="noreferrer"
                            className={`rounded-6 border-stroke text-text bg-fg-2 hover:border-accent relative mb-8 flex h-[2.5rem] w-full items-center justify-center gap-8 overflow-clip border px-12 duration-150 ease-out`}
                        >
                            <GithubLogoIcon size={24} />
                        </a>
                        <a
                            href="https://www.patreon.com/openmarch"
                            target="_blank"
                            rel="noreferrer"
                            className={`rounded-6 border-stroke text-text bg-fg-2 hover:border-accent relative mb-8 flex h-[2.5rem] w-full items-center justify-center gap-8 overflow-clip border px-12 duration-150 ease-out`}
                        >
                            <PatreonLogoIcon size={24} />
                        </a>
                    </div>
                    <a
                        href="https://store.openmarch.com"
                        target="_blank"
                        rel="noreferrer"
                        className={`rounded-6 border-stroke text-text bg-fg-2 hover:border-accent relative mb-8 flex min-h-[2.5rem] w-full min-w-0 items-center justify-start gap-8 overflow-hidden border px-12 duration-150 ease-out`}
                    >
                        <TShirtIcon size={24} className="flex-shrink-0" />
                        <span className="min-w-0 break-words">
                            <T keyName="launchpage.merch" />
                        </span>
                        <div className="bg-accent absolute right-[5%] bottom-[-15%] -z-10 h-[1rem] w-[6rem] rounded-full opacity-75 blur-xl">
                            a
                        </div>
                    </a>
                </div>
                <hr className="border-stroke w-full border" />
                <div className="flex min-w-0 flex-col">
                    <Tabs.Trigger value="settings">
                        <ListItem selected={selectedTab === "settings"}>
                            <GearSixIcon size={24} className="flex-shrink-0" />
                            <span className="min-w-0 break-words">
                                <T keyName="launchpage.settings.title" />
                            </span>
                        </ListItem>
                    </Tabs.Trigger>
                </div>
            </section>
        </Tabs.List>
    );
}
