import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type RefObject,
} from "react";
import clsx from "clsx";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera, WebGLRenderer } from "three";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEFAULT_FIELD_THEME, type FieldProperties } from "@openmarch/core";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    allMarchersQueryOptions,
    fieldPropertiesQueryOptions,
    moveMarchersInTargetMutationOptions,
} from "@/hooks/queries";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useTimingObjects } from "@/hooks";
import { useFieldImage } from "@/view3d/window/useFieldImage";
import { useMarcherAppearanceSteps } from "@/hooks/useMarcherAppearanceSteps";
import type { AppearanceStepsByMarcherId } from "@/services/appearance/appearanceSteps";
import { getLivePlaybackPosition } from "@/components/timeline/audio/AudioPlayer";
import TimelineIsolationBar, {
    TimelineFromStartBadge,
} from "@/components/timeline/TimelineIsolationBar";
import {
    displayedBeat,
    isMarcherDimmed,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useIsolationPlanStore } from "@/timeline/timelineIsolationPlan";
import { playbackBeat } from "@/timeline/positionBuffer";
import type { BeatTiming } from "@/timeline/timeMap";
import { installFieldTestApi } from "@/field/fieldTestApi";
import {
    probeWebGL,
    reprobeWebGL,
    useFieldQualityStore,
} from "@/field/fieldQuality";
import { FieldEditor } from "@/field/editor/fieldEditor";
import { ruledMove } from "@/field/editor/moveRules";
import { setActiveFieldEditor } from "@/field/editor/activeFieldEditor";
import { takeFieldPress } from "@/field/takeFieldPress";
import { publishLinePreviews, useFieldLineTool } from "@/field/fieldLineTool";
import { isMacPlatform } from "@/shortcuts/platform";
import { planFieldImage } from "@/field/fieldPlan";
import { dropMarchersOnTimeline } from "@/field/fieldDrop";
import { FieldMarchers } from "./fieldMarchers";
import FieldOverlay from "./FieldOverlay";
import { attachFieldPointerInput } from "./fieldPointerInput";
import { cameraBounds, useFieldViewStore } from "./fieldView";
import {
    attachFieldNavigation,
    fitFullscreen,
    resetView,
    settleView,
} from "./fieldNavigation";
import { GlyphAtlas } from "./sdfText";
import { selectionBoxPadding } from "./selectionRing";
import { drawnSelectionBox, selectionHandles } from "./selectionFrame";
import { createThreeFieldTestApi } from "./threeFieldTestApi";
import FieldLayer from "./layers/FieldLayer";
import BackgroundImageLayer from "./layers/BackgroundImageLayer";
import MarchersLayer from "./layers/MarchersLayer";
import LabelsLayer from "./layers/LabelsLayer";
import OverlayLayer from "./layers/OverlayLayer";
import { useTimelineVisuals } from "./useTimelineVisuals";
import {
    KeptMarksOverlay,
    KeptMarksPlacer,
    KeptMarkTooltipView,
    useFieldKeptMarks,
    useKeptMarkTooltip,
    type KeptMarkElements,
} from "./KeptMarks";
import {
    currentFieldQuality,
    useFieldQuality,
    useGpuCrashWatch,
} from "./useFieldQuality";
import { FieldUnavailable, useFieldQualityNotice } from "./FieldQualityNotice";
import { CanvasErrorBoundary, ContextLossGuard } from "./fieldRecovery";
import FieldBenchmark from "@/field/benchmark/FieldBenchmark";
import { threeFieldView } from "@/field/benchmark/fieldScenarios";
import { r3fFrames } from "./benchmarkFrames";
import {
    CHECKPOINT_FONT,
    COLLISION_FONT,
    LABEL_FONT,
    NUMBER_FONT,
} from "./fieldFonts";

/**
 * Where the timeline's layers sit among the field's (#201): the isolated move's
 * scene and the page's pathways above the field text (1) and under the
 * labels (1.9) and marchers (2). Collision markers sit over the marchers.
 */
const FOCUS_ORDER = 1.4;
const PATHS_ORDER = 1.5;
const COLLISIONS_ORDER = 4;

/**
 * The three.js field, or an explanation in its place when its canvas can't get
 * a WebGL context (#205), instead of the app's error boundary.
 */
