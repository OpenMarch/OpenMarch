import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_HIDDEN_PROPS_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    type View3dClock,
    type View3dPayloads,
    type View3dPublishChannel,
} from "../protocol";
import {
    relayInvalidations,
    relayTimelineChanges,
    useView3dPlaybackRequests,
    useView3dPublisher,
} from "../useView3dPublisher";
import { registerActionHandler } from "@/shortcuts/registry";
import { usePlaybackSpeedStore } from "@/stores/PlaybackSpeedStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { emitTimelineChange } from "@/db-functions/timelineChanges";
import {
    applyInvalidate,
    startView3dSync,
    useView3dSyncStore,
} from "../view3dSyncStore";

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

const clock = (overrides: Partial<View3dClock> = {}): View3dClock => ({
    seq: 1,
    playing: false,
    anchorShowMs: 5000,
    anchorWallMs: 1000,
    rate: 1,
    speed: 1,
    chosenSpeed: 1,
    playLoops: false,
    ...overrides,
});

describe("relayTimelineChanges", () => {
    it("sends once per tick of committed timeline changes, until stopped", async () => {
        const send = vi.fn();
        const stop = relayTimelineChanges(send);

        emitTimelineChange({ kind: "reset" });
        emitTimelineChange({ kind: "reset" });
        await flushMicrotasks();
        expect(send).toHaveBeenCalledTimes(1);

        emitTimelineChange({ kind: "reset" });
        stop();
        await flushMicrotasks();
        emitTimelineChange({ kind: "reset" });
        await flushMicrotasks();
        expect(send).toHaveBeenCalledTimes(1);
    });
});

describe("relayInvalidations", () => {
    it("forwards invalidated keys once per tick, de-duplicated", async () => {
        const qc = new QueryClient();
        const send = vi.fn();
        const restore = relayInvalidations(qc, send);

        void qc.invalidateQueries({ queryKey: ["pages"] });
        void qc.invalidateQueries({ queryKey: ["marchers", 3] });
        void qc.invalidateQueries({ queryKey: ["pages"] });
        await flushMicrotasks();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith([["pages"], ["marchers", 3]]);
        restore();
    });

    it("forwards a call without a key as invalidate-everything", async () => {
        const qc = new QueryClient();
        const send = vi.fn();
        const restore = relayInvalidations(qc, send);

        void qc.invalidateQueries({ queryKey: ["pages"] });
        void qc.invalidateQueries();
        await flushMicrotasks();

        expect(send).toHaveBeenCalledWith([[]]);
        restore();
    });

    it("still invalidates locally, and stops relaying once restored", async () => {
        const qc = new QueryClient();
        qc.setQueryData(["pages"], 1);
        const send = vi.fn();
        const restore = relayInvalidations(qc, send);

        await qc.invalidateQueries({ queryKey: ["pages"] });
        expect(qc.getQueryState(["pages"])?.isInvalidated).toBe(true);

        restore();
        void qc.invalidateQueries({ queryKey: ["pages"] });
        await flushMicrotasks();
        expect(send).toHaveBeenCalledTimes(1);
    });
});

describe("view3dSyncStore", () => {
    beforeEach(() => {
        useView3dSyncStore.setState({ clock: null });
    });

    it("reads 0 before the first clock", () => {
        expect(useView3dSyncStore.getState().showMs(10_000)).toBe(0);
    });

    it("keeps the newest clock and computes the show time from it", () => {
        const { receiveClock, showMs } = useView3dSyncStore.getState();
        receiveClock(clock({ seq: 2, playing: true }));
        receiveClock(clock({ seq: 1, anchorShowMs: 0 }));
        expect(showMs(1500)).toBe(5500);

        receiveClock(clock({ seq: 3, playing: false, anchorShowMs: 8000 }));
        expect(showMs(99_000)).toBe(8000);
    });

    it("invalidates the keys in the window's query client", () => {
        const qc = new QueryClient();
        qc.setQueryData(["pages"], 1);
        qc.setQueryData(["marchers"], 1);
        applyInvalidate(qc, [["pages"]]);
        expect(qc.getQueryState(["pages"])?.isInvalidated).toBe(true);
        expect(qc.getQueryState(["marchers"])?.isInvalidated).toBe(false);
        applyInvalidate(qc, [[]]);
        expect(qc.getQueryState(["marchers"])?.isInvalidated).toBe(true);
    });

    it("subscribes before saying hello, and drops malformed payloads", () => {
        const listeners = new Map<string, (payload: unknown) => void>();
        const calls: string[] = [];
        const api = {
            on: ((channel: string, cb: (payload: unknown) => void) => {
                calls.push(`on:${channel}`);
                listeners.set(channel, cb);
                return () => listeners.delete(channel);
            }) as Window["view3d"]["on"],
            hello: () => calls.push("hello"),
        };
        const stop = startView3dSync(api, new QueryClient());
        expect(calls.at(-1)).toBe("hello");
        expect(calls).toHaveLength(5);

        listeners.get(VIEW3D_CLOCK_CHANNEL)?.({ seq: "bad" });
        expect(useView3dSyncStore.getState().clock).toBeNull();
        listeners.get(VIEW3D_CLOCK_CHANNEL)?.(clock({ seq: 9 }));
        expect(useView3dSyncStore.getState().clock?.seq).toBe(9);
        listeners.get(VIEW3D_SELECTION_CHANNEL)?.({
            selectedPageId: 4,
            selectedMarcherIds: [1, 2],
        });
        expect(useView3dSyncStore.getState().selection.selectedPageId).toBe(4);
        listeners.get(VIEW3D_HIDDEN_PROPS_CHANNEL)?.({ hiddenItemIds: ["x"] });
        expect(useView3dSyncStore.getState().hiddenItemIds.size).toBe(0);
        listeners.get(VIEW3D_HIDDEN_PROPS_CHANNEL)?.({ hiddenItemIds: [3, 5] });
        expect([...useView3dSyncStore.getState().hiddenItemIds]).toEqual([
            3, 5,
        ]);

        stop();
        expect(listeners.size).toBe(0);
    });
});

