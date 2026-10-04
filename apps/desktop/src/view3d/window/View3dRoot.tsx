/**
 * Entry for the 3D View window (`?view=3d`, ADR 0002 D-3, design §7).
 *
 * `main.tsx` loads this with a dynamic `import()`, so the editor doesn't pay
 * for three.js. The window gets the editor's query client setup, theme,
 * Tolgee and TitleBar, but none of the editor's contexts. Main passes the
 * show name, theme and language in the query string.
 *
 * The scene is a placeholder until P3.1 lands `Scene.tsx`.
 */
// cspell:ignore frameloop
import { Component, type ReactNode, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import {
    QueryCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { T, TolgeeProvider, useTranslate } from "@tolgee/react";
import TitleBar from "@/components/titlebar/TitleBar";
import tolgee from "@/global/singletons/Tolgee";

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
        window.view3d.hello();
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
                    <PlaceholderScene />
                </ViewportErrorBoundary>
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

/** A ground plane the size of a football field, until the real scene lands (P3.1). */
function PlaceholderScene() {
    return (
        <Canvas
            frameloop="demand"
            camera={{ position: [0, 45, 70], fov: 45, near: 0.5, far: 2000 }}
            onCreated={({ camera }) => camera.lookAt(0, 0, -24)}
        >
            <color attach="background" args={["#8fb4d8"]} />
            <hemisphereLight args={["#ffffff", "#4a5a3a", 1.2]} />
            <directionalLight position={[40, 80, 60]} intensity={1.5} />
            {/* Field: x is ±55 m around center front, z runs back from 0. */}
            <mesh rotation-x={-Math.PI / 2} position={[0, 0, -24.4]}>
                <planeGeometry args={[110, 48.8]} />
                <meshStandardMaterial color="#3f7d3a" />
            </mesh>
            {/* Surrounding ground. */}
            <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, -24.4]}>
                <planeGeometry args={[400, 300]} />
                <meshStandardMaterial color="#5b6b4a" />
            </mesh>
            <gridHelper
                args={[110, 22, "#ffffff", "#d8e8d0"]}
                position={[0, 0.02, -24.4]}
                scale={[1, 1, 48.8 / 110]}
            />
        </Canvas>
    );
}