export default function ThreeField() {
    const [attempt, setAttempt] = useState(0);
    return (
        <CanvasErrorBoundary
            key={attempt}
            fallback={
                <FieldUnavailable
                    onRetry={() => {
                        reprobeWebGL();
                        setAttempt((n) => n + 1);
                    }}
                />
            }
            onError={(error) => {
                console.warn("The field couldn't start WebGL", error);
                useFieldQualityStore.setState({
                    gl: { kind: "none", renderer: null },
                });
            }}
        >
            <ThreeFieldView />
        </CanvasErrorBoundary>
    );
}

/**
 * The field, drawn with three.js (ADR 0005).
 * #192, the tracer bullet: it draws the field, and every marcher and its label
 * at the playhead, and installs the field test API. #199: each marcher in its
 * appearance at the playhead (the last flag crossed, `appearanceSteps`). #193: the
 * editor selects marchers by clicking them, with rings on the selected
 * marchers and a box around a multi-selection in the SVG overlay. #196:
 * dragging marchers, and saving the drop through the timeline.
 *
 * Guard rails (ADR 0005 D-2): it draws only on demand (`frameloop="demand"`;
 * playback and changes invalidate), there's one component per layer, and
 * positions reach the GPU through {@link FieldMarchers} in frame hooks, never
 * through React state.
 */
