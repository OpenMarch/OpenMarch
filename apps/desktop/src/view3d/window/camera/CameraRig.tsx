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
 *   (the point pressed stays under the pointer: the ground, the stands or a
 *   performer, whichever is in front), zooms toward what's under the cursor
 *   on the wheel (eased) or a pinch; double-click moves the orbit center to
 *   the clicked spot; never below the ground; any of these clears the active
 *   camera;
 * - in pick-a-seat mode, raycasts the kit's `pickTargets`, snaps to the
 *   nearest seat row and flies to a seated eye looking at the focus; Esc
 *   cancels;
 * - clears the crowd within `CROWD_CLEAR_RADIUS` of the camera on arrival;
 * - while the Director is on (`cinema/directorStore.ts`, key D), puts the
 *   camera where its shot track says for the show time, on every drawn frame.
 *   It asks for no frames of its own: playback and scrubs already draw. Any
 *   of the viewer's moves above turns the Director off first, and the camera
 *   carries on from where it was.
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
import { canHold, groundHit, levelHit, wheelPixels } from "./inputMath";
import { dragAction, wheelAction } from "./controlScheme";
import { requestDraw } from "../drawWake";
import { pickAlong } from "../scenePick";
import {
    cameraIndexForKey,
    FLY_IN_OFFSET,
    MIN_EYE_Y,
    openingCamera,
    SEAT_FOV_DEG,
    SEATED_EYE,
    seatAim,
} from "./rigMath";
import { snapToSeatRows } from "./seatSnap";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { demoTrack } from "../cinema/demoTrack";
import {
    directedPose,
    toggleDirector,
    useDirectorStore,
} from "../cinema/directorStore";
import { useCinemaContext } from "../cinema/subjectPoints";

/** Pointer travel (px) under which a press counts as a click, for picking. */
const CLICK_SLOP_PX = 6;
/** Input keeps the scene drawing this long (ms), covering eases and coasts that start from it. */
const INPUT_WAKE_MS = 1500;
/** Zoom per pinch delta unit (a trackpad pinch reports small deltas). */
const PINCH_ZOOM = 0.01;
/** The most one pinch event zooms (log of the ratio); Ctrl + a mouse wheel takes this path with big deltas. */
const PINCH_MAX_STEP = 0.3;
/**
 * Grab pan holds the point under the pointer only this close (m, along the
 * ground). Past it a few pixels cover a huge stretch of ground, so the drag
 * pans at its ordinary speed instead.
 */
