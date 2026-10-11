/**
 * Draws the 3D View only when something changes (docs/3d/fidelity.md P7.2).
 * The canvas runs with `frameloop="demand"`; this component decides, after
 * each frame, whether to ask for another one now, after a frame-cap delay,
 * or not at all (`drawPolicy.ts`).
 *
 * It keeps drawing while the show plays or the camera moves, and for a while
 * after anything that changes the picture: input, a store change, a show
 * edit, a resize. A paused show with a still camera draws nothing.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useQueryClient } from "@tanstack/react-query";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { useView3dSceneStore } from "./sceneStore";
import { useCameraStore } from "./camera/cameraStore";
import {
    createDrawState,
    createShadowState,
    nextFrameDelay,
    noteFrame,
    refreshShadows,
    shadowsNeedUpdate,
    wake,
} from "./drawPolicy";
import { registerDrawWaker } from "./drawWake";

/** How long each kind of change keeps the window drawing (ms). */
const WAKE = {
    /** Opening, a kit, lighting (the pro roof slides for about 2 s), quality. */
    scene: 4000,
    /** A camera pick or fly-to. */
    camera: 1500,
    /** A clock or selection from the editor. */
    sync: 600,
    /** A show edit landing in the query cache. */
    data: 1000,
    /** A resize, focus or visibility change. */
    window: 600,
} as const;

interface BatteryLike extends EventTarget {
    charging: boolean;
}

export default function DrawWhenNeeded() {
    const invalidate = useThree((s) => s.invalidate);
    const gl = useThree((s) => s.gl);
    const queryClient = useQueryClient();
    const state = useRef(createDrawState());
    const shadows = useRef(createShadowState());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Every request goes through here: extend the wake window and draw.
    useEffect(() => {
        const kick = (ms: number) => {
            wake(state.current, performance.now(), ms);
            invalidate();
        };
        // A change to what casts or lights also redraws the shadow map.
        const kickLit = (ms: number) => {
            refreshShadows(shadows.current, performance.now(), ms);
            kick(ms);
        };
        const unregister = registerDrawWaker(kick);
        kickLit(WAKE.scene);

        const unsubscribe = [
            useView3dSceneStore.subscribe(() => kickLit(WAKE.scene)),
            useCameraStore.subscribe(() => kick(WAKE.camera)),
            useView3dSyncStore.subscribe(() => kickLit(WAKE.sync)),
            queryClient.getQueryCache().subscribe(() => kickLit(WAKE.data)),
        ];
        const onWindow = () => kick(WAKE.window);
        window.addEventListener("resize", onWindow);
        window.addEventListener("focus", onWindow);
        document.addEventListener("visibilitychange", onWindow);
        return () => {
            unregister();
            unsubscribe.forEach((u) => u());
            window.removeEventListener("resize", onWindow);
            window.removeEventListener("focus", onWindow);
            document.removeEventListener("visibilitychange", onWindow);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [invalidate, queryClient]);

    // The battery reading, where the platform gives one.
    useEffect(() => {
        const nav = navigator as Navigator & {
            getBattery?: () => Promise<BatteryLike>;
        };
        if (typeof nav.getBattery !== "function") return;
        let battery: BatteryLike | null = null;
        let live = true;
        const update = () => {
            if (battery)
                useView3dSceneStore.getState()._setOnBattery(!battery.charging);
        };
        nav.getBattery()
            .then((b) => {
                if (!live) return;
                battery = b;
                update();
                b.addEventListener("chargingchange", update);
            })
            .catch(() => {
                // No battery API: treat as mains power.
            });
        return () => {
            live = false;
            battery?.removeEventListener("chargingchange", update);
        };
    }, []);

    // Before each render: decide whether the shadow map redraws. Then draw
    // again now, after the frame cap, or sleep.
    useFrame(() => {
        const now = performance.now();
        noteFrame(state.current, now);
        const scene = useView3dSceneStore.getState();
        const clock = useView3dSyncStore.getState().clock;
        gl.shadowMap.autoUpdate = false;
        if (clock?.playing || shadowsNeedUpdate(shadows.current, now))
            gl.shadowMap.needsUpdate = true;
        const delay = nextFrameDelay(state.current, now, {
            moving: !!clock?.playing,
            onBattery: scene.onBattery,
            prefs: scene.powerPrefs,
        });
        if (delay === null) return;
        if (delay === 0) {
            invalidate();
            return;
        }
        if (timer.current) return;
        timer.current = setTimeout(() => {
            timer.current = null;
            invalidate();
        }, delay);
    });

    return null;
}
