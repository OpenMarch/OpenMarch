import Canvas from "./components/canvas/Canvas";
import Topbar from "./components/toolbar/Topbar";
import Sidebar from "./components/toolbar/Sidebar";
import { SelectedPageProvider } from "./context/SelectedPageContext";
import { SelectedMarchersProvider } from "./context/SelectedMarchersContext";
import { IsPlayingProvider } from "./context/IsPlayingContext";
import StateInitializer from "./components/singletons/StateInitializer";
import LaunchPage from "./components/LaunchPage";
import { useEffect, useState } from "react";
import { FieldPropertiesProvider } from "./context/fieldPropertiesContext";
import RegisteredActionsHandler from "./utilities/RegisteredActionsHandler";
import TimelineContainer from "./components/timeline/TimelineContainer";
import AudioPlayer from "./components/singletons/AudioPlayer";
import { SelectedAudioFileProvider } from "./context/SelectedAudioFileContext";

function App() {
    const [databaseIsReady, setDatabaseIsReady] = useState(false);

    useEffect(() => {
        window.electron.databaseIsReady().then((result) => {
            setDatabaseIsReady(result);
        });
    }, []);
    return (
        // Context for the selected page. Will change when more specialized
        <>
            {!databaseIsReady ? (
                <LaunchPage setDatabaseIsReady={setDatabaseIsReady} />
            ) : (
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
                                        className="flex h-full min-h-0 w-full min-w-0 gap-8 p-8 pt-0"
                                    >
                                        <Sidebar />
                                        <div
                                            id="workspace"
                                            className="flex h-full min-h-0 w-full min-w-0 flex-col gap-8"
                                        >
                                            <Topbar />
                                            <Canvas />
                                            <TimelineContainer />
                                        </div>
                                    </div>
                                </FieldPropertiesProvider>
                            </SelectedAudioFileProvider>
                        </SelectedMarchersProvider>
                    </SelectedPageProvider>
                </IsPlayingProvider>
            )}
        </>
    );
}

export default App;
