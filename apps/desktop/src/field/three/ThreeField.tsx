import type { CountClock } from "@/timeline/countGrid";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
} from "react";
import clsx from "clsx";
import { useShallow } from "zustand/react/shallow";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera, WebGLRenderer } from "three";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEFAULT_FIELD_THEME, type FieldProperties } from "@openmarch/core";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { LABEL_SIZE_SCALE, useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsPreviewMode } from "@/stores/PreviewModeStore";
import { onScreenToggles } from "@/stores/TouchModifierStore";
import {
    allItemsQueryOptions,
    allMarcherRowsQueryOptions,
    fieldPropertiesQueryOptions,
    itemGeometryQueryOptions,
    moveMarchersInTargetMutationOptions,
} from "@/hooks/queries";
import {
    beatIndexesById,
    itemOutlineChanges,
} from "@/items/itemOutlineTimeline";
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
    fieldBeat,
    isMarcherDimmed,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useIsolationPlanStore } from "@/timeline/timelineIsolationPlan";
import { playbackBeat } from "@/timeline/positionBuffer";
import { installFieldTestApi } from "@/field/fieldTestApi";
import {
    probeWebGL,
    reprobeWebGL,
    useFieldQualityStore,
} from "@/field/fieldQuality";
import { FieldEditor } from "@/field/editor/fieldEditor";
import { settingsMoveOptions } from "@/field/editor/settingsMoveOptions";
import { VisualsFieldEditor } from "@/field/editor/visualsFieldEditor";
import { useIsVisualsView } from "@/stores/WorkspaceViewStore";
import { setActiveFieldEditor } from "@/field/editor/activeFieldEditor";
import { takeFieldPress } from "@/field/takeFieldPress";
import { setShapeField } from "@/shapes/field/shapeField";
import { useShapeFieldModes } from "@/shapes/field/useShapeFieldModes";
import {
    boxPressSelection,
    canReachInside,
    enterBox,
} from "@/shapes/placed/boxSelection";
import {
    drawnPlacedBoxes,
    PlacedBoxesOverlay,
} from "@/shapes/placed/PlacedBoxesOverlay";
import { ShapeEditor } from "@/shapes/editor/ShapeEditorBar";
import { useShapeEditorStore } from "@/shapes/frame/shapeEditorStore";
import FavoritesRing from "@/shapes/tool/FavoritesRing";
import DockedCommandBar from "@/shortcuts/palette/DockedCommandBar";
import { useShapeFocus } from "@/shapes/field/useShapeFocus";
import { useFieldItemWrites } from "@/field/fieldItemWrites";
import {
    snapToRounding,
    useFieldPropTool,
    usePropDrawn,
} from "@/field/fieldPropTool";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import { isMacPlatform } from "@/shortcuts/platform";
import { planFieldImage } from "@/field/fieldPlan";
import { dropMarchersOnTimeline } from "@/field/fieldDrop";
import { FieldMarchers } from "./fieldMarchers";
import { FieldItems } from "./fieldItems";
import FieldOverlay from "./FieldOverlay";
import TouchModifierButtons from "@/components/canvas/touch/TouchModifierButtons";
import FieldContextMenu, { useFieldMenu } from "./FieldContextMenu";
import { attachFieldPointerInput } from "./fieldPointerInput";
import { cameraBounds, useFieldViewStore } from "./fieldView";
import {
    attachFieldNavigation,
    fitAfterResize,
    glideToFitAfterResize,
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
import ItemsLayer from "./layers/ItemsLayer";
import LabelsLayer, { type LabelStyle } from "./layers/LabelsLayer";
import OverlayLayer from "./layers/OverlayLayer";
import StartFlagLayers from "./StartFlagLayers";
import { useTimelineVisuals } from "./useTimelineVisuals";
import { drawnFollowing } from "./fieldFollowing";
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
import PropDrawingNotice from "@/components/items/PropDrawingNotice";
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
/** Props and equipment lie on the field, under everything the timeline draws (C2.1). */
const ITEMS_ORDER = 1.3;
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
    // Items too: the field draws and selects props and equipment
    const { data: marcherRows } = useQuery(allMarcherRowsQueryOptions());
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { isPlaying } = useIsPlaying()!;
    const { beats, pages, countGrid } = useTimingObjects()!;
    const preview = useIsPreviewMode();
    const panning = useFieldViewStore((s) => s.panning);
    const { image: fieldImage, size: fieldImageSize } = useFieldImage();
    // Planned once, for the layer that draws it and the field test API
    const fieldImagePlan = useMemo(
        () =>
            fieldProperties
                ? planFieldImage(
                      fieldProperties,
                      fieldImage && {
                          width: fieldImage.width,
                          height: fieldImage.height,
                          size: fieldImageSize,
                      },
                  )
                : null,
        [fieldProperties, fieldImage, fieldImageSize],
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
    // The View tab's label form: full drill numbers ("OT12"), or the number only ("12")
    const { labelForm, labelSize, labelPosition } = useUiSettingsStore(
        useShallow((s) => ({
            labelForm: s.uiSettings.marcherLabels ?? "auto",
            labelSize: s.uiSettings.marcherLabelSize ?? "normal",
            labelPosition: s.uiSettings.marcherLabelPosition ?? "above",
        })),
    );
    const numbersOnly = labelForm === "numbers";
    const items = useMemo(() => new FieldItems(marchers), [marchers]);
    const itemLabels = useFieldItems(items, beats);
    const saveItem = useFieldItemWrites(items);
    const propDrawn = usePropDrawn();
    const labels = useMemo(
        () =>
            new Map(
                (marcherRows ?? []).map((marcher) => [
                    marcher.id,
                    itemLabels.get(marcher.id) ??
                        (numbersOnly
                            ? String(marcher.drill_order)
                            : marcher.drill_number),
                ]),
            ),
        [marcherRows, numbersOnly, itemLabels],
    );
    const labelStyle = useMemo(
        (): LabelStyle => ({
            form:
                labelForm === "auto"
                    ? "auto"
                    : labelForm === "off"
                      ? "off"
                      : "fixed",
            scale: LABEL_SIZE_SCALE[labelSize],
            beside: labelPosition === "beside",
        }),
        [labelForm, labelSize, labelPosition],
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
    const { dimming, following } = timeline;
    useShapeFocus(dimming);
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
        saveItem,
        propDrawn,
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
        saveItem,
        propDrawn,
        labels,
        pageId: selectedPage?.id ?? null,
        fieldImage: fieldImagePlan,
        theme: fieldProperties?.theme,
        marcherRows,
        setSelectedMarchers,
        moveMarchers,
        fieldProperties,
    };
    // #315: where a right-click opens the field's menu (`useFieldMenu`, below
    // the editor), and whether it's open: a press that closes it does nothing more
    const openMenuAt = useRef((_at: { x: number; y: number }) => {});
    const menuShown = useRef(false);

    const editor = useMemo(
        () =>
            new VisualsFieldEditor(
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
                    takePress: () => menuShown.current || takeFieldPress(),
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
                    // #204: a click on a placed box's member selects the whole box
                    pressSelection: (hit, shift, reachInside) =>
                        boxPressSelection(
                            hit,
                            shift,
                            selection.current,
                            reachInside,
                        ),
                    reachesInside: canReachInside,
                    doubleClickMarcher: enterBox,
                    // C2.1: items are hit anywhere inside their Outline
                    isItem: (id) => items.isItem(id),
                    itemAt: (point) => items.itemAt(point),
                    itemFrame: (id) => items.frameOf(id),
                    previewItem: (id, size) =>
                        items.setPreview(
                            id,
                            size && {
                                width: size.width / PIXELS_PER_METER,
                                depth: size.depth / PIXELS_PER_METER,
                                rotation: size.rotation,
                            },
                        ),
                    saveItem: (id, size) => latest.current.saveItem(id, size),
                    snap: (point) =>
                        snapToRounding(point, latest.current.fieldProperties),
                    propDrawn: (outline) => latest.current.propDrawn(outline),
                    // #315: a right-click opens the field's menu there
                    openMenu: (at) => openMenuAt.current(at.screen),
                },
                {
                    isMac: isMacPlatform(),
                    // The touch pill's Fine, Equal, From center and Add
                    onScreen: onScreenToggles,
                    // #197: snapping, the Snap toggle and Lock X/Y, read as they are on each
                    // move; off, the Snap toggle frees a rotate handle too
                    ...settingsMoveOptions(
                        () => latest.current.fieldProperties ?? null,
                    ),
                    // #545: the box's ratio lock is the selection's too
                    ratioLocked: () =>
                        useShapeEditorStore.getState().ratioLocked,
                },
            ),
        [marchers, items],
    );
    useEffect(() => {
        setActiveFieldEditor(editor);
        return () => setActiveFieldEditor(null);
    }, [editor]);
    // Visuals mode edits cues: the field only selects there (performer-behavior.md 7.1). Preview
    // edits nothing: the editor hears no presses there at all (`EditorInput`), only navigation
    const visuals = useIsVisualsView();
    const previewing = useIsPreviewMode();
    useEffect(
        () => editor.setReadOnly(visuals || previewing),
        [editor, visuals, previewing],
    );
    // A rotation typed into the inspector belongs to its selection and page:
    // when either changes before it's saved, it's dropped (#198)
    useEffect(() => editor.selectionChanged(), [editor, selectedIds]);
    const pageId = selectedPage?.id;
    useEffect(() => editor.cancelRotation(), [editor, pageId]);
    // #204: the shape tool and placed boxes read this field
    useEffect(() => {
        setShapeField({
            fieldProperties: () => latest.current.fieldProperties,
            zoom: () => useFieldViewStore.getState().zoom,
            marchers: () => latest.current.marcherRows,
            drawn: (ids) => marchers.drawn(ids),
        });
        return () => setShapeField(null);
    }, [marchers]);
    useShapeFieldModes(editor, isPlaying);
    useFieldPropTool(editor);
    const menu = useFieldMenu({
        marchers,
        editor,
        hasSelection: selectedIds.length > 0,
    });
    openMenuAt.current = menu.openAt;
    menuShown.current = menu.at !== null;
    const timelineMode = useTimelineResolverStore((s) => s.resolver !== null);

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
                    const box = drawnSelectionBox(marchers, editor, items);
                    return (
                        box &&
                        selectionHandles(box, useFieldViewStore.getState().zoom)
                    );
                },
                modeDrawing: () => editor.modeDrawing(),
                placedBoxes: drawnPlacedBoxes,
                items,
                propTool: () => editor.propToolShape(),
                fieldImage: () => latest.current.fieldImage,
                theme: () => latest.current.theme ?? DEFAULT_FIELD_THEME,
                dimmed: (id) => dimming.isDimmed(id),
                opacity: (id) => dimming.opacityOf(id),
                labelShown: (id) => dimming.labelShown(id),
                following: (id) => drawnFollowing(dimming, following, id),
            }),
        );
        return () => installFieldTestApi(undefined);
    }, [marchers, items, editor, dimming, following]);

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
    usePreviewFit(preview, ready, settled);

    return (
        <div
            ref={root}
            // Preview edits nothing, but the view still moves: a hand to drag it
            className={clsx(
                "rounded-6 relative h-full w-full touch-none overflow-hidden",
                preview && (panning ? "cursor-grabbing" : "cursor-grab"),
            )}
            data-testid="threeField"
        >
            {/* What a drag edits: Preview edits nothing */}
            {!preview && (
                <>
                    <TimelineIsolationBar />
                    <TimelineFromStartBadge />
                    <PropDrawingNotice />
                </>
            )}
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
            <div className="relative h-full w-full">
                {fieldProperties && quality.reason !== "noWebGL" && (
                    <Canvas
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
                            clock={countGrid}
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
                        <ItemsLayer
                            marchers={marchers}
                            items={items}
                            dimming={dimming}
                            theme={fieldProperties.theme}
                            renderOrder={ITEMS_ORDER}
                        />
                        <OverlayLayer
                            plan={timeline.focus}
                            renderOrder={FOCUS_ORDER}
                        />
                        <OverlayLayer
                            plan={timeline.paths}
                            renderOrder={PATHS_ORDER}
                        />
                        <StartFlagLayers
                            enabled={timeline.ready}
                            isPlaying={isPlaying}
                            marcherIds={marcherIds}
                            selectedIds={selectedIds}
                            fieldProperties={fieldProperties}
                        />
                        <MarchersLayer
                            marchers={marchers}
                            dimming={dimming}
                            following={following}
                            theme={fieldProperties.theme}
                        />
                        <LabelsLayer
                            marchers={marchers}
                            dimming={dimming}
                            following={following}
                            labels={labels}
                            theme={fieldProperties.theme}
                            atlas={atlases.label}
                            style={labelStyle}
                            holdAutoSize={isPlaying}
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
                    <PlacedBoxesOverlay
                        isPlaying={isPlaying}
                        theme={fieldProperties.theme}
                        stepPx={fieldProperties.pixelsPerStep}
                    />
                )}
                {fieldProperties && (
                    <FieldOverlay
                        marchers={marchers}
                        items={items}
                        editor={editor}
                        theme={fieldProperties.theme}
                    />
                )}
                {fieldProperties && (
                    <ShapeEditor stepPx={fieldProperties.pixelsPerStep} />
                )}
                {/* Fine, Equal, From center, Add and Snap for a tablet: touch layout only */}
                {!preview && <TouchModifierButtons marchers={marchers} />}
                <FavoritesRing />
                {/* A command asking its parameters docks here, over the field's top (#354) */}
                <DockedCommandBar />
                <KeptMarksOverlay
                    marks={keptMarks}
                    elements={keptMarkElements}
                />
                <FieldContextMenu
                    at={menu.at}
                    onClose={menu.close}
                    selectedCount={selectedIds.length}
                    timelineMode={timelineMode}
                />
            </div>
            <KeptMarkTooltipView tooltip={keptMarkTooltip} />
        </div>
    );
}

