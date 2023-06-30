import React from 'react';
import logo from './logo.svg';
import './App.css';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { fabric } from 'fabric';

function App() {
  return (
    <div className="App">
      <Canvas />
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
  );
}

export default App;
