import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TitleBar from "./components/TitleBar";
import { Toaster } from "sonner";
import StatusBar from "./components/StatusBar";
import "./styles/index.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";
import {
    CheckCircle,
    Warning,
    SealWarning,
    Info,
    CircleNotch,
} from "@phosphor-icons/react";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <main className="flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-bg-1 font-sans text-text outline-accent">
            <TitleBar />
            <App />
            <StatusBar />
        </main>
        <Toaster
            visibleToasts={5}
            toastOptions={{
                unstyled: true,
                classNames: {
                    title: "text-body text-text leading-none",
                    description: "text-sub text-text",
                    toast: "p-20 flex gap-8 bg-modal rounded-6 border border-stroke font-sans w-full backdrop-blur-md shadow-modal",
                },
            }}
            icons={{
                success: <CheckCircle size={24} className="text-green" />,
                info: <Info size={24} className="text-text" />,
                warning: <Warning size={24} className="text-yellow" />,
                error: <SealWarning size={24} className="text-red" />,
                loading: <CircleNotch size={24} className="text-text" />,
            }}
        />
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");