/**
 * Keeps the field's items (C2.1) in step with the show: which marchers rows
 * are items, their Outline changes by beat, and which the user hid. Returns
 * each item's label by marcher id: its name (or drill number) when names are
 * shown, else nothing.
 */
function useFieldItems(
    items: FieldItems,
    beats: readonly { id: number; index: number }[],
): ReadonlyMap<number, string> {
    const { data: itemRows } = useQuery(allItemsQueryOptions());
    const { data: geometry } = useQuery(itemGeometryQueryOptions());
    const { hiddenPropIds, showPropNames, propNameOverrides } =
        useUiSettingsStore(
            useShallow((s) => ({
                hiddenPropIds: s.uiSettings.hiddenPropIds,
                showPropNames: s.uiSettings.showPropNames,
                propNameOverrides: s.uiSettings.propNameOverrides,
            })),
        );
    useEffect(() => {
        const rows = itemRows ?? [];
        items.set({
            itemIds: new Set(rows.map((item) => item.marcher_id)),
            changes: itemOutlineChanges({
                items: rows,
                geometry: geometry ?? [],
                beatIndexes: beatIndexesById(beats),
            }),
            hidden: new Set(
                rows
                    .filter((item) => hiddenPropIds[item.id])
                    .map((item) => item.marcher_id),
            ),
        });
    }, [items, itemRows, geometry, beats, hiddenPropIds]);
    return useMemo(
        () =>
            new Map(
                (itemRows ?? []).map((item) => [
                    item.marcher_id,
                    (propNameOverrides[item.id] ?? showPropNames)
                        ? item.marcher.name ||
                          `${item.marcher.drill_prefix}${item.marcher.drill_order}`
                        : "",
                ]),
            ),
        [itemRows, showPropNames, propNameOverrides],
    );
}

