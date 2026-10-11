/**
 * The camera rig's state machine (P3.2): an orbit pose around a target plus
 * an optional fly-to tween. It owns no React and no DOM; `CameraRig.tsx`
 * feeds it input and calls `update` once per frame.
 */
import { PerspectiveCamera, type Camera, type Vector3Tuple } from "three";
import {
    clampRadius,
    FLY_MS,
    MAX_PAN,
    MAX_RADIUS,
    maxPhiAboveGround,
    MIN_EYE_Y,
    MIN_ZOOM_DISTANCE,
    nearFor,
    orbitPhi,
    ORBIT_PER_PX,
    panTarget,
    positionFromSpherical,
    sphericalFromPose,
    tweenPose,
    zoomRadius,
    ZOOM_PER_WHEEL,
    type Spherical,
    type Tween,
} from "./rigMath";
import { damp, zoomAbout, zoomRatioLimits } from "./inputMath";

/** A wheel zoom eases in with this half-life (ms): quick, but not a jump. */
export const ZOOM_HALF_LIFE_MS = 45;
/** A flung orbit coasts down with this half-life (ms). */
export const FLING_HALF_LIFE_MS = 120;
/** Drag movement within this window (ms) before release sets the fling speed. */
export const FLING_WINDOW_MS = 80;
/** Coasting stops below this speed (radians per ms). */
const FLING_STOP = 1e-6;

export interface FlyOptions {
    nowMs: number;
    /** Jump instead of flying (prefers-reduced-motion). */
    instant?: boolean;
    /** Field of view to arrive with; keeps the current one when omitted. */
    fovDeg?: number;
    /** Called once when the camera lands. */
    onArrive?: (position: Vector3Tuple) => void;
}

interface ActiveTween {
    tween: Tween;
    startMs: number;
    fromFov: number;
    toFov: number;
    onArrive?: (position: Vector3Tuple) => void;
    /** The look-at point at the last update, so a new fly starts from it. */
    currentTarget: Vector3Tuple;
}

export class RigController {
    target: Vector3Tuple = [0, 0, 0];
    spherical: Spherical = { radius: 100, phi: 1, theta: 0 };
    private active: ActiveTween | null = null;
    private lastUpdateMs: number | null = null;
    /** Wheel zoom still to apply, as a log of the radius ratio. */
    private pendingZoom = 0;
    private zoomAnchor: Vector3Tuple | null = null;
    /** Coasting orbit speed, radians per ms. */
    private velocity = { theta: 0, phi: 0 };
    /** Recent drag steps, for the fling speed on release. */
    private samples: { t: number; theta: number; phi: number }[] = [];

    constructor(private readonly camera: Camera) {}

    get flying(): boolean {
        return this.active !== null;
    }

    /** True while the camera moves on its own: a fly-to, an easing zoom, a coasting orbit. */
    get moving(): boolean {
        return (
            this.active !== null ||
            this.pendingZoom !== 0 ||
            this.velocity.theta !== 0 ||
            this.velocity.phi !== 0
        );
    }

    /** Places the camera at once and makes the pose the orbit state. */
    jumpTo(position: Vector3Tuple, target: Vector3Tuple, fovDeg?: number) {
        this.active = null;
        this.stopMotion();
        this.setPose(position, target);
        if (fovDeg !== undefined) this.setFov(fovDeg);
        this.apply();
    }

    /** Starts a fly-to from wherever the camera is now. */
    flyTo(position: Vector3Tuple, target: Vector3Tuple, options: FlyOptions) {
        this.stopMotion();
        const p = this.camera.position;
        const fromFov = this.fov();
        this.active = {
            tween: {
                fromPosition: [p.x, p.y, p.z],
                fromTarget: this.active
                    ? [...this.active.currentTarget]
                    : [...this.target],
                toPosition: [...position],
                toTarget: [...target],
                durationMs: options.instant ? 0 : FLY_MS,
            },
            startMs: options.nowMs,
            fromFov,
            toFov: options.fovDeg ?? fromFov,
            onArrive: options.onArrive,
            currentTarget: [...this.target],
        };
    }

    /** Stops a fly-to where it is. */
    cancelFly() {
        if (!this.active) return;
        const p = this.camera.position;
        this.setPose([p.x, p.y, p.z], this.active.currentTarget);
        this.active = null;
    }

