import { Component, useEffect, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import {
    classifyGlRenderer,
    glRendererName,
    useFieldQualityStore,
} from "@/field/fieldQuality";

/**
 * How long a lost WebGL context gets to come back by itself before the field
 * starts over on a new canvas.
 */
export const CONTEXT_RESTORE_WAIT_MS = 2000;

/** Records what draws the field's own context: after a restore, it can be a different GPU, or software. */
function recordRenderer(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
): void {
    const renderer = glRendererName(gl);
    useFieldQualityStore.setState({
        gl: { kind: classifyGlRenderer(renderer), renderer },
    });
}

/**
 * Keeps the field drawn through a lost WebGL context (sleep, a driver reset, a
 * GPU process crash), without reopening the show (ADR 0005 D-3).
 *
 * three.js keeps the context restorable and rebuilds its GPU state when the
 * browser restores it, from the geometry and textures it still holds; this
 * asks for the frame the on-demand loop would otherwise never draw. If the
 * browser doesn't restore it in time, `onGiveUp` starts the field over on a
 * new canvas. Everything the field draws lives outside the GPU, so nothing is
 * lost either way.
 */
export function ContextLossGuard({ onGiveUp }: { onGiveUp: () => void }) {
    const renderer = useThree((s) => s.gl);
    const invalidate = useThree((s) => s.invalidate);

    useEffect(() => {
        const canvas = renderer.domElement;
        // A new canvas (after giving up on a lost one) starts with a live context
        useFieldQualityStore.setState({ contextLost: false });
        recordRenderer(renderer.getContext());
        let timer: ReturnType<typeof setTimeout> | undefined;
        const lost = () => {
            useFieldQualityStore.setState({ contextLost: true });
            clearTimeout(timer);
            timer = setTimeout(onGiveUp, CONTEXT_RESTORE_WAIT_MS);
        };
        const restored = () => {
            clearTimeout(timer);
            recordRenderer(renderer.getContext());
            useFieldQualityStore.setState({ contextLost: false });
            invalidate();
        };
        // three's own listeners come first: it keeps the context restorable
        canvas.addEventListener("webglcontextlost", lost);
        canvas.addEventListener("webglcontextrestored", restored);
        return () => {
            clearTimeout(timer);
            canvas.removeEventListener("webglcontextlost", lost);
            canvas.removeEventListener("webglcontextrestored", restored);
        };
    }, [renderer, invalidate, onGiveUp]);

    return null;
}

/**
 * three's errors when the browser gives it no WebGL context: "Error creating
 * WebGL context." and "… with your selected attributes."
 */
const isWebGLStartError = (error: unknown) =>
    error instanceof Error &&
    /^(THREE\.WebGLRenderer: )?Error creating WebGL context\b/.test(
        error.message,
    );

/**
 * Catches the field's canvas failing to start (no WebGL context to be had), so
 * the field shows `fallback` instead of the app's error boundary. Any other
 * error goes on to the app's error boundary: it's a bug, not the machine.
 */
export class CanvasErrorBoundary extends Component<
    {
        fallback: ReactNode;
        onError: (error: unknown) => void;
        children: ReactNode;
    },
    { error: unknown }
> {
    state: { error: unknown } = { error: null };

    static getDerivedStateFromError(error: unknown) {
        return { error };
    }

    componentDidCatch(error: unknown) {
        if (isWebGLStartError(error)) this.props.onError(error);
    }

    render() {
        const { error } = this.state;
        if (error === null) return this.props.children;
        if (!isWebGLStartError(error)) throw error;
        return this.props.fallback;
    }
}
