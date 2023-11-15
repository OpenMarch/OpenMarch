import './App.css';
import './styles/global.scss';
import Canvas from './components/Canvas';
import Topbar from './components/toolbar/Topbar';
import Sidebar from './components/toolbar/Sidebar';
import { SelectedPageProvider } from './context/SelectedPageContext';
import { SelectedMarcherProvider } from './context/SelectedMarcherContext';
import { IsPlayingProvider } from './context/IsPlayingContext';

function App() {
  return (
    // Context for the selected page. Will change when more specialized
    <SelectedPageProvider>
      <SelectedMarcherProvider>
        <IsPlayingProvider>
          <div className="app-container">
            {/* <div className="toolbar-container"> */}
            <Topbar />
            <div className="secondary-container">
              <Sidebar />
              <Canvas />
            </div>
          </div>
          <div className="canvas-container">
          </div>
          {/* </div> */}
        </IsPlayingProvider>
      </SelectedMarcherProvider>
    </SelectedPageProvider >
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
