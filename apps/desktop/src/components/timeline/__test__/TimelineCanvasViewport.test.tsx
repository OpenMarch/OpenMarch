import { act, cleanup, render } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineGridCanvas } from "../TimelineCanvas";

/** A scroller `width` CSS pixels wide; `width.value` can change later */
const makeViewport = (initial: number) => {
    const viewport = document.createElement("div");
    const width = { value: initial };
    Object.defineProperty(viewport, "clientWidth", {
        configurable: true,
        get: () => width.value,
    });
    document.body.appendChild(viewport);
    return { viewport, width, ref: { current: viewport } };
};

/** The layer span the canvas was last drawn for, in CSS pixels */
const drawnSpan = (container: HTMLElement) => {
    const canvas = container.querySelector("canvas")!;
    return {
        left: parseFloat(canvas.style.left),
        right: parseFloat(canvas.style.left) + parseFloat(canvas.style.width),
        pixelWidth: canvas.width,
        cssWidth: parseFloat(canvas.style.width),
    };
};

const flushMicrotasks = () => act(async () => {});

let observers: { callback: ResizeObserverCallback }[] = [];
class FakeResizeObserver {
    constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {
        observers = observers.filter((o) => o !== this);
    }
}

let ratio = 1;
let mediaListeners: (() => void)[] = [];

beforeEach(() => {
    observers = [];
    mediaListeners = [];
    ratio = 1;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        get: () => ratio,
    });
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query.includes(`${ratio}dppx`),
        media: query,
        addEventListener: (_: string, listener: () => void) =>
            mediaListeners.push(listener),
        removeEventListener: (_: string, listener: () => void) => {
            mediaListeners = mediaListeners.filter((l) => l !== listener);
        },
        addListener: (listener: () => void) => mediaListeners.push(listener),
        removeListener: (listener: () => void) => {
            mediaListeners = mediaListeners.filter((l) => l !== listener);
        },
    }));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});

const grid = (ref: { current: HTMLElement }) => (
    <TimelineGridCanvas
        width={20_000}
        height={20}
        pixelsPerBeat={20}
        viewportRef={ref}
        measures={[]}
    />
);

describe("timeline viewport canvases", () => {
    it("redraws before a scroll reaches the edge of the drawn window", async () => {
        const { viewport, ref } = makeViewport(1000);
        const { container } = render(grid(ref));
        await flushMicrotasks();
        const first = drawnSpan(container);
        expect(first.left).toBe(0);
        // The view now ends 8 px short of the drawn window's right edge: a frame of edge-scroll
        // lag would show a blank strip there
        viewport.scrollLeft = first.right - 1000 - 8;
        act(() => {
            viewport.dispatchEvent(new Event("scroll"));
        });
        const next = drawnSpan(container);
        expect(next.left).toBeGreaterThan(0);
        expect(next.right - viewport.scrollLeft - 1000).toBeGreaterThan(250);
    });

    it("redraws when the viewport is wider than the last draw used", async () => {
        const { viewport, ref } = makeViewport(1000);
        // The layout settles wider right after the first draw reads the width, before the
        // passive effect that starts observing reads it
        let reads = 0;
        Object.defineProperty(viewport, "clientWidth", {
            configurable: true,
            get: () => (reads++ === 0 ? 1000 : 4000),
        });
        const actEnvironment = globalThis as {
            IS_REACT_ACT_ENVIRONMENT?: boolean;
        };
        // Outside act(), so the first draw (a microtask after the layout effects) runs before the
        // passive effects, as in the browser
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        try {
            root.render(grid(ref));
            await vi.waitFor(() => expect(observers).toHaveLength(1));
            expect(drawnSpan(host).right).toBe(2000);
            // The observer's first notification, at the settled width
            observers[0].callback(
                [],
                observers[0] as unknown as ResizeObserver,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(drawnSpan(host).right).toBeGreaterThanOrEqual(4000);
        } finally {
            root.unmount();
            actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        }
    });

    it("redraws at the new device pixel ratio when the screen's changes", async () => {
        const { ref } = makeViewport(1000);
        const { container } = render(grid(ref));
        await flushMicrotasks();
        expect(drawnSpan(container).pixelWidth).toBe(
            drawnSpan(container).cssWidth,
        );
        ratio = 2;
        expect(mediaListeners.length).toBeGreaterThan(0);
        act(() => {
            for (const listener of [...mediaListeners]) listener();
        });
        await flushMicrotasks();
        expect(drawnSpan(container).pixelWidth).toBe(
            2 * drawnSpan(container).cssWidth,
        );
        // Still listening at the new ratio
        expect(mediaListeners.length).toBeGreaterThan(0);
    });
});
