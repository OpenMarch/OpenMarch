import Canvas from "@/components/canvas/Canvas";
import Toolbar from "@/components/toolbar/Toolbar";
import Sidebar from "@/components/sidebar/Sidebar";
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
import * as RadixTooltip from "@radix-ui/react-tooltip";

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
            <RadixTooltip.Provider delayDuration={500} skipDelayDuration={50}>
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
                                        className="flex h-full min-h-0 w-full min-w-0 gap-8 px-8"
                                    >
                                        <Sidebar />
                                        <div
                                            id="workspace"
                                            className="flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                        >
                                            <Toolbar />
                                            <Canvas />
                                            <TimelineContainer />
                                        </div>
                                    </div>
                                </FieldPropertiesProvider>
                            </SelectedAudioFileProvider>
                        </SelectedMarchersProvider>
                    </SelectedPageProvider>
                </IsPlayingProvider>
            </RadixTooltip.Provider>
        );
}

export default App;
