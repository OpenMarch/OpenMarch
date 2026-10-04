/**
 * The 3D View camera rig (P3.2, ui.md UI-1 and UI-3). Mounted inside the
 * scene's `<Canvas>`. It:
 *
 * - opens each venue on its default camera (`pressBox`, the gym's `geJudge`,
 *   else the kit's first) with a fly-in; a rebuild of the same venue (new
 *   params or quality) keeps the view;
 * - flies to a kit camera on `useCameraStore().selectCamera(id)` and on keys
 *   1–9, over 1.1 s with an upward arc, or jumps under reduced motion;
 * - orbits on drag, pans on right-drag or Shift+drag, and zooms on the wheel
 *   or a pinch, never below the ground; any of these clears the active
 *   camera;
 * - in pick-a-seat mode, raycasts the kit's `pickTargets`, snaps to the
 *   nearest seat row and flies to a seated eye looking at the focus; Esc
 *   cancels;
 * - clears the crowd within `CROWD_CLEAR_RADIUS` of the camera on arrival;
 * - publishes the eye-height readout to `useCameraStore`.
 *
 * Camera state the overlay reads lives in `cameraStore.ts`.
 */
// cspell:ignore raycaster
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
    Raycaster,
    Vector2,
    Vector3,
    type Camera,
    type Vector3Tuple,
} from "three";
import type { CameraSeat, KitResult } from "@/view3d/core/types";
import { CROWD_CLEAR_RADIUS, useView3dSceneStore } from "../sceneStore";
import { createReadoutThrottle, useCameraStore } from "./cameraStore";
import { RigController } from "./rigController";
import {
    cameraIndexForKey,
    defaultCameraId,
    FLY_IN_OFFSET,
    horizontalDistance,
    SEAT_FOV_DEG,
    SEATED_EYE,
    seatAim,
} from "./rigMath";
import { snapToSeatRows } from "./seatSnap";

/** Pointer travel (px) under which a press counts as a click, for picking. */
const CLICK_SLOP_PX = 6;

function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
}

const scratch = new Vector3();

/**
 * Hides the people nearest `position` (world), in the crowd's kit-root
 * frame. Reads the scene store on arrival, so a venue change mid-flight
 * uses the new kit and crowd.
 */
function clearCrowdAround(position: Vector3Tuple) {
    const { kit, crowd } = useView3dSceneStore.getState();
    if (!kit || !crowd) return;
    kit.root.updateMatrixWorld();
    kit.root.worldToLocal(scratch.set(...position));
    crowd.clearAround([scratch.x, scratch.y, scratch.z], CROWD_CLEAR_RADIUS);
}

/**
 * Where pick-a-seat puts the eye for a click at `ndc`: the seat-row point
 * nearest the ray's hit on `pickTargets`, at `SEATED_EYE` above the tread
 * under it. Null on a miss or in a kit without stands.
 */
export function pickSeatEye(
    kit: KitResult,
    camera: Camera,
    ndc: Vector2,
    raycaster = new Raycaster(),
): Vector3Tuple | null {
    if (kit.pickTargets.length === 0 || kit.seatRows.length === 0) return null;
    kit.root.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(kit.pickTargets, true)[0];
    if (!hit) return null;
    const local = kit.root.worldToLocal(hit.point.clone());
    const snap = snapToSeatRows([local.x, local.y, local.z], kit.seatRows);
    if (!snap) return null;
    const seat = kit.root.localToWorld(new Vector3(...snap.point));
    // Seat rows sit on the tread in some kits and at bench height in others,
    // so find the tread right under the snapped point.
    raycaster.set(
        new Vector3(seat.x, seat.y + 2, seat.z),
        new Vector3(0, -1, 0),
    );
    raycaster.far = 4;
    const tread = raycaster.intersectObjects(kit.pickTargets, true)[0];
    raycaster.far = Infinity;
    const treadY = tread ? tread.point.y : seat.y;
    return [seat.x, treadY + SEATED_EYE, seat.z];
}