    /** Drag orbit. Returns false while flying (input is ignored then). */
    orbit(dxPx: number, dyPx: number): boolean {
        if (this.active) return false;
        const s = this.spherical;
        s.theta -= dxPx * ORBIT_PER_PX;
        s.phi = orbitPhi(
            s.phi,
            -dyPx * ORBIT_PER_PX,
            maxPhiAboveGround(s.radius, this.target[1]),
        );
        return true;
    }

    /** Drag pan in the ground plane. */
    pan(dxPx: number, dyPx: number, focus: Vector3Tuple): boolean {
        if (this.active) return false;
        this.target = panTarget(this.target, this.spherical, dxPx, dyPx, focus);
        return true;
    }

    /** Wheel zoom (`deltaY` in pixels). */
    zoomWheel(deltaY: number): boolean {
        if (this.active) return false;
        this.setRadius(zoomRadius(this.spherical.radius, deltaY));
        return true;
    }

    /** Pinch zoom: `ratio` is old finger distance over new. */
    zoomRatio(ratio: number): boolean {
        if (this.active) return false;
        this.setRadius(clampRadius(this.spherical.radius * ratio));
        return true;
    }

    /**
     * Wheel zoom toward `point` (what's under the cursor), eased over a few
     * frames by `update`. `pixels` is the wheel's deltaY in pixels.
     */
    zoomWheelAt(
        pixels: number,
        point: Vector3Tuple | null,
        nowMs: number,
    ): boolean {
        if (this.active) return false;
        void nowMs;
        this.pendingZoom += pixels * ZOOM_PER_WHEEL;
        this.zoomAnchor = point ? [...point] : null;
        return true;
    }

    /** Pinch zoom toward `point`: `ratio` is the new radius over the old. */
    zoomRatioAt(ratio: number, point: Vector3Tuple | null): boolean {
        if (this.active) return false;
        this.zoomBy(ratio, point);
        return true;
    }

    /** Drag orbit that remembers its speed, so `release` can fling it. */
    orbitDrag(dxPx: number, dyPx: number, nowMs: number): boolean {
        if (!this.orbit(dxPx, dyPx)) return false;
        this.velocity = { theta: 0, phi: 0 };
        this.samples.push({
            t: nowMs,
            theta: -dxPx * ORBIT_PER_PX,
            phi: -dyPx * ORBIT_PER_PX,
        });
        while (
            this.samples.length &&
            nowMs - this.samples[0].t > FLING_WINDOW_MS
        )
            this.samples.shift();
        return true;
    }

    /** The drag ended: coast at the speed of its last moments, if it was still moving. */
    release(nowMs: number) {
        const recent = this.samples.filter(
            (s) => nowMs - s.t <= FLING_WINDOW_MS,
        );
        this.samples = [];
        if (recent.length === 0 || this.active) return;
        // the first step covers the frame before its own timestamp
        const span = Math.max(16, nowMs - recent[0].t + 16);
        this.velocity = {
            theta: recent.reduce((n, s) => n + s.theta, 0) / span,
            phi: recent.reduce((n, s) => n + s.phi, 0) / span,
        };
    }

    /** Places the camera at the current orbit pose now, between frames (for raycasts). */
    sync() {
        if (!this.active) this.apply();
    }

    /** Stops coasting (a new press catches the camera). */
    stopMotion() {
        this.velocity = { theta: 0, phi: 0 };
        this.samples = [];
    }

    /**
     * Grab pan: the ground point that was under the pointer (`from`) moves
     * to where the pointer is now (`to`) by moving the target the other way.
     */
    grabPan(
        from: Vector3Tuple,
        to: Vector3Tuple,
        focus: Vector3Tuple,
    ): boolean {
        if (this.active) return false;
        let x = this.target[0] + from[0] - to[0];
        let z = this.target[2] + from[2] - to[2];
        const ox = x - focus[0];
        const oz = z - focus[2];
        const d = Math.hypot(ox, oz);
        if (d > MAX_PAN) {
            x = focus[0] + (ox / d) * MAX_PAN;
            z = focus[2] + (oz / d) * MAX_PAN;
        }
        this.target = [x, this.target[1], z];
        return true;
    }

    /** Moves the camera for this frame: the tween, or the orbit pose. */
    update(nowMs: number) {
        const dt =
            this.lastUpdateMs === null
                ? 0
                : Math.max(0, nowMs - this.lastUpdateMs);
        this.lastUpdateMs = nowMs;
        const a = this.active;
        if (a) {
            const pose = tweenPose(a.tween, nowMs - a.startMs);
            a.currentTarget = pose.target;
            this.camera.position.set(...pose.position);
            this.camera.lookAt(...pose.target);
            const u =
                a.tween.durationMs > 0
                    ? Math.min(1, (nowMs - a.startMs) / a.tween.durationMs)
                    : 1;
            this.setFov(a.fromFov + (a.toFov - a.fromFov) * u);
            if (pose.done) {
                this.active = null;
                this.setPose(pose.position, pose.target);
                this.apply();
                a.onArrive?.(pose.position);
            }
            this.camera.updateMatrixWorld();
            return;
        }
        this.ease(dt);
        this.apply();
    }

