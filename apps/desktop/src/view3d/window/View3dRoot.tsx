/**
 * Entry for the 3D View window (`?view=3d`, ADR 0010 D-3, design §7).
 *
 * `main.tsx` loads this with a dynamic `import()`, so the editor doesn't pay
 * for three.js. The window gets the editor's query client setup, theme,
 * Tolgee and TitleBar, but none of the editor's contexts. Main passes the
 * show name, theme and language in the query string.
 *
 * `Scene.tsx` (P3.1) draws the venue, and `overlay/` (P3.3) floats the
 * venue, lighting and camera controls and the readout over it.
 */
import { Component, type ReactNode, useEffect, useState } from "react";
import {
    QueryCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { T, TolgeeProvider, useTranslate } from "@tolgee/react";
import TitleBar from "@/components/titlebar/TitleBar";
import { probeWebGL, type GlKind } from "@/field/fieldQuality";
import tolgee from "@/global/singletons/Tolgee";
import { startView3dSync } from "@/view3d/sync/view3dSyncStore";
import View3dOverlay from "./overlay/View3dOverlay";
import { startPrefsSync, useView3dSceneStore } from "./sceneStore";
import Scene from "./Scene";
import { useKitShowCredits } from "./useKitShowCredits";

/**
 * What the viewport shows instead of the scene, as a translation key, or null
 * to draw the scene. Only no WebGL at all stops it. WebGL drawn in software
 * runs the whole view on the CPU, so the scene draws at low quality there
 * and says why (`sceneStore.ts` `softwareGl`, `overlay/QualityNotice.tsx`),
 * like the 2D field.
 */
export function viewportFallback(kind: GlKind): string | null {
    return kind === "none" ? "view3d.window.graphicsUnavailable" : null;
}

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
        const stopSync = startView3dSync(window.view3d, queryClient);
        // Graphics choices saved in the Settings window apply at once.
        const stopPrefs = startPrefsSync();
        return () => {
            stopSync();
            stopPrefs();
        };
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
    useKitShowCredits(params.showName);
    const title = t("view3d.window.title", { showName: params.showName });
    // Probed once, before the scene creates its own context, and recorded
    // before the scene's first render so it builds at low quality from the
    // start on software WebGL.
    const [glKind] = useState(() => {
        const kind = probeWebGL().kind;
        useView3dSceneStore.getState()._setSoftwareGl(kind === "software");
        return kind;
    });
    const fallback = viewportFallback(glKind);

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
                {fallback ? (
                    <ViewportMessage keyName={fallback} />
                ) : (
                    <ViewportErrorBoundary
                        fallback={
                            <ViewportMessage keyName="view3d.window.graphicsUnavailable" />
                        }
                    >
                        <Scene />
                    </ViewportErrorBoundary>
                )}
                <View3dOverlay />
            </div>
        </main>
    );
}

function ViewportMessage({ keyName }: { keyName: string }) {
    return (
        <p className="text-body text-text/60 p-24">
            <T keyName={keyName} />
        </p>
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
