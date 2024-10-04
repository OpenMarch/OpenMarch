import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TitleBar from "./components/TitleBar";
import StatusBar from "./components/StatusBar";
import "./styles/index.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <main className="flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-bg-1 pt-8 font-sans text-text outline-accent">
            {/* <TitleBar /> */}
            <App />
            <StatusBar />
        </main>
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");
