import { useEffect, useLayoutEffect, type ReactNode } from "react";
import {
    advance,
    createRoot,
    unmountComponentAtNode,
    useThree,
} from "@react-three/fiber";
import type { OrthographicCamera } from "three";
import { createStore, type StoreApi } from "zustand";
import type { FieldProperties } from "@openmarch/core";
import {
    FieldContextLostError,
    NoWebGLError,
    probeWebGL,
    QUALITY_SETTINGS,
    type QualitySettings,
} from "@/field/fieldQuality";
import { planFieldImage } from "@/field/fieldPlan";
import type { PositionSource } from "@/timeline/positionBuffer";
import type { AppearanceStepsByMarcherId } from "@/services/appearance/appearanceSteps";
import { FieldDimming } from "./fieldDimming";
import { FieldDrawContext, type FieldDraw } from "./fieldDrawContext";
import { FieldMarchers } from "./fieldMarchers";
import { cameraBounds, type FieldView } from "./fieldView";
import { GlyphAtlas } from "./sdfText";
import { CHECKPOINT_FONT, LABEL_FONT, NUMBER_FONT } from "./fieldFonts";
import FieldLayer from "./layers/FieldLayer";
import BackgroundImageLayer from "./layers/BackgroundImageLayer";
import MarchersLayer from "./layers/MarchersLayer";
import LabelsLayer from "./layers/LabelsLayer";

export interface OffscreenFieldArgs {
    fieldProperties: FieldProperties;
    /** Where the marchers are at a beat: the export's own resolver. */
    source: PositionSource;
    /** Each marcher's appearance over the show, as the field draws it (the last flag crossed). */
    appearanceSteps: AppearanceStepsByMarcherId | undefined;
    /** Each marcher's drill number, by id. */
    labels: ReadonlyMap<number, string>;
    /** The decoded field image, or null when the show has none. */
    image: ImageBitmap | null;
    width: number;
    height: number;
}

/**
 * The new field drawn off screen, one frame at a time (#207): the video
 * export's frames and its preview. It mounts the on-screen field's layers
 * (field, image, marchers, labels) in their own React Three Fiber root, on a
 * canvas that's never in the page, with its own view and always at full
 * quality (`EXPORT_QUALITY`): an export looks the same on a software-GL
 * machine as on a GPU.
 *
 * Frames are drawn only when asked (`frameloop: "never"`). `draw(beat)`
 * samples the marchers, runs the layers' frame hooks and renders, all
 * synchronously, so the canvas holds that beat's frame when it returns. It's
 * kept until the next draw (`preserveDrawingBuffer`), for the caller to copy.
 * If the context is lost, `draw` throws `FieldContextLostError`.
 */
export interface OffscreenField {
    /** The drawn frame, `width` × `height` pixels, transparent outside the field. */
    readonly canvas: HTMLCanvasElement;
    /** Which field units the frame shows; its size becomes the canvas's. */
    setView(view: FieldView): void;
    /** Draws the marchers at `beat`. */
    draw(beat: number): void;
    dispose(): void;
}

