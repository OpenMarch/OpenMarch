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
                <div className="app-container">
                  {/* <div className="toolbar-container"> */}
                  <Topbar />
                  <div className="secondary-container">
                    <Sidebar />
                    <Canvas />
                    {/* <PageList /> */}
                  </div>
                </div>
                {/* </div> */}
              </IsPlayingProvider>
            </FieldPropertiesProvider>
          </SelectedMarchersProvider>
        </SelectedPageProvider >
      }
    </>
  );
}

export default App;

// {/* <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.tsx</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header> */}
// {/* <Toolbar /> */ }
