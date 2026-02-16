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
import FocusNotice from "./components/FocusNotice";
import PropDrawingNotice from "./components/PropDrawingNotice";
import SvgPreviewHandler from "./utilities/SvgPreviewHandler";
import { useFullscreenStore } from "./stores/FullscreenStore";
import AnalyticsOptInModal from "./components/AnalyticsOptInModal";
import { attachCodegenListeners } from "@/components/canvas/listeners/CodegenListeners";
import ErrorBoundary from "./ErrorBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createAllUndoTriggers } from "./db-functions";
import { db } from "./global/database/db";
import { historyKeys } from "./hooks/queries/useHistory";
import tolgee from "./global/singletons/Tolgee";
import { InContextTools } from "@tolgee/web/tools";
import clsx from "clsx";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            networkMode: "offlineFirst",
        },
    },
});

function App() {
    const [databaseIsReady, setDatabaseIsReady] = useState(false);
    const [appCanvas, setAppCanvas] = useState<OpenMarchCanvas | undefined>(
        undefined,
    );
    const [analyticsConsent, setAnalyticsConsent] = useState<boolean | null>(
        null,
    );
    const {
        fetchUiSettings,
        uiSettings: { focussedComponent },
    } = useUiSettingsStore();
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
        console.debug("Loading plugins...");
        void window.plugins
            ?.list()
            .then(async (pluginPaths: string[]) => {
                for (const path of pluginPaths) {
                    const pluginName =
                        path.split(/[/\\]/).pop() || "Unknown Plugin";
                    console.debug(`Loading plugin: ${pluginName}`);
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
                console.debug("All plugins loaded.");
            });
    }, []);

    useEffect(() => {
        // Check if database is ready
        void window.electron.databaseIsReady().then((result: boolean) => {
            setDatabaseIsReady(result);
        });
    }, []);

    useEffect(() => {
        fetchUiSettings();
    }, [fetchUiSettings]);

    /**
     * Invalidate history queries when a mutation is added.
     * This is to keep the UI fresh for when an undo/redo is available.
     */
    useEffect(() => {
        const unsubscribe = queryClient
            .getMutationCache()
            .subscribe((event) => {
                if (event?.type === "updated") {
                    void queryClient.invalidateQueries({
                        queryKey: historyKeys.all(),
                    });
                }
            });
        return () => unsubscribe();
    }, [databaseIsReady]);

    useEffect(() => {
        void window.electron
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
            void window.electron.codegen.clearMouseActions();
            const cleanup = attachCodegenListeners(appCanvas);
            return cleanup;
        }
    }, [appCanvas, isCodegen]);

    useEffect(() => {
        if (databaseIsReady)
            createAllUndoTriggers(db).catch((error) => {
                console.error("Error creating undo triggers:", error);
            });
    }, [databaseIsReady]);

    // Inject Tolgee API key
    useEffect(() => {
        async function injectTolgeeApiKey() {
            const tolgeeDevTools = await window.electron.invoke(
                "settings:get",
                "tolgeeDevTools",
            );
            const tolgeeApiKey = await window.electron.invoke(
                "settings:get",
                "tolgeeApiKey",
            );
            if (tolgeeDevTools && tolgeeApiKey) {
                tolgee.updateOptions({
                    apiKey: tolgeeApiKey,
                });
                tolgee.addPlugin(InContextTools());
            }
        }
        void injectTolgeeApiKey();
    }, []);

    const timelineFocussedClass = clsx({
        "opacity-30": focussedComponent === "timeline",
    });

    return (
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                {process.env.NODE_ENV !== "production" && (
                    <ReactQueryDevtools initialIsOpen={false} />
                )}
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
                                            <StateInitializer />
                                            <RegisteredActionsHandler />
                                            <SvgPreviewHandler />
                                            <TitleBar showControls />
                                            <FocusNotice />
                                            <PropDrawingNotice />
                                            <div
                                                id="app"
                                                className="flex h-full min-h-0 w-full gap-8 px-8 pb-8"
                                            >
                                                <div
                                                    id="workspace"
                                                    className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                                >
                                                    <div
                                                        className={
                                                            timelineFocussedClass
                                                        }
                                                    >
                                                        <Toolbar />
                                                    </div>
                                                    <div
                                                        className={clsx(
                                                            "relative flex h-full min-h-0 min-w-0 gap-8",
                                                            timelineFocussedClass,
                                                        )}
                                                    >
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
                                                {!isFullscreen && (
                                                    <div
                                                        className={
                                                            timelineFocussedClass
                                                        }
                                                    >
                                                        <Inspector />
                                                    </div>
                                                )}
                                            </div>
                                            <Toaster />
                                        </SelectedAudioFileProvider>
                                    </SelectedMarchersProvider>
                                </SelectedPageProvider>
                            </IsPlayingProvider>
                        </TooltipProvider>
                    )}
                </main>
            </QueryClientProvider>
        </ErrorBoundary>
    );
}

export default App;