export async function createOffscreenField(
    args: OffscreenFieldArgs,
): Promise<OffscreenField> {
    const canvas = document.createElement("canvas");
    canvas.width = args.width;
    canvas.height = args.height;
    const root = createRoot(canvas);
    try {
        await root.configure({
            frameloop: "never",
            size: { width: args.width, height: args.height, top: 0, left: 0 },
            dpr: 1,
            orthographic: true,
            // Bounds given here make the camera manual: `ViewCamera` sets them
            camera: {
                left: 0,
                right: 1,
                top: 0,
                bottom: 1,
                near: 0.1,
                far: 100,
                position: [0, 0, 10],
            },
            flat: true,
            linear: true,
            gl: {
                antialias: false,
                alpha: true,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
            },
        });
    } catch (error) {
        root.unmount();
        // Only a context that can't be created means no WebGL; anything else is a bug to report
        if (probeWebGL().kind === "none") throw new NoWebGLError(error);
        throw error;
    }

    const view = createStore<FieldView>(() => ({
        width: args.width,
        height: args.height,
        zoom: 1,
        panX: 0,
        panY: 0,
    }));
    const draw: FieldDraw = { view, quality: () => EXPORT_QUALITY };
    const marchers = new FieldMarchers(args.source);
    marchers.setAppearanceSteps(args.appearanceSteps);
    const atlases = {
        label: new GlyphAtlas(LABEL_FONT),
        number: new GlyphAtlas(NUMBER_FONT),
        checkpoint: new GlyphAtlas(CHECKPOINT_FONT),
    };
    const placement = planFieldImage(
        args.fieldProperties,
        args.image && { width: args.image.width, height: args.image.height },
    );

    let mounted!: () => void;
    const ready = new Promise<void>((resolve) => (mounted = resolve));
    const store = root.render(
        <FieldDrawContext.Provider value={draw}>
            <Mounted onMounted={mounted}>
                <ViewCamera view={view} />
                <FieldLayer
                    fieldProperties={args.fieldProperties}
                    numberAtlas={atlases.number}
                    labelAtlas={atlases.checkpoint}
                />
                <BackgroundImageLayer
                    image={args.image}
                    placement={placement}
                />
                <MarchersLayer
                    marchers={marchers}
                    dimming={NO_DIMMING}
                    theme={args.fieldProperties.theme}
                />
                <LabelsLayer
                    marchers={marchers}
                    dimming={NO_DIMMING}
                    labels={args.labels}
                    theme={args.fieldProperties.theme}
                    atlas={atlases.label}
                />
            </Mounted>
        </FieldDrawContext.Provider>,
    );
    // A layer that fails to mount never reports it: give up rather than wait forever
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            ready,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(new Error("The field didn't start off screen")),
                    MOUNT_TIMEOUT_MS,
                );
            }),
        ]);
    } catch (error) {
        root.unmount();
        throw error;
    } finally {
        clearTimeout(timer);
    }
    const state = store.getState();
    state.gl.setClearColor(0x000000, 0);

    let disposed = false;
    return {
        canvas,
        setView(next) {
            const { size } = store.getState();
            if (size.width !== next.width || size.height !== next.height)
                store.getState().setSize(next.width, next.height, 0, 0);
            view.setState(next);
        },
        draw(beat) {
            marchers.fill(beat);
            const state = store.getState();
            // This root only: the on-screen field draws on its own
            advance(performance.now() / 1000, false, state);
            // A lost context draws nothing: say so rather than save empty frames
            if (state.gl.getContext().isContextLost())
                throw new FieldContextLostError();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            // Also disposes the renderer and loses its context, so exports and
            // previews don't pile up contexts. The atlases go once the layers
            // drawing with them have unmounted.
            unmountComponentAtNode(canvas, () => {
                atlases.label.dispose();
                atlases.number.dispose();
                atlases.checkpoint.dispose();
            });
        },
    };
}

/**
 * Full quality, whatever the machine. Labels never fade: an export draws them
 * at every size, and its preview shows what the video will.
 */
const EXPORT_QUALITY: QualitySettings = {
    ...QUALITY_SETTINGS.full,
    labelFadeFrom: -1,
    labelFadeTo: 0,
};

/** How long the layers may take to mount. */
const MOUNT_TIMEOUT_MS = 20_000;

/** Nobody is dimmed in an export. */
const NO_DIMMING = new FieldDimming();

/** Resolves once everything under it has mounted: a parent's effects run after its children's. */
function Mounted({
    onMounted,
    children,
}: {
    onMounted: () => void;
    children: ReactNode;
}) {
    useEffect(() => onMounted(), [onMounted]);
    return <>{children}</>;
}

/** Points the camera at the view, as `ThreeField`'s `FieldCamera` does on screen. */
function ViewCamera({ view }: { view: StoreApi<FieldView> }) {
    const camera = useThree((s) => s.camera) as OrthographicCamera;
    useLayoutEffect(() => {
        const apply = () => {
            Object.assign(camera, cameraBounds(view.getState()));
            camera.updateProjectionMatrix();
        };
        apply();
        return view.subscribe(apply);
    }, [camera, view]);
    return null;
}
