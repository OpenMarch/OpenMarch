import Canvas from "@/components/canvas/Canvas";
import Toolbar from "@/components/toolbar/Toolbar";
import Inspector from "@/components/inspector/Inspector";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import StateInitializer from "@/components/singletons/StateInitializer";
import LaunchPage from "@/components/launchpage/LaunchPage";
import { useEffect, useRef, useState } from "react";
import { FieldPropertiesProvider } from "@/context/fieldPropertiesContext";
import RegisteredActionsHandler from "@/utilities/RegisteredActionsHandler";
import TimelineContainer from "@/components/timeline/TimelineContainer";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import TitleBar from "@/components/titlebar/TitleBar";
import { useUiSettingsStore } from "./stores/UiSettingsStore";
import CanvasZoomControls from "@/components/canvas/CanvasZoomControls";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import Plugin from "./global/classes/Plugin";
import Sidebar from "@/components/sidebar/Sidebar";
import Toaster from "./components/ui/Toaster";
import SvgPreviewHandler from "./utilities/SvgPreviewHandler";
import { useFullscreenStore } from "./stores/FullscreenStore";
import AnalyticsOptInModal from "./components/AnalyticsOptInModal";
import { attachCodegenListeners } from "@/components/canvas/listeners/CodegenListeners";
import ErrorBoundary from "./ErrorBoundary";
import { T } from "@tolgee/react";

// The app

function App() {
    const [databaseIsReady, setDatabaseIsReady] = useState(false);
    const [appCanvas, setAppCanvas] = useState<OpenMarchCanvas | undefined>(
        undefined,
    );
    const [analyticsConsent, setAnalyticsConsent] = useState<boolean | null>(
        null,
    );
    const { fetchUiSettings } = useUiSettingsStore();
    const pluginsLoadedRef = useRef(false);
    const { isFullscreen } = useFullscreenStore();

    // Check if running in codegen mode
    const isCodegen = window.electron.isCodegen;
    if (isCodegen) {
        console.log("🎭 React app running in Playwright Codegen mode");
    }

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

                        let metadata = Plugin.getMetadata(code);

                        if (!metadata) {
                            throw new Error(
                                `Plugin ${pluginName} is missing metadata.`,
                            );
                        }

                        new Plugin(
                            metadata.name,
                            metadata.version,
                            metadata.description,
                            metadata.author,
                            pluginName,
                        );

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
        // Check if database is ready
        window.electron.databaseIsReady().then((result: boolean) => {
            setDatabaseIsReady(result);
        });
    }, []);

    useEffect(() => {
        fetchUiSettings();
    }, [fetchUiSettings]);

    useEffect(() => {
        window.electron
            .invoke("settings:get", "optOutAnalytics")
            .then((optOut) => {
                if (optOut === undefined) {
                    setAnalyticsConsent(null);
                } else {
                    setAnalyticsConsent(!optOut);
                }
            });
    }, []);

    useEffect(() => {
        if (appCanvas && isCodegen) {
            window.electron.codegen.clearMouseActions();
            const cleanup = attachCodegenListeners(appCanvas);
            return cleanup;
        }
    }, [appCanvas, isCodegen]);

    return (
        <ErrorBoundary>
            <main className="bg-bg-1 text-text outline-accent flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden font-sans">
                {analyticsConsent === null && !isCodegen && (
                    <AnalyticsOptInModal
                        onChoice={(choice) => setAnalyticsConsent(choice)}
                    />
                )}
                {/* Codegen mode indicator */}
                {isCodegen && (
                    <div className="bg-yellow px-16 py-8 text-center font-bold text-black">
                        🎭 PLAYWRIGHT CODEGEN MODE - Recording test actions
                    </div>
                )}
                {/* Always show LaunchPage when no file is selected, regardless of database state */}
                {!databaseIsReady ? (
                    <LaunchPage setDatabaseIsReady={setDatabaseIsReady} />
                ) : (
                    <TooltipProvider
                        delayDuration={500}
                        skipDelayDuration={500}
                    >
                        <IsPlayingProvider>
                            <SelectedPageProvider>
                                <SelectedMarchersProvider>
                                    <SelectedAudioFileProvider>
                                        <FieldPropertiesProvider>
                                            <StateInitializer />
                                            <RegisteredActionsHandler />
                                            <SvgPreviewHandler />
                                            <TitleBar showControls />
                                            <div
                                                id="app"
                                                className="flex h-full min-h-0 w-full gap-8 px-8 pb-8"
                                            >
                                                <div
                                                    id="workspace"
                                                    className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                                >
                                                    <Toolbar />
                                                    <div className="relative flex h-full min-h-0 min-w-0 gap-8">
                                                        {!isFullscreen && (
                                                            <>
                                                                <Sidebar />
                                                                <SidebarModal />
                                                            </>
                                                        )}
                                                        <Canvas
                                                            onCanvasReady={
                                                                setAppCanvas
                                                            }
                                                        />
                                                        <CanvasZoomControls
                                                            canvas={appCanvas}
                                                        />
                                                    </div>
                                                    <TimelineContainer />
                                                </div>
                                                {!isFullscreen && <Inspector />}
                                            </div>
                                            <Toaster />
                                        </FieldPropertiesProvider>
                                    </SelectedAudioFileProvider>
                                </SelectedMarchersProvider>
                            </SelectedPageProvider>
                        </IsPlayingProvider>
                    </TooltipProvider>
                )}
            </main>
        </ErrorBoundary>
    );
}

export default App;
