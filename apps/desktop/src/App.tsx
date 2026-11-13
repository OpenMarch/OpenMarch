import { threeZoomControls } from "@/field/three/fieldNavigation";
import Toolbar from "@/components/toolbar/Toolbar";
import Inspector from "@/components/inspector/Inspector";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import StateInitializer from "@/components/singletons/StateInitializer";
import { View3dPublisher } from "@/view3d/sync/useView3dPublisher";
import TimelineResolverHost from "@/timeline/TimelineResolverHost";
import LaunchPage from "@/components/launchpage/LaunchPage";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import CommandPalette from "@/shortcuts/palette/CommandPalette";
import LongPressGuard from "@/components/ui/LongPressGuard";
import ExportCoordinatesModal from "@/components/exporting/ExportCoordinatesModal";
import ShortcutDispatcher from "@/shortcuts/ShortcutDispatcher";
import {
    EditorActionHandlers,
    FileActionHandlers,
} from "@/shortcuts/ActionHandlers";
import TimelineContainer from "@/components/timeline/TimelineContainer";
import { TimelineSplitter } from "@/components/timeline/TimelineSplitter";
import clsx from "clsx";
import { useTempoModeStore } from "@/tempo/tempoModeStore";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import TitleBar from "@/components/titlebar/TitleBar";
import { useUiSettingsStore } from "./stores/UiSettingsStore";
import { useSnapOnWhenFileOpens } from "./hooks/useSnapOnWhenFileOpens";
import CanvasZoomControls from "@/components/canvas/CanvasZoomControls";
import FieldDisplayBar from "@/components/canvas/display/FieldDisplayBar";
import View3dButton from "@/components/toolbar/View3dButton";
import Sidebar from "@/components/sidebar/Sidebar";
import Toaster from "./components/ui/Toaster";
import SvgPreviewHandler from "./utilities/SvgPreviewHandler";
import { useIsPreviewMode } from "./stores/PreviewModeStore";
import { PreviewModeHost } from "./components/preview/PreviewMode";
import WorkspaceViewSwitch from "./components/toolbar/WorkspaceViewSwitch";
import { useEditorModeStore } from "./stores/EditorModeStore";
import ErrorBoundary from "./ErrorBoundary";
import {
    QueryCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createAllUndoTriggers, resetTimelineChangeLog } from "./db-functions";
import { db } from "./global/database/db";
import {
    historyKeys,
    refreshAfterStoredCounts,
} from "./hooks/queries/useHistory";
import tolgee from "./global/singletons/Tolgee";
import { InContextTools } from "@tolgee/web/tools";
import AlertModal from "./components/AlertModal";
import ConvertShowDialog from "./components/ConvertShowDialog";
import ShortcutsDialog from "./components/ShortcutsDialog";
import MusicXmlChecksDialog from "./components/music/MusicXmlChecksDialog";
import WebWelcomeModal from "./components/WebWelcomeModal";
import WebSettingsSheet from "./components/WebSettingsSheet";
import ReportDrawer, { ReportRecordingBar } from "./feedback/ReportDrawer";
import { canSendReports } from "./feedback/openReport";
import WebHomeScreenPrompt from "./components/web/WebHomeScreenPrompt";
import WebVersionsDialog from "./components/web/WebVersionsDialog";
import { isWebBuild } from "./utilities/webBuild";
import { useLoadFileErrorHandler } from "./hooks/useLoadFileErrorHandler";
import { toast } from "sonner";
import { version as currentVersion } from "../package.json";
import CheckForUpdatesHandler from "@/updates/CheckForUpdatesHandler";
import { shouldShowUpdateNotification } from "./utilities/updateNotification";
import { shouldShowWelcomeFlow } from "./components/welcome/welcomeFlowSteps";
import WelcomeScreen from "./components/welcome/WelcomeScreen";
import { useAnalyticsQuestionStore } from "./stores/AnalyticsQuestionStore";
import { useIsTouchMode } from "./stores/InputModeStore";
import { useOnScreenKeyboard } from "./hooks/useOnScreenKeyboard";
import { startAudioUnlock } from "./utilities/audioUnlock";
import { audioContextRef } from "@/components/timeline/audio/AudioPlayer";
import {
    inspectorLayout,
    type InspectorChoices,
} from "./utilities/inspectorLayout";
import InspectorDock from "@/components/layout/InspectorDock";
import WindowTooSmallNotice from "@/components/layout/WindowTooSmallNotice";
import { useWindowSize } from "./hooks/useWindowSize";
import { siteUrl } from "@/global/siteUrl";

