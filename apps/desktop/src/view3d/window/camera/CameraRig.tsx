/**
 * The 3D View camera rig (P3.2, ui.md UI-1 and UI-3). Mounted inside the
 * scene's `<Canvas>`. It:
 *
 * - opens each venue on its default camera (the first in the show's own
 *   list, else `pressBox`, the gym's `geJudge`, else the kit's first) with a
 *   fly-in; a rebuild of the same venue (new params or quality) keeps the
 *   view;
 * - flies to a listed camera (`useView3dSceneStore().cameras`) on
 *   `useCameraStore().selectCamera(id)` and on keys 1–9, over 1.1 s with an
 *   upward arc, or jumps under reduced motion;
 * - tells `useCameraStore().currentPose()` where the view is, for saving
 *   cameras;
 * - moves on drag and scroll as the viewer's control scheme says
 *   (`controlScheme.ts`): orbits (a flung drag coasts to a stop), grab-pans
 *   (the ground point under the pointer stays under it), zooms toward the
 *   cursor on the wheel (eased) or a pinch; double-click moves the orbit
 *   center to the clicked spot; never below the ground; any of these clears
 *   the active camera;
 * - in pick-a-seat mode, raycasts the kit's `pickTargets`, snaps to the
 *   nearest seat row and flies to a seated eye looking at the focus; Esc
 *   cancels;
 * - clears the crowd within `CROWD_CLEAR_RADIUS` of the camera on arrival.
 *
 * Camera state the overlay reads lives in `cameraStore.ts`.
 */
// cspell:ignore raycaster
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
    PerspectiveCamera,
    Raycaster,
    Vector2,
    Vector3,
    type Camera,
    type Vector3Tuple,
} from "three";
import type { CameraSeat, KitResult } from "@/view3d/core/types";
import { CROWD_CLEAR_RADIUS, useView3dSceneStore } from "../sceneStore";
import { useCameraStore } from "./cameraStore";
import { RigController } from "./rigController";
import { groundHit, wheelPixels } from "./inputMath";
import { dragAction, wheelAction } from "./controlScheme";
import { requestDraw } from "../drawWake";
import { pickAlong } from "../scenePick";
import {
    cameraIndexForKey,
    FLY_IN_OFFSET,
    openingCamera,
    SEAT_FOV_DEG,
    SEATED_EYE,
    seatAim,
} from "./rigMath";
import { snapToSeatRows } from "./seatSnap";

/** Pointer travel (px) under which a press counts as a click, for picking. */
const CLICK_SLOP_PX = 6;
/** Input keeps the scene drawing this long (ms), covering eases and coasts that start from it. */
const INPUT_WAKE_MS = 1500;
/** Zoom per pinch delta unit (a trackpad pinch reports small deltas). */
const PINCH_ZOOM = 0.01;
/** The most one pinch event zooms (log of the ratio); Ctrl + a mouse wheel takes this path with big deltas. */
const PINCH_MAX_STEP = 0.3;
/**
 * Grab pan keeps the ground under the pointer only this close (m, along the
 * ground). Past it a few pixels cover a huge stretch of ground, so the drag
 * pans at its ordinary speed instead.
 */
