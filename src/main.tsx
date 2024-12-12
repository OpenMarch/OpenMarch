import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";
import { ThemeProvider } from "./context/ThemeContext";

// test comment
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");