const MAX_GRAB_DISTANCE = 250;
/** A wheel event at the same pointer position within this long (ms) zooms toward the same point. */
const ZOOM_POINT_REUSE_MS = 300;

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

    // The Director's view of the show: who is where, and the picture's shape.
    const aspect = useThree((s) =>
        s.size.height > 0 ? s.size.width / s.size.height : 1,
    );
    const cinema = useCinemaContext(aspect);
    const cinemaRef = useRef(cinema);
    cinemaRef.current = cinema;
    const directing = useDirectorStore((s) => s.directing);
    const hasTrack = useDirectorStore((s) => s.track.length > 0);
    const { countGrid } = useTimingObjects();

    // Until shots are stored in the show, the Director plays a demo track.
    useEffect(() => {
        if (!directing || hasTrack || countGrid.storedCount === 0) return;
        useDirectorStore
            .getState()
            .setTrack(
                demoTrack(
                    countGrid.storedCount,
                    (count) => countGrid.timeAtBeat(count) * 1000,
                ),
            );
    }, [directing, hasTrack, countGrid]);

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
            // The camera is already where the Director had it, so the move
            // carries on from there.
            useDirectorStore.getState().setDirecting(false);
            const store = useCameraStore.getState();
            if (store.activeCameraId !== null) store._setActive(null);
        };
        const focus = () => useView3dSceneStore.getState().focus;
        const scheme = () => useView3dSceneStore.getState().controlScheme;

        /** The camera's ray through a client position, from its current pose. */
        const rayAt = (
            clientX: number,
            clientY: number,
        ): { o: Vector3Tuple; d: Vector3Tuple } => {
            const rect = el.getBoundingClientRect();
            const ndc = new Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1,
            );
            rig.sync();
            raycaster.setFromCamera(ndc, camera);
            const { origin, direction } = raycaster.ray;
            return {
                o: [origin.x, origin.y, origin.z],
                d: [direction.x, direction.y, direction.z],
            };
        };

        /**
         * The nearest surface along a ray: a performer, the stands (the
         * kit's `pickTargets`) or the ground, whichever it meets first. Null
         * for the sky. The ground alone would see through the stands to the
         * ground behind them. Reads the raycaster `rayAt` set up.
         */
        const surfaceAlong = (
            o: Vector3Tuple,
            d: Vector3Tuple,
        ): Vector3Tuple | null => {
            let t = pickAlong(o, d);
            const kit = useView3dSceneStore.getState().kit;
            if (kit && kit.pickTargets.length > 0) {
                const hit = raycaster.intersectObjects(
                    kit.pickTargets,
                    true,
                )[0];
                if (hit && (t === null || hit.distance < t)) t = hit.distance;
            }
            const ground = groundHit(o, d);
            if (ground) {
                const tg = Math.hypot(
                    ground[0] - o[0],
                    ground[1] - o[1],
                    ground[2] - o[2],
                );
                if (t === null || tg < t) t = tg;
            }
            if (t === null) return null;
            return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        };
        /** The nearest surface under a client position (see `surfaceAlong`). */
        const surfaceAt = (
            clientX: number,
            clientY: number,
        ): Vector3Tuple | null => {
            const { o, d } = rayAt(clientX, clientY);
            return surfaceAlong(o, d);
        };

        /**
         * The last zoom point, kept while the pointer stays put: zooming
         * keeps that point under the pointer, so the next wheel event would
         * find it again, and raycasting the stands on every event costs a
         * few ms in the big venues. Any press or key drops it.
         */
        let lastZoom: {
            x: number;
            y: number;
            atMs: number;
            point: Vector3Tuple;
        } | null = null;
        /**
         * The point to zoom toward under a client position: the surface
         * there, or, looking at the sky, the point at the orbit's distance
         * along the ray.
         */
        const zoomPointAt = (
            clientX: number,
            clientY: number,
        ): Vector3Tuple => {
            const now = performance.now();
            if (
                lastZoom &&
                lastZoom.x === clientX &&
                lastZoom.y === clientY &&
                now - lastZoom.atMs < ZOOM_POINT_REUSE_MS
            ) {
                lastZoom.atMs = now;
                return lastZoom.point;
            }
            let point = surfaceAt(clientX, clientY);
            if (!point) {
                const { o, d } = rayAt(clientX, clientY);
                const t = rig.spherical.radius;
                point = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
            }
            lastZoom = { x: clientX, y: clientY, atMs: now, point };
            return point;
        };

        /** The surface under a client position, if a grab pan can hold it (`canHold`). */
        const grabAt = (
            clientX: number,
            clientY: number,
        ): Vector3Tuple | null => {
            const { o, d } = rayAt(clientX, clientY);
            const hit = surfaceAlong(o, d);
            return hit && canHold(o, d, hit, MAX_GRAB_DISTANCE) ? hit : null;
        };
        /**
         * Where the pointer is now at the held point's height, while it can
         * still be held: the pan moves the camera level, so the held point
         * stays on this plane, and putting it here keeps it under the
         * pointer.
         */
        const heldAt = (
            clientX: number,
            clientY: number,
            held: Vector3Tuple,
        ): Vector3Tuple | null => {
            const { o, d } = rayAt(clientX, clientY);
            const hit = levelHit(o, d, held[1]);
            return hit && canHold(o, d, hit, MAX_GRAB_DISTANCE) ? hit : null;
        };
        /** The point held by a pan drag, or null while the drag pans at its ordinary speed. */
        let grab: Vector3Tuple | null = null;
        let orbiting = false;

        const onPointerDown = (e: PointerEvent) => {
            lastZoom = null;
            el.setPointerCapture?.(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            moved = 0;
            rig.stopMotion();
            orbiting = false;
            grab =
                dragAction(scheme(), e) === "pan" && !rig.flying
                    ? grabAt(e.clientX, e.clientY)
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
                const now = grab ? heldAt(e.clientX, e.clientY, grab) : null;
                // Once the held point can't follow the pointer, finish the
                // press without it, or coming back would snap to it.
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
            useDirectorStore.getState().setDirecting(false);
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
                // The view moves under a still pointer: aim the next zoom afresh.
                lastZoom = null;
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
            const hit = surfaceAt(e.clientX, e.clientY);
            if (!hit || rig.flying) return;
            // The spot itself becomes the center, at its own height (a seat
            // up in the stands too), and the camera shifts with it, keeping
            // its angle and distance, above the ground.
            const p = camera.position;
            const t = rig.target;
            const target: Vector3Tuple = [...hit];
            rig.flyTo(
                [
                    p.x + target[0] - t[0],
                    Math.max(MIN_EYE_Y, p.y + target[1] - t[1]),
                    p.z + target[2] - t[2],
                ],
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
            lastZoom = null;
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
            if (e.key === "d" || e.key === "D") {
                if (e.repeat || e.shiftKey) return;
                e.preventDefault();
                toggleDirector();
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
        const ctx = cinemaRef.current;
        const pose = ctx
            ? directedPose(useView3dSyncStore.getState().showMs(), ctx)
            : null;
        if (pose) {
            // Also ends a fly-to or a coast the Director interrupted.
            rig.jumpTo(pose.position, pose.target, pose.fovDeg);
            return;
        }
        rig.update(now);
        if (rig.moving) requestDraw(100);
    }, -1);

    // Leave the store clean when the window's scene goes away.
    useEffect(
        () => () => {
            const store = useCameraStore.getState();
            store._setActive(null);
            store.setPickMode(false);
            useDirectorStore.getState().setDirecting(false);
        },
        [],
    );

    return null;
}