/** How long to wait for Preview's layout to settle. */
const PREVIEW_SETTLE_MS = 250;

/**
 * Switching Preview on or off glides the field to that mode's fit, as
 * clicking the zoom percentage does; entering Preview also clears the
 * selection. As the show opens, and for `PREVIEW_SETTLE_MS` after a switch,
 * the view isn't `settled`: the panels are still laying out around the field,
 * so a resize fits it again (the glide follows them by itself).
 */
function usePreviewFit(
    preview: boolean,
    ready: boolean,
    settled: RefObject<boolean>,
) {
    const { setSelectedMarchers } = useSelectedMarchers()!;
    // Read when it runs: the effect follows Preview and readiness only
    const clearSelection = useRef(() => setSelectedMarchers([]));
    clearSelection.current = () => setSelectedMarchers([]);
    const opening = useRef(true);
    useEffect(() => {
        if (!ready) return;
        // Once the show has opened, a run is Preview switching
        const switching = !opening.current;
        if (switching) {
            settled.current = false;
            glideToFitAfterResize();
            if (preview) clearSelection.current();
        }
        let frame = 0;
        const timeout = setTimeout(() => {
            frame = requestAnimationFrame(() => {
                opening.current = false;
                settled.current = true;
                if (switching) return;
                settleView();
                if (preview) clearSelection.current();
            });
        }, PREVIEW_SETTLE_MS);
        return () => {
            clearTimeout(timeout);
            cancelAnimationFrame(frame);
        };
    }, [preview, ready, settled]);
}