function ThreeFieldView() {
    const databaseReady = useDatabaseReady();
    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const { data: marcherRows } = useQuery(allMarchersQueryOptions());
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { isPlaying } = useIsPlaying()!;
    const { beats, pages } = useTimingObjects()!;
    const isFullscreen = useFullscreenStore((s) => s.isFullscreen);
    const perspective = useFullscreenStore((s) => s.perspective);
    const setPerspective = useFullscreenStore((s) => s.setPerspective);
    // The tilt is fullscreen's only: leaving fullscreen flattens the field
    useEffect(() => {
        if (!isFullscreen) setPerspective(0);
    }, [isFullscreen, setPerspective]);
    const { image: fieldImage } = useFieldImage();
    // Planned once, for the layer that draws it and the field test API
    const fieldImagePlan = useMemo(
        () =>
            fieldProperties
                ? planFieldImage(
                      fieldProperties,
                      fieldImage && {
                          width: fieldImage.width,
                          height: fieldImage.height,
                      },
                  )
                : null,
        [fieldProperties, fieldImage],
    );
    const appearanceSteps = useMarcherAppearanceSteps(true);
    const { mutateAsync: moveMarchers } = useMutation(
        moveMarchersInTargetMutationOptions(),
    );

    // Weak machines (#205): what draws WebGL here, known before the canvas mounts
    const [probed] = useState(
        () => useFieldQualityStore.getState().gl ?? probeWebGL(),
    );
    useLayoutEffect(() => {
        if (!useFieldQualityStore.getState().gl)
            useFieldQualityStore.setState({ gl: probed });
    }, [probed]);
    useGpuCrashWatch();
    const quality = useFieldQuality();
    useFieldQualityNotice(quality.reason);
    // A new key starts the field over on a new canvas, with a new context
    const [canvasKey, setCanvasKey] = useState(0);
    const startOver = useCallback(() => setCanvasKey((key) => key + 1), []);

    const marchers = useMemo(() => new FieldMarchers(), []);
    const labels = useMemo(
        () =>
            new Map(
                (marcherRows ?? []).map((marcher) => [
                    marcher.id,
                    marcher.drill_number,
                ]),
            ),
        [marcherRows],
    );
    const atlases = useMemo(
        () => ({
            label: new GlyphAtlas(LABEL_FONT),
            number: new GlyphAtlas(NUMBER_FONT),
            checkpoint: new GlyphAtlas(CHECKPOINT_FONT),
            collision: new GlyphAtlas(COLLISION_FONT),
        }),
        [],
    );
    useEffect(
        () => () => {
            atlases.label.dispose();
            atlases.number.dispose();
            atlases.checkpoint.dispose();
            atlases.collision.dispose();
        },
        [atlases],
    );

    const selectedIds = useMemo(
        () => selectedMarchers.map((marcher) => marcher.id),
        [selectedMarchers],
    );
    // The editor reads the selection it last wrote until React renders it, so
    // a second click before then builds on the first
    const selection = useRef<readonly number[]>(selectedIds);
    useLayoutEffect(() => {
        selection.current = selectedIds;
    }, [selectedIds]);

    // #201: the timeline's pathways, isolation scene, collisions, dimming and kept marks
    const marcherIds = useMemo(
        () => marcherRows?.map((marcher) => marcher.id),
        [marcherRows],
    );
    const timeline = useTimelineVisuals({
        isPlaying,
        selectedPage,
        pages,
        marcherIds,
        fieldProperties,
    });
    const { dimming } = timeline;
    const keptMarks = useFieldKeptMarks({
        enabled: timeline.ready,
        isPlaying,
        pages,
        pageId: selectedPage?.id,
        marcherIds,
    });
    const keptMarkElements = useRef<KeptMarkElements>(new Map());
    const root = useRef<HTMLDivElement>(null);
    const keptMarkTooltip = useKeptMarkTooltip({
        target: root,
        marks: keptMarks,
        marchers,
    });

    // The field test API and the editor read the latest of these, not the render they came from
    const element = useRef<HTMLElement | null>(null);
    const renderer = useRef<WebGLRenderer | null>(null);
    const benchFrames = useMemo(() => r3fFrames(() => renderer.current), []);
    const benchElement = useCallback(
        () => renderer.current?.domElement ?? null,
        [],
    );
    const benchView = useMemo(
        () => threeFieldView(benchElement),
        [benchElement],
    );
    const benchMarchers = useCallback(() => marchers.ids.length, [marchers]);
    const latest = useRef({
        labels,
        pageId: selectedPage?.id ?? null,
        marcherRows,
        setSelectedMarchers,
        moveMarchers,
        fieldImage: fieldImagePlan,
        theme: fieldProperties?.theme,
        fieldProperties,
    });
    latest.current = {
        labels,
        pageId: selectedPage?.id ?? null,
        fieldImage: fieldImagePlan,
        theme: fieldProperties?.theme,
        marcherRows,
        setSelectedMarchers,
        moveMarchers,
        fieldProperties,
    };

    const editor = useMemo(
        () =>
            new FieldEditor(
                {
                    selection: {
                        get: () => selection.current,
                        set(ids) {
                            const byId = new Map(
                                (latest.current.marcherRows ?? []).map(
                                    (marcher) => [marcher.id, marcher],
                                ),
                            );
                            // Only marchers the app knows, as the context will hold them
                            const selected = ids.flatMap(
                                (id) => byId.get(id) ?? [],
                            );
                            selection.current = selected.map((m) => m.id);
                            latest.current.setSelectedMarchers(selected);
                        },
                    },
                    marchers: () => marchers,
                    zoom: () => useFieldViewStore.getState().zoom,
                    // UI-9: marchers dimmed outside the isolated move can't be selected or hit
                    canSelect: (id) =>
                        !isMarcherDimmed(
                            useTimelineSelectionStore.getState(),
                            id,
                        ),
                    takePress: takeFieldPress,
                    selectionBoxPadding: () =>
                        selectionBoxPadding(useFieldViewStore.getState().zoom),
                    showPositions: (positions) =>
                        marchers.setOverrides(positions),
                    // #196: drops go through the drop-to-timeline path
                    drop: (positions) =>
                        dropMarchersOnTimeline(
                            positions,
                            latest.current.moveMarchers,
                        ),
                    // #203: the line tool's previews are the alignment event's, which Shift+Enter applies
                    lineFinished: publishLinePreviews,
                    stepGrid: () => latest.current.fieldProperties ?? null,
                },
                {
                    isMac: isMacPlatform(),
                    // #197: snapping, Shift, Alt and Lock X/Y, read as they are on each move
                    moveTransform: ruledMove(() => {
                        const { coordinateRounding, lockX, lockY } =
                            useUiSettingsStore.getState().uiSettings;
                        return {
                            rounding: coordinateRounding,
                            lockX,
                            lockY,
                            grid: latest.current.fieldProperties ?? null,
                        };
                    }),
                },
            ),
        [marchers],
    );
    useEffect(() => {
        setActiveFieldEditor(editor);
        return () => setActiveFieldEditor(null);
    }, [editor]);
    // A rotation typed into the inspector belongs to its selection and page:
    // when either changes before it's saved, it's dropped (#198)
    useEffect(() => editor.selectionChanged(), [editor, selectedIds]);
    const pageId = selectedPage?.id;
    useEffect(() => editor.cancelRotation(), [editor, pageId]);
    useFieldLineTool(editor);
    // A finished line follows its marchers to another page
    useEffect(
        () => marchers.subscribe(() => editor.refreshLineTool()),
        [marchers, editor],
    );

    useEffect(() => {
        installFieldTestApi(
            createThreeFieldTestApi({
                marchers,
                labels: () => latest.current.labels,
                view: () => useFieldViewStore.getState(),
                element: () => element.current,
                pageId: () => latest.current.pageId,
                quality: currentFieldQuality,
                contextLost: () => useFieldQualityStore.getState().contextLost,
                selection: () => selection.current,
                activeGesture: () => editor.activeGesture(),
                handles() {
                    const box = drawnSelectionBox(marchers, editor);
                    return (
                        box &&
                        selectionHandles(box, useFieldViewStore.getState().zoom)
                    );
                },
                lineTool: () => editor.lineToolShape(),
                fieldImage: () => latest.current.fieldImage,
                theme: () => latest.current.theme ?? DEFAULT_FIELD_THEME,
                dimmed: (id) => dimming.isDimmed(id),
            }),
        );
        return () => installFieldTestApi(undefined);
    }, [marchers, editor, dimming]);

    // Navigation (#194): wheel, pan drags and touch anywhere on the field
    useEffect(() => {
        if (!root.current) return;
        return attachFieldNavigation(
            root.current,
            () => element.current,
            () => useUiSettingsStore.getState().uiSettings.mouseSettings,
        );
    }, []);
    // The view opens once the field and a page are loaded. Latched: a page
    // briefly unselected mustn't reset the view
    const [ready, setReady] = useState(false);
    if (!ready && fieldProperties && selectedPage) setReady(true);
    // Until the layout settles, the view is still the opening view
    const settled = useRef(false);
    // Here, not in the camera: a canvas started over after a lost context
    // keeps the view
    const opened = useRef(false);
    useFullscreenFit(root, isFullscreen, ready, settled);

    return (
        <div
            ref={root}
            // Fullscreen leaves room above the field, and the field takes no
            // input there
            className={clsx(
                "rounded-6 relative h-full w-full touch-none overflow-hidden",
                isFullscreen && "pointer-events-none pt-128",
            )}
            style={TILT_PERSPECTIVE}
            data-testid="threeField"
        >
            <TimelineIsolationBar />
            <TimelineFromStartBadge />
            <FieldBenchmark
                frames={benchFrames}
                view={benchView}
                element={benchElement}
                marcherCount={benchMarchers}
            />
            {quality.reason === "noWebGL" && (
                <FieldUnavailable
                    onRetry={() => {
                        reprobeWebGL();
                        startOver();
                    }}
                />
            )}
            <div
                // Fullscreen's perspective (UI-12) tilts the field and what's
                // drawn over it together. The field takes no input in
                // fullscreen, so nothing hit-tests through the tilt
                className="relative h-full w-full"
                style={tiltStyle(perspective)}
                data-testid="fieldTilt"
            >
                {fieldProperties && quality.reason !== "noWebGL" && (
                    <Canvas
                        // Sized by layout, not by the tilted box on screen
                        resize={{ offsetSize: true }}
                        key={canvasKey}
                        // The field canvas, for the scenarios
                        data-testid="fieldCanvas"
                        frameloop="demand"
                        orthographic
                        // Bounds given here make the camera manual: `FieldCamera` sets them
                        camera={{
                            left: 0,
                            right: 1,
                            top: 0,
                            bottom: 1,
                            near: 0.1,
                            far: 100,
                            position: [0, 0, 10],
                        }}
                        dpr={quality.settings.dpr}
                        // Colors are drawn as the theme gives them, with no tone mapping
                        flat
                        linear
                        gl={{
                            powerPreference: "high-performance",
                            antialias: false,
                        }}
                        onCreated={({ gl }) => {
                            element.current = gl.domElement;
                            renderer.current = gl;
                        }}
                    >
                        <ContextLossGuard onGiveUp={startOver} />
                        <FieldCamera
                            fieldProperties={fieldProperties}
                            root={root}
                            ready={ready}
                            opened={opened}
                            settled={settled}
                        />
                        <EditorInput
                            editor={editor}
                            marchers={marchers}
                            selectedIds={selectedIds}
                        />
                        <PlayheadDriver
                            marchers={marchers}
                            isPlaying={isPlaying}
                            beats={beats}
                            appearanceSteps={appearanceSteps}
                        />
                        <FieldLayer
                            fieldProperties={fieldProperties}
                            numberAtlas={atlases.number}
                            labelAtlas={atlases.checkpoint}
                        />
                        <BackgroundImageLayer
                            image={fieldImage}
                            placement={fieldImagePlan}
                        />
                        <OverlayLayer
                            plan={timeline.focus}
                            renderOrder={FOCUS_ORDER}
                        />
                        <OverlayLayer
                            plan={timeline.paths}
                            renderOrder={PATHS_ORDER}
                        />
                        <MarchersLayer
                            marchers={marchers}
                            dimming={dimming}
                            theme={fieldProperties.theme}
                        />
                        <LabelsLayer
                            marchers={marchers}
                            dimming={dimming}
                            labels={labels}
                            theme={fieldProperties.theme}
                            atlas={atlases.label}
                        />
                        <OverlayLayer
                            plan={timeline.collisions}
                            renderOrder={COLLISIONS_ORDER}
                            atlas={atlases.collision}
                        />
                        <KeptMarksPlacer
                            marks={keptMarks}
                            marchers={marchers}
                            elements={keptMarkElements}
                        />
                    </Canvas>
                )}
                {fieldProperties && (
                    <FieldOverlay
                        marchers={marchers}
                        editor={editor}
                        theme={fieldProperties.theme}
                    />
                )}
                <KeptMarksOverlay
                    marks={keptMarks}
                    elements={keptMarkElements}
                />
            </div>
            <KeptMarkTooltipView tooltip={keptMarkTooltip} />
        </div>
    );
}

