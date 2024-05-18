import Canvas from './components/canvas/Canvas';
import Topbar from './components/toolbar/Topbar';
import Sidebar from './components/toolbar/Sidebar';
import { SelectedPageProvider } from './context/SelectedPageContext';
import { SelectedMarchersProvider } from './context/SelectedMarchersContext';
import { IsPlayingProvider } from './context/IsPlayingContext';
import StateInitializer from './StateInitializer';
import LaunchPage from './components/LaunchPage';
import { useEffect, useState } from 'react';
import { FieldPropertiesProvider } from './context/fieldPropertiesContext';
import RegisteredActionsHandler from './utilities/RegisteredActionsHandler';
import TimelineContainer from './components/timeline/TimelineContainer';

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
      {!databaseIsReady ? <LaunchPage setDatabaseIsReady={setDatabaseIsReady} /> :
        <SelectedPageProvider>
          <SelectedMarchersProvider>
            <FieldPropertiesProvider>
              <IsPlayingProvider>
                <StateInitializer />
                <RegisteredActionsHandler />
                <div className="app-container">
                  <Topbar />
                  <div className="secondary-container">
                    <Sidebar />
                    <Canvas />
                    <TimelineContainer />
                  </div>
                </div>
              </IsPlayingProvider>
            </FieldPropertiesProvider>
          </SelectedMarchersProvider>
        </SelectedPageProvider >
      }
    </>
  );
}

export default App;
