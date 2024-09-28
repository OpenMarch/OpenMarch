import Canvas from "./components/canvas/Canvas";
import Topbar from "./components/topbar/Topbar";
import Sidebar from "./components/sidebar/Sidebar";
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
        <main className="font-sans dark bg-gray-900 fixed h-full w-full z-20 top-0 start-0">
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
                                        className="h-full grid justify-stretch"
                                        style={{
                                            gridTemplateRows: "120px 1fr 100px",
                                            gridTemplateColumns: "250px 1fr",
                                        }}
                                    >
                                        <Topbar className="col-span-full box-border border-gray-500 border-0 border-b-2 border-solid" />
                                        <Sidebar className="row-span-2 box-border border-gray-500 border-0 border-r-2 border-solid" />
                                        <Canvas />
                                        <TimelineContainer className="box-border bg-gray-800 border-gray-500 border-0 border-t-2 border-solid" />
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
