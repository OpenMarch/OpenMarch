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
        <main className="dark:outline-dark h-screen w-screen overflow-hidden bg-bg-1 font-sans text-text outline-white">
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
                                    <div className="flex h-full w-full gap-8 p-8">
                                        <Sidebar />
                                        <div className="flex h-full w-full flex-col gap-8">
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
        </main>
    );
}

export default App;