/** The tilt's depth: the field is viewed from 1500 CSS px away, at its center. */
const TILT_PERSPECTIVE: CSSProperties = {
    perspective: "1500px",
    perspectiveOrigin: "center center",
};

/**
 * Fullscreen's perspective: the field leans back `degrees` about a line
 * below its center, which looks more natural, and eases into each angle.
 */
const tiltStyle = (degrees: number): CSSProperties => ({
    transform: degrees === 0 ? undefined : `rotateX(${degrees}deg)`,
    transformOrigin: "center 70%",
    transition: "transform 0.2s ease-out",
});

/** How long to wait for the fullscreen layout to settle. */
const FULLSCREEN_SETTLE_MS = 250;

/**
 * Entering fullscreen fits the whole field and clears the selection, and
 * leaving it centers the field at the base zoom again, once the layout has
 * settled. The field also centers again that long after it's `ready`, as the
 * app's panels finish laying out around it, and marks the view `settled`.
 */
function useFullscreenFit(
    root: RefObject<HTMLDivElement | null>,
    isFullscreen: boolean,
    ready: boolean,
    settled: RefObject<boolean>,
) {
    const { setSelectedMarchers } = useSelectedMarchers()!;
    // Read when it runs: the effect follows fullscreen and readiness only
    const clearSelection = useRef(() => setSelectedMarchers([]));
    clearSelection.current = () => setSelectedMarchers([]);
    const opening = useRef(true);
    useEffect(() => {
        if (!ready) return;
        // Until it has run once, it's the show opening; then fullscreen changes
        const first = opening.current;
        let frame = 0;
        const timeout = setTimeout(() => {
            frame = requestAnimationFrame(() => {
                opening.current = false;
                settled.current = true;
                if (!isFullscreen) {
                    if (first) settleView();
                    else resetView();
                    return;
                }
                if (root.current)
                    fitFullscreen({
                        width: root.current.clientWidth,
                        height: root.current.clientHeight,
                    });
                clearSelection.current();
            });
        }, FULLSCREEN_SETTLE_MS);
        return () => {
            clearTimeout(timeout);
            cancelAnimationFrame(frame);
        };
    }, [isFullscreen, ready, root, settled]);
}

