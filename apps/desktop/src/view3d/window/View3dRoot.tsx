/**
 * Entry for the 3D View window (`?view=3d`, ADR 0002 D-3, design §7).
 *
 * `main.tsx` loads this with a dynamic `import()`, so the editor doesn't pay
 * for three.js. The window gets the editor's query client setup, theme,
 * Tolgee and TitleBar, but none of the editor's contexts. Main passes the
 * show name, theme and language in the query string.
 *
 * `Scene.tsx` (P3.1) draws the venue. A small readout shows the synced show
 * time and selected page, for e2e and manual checks.
 */
import { Component, type ReactNode, useEffect, useRef } from "react";
import {
    QueryCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { T, TolgeeProvider, useTranslate } from "@tolgee/react";
import TitleBar from "@/components/titlebar/TitleBar";
import tolgee from "@/global/singletons/Tolgee";
import {
    startView3dSync,
    useView3dSyncStore,
} from "@/view3d/sync/view3dSyncStore";
import Scene from "./Scene";

export interface View3dWindowParams {
    showName: string;
    theme: "light" | "dark";
    language: string;
}

/** Reads the parameters main puts in the window's query string. */
export function readView3dWindowParams(search: string): View3dWindowParams {
    const query = new URLSearchParams(search);
    return {
        showName: query.get("show") ?? "",
        theme: query.get("theme") === "light" ? "light" : "dark",
        language: query.get("lang") || "en",
    };
}

const params = readView3dWindowParams(window.location.search);

// Same defaults as the editor's client in App.tsx.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            networkMode: "always",
        },
    },
    queryCache: new QueryCache({
        onError: (_error, query) => {
            if (query?.meta?.errorMessage) {
                console.error(query.meta.errorMessage);
            }
        },
    }),
});

export default function View3dRoot() {
    useEffect(() => {
        document.documentElement.classList.toggle(
            "dark",
            params.theme === "dark",
        );
        if (params.language !== "en") {
            void tolgee.changeLanguage(params.language);
        }
        // Listens to the editor, then says hello for a fresh clock and selection.
        return startView3dSync(window.view3d, queryClient);
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <View3dWindow />
            </TolgeeProvider>
        </QueryClientProvider>
    );
}

function View3dWindow() {
    const { t } = useTranslate();
    const title = t("view3d.window.title", { showName: params.showName });

    useEffect(() => {
        document.title = title;
    }, [title]);

    return (
        <main className="bg-bg-1 text-text flex h-screen min-h-0 w-screen min-w-0 flex-col overflow-hidden font-sans">
            <TitleBar windowTitle={title} isMacOS={window.view3d.isMacOS} />
            <div
                className="relative min-h-0 flex-1"
                data-testid="view3d-viewport"
            >
                <ViewportErrorBoundary
                    fallback={
                        <p className="text-body text-text/60 p-24">
                            <T keyName="view3d.window.graphicsUnavailable" />
                        </p>
                    }
                >
                    <Scene />
                </ViewportErrorBoundary>
                <SyncReadout />
            </div>
        </main>
    );
}

/**
 * Keeps the title bar up when the scene can't render, for example when WebGL
 * context creation fails, and says why instead of leaving a blank window.
 */
class ViewportErrorBoundary extends Component<
    { children: ReactNode; fallback: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.error("3D View failed to render:", error);
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}

/** Formats show milliseconds as `m:ss.mmm`. */
export function formatShowTime(showMs: number): string {
    const totalMs = Math.max(0, Math.round(showMs));
    const minutes = Math.floor(totalMs / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/**
 * The window's show time and selected page. The time updates every frame
 * through a ref, so the readout doesn't re-render React.
 */
function SyncReadout() {
    const timeRef = useRef<HTMLSpanElement>(null);
    const selectedPageId = useView3dSyncStore(
        (state) => state.selection.selectedPageId,
    );
    const playing = useView3dSyncStore((state) => !!state.clock?.playing);

    useEffect(() => {
        let frame = 0;
        const update = () => {
            const showMs = useView3dSyncStore.getState().showMs();
            if (timeRef.current) {
                timeRef.current.textContent = formatShowTime(showMs);
                timeRef.current.dataset.showMs = String(Math.round(showMs));
            }
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <div
            className="bg-bg-1/80 text-sub text-text border-stroke rounded-6 pointer-events-none absolute bottom-8 left-8 flex gap-12 border px-8 py-4 font-mono"
            data-testid="view3d-sync-readout"
            data-playing={playing}
            data-selected-page-id={selectedPageId ?? ""}
        >
            <span>
                <T keyName="view3d.debug.showTime" />{" "}
                <span ref={timeRef} data-testid="view3d-show-time">
                    {formatShowTime(0)}
                </span>
            </span>
            <span>
                <T keyName="view3d.debug.page" />{" "}
                <span data-testid="view3d-selected-page">
                    {selectedPageId ?? "-"}
                </span>
            </span>
        </div>
    );
}