// eslint-disable-next-line max-lines-per-function
export default function CameraRig() {
    const camera = useThree((s) => s.camera);
    const gl = useThree((s) => s.gl);
    const kit = useView3dSceneStore((s) => s.kit);
    const kitId = useView3dSceneStore((s) => s.kitId);
    const pickMode = useCameraStore((s) => s.pickMode);

    const rig = useMemo(() => new RigController(camera), [camera]);
    const shownKitIdRef = useRef<string | null>(null);
    const throttleRef = useRef(
        createReadoutThrottle((r) => useCameraStore.getState()._setReadout(r)),
    );

    const flyToSeat = (seat: CameraSeat) => {
        const aim = seatAim(seat);
        rig.flyTo(aim.position, aim.target, {
            nowMs: performance.now(),
            instant: prefersReducedMotion(),
            fovDeg: seat.fovDeg ?? SEAT_FOV_DEG,
            onArrive: clearCrowdAround,
        });
    };
    const flyToSeatRef = useRef(flyToSeat);
    flyToSeatRef.current = flyToSeat;

    // A new venue opens on its default camera with a fly-in.
    useEffect(() => {
        if (!kit || !kitId) return;
        const store = useCameraStore.getState();
        if (shownKitIdRef.current === kitId) {
            // Same venue rebuilt: keep the view.
            if (
                store.activeCameraId &&
                !kit.cameras.some((c) => c.id === store.activeCameraId)
            )
                store._setActive(null);
            return;
        }
        shownKitIdRef.current = kitId;
        store.setPickMode(false);
        const id = defaultCameraId(kit.cameras);
        const seat = kit.cameras.find((c) => c.id === id);
        if (!seat) {
            store._setActive(null);
            return;
        }
        const start: Vector3Tuple = [
            seat.position[0] + FLY_IN_OFFSET[0],
            seat.position[1] + FLY_IN_OFFSET[1],
            seat.position[2] + FLY_IN_OFFSET[2],
        ];
        rig.jumpTo(start, kit.focus);
        flyToSeatRef.current(seat);
        store._setActive(seat.id);
    }, [kit, kitId, rig]);

    // selectCamera() from the overlay.
    useEffect(
        () =>
            useCameraStore.subscribe((state, prev) => {
                if (!state._request || state._request === prev._request) return;
                const current = useView3dSceneStore.getState().kit;
                const seat = current?.cameras.find(
                    (c) => c.id === state._request!.id,
                );
                if (seat) flyToSeatRef.current(seat);
            }),
        [],
    );

    // Crosshair while picking.
    useEffect(() => {
        const el = gl.domElement;
        el.style.cursor = pickMode ? "crosshair" : "";
        return () => {
            el.style.cursor = "";
        };
    }, [gl, pickMode]);

    // Pointer, wheel and keyboard input.
    useEffect(() => {
        const el = gl.domElement;
        const pointers = new Map<number, { x: number; y: number }>();
        let moved = 0;
        let pinch = 0;
        const raycaster = new Raycaster();

        const manualMove = () => {
            const store = useCameraStore.getState();
            if (store.activeCameraId !== null) store._setActive(null);
        };
        const focus = () => useView3dSceneStore.getState().focus;

        const onPointerDown = (e: PointerEvent) => {
            el.setPointerCapture?.(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            moved = 0;
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                pinch = Math.hypot(a.x - b.x, a.y - b.y);
            }
        };
        const onPointerMove = (e: PointerEvent) => {
            const p = pointers.get(e.pointerId);
            if (!p) return;
            const dx = e.clientX - p.x;
            const dy = e.clientY - p.y;
            p.x = e.clientX;
            p.y = e.clientY;
            moved += Math.abs(dx) + Math.abs(dy);
            if (dx === 0 && dy === 0) return;
            let changed: boolean;
            if (pointers.size >= 2) {
                const [a, b] = [...pointers.values()];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                changed = pinch > 0 && d > 0 && rig.zoomRatio(pinch / d);
                pinch = d;
                changed = rig.pan(dx * 0.5, dy * 0.5, focus()) || changed;
            } else if (e.shiftKey || (e.buttons & 2) !== 0) {
                changed = rig.pan(dx, dy, focus());
            } else {
                changed = rig.orbit(dx, dy);
            }
            if (changed) manualMove();
        };
        const onPointerUp = (e: PointerEvent) => {
            const had = pointers.delete(e.pointerId);
            if (pointers.size < 2) pinch = 0;
            if (!had || e.button !== 0) return;
            const store = useCameraStore.getState();
            const current = useView3dSceneStore.getState().kit;
            if (!store.pickMode || moved >= CLICK_SLOP_PX || !current) return;
            const rect = el.getBoundingClientRect();
            const ndc = new Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1,
            );
            const eye = pickSeatEye(current, camera, ndc, raycaster);
            if (!eye) return;
            store.setPickMode(false);
            store._setActive(null);
            rig.flyTo(eye, [...current.focus], {
                nowMs: performance.now(),
                instant: prefersReducedMotion(),
                onArrive: clearCrowdAround,
            });
        };
        const onPointerCancel = (e: PointerEvent) => {
            pointers.delete(e.pointerId);
            if (pointers.size < 2) pinch = 0;
        };
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const pixels =
                e.deltaMode === 1
                    ? e.deltaY * 16
                    : e.deltaMode === 2
                      ? e.deltaY * 400
                      : e.deltaY;
            if (rig.zoomWheel(pixels)) manualMove();
        };
        const onContextMenu = (e: Event) => e.preventDefault();
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || isTypingTarget(e.target)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const store = useCameraStore.getState();
            if (e.key === "Escape") {
                if (store.pickMode) {
                    store.setPickMode(false);
                    e.preventDefault();
                }
                return;
            }
            const index = cameraIndexForKey(e.key);
            const current = useView3dSceneStore.getState().kit;
            const seat = index === null ? undefined : current?.cameras[index];
            if (!seat) return;
            e.preventDefault();
            store.selectCamera(seat.id);
        };

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointermove", onPointerMove);
        el.addEventListener("pointerup", onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        el.addEventListener("wheel", onWheel, { passive: false });
        el.addEventListener("contextmenu", onContextMenu);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("contextmenu", onContextMenu);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [gl, camera, rig]);

    // Runs before the scene's own frame work, so `kit.onFrame` (roof
    // hiding) sees this frame's camera.
    useFrame(() => {
        const now = performance.now();
        rig.update(now);
        const p = camera.position;
        const position: Vector3Tuple = [p.x, p.y, p.z];
        throttleRef.current(
            {
                eyeHeightM: p.y,
                distanceToFocusM: horizontalDistance(
                    position,
                    useView3dSceneStore.getState().focus,
                ),
            },
            now,
        );
    }, -1);

    // Leave the store clean when the window's scene goes away.
    useEffect(
        () => () => {
            const store = useCameraStore.getState();
            store._setActive(null);
            store.setPickMode(false);
        },
        [],
    );

    return null;
}
