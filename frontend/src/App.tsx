import React from 'react';
// import logo from './logo.svg';
import './App.css';
import './styles/global.scss';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { fabric } from 'fabric';
import Topbar from './components/toolbar/Topbar';
import Sidebar from './components/toolbar/Sidebar';
import { SelectedPageProvider } from './context/SelectedPageContext';
import { SelectedMarcherProvider } from './context/SelectedMarcherContext';

function App() {
  return (
    // Context for the selected page. Will change when more specialized
    <SelectedPageProvider>
      <SelectedMarcherProvider>
        <div className="App">
          <div className="toolbar-container">
            <Topbar />
            <Sidebar />
          </div>
          {/* <Canvas /> */}
          {/* <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header> */}
          <Toolbar />
        </div>
      </SelectedMarcherProvider>
    </SelectedPageProvider >
  );
}

export default App;
