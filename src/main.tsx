import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TitleBar from "./components/TitleBar";
import StatusBar from "./components/StatusBar";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <main className="flex h-screen w-screen flex-col overflow-hidden bg-bg-1 font-sans text-text outline-accent">
            <TitleBar />
            <App />
            <StatusBar />
        </main>
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");