// The field's own chunk, so the launch page doesn't load three.js
const ThreeField = lazy(() => import("@/field/three/ThreeField"));

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            networkMode: "always",
        },
    },
    queryCache: new QueryCache({
        onError: (_error, query) => {
            if (query?.meta?.errorMessage) {
                console.error(query.meta.errorMessage);
            }
        },
    }),
});

function App() {
    useLoadFileErrorHandler();
    const [databaseIsReady, setDatabaseIsReady] = useState(false);
    const editorModeLoaded = useEditorModeStore((s) => s.loaded);
    const editorMode = useEditorModeStore((s) => s.mode);
    const analyticsQuestion = useAnalyticsQuestionStore((s) => s.status);
    // Setup isn't finished (no mode, or the analytics question unanswered) but
    // a show opened at launch: the welcome flow comes first (desktop only; the
    // launch page shows it when no show is open).
    const welcomeBeforeShow =
        !isWebBuild &&
        databaseIsReady &&
        shouldShowWelcomeFlow({
            loaded: editorModeLoaded,
            mode: editorMode,
            analytics: analyticsQuestion,
        });
    const fetchUiSettings = useUiSettingsStore((s) => s.fetchUiSettings);
    // Preview watches the show: no toolbar, sidebar or inspector
    const preview = useIsPreviewMode();
    const isTouchMode = useIsTouchMode();
    const windowSize = useWindowSize();
    const [inspectorChoices, setInspectorChoices] = useState<InspectorChoices>({
        side: null,
        drawer: false,
    });
    const inspector = inspectorLayout(
        windowSize.width,
        windowSize.height,
        isTouchMode,
        inspectorChoices,
    );
    const drawerShown = inspector.presentation === "drawer";
    const setInspectorOpen = useCallback(
        (open: boolean) =>
            setInspectorChoices((choices) =>
                drawerShown
                    ? { ...choices, drawer: open }
                    : { ...choices, side: open },
            ),
        [drawerShown],
    );

    useOnScreenKeyboard();

    // iPads and phones: audio may only start during a press.
    useEffect(() => startAudioUnlock(() => [audioContextRef]), []);

    // Check if running in codegen mode
    const isCodegen = window.electron.isCodegen;
    if (isCodegen) {
        // eslint-disable-next-line no-console
        console.log("🎭 React app running in Playwright Codegen mode");
    }

    useEffect(() => {
        // Check if database is ready
        void window.electron.databaseIsReady().then((result: boolean) => {
            setDatabaseIsReady(result);
        });
    }, []);

    useEffect(() => {
        const previousVersion = localStorage.getItem("openmarch:lastVersion");
        localStorage.setItem("openmarch:lastVersion", currentVersion);

        if (shouldShowUpdateNotification(previousVersion, currentVersion)) {
            toast.info(tolgee.t("app.updated", { version: currentVersion }), {
                duration: 10_000,
                action: {
                    label: tolgee.t("app.releaseNotes"),
                    onClick: () =>
                        window.electron.openExternal(
                            siteUrl("/download/#releases"),
                        ),
                },
            });
        }
    }, []);

    useEffect(() => {
        fetchUiSettings();
    }, [fetchUiSettings]);

    // A forgotten Snap toggle doesn't carry into the file just opened or made
    useSnapOnWhenFileOpens(databaseIsReady);

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

    useEffect(() => refreshAfterStoredCounts(queryClient), [databaseIsReady]);

    useEffect(() => {
        if (databaseIsReady)
            createAllUndoTriggers(db).catch((error) => {
                console.error("Error creating undo triggers:", error);
            });
    }, [databaseIsReady]);

    useEffect(() => {
        // A file was just opened (the window reloads on every open): drop change-log rows left by
        // writes outside the wrapper, such as migrations or repair, and have listeners cold-build
        if (databaseIsReady)
            resetTimelineChangeLog(db).catch((error) => {
                console.error("Error clearing the timeline change log:", error);
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

    // Tempo mode: the tempo lanes are the only thing in focus; the rest steps back and
    // takes no input until tempo mode is done
    const tempoMode = useTempoModeStore((s) => s.on);
    const tempoModeClass = clsx(
        "transition-opacity duration-200",
        tempoMode && "pointer-events-none opacity-30 select-none",
    );

    return (
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                {process.env.NODE_ENV !== "production" && (
                    <ReactQueryDevtools initialIsOpen={false} />
                )}
                <main className="app-frame bg-bg-1 text-text outline-accent fixed inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden font-sans">
                    {/* Codegen mode indicator */}
                    {isCodegen && (
                        <div className="bg-yellow px-16 py-8 text-center font-bold text-black">
                            {tolgee.t("app.codegenBanner")}
                        </div>
                    )}
                    <AlertModal />
                    {isWebBuild && <WebWelcomeModal />}
                    <ConvertShowDialog />
                    {isWebBuild && <WebSettingsSheet />}
                    {canSendReports && <ReportRecordingBar />}
                    {canSendReports && (
                        <ReportDrawer
                            placement={drawerShown ? "sheet" : "overlay"}
                        />
                    )}
                    {isWebBuild && <WebHomeScreenPrompt />}
                    {isWebBuild && <WebVersionsDialog />}
                    <ShortcutDispatcher />
                    {!isWebBuild && <CheckForUpdatesHandler />}
                    <CommandPalette />
                    <ShortcutsDialog />
                    <MusicXmlChecksDialog />
                    <LongPressGuard />
                    <WindowTooSmallNotice size={windowSize} />
                    {/* Always show LaunchPage when no file is selected, regardless of database state */}
                    {!databaseIsReady ? (
                        <SelectedAudioFileProvider>
                            <FileActionHandlers />
                            <LaunchPage
                                setDatabaseIsReady={setDatabaseIsReady}
                            />
                        </SelectedAudioFileProvider>
                    ) : welcomeBeforeShow ? (
                        <WelcomeScreen />
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
                                            <FileActionHandlers />
                                            <EditorActionHandlers />
                                            <ExportCoordinatesModal />
                                            <TimelineResolverHost />
                                            <View3dPublisher />
                                            <SvgPreviewHandler />
                                            <PreviewModeHost />
                                            <TitleBar showControls />
                                            <>
                                                <div
                                                    id="app"
                                                    className="relative flex h-full min-h-0 w-full gap-8 px-8 pb-8"
                                                >
                                                    <div
                                                        id="workspace"
                                                        className="relative flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                                    >
                                                        {preview ? (
                                                            // Only the workspace switch, to go back, and the 3D View
                                                            <div className="flex items-center justify-end gap-8">
                                                                <View3dButton />
                                                                <WorkspaceViewSwitch />
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className={
                                                                    tempoModeClass
                                                                }
                                                                inert={
                                                                    tempoMode
                                                                }
                                                            >
                                                                <Toolbar />
                                                            </div>
                                                        )}
                                                        <div
                                                            className={clsx(
                                                                "relative flex h-full min-h-0 min-w-0 gap-8",
                                                                tempoModeClass,
                                                                // the taller tempo pane can leave the sidebar short
                                                                tempoMode &&
                                                                    "overflow-hidden",
                                                            )}
                                                            inert={tempoMode}
                                                        >
                                                            {!preview && (
                                                                <>
                                                                    <Sidebar />
                                                                    <SidebarModal />
                                                                </>
                                                            )}
                                                            <Suspense>
                                                                <ThreeField />
                                                            </Suspense>
                                                            <CanvasZoomControls
                                                                canvas={
                                                                    threeZoomControls
                                                                }
                                                            />
                                                            <FieldDisplayBar />
                                                        </div>
                                                        <TimelineSplitter>
                                                            <TimelineContainer />
                                                        </TimelineSplitter>
                                                    </div>
                                                    {!preview && (
                                                        <InspectorDock
                                                            layout={inspector}
                                                            onOpenChange={
                                                                setInspectorOpen
                                                            }
                                                            className={
                                                                tempoModeClass
                                                            }
                                                            inert={tempoMode}
                                                        >
                                                            <Inspector />
                                                        </InspectorDock>
                                                    )}
                                                </div>
                                            </>
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
