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
    <main className='font-sans dark bg-gray-900 fixed h-full w-full z-20 top-0 start-0'>
      {!databaseIsReady ? <LaunchPage setDatabaseIsReady={setDatabaseIsReady} /> :
        <SelectedPageProvider>
          <SelectedMarchersProvider>
            <FieldPropertiesProvider>
              <IsPlayingProvider>
                <StateInitializer />
                <RegisteredActionsHandler />
                <div className='h-full grid justify-stretch' style={{ gridTemplateRows: "100px 1fr 100px", gridTemplateColumns: "250px 1fr" }} >
                  <Topbar className='col-span-full ' />
                  <Sidebar className='row-span-2' />
                  <Canvas className='h-1/2' />
                  {/* <div className='bg-green-200' /> */}
                  {/* <TimelineContainer /> */}
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