describe("useView3dPublisher", () => {
    type Sent = { channel: View3dPublishChannel; payload: unknown };
    let sent: Sent[];
    let onWindowState: ((open: boolean) => void) | undefined;
    let onHello: (() => void) | undefined;
    let onVenueRequest: ((request: { settings: unknown }) => void) | undefined;
    let windowAlreadyOpen: boolean;
    let isOpenReply: Promise<boolean> | undefined;
    const originalElectron = window.electron;

    beforeEach(() => {
        sent = [];
        windowAlreadyOpen = false;
        isOpenReply = undefined;
        window.electron = {
            isView3dOpen: () =>
                isOpenReply ?? Promise.resolve(windowAlreadyOpen),
            publishToView3d: <C extends View3dPublishChannel>(
                channel: C,
                payload: View3dPayloads[C],
            ) => sent.push({ channel, payload }),
            onView3dWindowState: (cb: (open: boolean) => void) => {
                onWindowState = cb;
                return () => (onWindowState = undefined);
            },
            onView3dHello: (cb: () => void) => {
                onHello = cb;
                return () => (onHello = undefined);
            },
            onView3dVenueChangeRequest: (
                cb: (request: { settings: unknown }) => void,
            ) => {
                onVenueRequest = cb;
                return () => (onVenueRequest = undefined);
            },
        } as unknown as Window["electron"];
    });

    afterEach(() => {
        window.electron = originalElectron;
    });

    const render = () => {
        const qc = new QueryClient();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        );
        return { qc, ...renderHook(() => useView3dPublisher(), { wrapper }) };
    };

    it("publishes nothing while no 3D View window is open", async () => {
        const { qc } = render();
        void qc.invalidateQueries({ queryKey: ["pages"] });
        await flushMicrotasks();
        expect(sent).toEqual([]);
    });

    it("publishes the clock, selection and invalidations once the window opens", async () => {
        const { qc } = render();
        act(() => onWindowState?.(true));

        const channels = sent.map((message) => message.channel);
        expect(channels).toContain(VIEW3D_CLOCK_CHANNEL);
        expect(channels).toContain(VIEW3D_SELECTION_CHANNEL);
        const first = sent.find((m) => m.channel === VIEW3D_CLOCK_CHANNEL)
            ?.payload as View3dClock;
        expect(first.playing).toBe(false);
        expect(first.anchorShowMs).toBe(0);

        sent = [];
        void qc.invalidateQueries({ queryKey: ["view3d_venue"] });
        await flushMicrotasks();
        expect(sent).toEqual([
            {
                channel: VIEW3D_INVALIDATE_CHANNEL,
                payload: { queryKeys: [["view3d_venue"]] },
            },
        ]);

        act(() => onWindowState?.(false));
        sent = [];
        void qc.invalidateQueries({ queryKey: ["pages"] });
        await flushMicrotasks();
        expect(sent).toEqual([]);
    });

    it("finds a window left open by an editor reload, and has it read everything again", async () => {
        windowAlreadyOpen = true;
        const { qc } = render();
        await act(flushMicrotasks);

        expect(sent).toContainEqual({
            channel: VIEW3D_INVALIDATE_CHANNEL,
            payload: { queryKeys: [[]] },
        });
        const channels = sent.map((message) => message.channel);
        expect(channels).toContain(VIEW3D_CLOCK_CHANNEL);
        expect(channels).toContain(VIEW3D_SELECTION_CHANNEL);

        sent = [];
        void qc.invalidateQueries({ queryKey: ["pages"] });
        await flushMicrotasks();
        expect(sent).toEqual([
            {
                channel: VIEW3D_INVALIDATE_CHANNEL,
                payload: { queryKeys: [["pages"]] },
            },
        ]);
    });

    it("ignores an answer that arrives after it unmounts", async () => {
        let answer!: (open: boolean) => void;
        isOpenReply = new Promise((resolve) => (answer = resolve));
        const { unmount } = render();
        unmount();
        answer(true);
        await act(flushMicrotasks);
        expect(sent).toEqual([]);
    });

    it("stays quiet when it (re)loads with no window open", async () => {
        render();
        await act(flushMicrotasks);
        expect(sent).toEqual([]);
    });

    it("answers hello with a newer clock and the selection", () => {
        render();
        act(() => onHello?.());
        act(() => onHello?.());
        const clocks = sent
            .filter((m) => m.channel === VIEW3D_CLOCK_CHANNEL)
            .map((m) => (m.payload as View3dClock).seq);
        expect(clocks.length).toBeGreaterThanOrEqual(2);
        expect([...clocks].sort((a, b) => a - b)).toEqual(clocks);
        expect(new Set(clocks).size).toBe(clocks.length);
        expect(
            sent.filter((m) => m.channel === VIEW3D_SELECTION_CHANNEL),
        ).not.toHaveLength(0);
    });

    it("sends the hidden props on hello and whenever they change while open", () => {
        const set = (hiddenPropIds: Record<string, boolean>) => {
            const { uiSettings, setUiSettings } = useUiSettingsStore.getState();
            setUiSettings({ ...uiSettings, hiddenPropIds });
        };
        act(() => set({ 7: true, 2: true, 4: false }));
        render();
        act(() => onHello?.());
        const hidden = () =>
            sent
                .filter((m) => m.channel === VIEW3D_HIDDEN_PROPS_CHANNEL)
                .map((m) => m.payload);
        expect(hidden().at(-1)).toEqual({ hiddenItemIds: [2, 7] });
        sent = [];
        act(() => set({ 2: true }));
        expect(hidden()).toEqual([{ hiddenItemIds: [2] }]);
        act(() => onWindowState?.(false));
        sent = [];
        act(() => set({}));
        expect(hidden()).toEqual([]);
    });

    it("ignores invalid venue change requests", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { qc } = render();
        act(() => onVenueRequest?.({ settings: { kit: "moon" } }));
        expect(warn).toHaveBeenCalled();
        expect(qc.getMutationCache().getAll()).toHaveLength(0);
        warn.mockRestore();
    });
});

