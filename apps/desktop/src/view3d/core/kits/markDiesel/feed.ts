// cspell:ignore superframe superframes
import {
    HalfFloatType,
    LinearFilter,
    LinearMipmapLinearFilter,
    PerspectiveCamera,
    WebGLRenderTarget,
    type Camera,
    type Object3D,
    type Scene,
    type Texture,
    type Vector3Tuple,
    type WebGLRenderer,
} from "three";
import type { DieselFrame } from "./frame";

/**
 * The video boards' live picture: the scene itself, seen by a broadcast
 * camera at the front of the upper deck, drawn into a small render target a few
 * times a second.
 *
 * What keeps it cheap (docs/3d/fidelity.md):
 *
 * - It is built at high quality only; at low quality the boards show a card.
 * - It draws from a screen's own `onBeforeRender`, which three calls only
 *   for a screen inside the view's frustum: no board in view, no picture
 *   drawn. Both screens share the one picture.
 * - It draws at most `fps` times a second of the kit's own frame time, and
 *   never unless the window is drawing anyway (a paused show with a still
 *   camera draws nothing, so neither does the feed).
 * - It skips the shadow pass: the shadow map the view just drew is reused.
 * - From outside the hall the boards can't be seen, so it stops.
 */
export const DIESEL_FEED = {
    /** Pictures a second, at most. */
    fps: 12,
    /** The picture's width in pixels; its height follows the screen. */
    width: 512,
    /** Vertical field of view of the broadcast camera, degrees. */
    fovDeg: 42,
} as const;

/** Decides when the next picture is due, from the frame times it is fed. */
export class FeedThrottle {
    private since = Infinity;

    constructor(readonly interval: number) {}

    /** A frame of `dt` seconds has passed. */
    tick(dt: number): void {
        if (dt > 0) this.since += dt;
    }

    /** Whether a picture should be drawn on this frame. */
    get due(): boolean {
        return this.since >= this.interval;
    }

    /** A picture was drawn. */
    drawn(): void {
        this.since = 0;
    }

    /** The scene changed at once (lighting, a new kit): draw on the next frame. */
    invalidate(): void {
        this.since = Infinity;
    }
}

/**
 * Whether a view from `cameraPosition` (kit-root space) can see the boards
 * at all: it has to be inside the building and under its roof.
 */
export function feedInView(
    [x, y, z]: Vector3Tuple,
    frame: Pick<DieselFrame, "BUILDING">,
): boolean {
    const { halfX, halfZ, roofY } = frame.BUILDING;
    return Math.abs(x) < halfX && Math.abs(z) < halfZ && y < roofY(z);
}

/** Where the broadcast camera stands and looks, in kit-root space. */
export function feedCameraPose(frame: DieselFrame): {
    position: Vector3Tuple;
    target: Vector3Tuple;
} {
    const { upper, halfZ } = frame.BOWL;
    // On a stand at the upper deck's front rail on the 50: over the rail,
    // and in front of the deck's portals and its crowd.
    return {
        position: [0, upper.base + 2.8, halfZ + upper.offset + 0.5],
        // A little toward the camera from the 50, so the field fills the picture.
        target: [0, 0, frame.FIELD_HALF_WIDTH * 0.2],
    };
}

/** The parts of the renderer the feed uses (a fake stands in for it in tests). */
export type FeedRenderer = Pick<
    WebGLRenderer,
    | "getRenderTarget"
    | "setRenderTarget"
    | "getActiveCubeFace"
    | "getActiveMipmapLevel"
    | "clear"
    | "render"
> & {
    xr: { enabled: boolean };
    shadowMap: { autoUpdate: boolean };
    state: { buffers: { depth: { setMask(flag: boolean): void } } };
};

export interface BoardFeed {
    /** The picture; map it on the screens. */
    texture: Texture;
    /** The broadcast camera; add it to the part so it follows the kit. */
    camera: PerspectiveCamera;
    /** Makes `screen` show the feed: it draws the picture when it is due. */
    attach(screen: Object3D): void;
    /** Per frame: `dt` seconds have passed, seen from `cameraPosition`. */
    tick(dt: number, cameraPosition: Vector3Tuple): void;
    /** Draws a fresh picture on the next frame. */
    invalidate(): void;
    /** Draws the picture now if one is due (what an attached screen calls). */
    draw(renderer: FeedRenderer, scene: Scene): boolean;
    /** Pictures drawn so far, and what the last one cost on the CPU (ms). */
    readonly stats: { pictures: number; lastMs: number };
    dispose(): void;
}

/** A feed for screens of `aspect` (width over height). */
export function createBoardFeed(frame: DieselFrame, aspect: number): BoardFeed {
    const width = DIESEL_FEED.width;
    const height = Math.round(width / aspect);
    // Half floats: the picture holds the scene's light before tone mapping,
    // and the screen applies the view's exposure to it like everything else.
    const target = new WebGLRenderTarget(width, height, {
        type: HalfFloatType,
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
    });
    target.texture.name = "markDiesel.feed";

    const camera = new PerspectiveCamera(DIESEL_FEED.fovDeg, aspect, 1, 2000);
    camera.name = "markDiesel.feedCamera";
    const pose = feedCameraPose(frame);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);

    const throttle = new FeedThrottle(1 / DIESEL_FEED.fps);
    const screens: Object3D[] = [];
    const stats = { pictures: 0, lastMs: 0 };
    let inView = true;
    let drawing = false;

    const draw = (renderer: FeedRenderer, scene: Scene): boolean => {
        // `drawing`: the picture's own pass must not start another.
        if (drawing || !inView || !throttle.due) return false;
        drawing = true;
        const started = performance.now();
        const previous = {
            target: renderer.getRenderTarget(),
            face: renderer.getActiveCubeFace(),
            level: renderer.getActiveMipmapLevel(),
            xr: renderer.xr.enabled,
            shadows: renderer.shadowMap.autoUpdate,
        };
        // A screen can't show a picture that is being drawn into.
        const shown = screens.map((s) => s.visible);
        screens.forEach((s) => (s.visible = false));
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        try {
            renderer.setRenderTarget(target);
            // The depth buffer must be writable to be cleared.
            renderer.state.buffers.depth.setMask(true);
            renderer.clear();
            renderer.render(scene, camera as Camera);
        } finally {
            renderer.xr.enabled = previous.xr;
            renderer.shadowMap.autoUpdate = previous.shadows;
            renderer.setRenderTarget(
                previous.target,
                previous.face,
                previous.level,
            );
            screens.forEach((s, i) => (s.visible = shown[i]));
            drawing = false;
        }
        throttle.drawn();
        stats.pictures++;
        stats.lastMs = performance.now() - started;
        return true;
    };

    return {
        texture: target.texture,
        camera,
        attach(screen) {
            screens.push(screen);
            screen.onBeforeRender = (renderer, scene) => {
                draw(renderer as unknown as FeedRenderer, scene as Scene);
            };
        },
        tick(dt, cameraPosition) {
            throttle.tick(dt);
            inView = feedInView(cameraPosition, frame);
        },
        invalidate: () => throttle.invalidate(),
        draw,
        stats,
        dispose() {
            screens.forEach((s) => (s.onBeforeRender = () => {}));
            screens.length = 0;
            target.dispose();
        },
    };
}
