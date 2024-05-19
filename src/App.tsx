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
    <main className='dark bg-white dark:bg-gray-900 fixed w-full z-20 top-0 start-0 border-b border-gray-200 dark:border-gray-600'>
      {!databaseIsReady ? <LaunchPage setDatabaseIsReady={setDatabaseIsReady} /> :
        <SelectedPageProvider>
          <SelectedMarchersProvider>
            <FieldPropertiesProvider>
              <IsPlayingProvider>
                <StateInitializer />
                <RegisteredActionsHandler />
                <div >
                  <Topbar />
                  <div className="secondary-container">
                    <Sidebar />
                    <Canvas />
                    {/* <TimelineContainer /> */}
                  </div>
                </div>
              </IsPlayingProvider>
            </FieldPropertiesProvider>
          </SelectedMarchersProvider>
        </SelectedPageProvider >
      }
    </main>
  );
}

export default App;