describe("useView3dPlaybackRequests", () => {
    type Request = { action: unknown; release?: unknown };
    let onRequest: ((request: Request) => void) | undefined;
    let onWindowState: ((open: boolean) => void) | undefined;
    const originalElectron = window.electron;
    const log: string[] = [];
    let unregister: () => void;

    beforeEach(() => {
        log.length = 0;
        window.electron = {
            onView3dPlaybackRequest: (cb: (request: Request) => void) => {
                onRequest = cb;
                return () => (onRequest = undefined);
            },
            onView3dWindowState: (cb: (open: boolean) => void) => {
                onWindowState = cb;
                return () => (onWindowState = undefined);
            },
        } as unknown as Window["electron"];
        unregister = registerActionHandler("holdFasterPlayback", {
            run: () => log.push("press"),
            isEnabled: () => true,
            release: () => log.push("release"),
        });
    });

    afterEach(() => {
        unregister();
        window.electron = originalElectron;
    });

    it("holds a speed key until the window lets go of it", () => {
        renderHook(() => useView3dPlaybackRequests());
        onRequest?.({ action: "holdFasterPlayback" });
        expect(log).toEqual(["press"]);
        onRequest?.({ action: "holdFasterPlayback", release: true });
        expect(log).toEqual(["press", "release"]);
        // A stray release does nothing
        onRequest?.({ action: "holdFasterPlayback", release: true });
        expect(log).toEqual(["press", "release"]);
    });

    it("chooses a speed the window asks for, within the limits", () => {
        renderHook(() => useView3dPlaybackRequests());
        onRequest?.({ action: "setPlaybackSpeed", speed: 0.75 });
        expect(usePlaybackSpeedStore.getState().speed).toBe(0.75);
        onRequest?.({ action: "setPlaybackSpeed", speed: 99 });
        expect(usePlaybackSpeedStore.getState().speed).toBe(8);
        onRequest?.({ action: "setPlaybackSpeed", speed: "2" });
        expect(usePlaybackSpeedStore.getState().speed).toBe(8);
        usePlaybackSpeedStore.getState().setSpeed(1);
    });

    it("lets go when the window closes with the key held", () => {
        const { unmount } = renderHook(() => useView3dPlaybackRequests());
        onRequest?.({ action: "holdFasterPlayback" });
        onWindowState?.(false);
        expect(log).toEqual(["press", "release"]);
        onRequest?.({ action: "holdFasterPlayback" });
        unmount();
        expect(log).toEqual(["press", "release", "press", "release"]);
    });
});
