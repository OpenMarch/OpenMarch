/**
 * A way for anything in the window to ask the scene to keep drawing for a
 * while: input handlers, the performers when their meshes change, the camera
 * while it eases. The scene's `DrawWhenNeeded` registers the waker; before
 * that, requests do nothing (the scene draws its first frames anyway).
 */
type Waker = (ms: number) => void;

let current: Waker | null = null;

/** Registers the scene's waker; returns a function that removes it. */
export function registerDrawWaker(waker: Waker): () => void {
    current = waker;
    return () => {
        if (current === waker) current = null;
    };
}

/** Keep drawing for at least `ms` from now. */
export function requestDraw(ms: number): void {
    current?.(ms);
}
