/**
 * The camera rig's state machine (P3.2): an orbit pose around a target plus
 * an optional fly-to tween. It owns no React and no DOM; `CameraRig.tsx`
 * feeds it input and calls `update` once per frame.
 */
import { PerspectiveCamera, type Camera, type Vector3Tuple } from "three";
import {
    clampRadius,
    FLY_MS,
    maxPhiAboveGround,
    MIN_EYE_Y,
    orbitPhi,
    ORBIT_PER_PX,
    panTarget,
    positionFromSpherical,
    sphericalFromPose,
    tweenPose,
    zoomRadius,
    type Spherical,
    type Tween,
} from "./rigMath";

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

    constructor(private readonly camera: Camera) {}

    get flying(): boolean {
        return this.active !== null;
    }

    /** Places the camera at once and makes the pose the orbit state. */
    jumpTo(position: Vector3Tuple, target: Vector3Tuple, fovDeg?: number) {
        this.active = null;
        this.setPose(position, target);
        if (fovDeg !== undefined) this.setFov(fovDeg);
        this.apply();
    }

    /** Starts a fly-to from wherever the camera is now. */
    flyTo(position: Vector3Tuple, target: Vector3Tuple, options: FlyOptions) {
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

    /** Moves the camera for this frame: the tween, or the orbit pose. */
    update(nowMs: number) {
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
        this.apply();
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
