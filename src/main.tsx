import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TitleBar from "./components/titlebar/TitleBar";
import { Toaster } from "sonner";
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
import { TooltipProvider } from "@radix-ui/react-tooltip";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <TooltipProvider delayDuration={500} skipDelayDuration={500}>
            <main className="flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden bg-bg-1 pb-8 font-sans text-text outline-accent">
                <TitleBar />
                <App />
            </main>
            <Toaster
                visibleToasts={6}
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
        </TooltipProvider>
    </React.StrictMode>,
);

postMessage({ payload: "removeLoading" }, "*");