const MAX_GRAB_DISTANCE = 250;

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
        const { cameras, camerasCustomized } = useView3dSceneStore.getState();
        if (shownKitIdRef.current === kitId) {
            // Same venue rebuilt: keep the view.
            if (
                store.activeCameraId &&
                !cameras.some((c) => c.id === store.activeCameraId)
            )
                store._setActive(null);
            return;
        }
        shownKitIdRef.current = kitId;
        store.setPickMode(false);
        const opening = openingCamera(cameras, camerasCustomized, kit.cameras);
        if (!opening) {
            store._setActive(null);
            return;
        }
        const { seat } = opening;
        const start: Vector3Tuple = [
            seat.position[0] + FLY_IN_OFFSET[0],
            seat.position[1] + FLY_IN_OFFSET[1],
            seat.position[2] + FLY_IN_OFFSET[2],
        ];
        rig.jumpTo(start, kit.focus);
        flyToSeatRef.current(seat);
        store._setActive(opening.listed ? seat.id : null);
    }, [kit, kitId, rig]);

    // An edit to the list that removes the active camera leaves a free view.
    useEffect(
        () =>
            useView3dSceneStore.subscribe((state, prev) => {
                // A venue rebuild is handled with the new kit above.
                if (state.cameras === prev.cameras || state.kit !== prev.kit)
                    return;
                const store = useCameraStore.getState();
                if (
                    store.activeCameraId &&
                    !state.cameras.some((c) => c.id === store.activeCameraId)
                )
                    store._setActive(null);
            }),
        [],
    );

    // Where the view is, for saving it as a camera.
    useEffect(() => {
        const store = useCameraStore.getState();
        store._setPoseSource(() => {
            rig.sync();
            const p = camera.position;
            return {
                position: [p.x, p.y, p.z],
                target: rig.lookAt,
                fovDeg:
                    camera instanceof PerspectiveCamera
                        ? camera.fov
                        : SEAT_FOV_DEG,
            };
        });
        return () => store._setPoseSource(null);
    }, [camera, rig]);

    // selectCamera() from the overlay.
    useEffect(
        () =>
            useCameraStore.subscribe((state, prev) => {
                if (!state._request || state._request === prev._request) return;
                const seat = useView3dSceneStore
                    .getState()
                    .cameras.find((c) => c.id === state._request!.id);
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
            requestDraw(INPUT_WAKE_MS);
            const store = useCameraStore.getState();
            if (store.activeCameraId !== null) store._setActive(null);
        };
        const focus = () => useView3dSceneStore.getState().focus;
        const scheme = () => useView3dSceneStore.getState().controlScheme;

        /** The ground point under a client position, from the camera's current pose. */
        const groundAt = (
            clientX: number,
            clientY: number,
        ): Vector3Tuple | null => {
            const rect = el.getBoundingClientRect();
            const ndc = new Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1,
            );
            rig.sync();
            raycaster.setFromCamera(ndc, camera);
            const o = raycaster.ray.origin;
            const d = raycaster.ray.direction;
            return groundHit([o.x, o.y, o.z], [d.x, d.y, d.z]);
        };

        /**
         * The point to zoom toward under a client position: the nearest
         * marcher or ground along the cursor's ray, or, looking at the sky,
         * the point at the orbit's distance along it.
         */
        const zoomPointAt = (
            clientX: number,
            clientY: number,
        ): Vector3Tuple => {
            const rect = el.getBoundingClientRect();
            const ndc = new Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1,
            );
            rig.sync();
            raycaster.setFromCamera(ndc, camera);
            const o: Vector3Tuple = [
                raycaster.ray.origin.x,
                raycaster.ray.origin.y,
                raycaster.ray.origin.z,
            ];
            const d: Vector3Tuple = [
                raycaster.ray.direction.x,
                raycaster.ray.direction.y,
                raycaster.ray.direction.z,
            ];
            let t = pickAlong(o, d);
            const ground = groundHit(o, d);
            if (ground) {
                const tg = Math.hypot(
                    ground[0] - o[0],
                    ground[1] - o[1],
                    ground[2] - o[2],
                );
                if (t === null || tg < t) t = tg;
            }
            if (t === null) t = rig.spherical.radius;
            return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        };
        /** The ground under a client position, if it's near enough to grab. */
        const nearGroundAt = (
            clientX: number,
            clientY: number,
        ): Vector3Tuple | null => {
            const hit = groundAt(clientX, clientY);
            if (!hit) return null;
            const p = camera.position;
            return Math.hypot(hit[0] - p.x, hit[2] - p.z) <= MAX_GRAB_DISTANCE
                ? hit
                : null;
        };
        /** The ground point held by a pan drag, or null while the drag pans at its ordinary speed. */
        let grab: Vector3Tuple | null = null;
        let orbiting = false;

        const onPointerDown = (e: PointerEvent) => {
            el.setPointerCapture?.(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            moved = 0;
            rig.stopMotion();
            orbiting = false;
            grab =
                dragAction(scheme(), e) === "pan" && !rig.flying
                    ? nearGroundAt(e.clientX, e.clientY)
                    : null;
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                pinch = Math.hypot(a.x - b.x, a.y - b.y);
                grab = null;
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
            } else if (dragAction(scheme(), e) === "pan") {
                const now = grab ? nearGroundAt(e.clientX, e.clientY) : null;
                // Once the pointer leaves the ground, finish the press without
                // a held point, or coming back would snap to it.
                if (!now) grab = null;
                changed =
                    grab && now
                        ? rig.grabPan(grab, now, focus())
                        : rig.pan(dx, dy, focus());
            } else {
                // The orbit moves the ground, so a pan resumed in this press
                // can't grab the point it held before.
                grab = null;
                changed = rig.orbitDrag(dx, dy, performance.now());
                orbiting = orbiting || changed;
            }
            if (changed) manualMove();
        };
        const onPointerUp = (e: PointerEvent) => {
            const had = pointers.delete(e.pointerId);
            if (pointers.size < 2) pinch = 0;
            if (orbiting && pointers.size === 0) rig.release(performance.now());
            orbiting = false;
            grab = null;
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
            orbiting = false;
            grab = null;
        };
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const action = wheelAction(scheme(), e);
            let changed: boolean;
            if (action === "pinch") {
                const step = wheelPixels(e.deltaY, e.deltaMode) * PINCH_ZOOM;
                changed = rig.zoomRatioAt(
                    Math.exp(
                        Math.max(
                            -PINCH_MAX_STEP,
                            Math.min(PINCH_MAX_STEP, step),
                        ),
                    ),
                    zoomPointAt(e.clientX, e.clientY),
                );
            } else if (action !== "zoom") {
                // natural scrolling: moving the fingers right gives a negative
                // deltaX; orbit and pan as if the fingers dragged the scene
                const dx = -wheelPixels(e.deltaX, e.deltaMode);
                const dy = -wheelPixels(e.deltaY, e.deltaMode);
                changed =
                    action === "pan"
                        ? rig.pan(dx, dy, focus())
                        : rig.orbit(dx, dy);
            } else {
                // A sideways-only swipe has nothing to zoom by.
                if (e.deltaY === 0) return;
                changed = rig.zoomWheelAt(
                    wheelPixels(e.deltaY, e.deltaMode),
                    zoomPointAt(e.clientX, e.clientY),
                    performance.now(),
                );
            }
            if (changed) manualMove();
        };
        const onDoubleClick = (e: MouseEvent) => {
            const hit = groundAt(e.clientX, e.clientY);
            if (!hit || rig.flying) return;
            const p = camera.position;
            const t = rig.target;
            const target: Vector3Tuple = [hit[0], t[1], hit[2]];
            rig.flyTo(
                [p.x + target[0] - t[0], p.y, p.z + target[2] - t[2]],
                target,
                {
                    nowMs: performance.now(),
                    instant: prefersReducedMotion(),
                },
            );
            manualMove();
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
            const { cameras } = useView3dSceneStore.getState();
            const seat = index === null ? undefined : cameras[index];
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
        el.addEventListener("dblclick", onDoubleClick);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("contextmenu", onContextMenu);
            el.removeEventListener("dblclick", onDoubleClick);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [gl, camera, rig]);

    // Runs before the scene's own frame work, so `kit.onFrame` (roof
    // hiding) sees this frame's camera.
    useFrame(() => {
        const now = performance.now();
        rig.update(now);
        if (rig.moving) requestDraw(100);
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