/**
 * Keeps the view store's size and field in step with the canvas, opens the
 * show fitted once it's `ready`, and points the camera at the store's view.
 * Until the view has `settled`, a resize fits it again. After that a resize
 * keeps the zoom and where the field sits from the top-left; in Preview it
 * fits the field again, unless a glide is following the pane.
 */
function FieldCamera({
    fieldProperties,
    ready,
    opened,
    settled,
}: {
    fieldProperties: FieldProperties;
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
        } else {
            fitAfterResize(settled.current);
        }
    }, [width, height, fieldProperties, ready, opened, settled]);

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
    // Preview edits nothing, and selects nothing: presses only move the view (`fieldNavigation`)
    const preview = useIsPreviewMode();

    useEffect(
        () => (preview ? undefined : attachFieldPointerInput(canvas, editor)),
        [canvas, editor, preview],
    );
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
    clock,
    appearanceSteps,
}: {
    marchers: FieldMarchers;
    isPlaying: boolean;
    /** The show's counts, past the stored ones too: marchers follow moves past the end */
    clock: CountClock;
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
        // UI-26: a dragged start flag shows where its movers leave from
        let drawn = fieldBeat(useTimelineSelectionStore.getState());
        draw(drawn);
        return useTimelineSelectionStore.subscribe((state) => {
            const at = fieldBeat(state);
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
        marchers.fill(playbackBeat(clock, getLivePlaybackPosition() * 1000));
        invalidate();
    }, -1);

    return null;
}