    /** Applies this frame's share of the eased wheel zoom and the coasting orbit. */
    private ease(dt: number) {
        if (this.pendingZoom !== 0 && dt > 0) {
            let remaining = damp(this.pendingZoom, dt, ZOOM_HALF_LIFE_MS);
            if (Math.abs(remaining) < 1e-4) remaining = 0;
            const step = this.pendingZoom - remaining;
            this.pendingZoom = remaining;
            const before = this.spherical.radius;
            this.zoomBy(Math.exp(step), this.zoomAnchor);
            // at a limit the rest of the step would do nothing: drop it
            if (this.spherical.radius === before) this.pendingZoom = 0;
            if (this.pendingZoom === 0) this.zoomAnchor = null;
        }
        const v = this.velocity;
        if ((v.theta !== 0 || v.phi !== 0) && dt > 0) {
            // the distance a decaying speed covers over dt
            const k =
                (FLING_HALF_LIFE_MS / Math.LN2) *
                (1 - Math.pow(0.5, dt / FLING_HALF_LIFE_MS));
            const s = this.spherical;
            s.theta += v.theta * k;
            s.phi = orbitPhi(
                s.phi,
                v.phi * k,
                maxPhiAboveGround(s.radius, this.target[1]),
            );
            v.theta = damp(v.theta, dt, FLING_HALF_LIFE_MS);
            v.phi = damp(v.phi, dt, FLING_HALF_LIFE_MS);
            if (Math.abs(v.theta) < FLING_STOP && Math.abs(v.phi) < FLING_STOP)
                this.velocity = { theta: 0, phi: 0 };
        }
    }

    /**
     * Zooms by `ratio` (new distance over old). With a `point` (the one
     * under the cursor), the camera and the orbit target scale about it, as
     * CAD tools zoom: the view keeps its angle and the point stays where it
     * is on screen, the zoom stopping `MIN_ZOOM_DISTANCE` short of it, with
     * the eye above the ground and within `MAX_RADIUS` of the target.
     */
    private zoomBy(ratio: number, point: Vector3Tuple | null) {
        if (!point) {
            this.setRadius(clampRadius(this.spherical.radius * ratio));
            return;
        }
        const position = positionFromSpherical(this.spherical, this.target);
        const [lo, hi] = zoomRatioLimits(position, this.target, point, {
            minDistance: MIN_ZOOM_DISTANCE,
            minEyeY: MIN_EYE_Y,
            maxRadius: MAX_RADIUS,
        });
        const k = Math.min(hi, Math.max(lo, ratio));
        if (k === 1) return;
        const next = zoomAbout(position, this.target, point, k);
        this.setPose(next.position, next.target);
    }

    private setRadius(radius: number) {
        const s = this.spherical;
        s.radius = radius;
        // Zooming out can push a camera that looks up under the ground.
        if (this.eyeY() < MIN_EYE_Y)
            s.phi = Math.min(
                s.phi,
                maxPhiAboveGround(s.radius, this.target[1]),
            );
    }

    private eyeY(): number {
        return positionFromSpherical(this.spherical, this.target)[1];
    }

    private setPose(position: Vector3Tuple, target: Vector3Tuple) {
        this.target = [...target];
        this.spherical = sphericalFromPose(position, target);
    }

    private apply() {
        const pos = positionFromSpherical(this.spherical, this.target);
        this.camera.position.set(...pos);
        this.camera.lookAt(...this.target);
        this.camera.updateMatrixWorld();
        this.setNear(nearFor(this.spherical.radius));
    }

    private setNear(near: number) {
        if (!(this.camera instanceof PerspectiveCamera)) return;
        if (Math.abs(this.camera.near - near) < 1e-6) return;
        this.camera.near = near;
        this.camera.updateProjectionMatrix();
    }

    private fov(): number {
        return this.camera instanceof PerspectiveCamera ? this.camera.fov : 45;
    }

    private setFov(fov: number) {
        if (!(this.camera instanceof PerspectiveCamera)) return;
        if (Math.abs(this.camera.fov - fov) < 1e-6) return;
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
    }
}