/**
 * Keeps the view store's size and field in step with the canvas, opens the
 * show centered at the base zoom once it's `ready`, and points the camera at
 * the store's view. Until the view has `settled`, a resize centers it again.
 * After that a resize keeps the zoom and where the field sits from the
 * top-left; in fullscreen it fits the field again.
 */
function FieldCamera({
    fieldProperties,
    root,
    ready,
    opened,
    settled,
}: {
    fieldProperties: FieldProperties;
    root: RefObject<HTMLDivElement | null>;
    ready: boolean;
    opened: RefObject<boolean>;
    settled: RefObject<boolean>;
}) {
    const width = useThree((s) => s.size.width);
    const height = useThree((s) => s.size.height);
    const camera = useThree((s) => s.camera) as OrthographicCamera;
    const invalidate = useThree((s) => s.invalidate);

    useLayoutEffect(() => {
        const field = {
            width: fieldProperties.width,
            height: fieldProperties.height,
        };
        useFieldViewStore.setState({ width, height, field });
        if (width <= 0 || height <= 0 || !ready) return;
        if (!opened.current) {
            opened.current = true;
            resetView();
        } else if (useFullscreenStore.getState().isFullscreen && root.current) {
            fitFullscreen({
                width: root.current.clientWidth,
                height: root.current.clientHeight,
            });
        } else if (!settled.current) {
            settleView();
        }
    }, [width, height, fieldProperties, root, ready, opened, settled]);

    useLayoutEffect(() => {
        const apply = () => {
            const view = useFieldViewStore.getState();
            if (view.width <= 0 || view.height <= 0) return;
            Object.assign(camera, cameraBounds(view));
            camera.updateProjectionMatrix();
            invalidate();
        };
        apply();
        return useFieldViewStore.subscribe(apply);
    }, [camera, invalidate]);

    return null;
}

