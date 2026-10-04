/**
 * Window side of the 3D View sync (ADR 0002 D-4, docs/3d/design.md §7).
 *
 * Holds the editor's latest clock and selection. Scene code reads
 * `showMs()` inside `useFrame` (`useView3dSyncStore.getState().showMs()`),
 * not through React renders.
 */
import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";
import {
    VIEW3D_CLOCK_CHANNEL,
    VIEW3D_INVALIDATE_CHANNEL,
    VIEW3D_SELECTION_CHANNEL,
    isView3dClock,
    isView3dInvalidate,
    isView3dSelection,
    newerClock,
    showTimeAt,
    wallNowMs,
    type View3dClock,
    type View3dSelection,
} from "./protocol";

export interface View3dSyncState {
    /** The newest clock from the editor, or null before the first one. */
    clock: View3dClock | null;
    selection: View3dSelection;
    /** Keeps `clock` unless `incoming` has a newer `seq`. */
    receiveClock: (incoming: View3dClock) => void;
    receiveSelection: (selection: View3dSelection) => void;
    /** The show time now, in milliseconds. 0 before the first clock. */
    showMs: (nowWallMs?: number) => number;
}

const EMPTY_SELECTION: View3dSelection = {
    selectedPageId: null,
    selectedMarcherIds: [],
};

export const useView3dSyncStore = create<View3dSyncState>()((set, get) => ({
    clock: null,
    selection: EMPTY_SELECTION,
    receiveClock: (incoming) =>
        set((state) => {
            const clock = newerClock(state.clock, incoming);
            return clock === state.clock ? state : { clock };
        }),
    receiveSelection: (selection) => set({ selection }),
    showMs: (nowWallMs = wallNowMs()) => {
        const { clock } = get();
        return clock ? showTimeAt(clock, nowWallMs) : 0;
    },
}));

/** Invalidates the editor's query keys in the window's own query client. */
export function applyInvalidate(
    queryClient: QueryClient,
    queryKeys: unknown[][],
) {
    for (const queryKey of queryKeys) {
        void (queryKey.length === 0
            ? queryClient.invalidateQueries()
            : queryClient.invalidateQueries({ queryKey }));
    }
}

/**
 * Feeds the store and the window's query client from the editor, then says
 * hello so the editor sends a fresh clock and selection.
 *
 * @returns a function that stops listening.
 */
export function startView3dSync(
    api: Pick<Window["view3d"], "on" | "hello">,
    queryClient: QueryClient,
): () => void {
    const { receiveClock, receiveSelection } = useView3dSyncStore.getState();
    const cleanups = [
        api.on(VIEW3D_CLOCK_CHANNEL, (payload) => {
            if (isView3dClock(payload)) receiveClock(payload);
        }),
        api.on(VIEW3D_SELECTION_CHANNEL, (payload) => {
            if (isView3dSelection(payload)) receiveSelection(payload);
        }),
        api.on(VIEW3D_INVALIDATE_CHANNEL, (payload) => {
            if (isView3dInvalidate(payload)) {
                applyInvalidate(queryClient, payload.queryKeys);
            }
        }),
    ];
    api.hello();
    return () => cleanups.forEach((cleanup) => cleanup());
}
