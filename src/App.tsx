import Canvas from "@/components/canvas/Canvas";
import Toolbar from "@/components/toolbar/Toolbar";
import Sidebar from "@/components/sidebar/Sidebar";
import SidebarModal from "@/components/sidebar/SidebarModal";
import { SelectedPageProvider } from "@/context/SelectedPageContext";
import { SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { IsPlayingProvider } from "@/context/IsPlayingContext";
import StateInitializer from "@/components/singletons/StateInitializer";
import LaunchPage from "@/components/LaunchPage";
import { useEffect, useState } from "react";
import { FieldPropertiesProvider } from "@/context/fieldPropertiesContext";
import RegisteredActionsHandler from "@/utilities/RegisteredActionsHandler";
import TimelineContainer from "@/components/timeline/TimelineContainer";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { CanvasProvider } from "@/context/CanvasContext";
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

function App() {
    const [databaseIsReady, setDatabaseIsReady] = useState(false);
    const { fetchUiSettings } = useUiSettingsStore();

    useEffect(() => {
        window.electron.databaseIsReady().then((result) => {
            setDatabaseIsReady(result);
        });
    }, []);

    useEffect(() => {
        fetchUiSettings();
    }, [fetchUiSettings]);

    return (
        <main className="flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-bg-1 font-sans text-text outline-accent">
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
                                        <CanvasProvider>
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
                                        </CanvasProvider>
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