/**
 * Sends the pointer on the canvas to the editor, and marks the app's
 * selection on the marchers for their rings and the overlay's box. Draws the
 * marchers the editor moves.
 */
function EditorInput({
    editor,
    marchers,
    selectedIds,
}: {
    editor: FieldEditor;
    marchers: FieldMarchers;
    selectedIds: readonly number[];
}) {
    const canvas = useThree((s) => s.gl.domElement);
    const invalidate = useThree((s) => s.invalidate);

    useEffect(() => attachFieldPointerInput(canvas, editor), [canvas, editor]);
    // A drag moves marchers outside the playhead's fills: draw them
    useEffect(() => marchers.subscribe(invalidate), [marchers, invalidate]);

    useEffect(() => {
        marchers.setSelection(selectedIds);
        invalidate();
    }, [marchers, selectedIds, invalidate]);

    return null;
}

/**
 * Moves the marchers to the playhead, and gives them their appearance steps
 * (`FieldMarchers` samples them with the positions). Paused, it follows the beat the timeline
 * shows (the playhead, or a held preview frame) through a store subscription,
 * so a scrub draws each beat without re-rendering React. Playing, it samples
 * the live playback time in a frame hook and asks for the next frame.
 */
function PlayheadDriver({
    marchers,
    isPlaying,
    beats,
    appearanceSteps,
}: {
    marchers: FieldMarchers;
    isPlaying: boolean;
    beats: readonly BeatTiming[];
    appearanceSteps: AppearanceStepsByMarcherId | undefined;
}) {
    const invalidate = useThree((s) => s.invalidate);

    useEffect(() => {
        marchers.setAppearanceSteps(appearanceSteps);
        invalidate();
    }, [marchers, appearanceSteps, invalidate]);
    // A new version means new answers from the resolver
    const version = useTimelineResolverStore((s) => s.version);
    const isolationPlan = useIsolationPlanStore((s) => s.current);

    useEffect(() => {
        if (isPlaying) {
            invalidate();
            return;
        }
        const draw = (beat: number) => {
            if (marchers.fill(beat, isolationPlan)) invalidate();
        };
        let drawn = displayedBeat(useTimelineSelectionStore.getState());
        draw(drawn);
        return useTimelineSelectionStore.subscribe((state) => {
            const at = displayedBeat(state);
            if (at === drawn) return;
            drawn = at;
            // Called inside the store's write: a failed draw mustn't stop its other listeners
            try {
                draw(at);
            } catch (error) {
                console.error(
                    "Error drawing the marchers at the playhead",
                    error,
                );
            }
        });
    }, [isPlaying, version, isolationPlan, marchers, invalidate]);

    // Before the layers' frame hooks (priority 0), so they draw this frame's positions
    useFrame(() => {
        if (!isPlaying) return;
        marchers.fill(playbackBeat(beats, getLivePlaybackPosition() * 1000));
        invalidate();
    }, -1);

    return null;
}
