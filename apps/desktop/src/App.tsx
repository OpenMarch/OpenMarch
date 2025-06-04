import Canvas from "@/components/canvas/Canvas";
import Toolbar from "@/components/toolbar/Toolbar";
import Inspector from "@/components/inspector/Inspector";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import StateInitializer from "@/components/singletons/StateInitializer";
import LaunchPage from "@/components/LaunchPage";
import { useEffect, useRef, useState } from "react";
import { FieldPropertiesProvider } from "@/context/fieldPropertiesContext";
import RegisteredActionsHandler from "@/utilities/RegisteredActionsHandler";
import TimelineContainer from "@/components/timeline/TimelineContainer";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import {
    CheckCircleIcon,
    WarningIcon,
    SealWarningIcon,
    InfoIcon,
    CircleNotchIcon,
} from "@phosphor-icons/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import TitleBar from "@/components/titlebar/TitleBar";
import { useUiSettingsStore } from "./stores/UiSettingsStore";
import Sidebar from "@/components/sidebar/Sidebar";

// app

function App() {
    const [databaseIsReady, setDatabaseIsReady] = useState(false);
    const { fetchUiSettings } = useUiSettingsStore();
    const pluginsLoadedRef = useRef(false);

    useEffect(() => {
        if (pluginsLoadedRef.current) return;
        pluginsLoadedRef.current = true;
        console.log("Loading plugins...");
        window.plugins
            ?.list()
            .then(async (pluginPaths: string[]) => {
                for (const path of pluginPaths) {
                    const pluginName =
                        path.split(/[/\\]/).pop() || "Unknown Plugin";
                    console.log(`Loading plugin: ${pluginName}`);
                    try {
                        const code = await window.plugins.get(path);
                        const script = document.createElement("script");
                        script.type = "text/javascript";
                        script.text = code;
                        document.body.appendChild(script);
                    } catch (error) {
                        console.error(
                            `Failed to load plugin ${pluginName}:`,
                            error,
                        );
                    }
                }
            })
            .then(() => {
                console.log("All plugins loaded.");
            });
    }, []);

    useEffect(() => {
        window.electron.databaseIsReady().then((result) => {
            setDatabaseIsReady(result);
        });
    }, []);

    useEffect(() => {
        fetchUiSettings();
    }, [fetchUiSettings]);

    return (
        <main className="bg-bg-1 text-text outline-accent flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden font-sans">
            {!databaseIsReady ? (
                <>
                    <LaunchPage setDatabaseIsReady={setDatabaseIsReady} />
                </>
            ) : (
                <TooltipProvider delayDuration={500} skipDelayDuration={500}>
                    <IsPlayingProvider>
                        <SelectedPageProvider>
                            <SelectedMarchersProvider>
                                <SelectedAudioFileProvider>
                                    <FieldPropertiesProvider>
                                        <StateInitializer />
                                        <RegisteredActionsHandler />
                                        <TitleBar />
                                        <div
                                            id="app"
                                            className="flex h-full min-h-0 w-full gap-8 px-8 pb-8"
                                        >
                                            <div
                                                id="workspace"
                                                className="flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                            >
                                                <Toolbar />
                                                <div className="relative flex h-full min-h-0 min-w-0 gap-8">
                                                    <Sidebar />
                                                    <SidebarModal />
                                                    <Canvas />
                                                </div>
                                                <TimelineContainer />
                                            </div>
                                            <Inspector />
                                        </div>
                                        <Toaster
                                            visibleToasts={6}
                                            toastOptions={{
                                                unstyled: true,
                                                classNames: {
                                                    title: "text-body text-text leading-none",
                                                    description:
                                                        "text-sub text-text",
                                                    toast: "p-20 flex gap-8 bg-modal rounded-6 border border-stroke font-sans w-full backdrop-blur-md shadow-modal",
                                                },
                                            }}
                                            icons={{
                                                success: (
                                                    <CheckCircleIcon
                                                        size={24}
                                                        className="text-green"
                                                    />
                                                ),
                                                info: (
                                                    <InfoIcon
                                                        size={24}
                                                        className="text-text"
                                                    />
                                                ),
                                                warning: (
                                                    <WarningIcon
                                                        size={24}
                                                        className="text-yellow"
                                                    />
                                                ),
                                                error: (
                                                    <SealWarningIcon
                                                        size={24}
                                                        className="text-red"
                                                    />
                                                ),
                                                loading: (
                                                    <CircleNotchIcon
                                                        size={24}
                                                        className="text-text"
                                                    />
                                                ),
                                            }}
                                        />
                                    </FieldPropertiesProvider>
                                </SelectedAudioFileProvider>
                            </SelectedMarchersProvider>
                        </SelectedPageProvider>
                    </IsPlayingProvider>
                </TooltipProvider>
            )}
        </main>
    );
}

export default App;
