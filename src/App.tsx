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
import AudioPlayer from "@/components/singletons/AudioPlayer";
import { SelectedAudioFileProvider } from "@/context/SelectedAudioFileContext";
import { Provider as TooltipProvider } from "@radix-ui/react-tooltip";

function App() {
    const [databaseIsReady, setDatabaseIsReady] = useState(false);

    useEffect(() => {
        window.electron.databaseIsReady().then((result) => {
            setDatabaseIsReady(result);
        });
    }, []);

    if (!databaseIsReady)
        return <LaunchPage setDatabaseIsReady={setDatabaseIsReady} />;
    else
        return (
            // Context for the selected page. Will change when more specialized
            <TooltipProvider delayDuration={500} skipDelayDuration={500}>
                <IsPlayingProvider>
                    <SelectedPageProvider>
                        <SelectedMarchersProvider>
                            <SelectedAudioFileProvider>
                                <FieldPropertiesProvider>
                                    <StateInitializer />
                                    <AudioPlayer />
                                    <RegisteredActionsHandler />
                                    <div
                                        id="app"
                                        className="flex h-full min-h-0 w-full gap-8 px-8"
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
                                </FieldPropertiesProvider>
                            </SelectedAudioFileProvider>
                        </SelectedMarchersProvider>
                    </SelectedPageProvider>
                </IsPlayingProvider>
            </TooltipProvider>
        );
}

export default App;
