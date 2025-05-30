import Canvas from "@/components/canvas/Canvas";
import Toolbar from "@/components/toolbar/Toolbar";
import Sidebar from "@/components/sidebar/Sidebar";
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
    CheckCircle,
    Warning,
    SealWarning,
    Info,
    CircleNotch,
} from "@phosphor-icons/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import TitleBar from "./components/titlebar/TitleBar";
import { useUiSettingsStore } from "./stores/UiSettingsStore";

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
                    console.log(`Loading plugin: ${path}`);
                    try {
                        const code = await window.plugins.get(path);
                        const script = document.createElement("script");
                        script.type = "text/javascript";
                        script.text = code;
                        document.body.appendChild(script);
                    } catch (error) {
                        console.error(`Failed to load plugin ${path}:`, error);
                    }
                }
            })
            .then(() => {
                console.log("All plugins loaded.");
            });
    }, []);

    useEffect(() => {
        console.log("Loading plugins...");
        window.plugins?.list().then(async (pluginPaths: string[]) => {
            for (const path of pluginPaths) {
                try {
                    const code = await window.plugins.get(path);
                    if (/module\.exports|require\(/.test(code)) {
                        console.warn(
                            `Plugin ${path} uses CommonJS and will not work in the browser context.`,
                        );
                        continue;
                    }
                    const script = document.createElement("script");
                    script.type = "text/javascript";
                    script.text = code;
                    document.body.appendChild(script);
                    console.log(`Plugin loaded: ${path}`);
                } catch (error) {
                    console.error(`Failed to load plugin ${path}:`, error);
                }
            }
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
                                            <Sidebar />
                                            <div
                                                id="workspace"
                                                className="flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                            >
                                                <Toolbar />
                                                <div className="relative h-full min-h-0">
                                                    <SidebarModal />
                                                    <Canvas />
                                                </div>
                                                <TimelineContainer />
                                            </div>
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
                                                    <CheckCircle
                                                        size={24}
                                                        className="text-green"
                                                    />
                                                ),
                                                info: (
                                                    <Info
                                                        size={24}
                                                        className="text-text"
                                                    />
                                                ),
                                                warning: (
                                                    <Warning
                                                        size={24}
                                                        className="text-yellow"
                                                    />
                                                ),
                                                error: (
                                                    <SealWarning
                                                        size={24}
                                                        className="text-red"
                                                    />
                                                ),
                                                loading: (
                                                    <CircleNotch
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
