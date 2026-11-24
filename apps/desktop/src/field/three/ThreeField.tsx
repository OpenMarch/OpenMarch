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
import { useFieldTopInset } from "@/components/canvas/fieldLayers";
import { useShallow } from "zustand/react/shallow";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera, WebGLRenderer } from "three";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DEFAULT_FIELD_THEME, type FieldProperties } from "@openmarch/core";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { LABEL_SIZE_SCALE, useUiSettingsStore } from "@/stores/UiSettingsStore";
import { isPreviewMode, useIsPreviewMode } from "@/stores/PreviewModeStore";
import {
    useIsEditingFieldLines,
    useIsFieldEditMode,
} from "@/field/editMode/fieldEditModeStore";
import { FieldEditOverlay } from "@/field/editMode/FieldEditOverlay";
import { onScreenToggles } from "@/stores/TouchModifierStore";
import {
    allItemsQueryOptions,
    allMarcherRowsQueryOptions,
    fieldPropertiesQueryOptions,
    itemGeometryQueryOptions,
    moveMarchersInTargetMutationOptions,
} from "@/hooks/queries";
import { showAssetsQueryOptions } from "@/hooks/queries/useShowAssets";
import { libraryModels } from "@/showAssets/libraryModels";
import {
    beatIndexesById,
    itemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import { propColorsByMarcher } from "@/items/propColor";
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
import { ReadOnlyFieldEditor } from "@/field/editor/readOnlyFieldEditor";
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
import { PathEditor } from "@/pathways/PathEditor";
import HandleMenu from "@/shapes/editor/HandleMenu";
import FavoritesRing from "@/shapes/tool/FavoritesRing";
import DockedCommandBar from "@/shortcuts/palette/DockedCommandBar";
import { useShapeFocus } from "@/shapes/field/useShapeFocus";
import { useFollowFocus } from "@/pathways/useFollowFocus";
import { useOrderSweepFocus } from "@/pathways/marcherOrderStore";
import MarcherOrderOverlay from "@/pathways/MarcherOrderOverlay";
import { useFollowTheLeader } from "@/pathways/followTheLeader";
import { useFieldItemWrites } from "@/field/fieldItemWrites";
import {
    snapToRounding,
    useFieldPropTool,
    usePropDrawn,
} from "@/field/fieldPropTool";
import { PIXELS_PER_METER } from "@/items/itemOutlines";
import { PIT_MANIFEST, pitModelName } from "@/view3d/core/pit/pitModels";
import { isMacPlatform } from "@/shortcuts/platform";
import { planFieldImage } from "@/field/fieldPlan";
import { dropMarchersOnTimeline } from "@/field/fieldDrop";
import {
    fieldViewSize,
    pitAreasOf,
    type PitAreaEquipment,
} from "@/field/pitStrip";
import type { FieldRect } from "@/field/editor/selectionArea";
import { FieldMarchers } from "./fieldMarchers";
import { FieldItems } from "./fieldItems";
import FieldOverlay from "./FieldOverlay";
import TouchModifierButtons from "@/components/canvas/touch/TouchModifierButtons";
import FieldContextMenu, { useFieldMenu } from "./FieldContextMenu";
import { attachFieldPointerInput } from "./fieldPointerInput";
import { attachFieldGestures } from "./fieldGestures";
import { fingerRole, holdDragArea, penDrag } from "./fieldDragModes";
import { useFieldAreaTool } from "@/field/fieldSelectTool";
import { runFieldHistory } from "./fieldHistory";
import { cameraBounds, useFieldViewStore } from "./fieldView";
import {
    attachFieldNavigation,
    enterFieldEditView,
    fitAfterResize,
    leaveFieldEditView,
    glideToFitAfterResize,
    resetView,
    settleView,
} from "./fieldNavigation";
import { GlyphAtlas } from "./sdfText";
import { selectionBoxPadding } from "./selectionRing";
import { useSelectionCoverStore } from "@/field/editor/selectionCoverStore";
import { drawnSelectionBox, selectionHandles } from "./selectionFrame";
import { fieldObstacleSource } from "./fieldObstacles";
import { createThreeFieldTestApi } from "./threeFieldTestApi";
import FieldLayer from "./layers/FieldLayer";
import BackgroundImageLayer from "./layers/BackgroundImageLayer";
import MarchersLayer from "./layers/MarchersLayer";
import ItemsLayer from "./layers/ItemsLayer";
import LabelsLayer, { type LabelStyle } from "./layers/LabelsLayer";
import { useEquipmentIcons } from "@/cues/useEquipmentIcons";
import OverlayLayer from "./layers/OverlayLayer";
import StartFlagLayers from "./StartFlagLayers";
import { ModeMarchers } from "./ModeMarchers";
import {
    drawnSelection,
    useShapeMarchersHidden,
} from "@/shapes/field/marchersHidden";
import { useTimelineVisuals } from "./useTimelineVisuals";
import { drawnLabelBold, drawnNotDefined } from "./fieldNotDefined";
import { useMarcherShapeOf } from "./useMarcherShapes";
import {
    currentFieldQuality,
    useFieldQuality,
    useGpuCrashWatch,
} from "./useFieldQuality";
import { FieldUnavailable, useFieldQualityNotice } from "./FieldQualityNotice";
import { CanvasErrorBoundary, ContextLossGuard } from "./fieldRecovery";
import FieldBenchmark from "@/field/benchmark/FieldBenchmark";
import PropDrawingNotice from "@/components/items/PropDrawingNotice";
import { ClipboardChip } from "@/shapes/clipboard/ClipboardChip";
import { threeFieldView } from "@/field/benchmark/fieldScenarios";
import { r3fFrames } from "./benchmarkFrames";
import { makeFloorSampler } from "@/pathways/floorSampler";
import { useTheme } from "@/context/ThemeContext";
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
    const { theme: appTheme } = useTheme();
    // How bright the floor is under the order lanes (step 4i): background and field image, read once
    const orderFloor = useMemo(
        () =>
            makeFloorSampler({
                background: fieldProperties?.theme.background ?? {
                    r: 255,
                    g: 255,
                    b: 255,
                },
                image: fieldImage,
                placement: fieldImagePlan,
                width: fieldProperties?.width ?? 0,
                height: fieldProperties?.height ?? 0,
                // Beyond the field the app's own background shows through the canvas
                outside: document.documentElement.classList.contains("dark")
                    ? 0.06
                    : 0.92,
            }),
        // `appTheme` is what the dark class follows
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fieldProperties, fieldImage, fieldImagePlan, appTheme],
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
    // What a performer holds, by their drill number, when it isn't their section's usual (#992)
    const equipmentIcons = useEquipmentIcons();
    const equipmentIconPlace = useUiSettingsStore(
        (s) => s.uiSettings.equipmentIconPlace ?? "beside",
    );
    const items = useMemo(() => new FieldItems(marchers), [marchers]);
    const itemLabels = useFieldItems(items, beats);
    const { strips, loaded: itemsLoaded } = useFieldStrips(fieldProperties);
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

    // The labels as drawn, for the order line to keep clear of
    const labelFadeFrom = quality.settings.labelFadeFrom;
    const orderLabels = useMemo(
        () => ({
            text: labels,
            style: labelStyle,
            atlas: atlases.label,
            fadeFrom: labelFadeFrom,
        }),
        [labels, labelStyle, atlases, labelFadeFrom],
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

    // #201: the timeline's pathways, isolation scene, collisions and dimming
    const marcherIds = useMemo(
        () => marcherRows?.map((marcher) => marcher.id),
        [marcherRows],
    );
    // #558: the edited shape's marchers, while it's seen on its own
    const hiddenIds = useShapeMarchersHidden();
    // Isolation's start and end marks take the marchers' shapes
    const shapeOf = useMarcherShapeOf(marchers, fieldProperties?.theme);
    const timeline = useTimelineVisuals({
        isPlaying,
        selectedPage,
        pages,
        marcherIds,
        fieldProperties,
        hiddenIds,
        shapeOf,
    });
    const { dimming, look } = timeline;
    // The Follow tool's line, or Set order's (pathways step 4g): everyone else fades
    const followFocus = useFollowFocus();
    const sweepFocus = useOrderSweepFocus();
    const followTheLeader = useFollowTheLeader();
    useShapeFocus(dimming, followFocus ?? sweepFocus);
    // #824: while the Field panel is open the drill can't be picked, and while its lines are
    // edited the drill steps back
    const fieldEditing = useIsFieldEditMode() && !preview;
    const editingLines = useIsEditingFieldLines() && !preview;
    useEffect(
        () => dimming.setEveryoneDimmed(editingLines),
        [dimming, editingLines],
    );
    const root = useRef<HTMLDivElement>(null);
    // #927: the bars at the field's top sit below the touch toolbar's panel
    useFieldTopInset(root);

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
        equipmentIcons,
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
        equipmentIcons,
    };
    // #315: where a right-click opens the field's menu (`useFieldMenu`, below
    // the editor), and the press that closes it, which does nothing more
    const openMenuAt = useRef(
        (
            _at: { x: number; y: number },
            _marcher: number | null,
            _actions?: readonly string[],
        ) => {},
    );
    const takeMenuPress = useRef((): boolean => false);

    const editor = useMemo(
        () =>
            new ReadOnlyFieldEditor(
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
                    // #558: the shape's hidden marchers aren't there to press while it's seen alone
                    marcherHidden: (id) => dimming.isHidden(id),
                    takePress: () =>
                        takeMenuPress.current() || takeFieldPress(),
                    selectionBoxPadding: () =>
                        selectionBoxPadding(useFieldViewStore.getState().zoom),
                    // Step 4j: the box stands clear of the order lane drawn on the selection
                    selectionCovers: () =>
                        useSelectionCoverStore.getState().covers,
                    showPositions: (positions) =>
                        marchers.setOverrides(positions),
                    // #196: drops go through the drop-to-timeline path
                    drop: (positions) =>
                        dropMarchersOnTimeline(
                            positions,
                            latest.current.moveMarchers,
                            // A locked item's drop moves it on every page
                            (id) => items.isLocked(id),
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
                    // The pit's locked equipment: no marquee or lasso takes it
                    isLocked: (id) => items.isLocked(id),
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
                    openMenu: (at, hit, actions) =>
                        openMenuAt.current(at.screen, hit, actions),
                },
                {
                    isMac: isMacPlatform(),
                    // The touch pill's Fine, Equal, From center and Add
                    onScreen: onScreenToggles,
                    // #197: snapping, the Snap toggle and Lock X/Y, read as they are on each
                    // move; off, the Snap toggle frees a rotate handle too
                    // #585: and lands a dragged or resized selection on the field's lines
                    ...settingsMoveOptions(
                        () => latest.current.fieldProperties ?? null,
                        () => {
                            const properties = latest.current.fieldProperties;
                            return properties
                                ? {
                                      properties,
                                      zoom: useFieldViewStore.getState().zoom,
                                  }
                                : null;
                        },
                    ),
                },
            ),
        [marchers, items, dimming],
    );
    // The marcher under the pointer: an equipment icon in place of the number gives way to it
    const hoveredMarcher = useMemo(
        () => ({
            get: () => editor.hoveredMarcher(),
            subscribe: (changed: () => void) => editor.subscribe(changed),
        }),
        [editor],
    );
    useEffect(() => {
        setActiveFieldEditor(editor);
        return () => setActiveFieldEditor(null);
    }, [editor]);
    // Preview edits nothing: the editor hears no presses there at all (`EditorInput`), only
    // navigation
    const previewing = useIsPreviewMode();
    useEffect(() => editor.setReadOnly(previewing), [editor, previewing]);
    // A rotation typed into the inspector belongs to its selection and page:
    // when either changes before it's saved, it's dropped (#198)
    useEffect(() => editor.selectionChanged(), [editor, selectedIds]);
    const pageId = selectedPage?.id;
    useEffect(() => {
        editor.cancelRotation();
        editor.pageChanged();
    }, [editor, pageId]);
    useEffect(() => editor.setPlaying(isPlaying), [editor, isPlaying]);
    // The Select bar's tool: what a mouse drag from empty field draws
    const areaTool = useFieldAreaTool();
    useEffect(() => editor.setAreaTool(areaTool), [editor, areaTool]);
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
    // #933: the pill keeps off the selection box, the open shape and their handles
    const obstacles = useMemo(
        () => fieldObstacleSource(marchers, editor, items),
        [marchers, editor, items],
    );
    useShapeFieldModes(editor, isPlaying);
    useFieldPropTool(editor, () => latest.current.fieldProperties);
    const menu = useFieldMenu({
        marchers,
        editor,
        hasSelection: selectedIds.length > 0,
    });
    openMenuAt.current = menu.openAt;
    takeMenuPress.current = menu.takePress;
    const timelineMode = useTimelineResolverStore((s) => s.resolver !== null);

    useEffect(() => {
        installFieldTestApi(
            createThreeFieldTestApi({
                marchers,
                labels: () => latest.current.labels,
                equipmentIcons: () =>
                    latest.current.equipmentIcons?.at(marchers.drawnBeat)
                        .icons ?? new Map(),
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
                selectionPivot: () => editor.selectionPivot(),
                modeDrawing: () => editor.modeDrawing(),
                placedBoxes: drawnPlacedBoxes,
                items,
                propTool: () => editor.propToolShape(),
                fieldImage: () => latest.current.fieldImage,
                theme: () => latest.current.theme ?? DEFAULT_FIELD_THEME,
                dimmed: (id) => dimming.isDimmed(id),
                opacity: (id) => dimming.opacityOf(id),
                labelShown: (id) => dimming.labelShown(id),
                notDefined: (id) => drawnNotDefined(dimming, look, id),
                labelBold: (id) => drawnLabelBold(dimming, look, id),
                fieldProperties: () => latest.current.fieldProperties,
            }),
        );
        return () => installFieldTestApi(undefined);
    }, [marchers, items, editor, dimming, look]);

    // Navigation (#194): wheel, pan drags and touch anywhere on the field
    useEffect(() => {
        if (!root.current) return;
        return attachFieldNavigation(
            root.current,
            () => element.current,
            () => useUiSettingsStore.getState().uiSettings.mouseSettings,
        );
    }, []);
    // Fingers and the pen's palm rule (tablet plan 1.1): one finger on a
    // marcher or the selection selects and moves it (1.2), elsewhere it does
    // what the pill's drag mode says (1.3: pans in Auto, or draws a box or
    // lasso); two pan and pinch, a long press asks the editor for a menu. Preview
    // edits nothing, so there fingers only navigate
    useEffect(() => {
        if (!root.current) return;
        return attachFieldGestures(root.current, () => element.current, {
            editor: () => (isPreviewMode() ? null : editor),
            singleFinger: (press) => fingerRole(editor, press),
            holdDrag: (press) => holdDragArea(editor, press),
            tap: (pointer) => {
                if (!isPreviewMode()) editor.fingerTap(pointer);
            },
            history: runFieldHistory,
        });
    }, [editor]);
    // The view opens once the field and a page are loaded. Latched: a page
    // briefly unselected mustn't reset the view
    const [ready, setReady] = useState(false);
    // The items too, so a show with a pit opens fitted to the pit strip
    if (!ready && fieldProperties && selectedPage && itemsLoaded)
        setReady(true);
    // Until the layout settles, the view is still the opening view
    const settled = useRef(false);
    // Here, not in the camera: a canvas started over after a lost context
    // keeps the view
    const opened = useRef(false);
    usePreviewFit(preview, ready, settled);
    useFieldEditFit(fieldEditing, ready);

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
            {!preview && !fieldEditing && (
                <>
                    <TimelineIsolationBar />
                    <TimelineFromStartBadge />
                    <PropDrawingNotice />
                    {/* What's copied, in the bottom-left corner across from the zoom box (#961) */}
                    <ClipboardChip />
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
                            strips={strips}
                            ready={ready}
                            opened={opened}
                            settled={settled}
                        />
                        <EditorInput
                            editor={editor}
                            marchers={marchers}
                            selectedIds={selectedIds}
                            hiddenIds={hiddenIds}
                        />
                        <ModeMarchers editor={editor} marchers={marchers} />
                        <PlayheadDriver
                            marchers={marchers}
                            isPlaying={isPlaying}
                            clock={countGrid}
                            appearanceSteps={appearanceSteps}
                        />
                        <FieldLayer
                            fieldProperties={fieldProperties}
                            strips={strips}
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
                            marchers={marchers}
                            enabled={timeline.ready}
                            isPlaying={isPlaying}
                            marcherIds={marcherIds}
                            selectedIds={selectedIds}
                            fieldProperties={fieldProperties}
                        />
                        <MarchersLayer
                            marchers={marchers}
                            dimming={dimming}
                            look={look}
                            theme={fieldProperties.theme}
                            icons={equipmentIcons}
                            iconPlace={equipmentIconPlace}
                        />
                        <LabelsLayer
                            marchers={marchers}
                            dimming={dimming}
                            look={look}
                            labels={labels}
                            theme={fieldProperties.theme}
                            atlas={atlases.label}
                            style={labelStyle}
                            holdAutoSize={isPlaying}
                            icons={equipmentIcons}
                            iconPlace={equipmentIconPlace}
                            hovered={hoveredMarcher}
                        />
                        <OverlayLayer
                            plan={timeline.collisions}
                            renderOrder={COLLISIONS_ORDER}
                            atlas={atlases.collision}
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
                {/* A line's order, and Set order's sweep (pathways step 4g): only with
                    Follow-the-leader on (#1095) */}
                {fieldProperties && followTheLeader && (
                    <MarcherOrderOverlay
                        marchers={marchers}
                        labels={orderLabels}
                        theme={fieldProperties.theme}
                        floor={orderFloor}
                    />
                )}
                {fieldProperties && (
                    <ShapeEditor stepPx={fieldProperties.pixelsPerStep} />
                )}
                {fieldProperties && !isPlaying && (
                    <PathEditor fieldProperties={fieldProperties} />
                )}
                {/* Edit lines' rulers and lines, over everything that edits the drill */}
                {fieldProperties && editingLines && (
                    <FieldEditOverlay fp={fieldProperties} />
                )}
                {/* Fine, Equal, From center, Add and Snap for a tablet: touch layout only */}
                {!preview && (
                    <TouchModifierButtons
                        marchers={marchers}
                        obstacles={obstacles}
                    />
                )}
                <FavoritesRing />
                {/* A command asking its parameters docks here, over the field's top (#354) */}
                <DockedCommandBar />
                {/* A Line's point and segment menus (#569) */}
                <HandleMenu />
                <FieldContextMenu
                    at={menu.at}
                    actions={menu.actions}
                    marcher={menu.marcher}
                    onClose={menu.close}
                    selectedCount={selectedIds.length}
                    timelineMode={timelineMode}
                />
            </div>
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
    const { data: assets } = useQuery(showAssetsQueryOptions());
    const library = useMemo(() => libraryModels(assets), [assets]);
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
            colors: propColorsByMarcher(rows),
            locked: new Set(
                rows.filter((item) => item.locked).map((i) => i.marcher_id),
            ),
            models: new Map(
                rows.flatMap((item) =>
                    item.model ? [[item.marcher_id, item.model] as const] : [],
                ),
            ),
            library,
        });
    }, [items, itemRows, geometry, beats, hiddenPropIds, library]);
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

/**
 * The pit areas beside the field (instruments.md section 6, `pitAreasOf`): around the equipment in
 * front of the front sideline and behind the back sideline, where the resolver has it at the start
 * of the show (a locked item is there all show), each as big as its model's footprint. The same
 * array until they change. `loaded` once the items are, and the resolver with any equipment, so
 * the view can open fitted to them.
 */
function useFieldStrips(fieldProperties: FieldProperties | undefined): {
    strips: readonly FieldRect[];
    loaded: boolean;
} {
    const { data: itemRows, isFetched } = useQuery(allItemsQueryOptions());
    const equipment = useMemo(
        () =>
            (itemRows ?? [])
                .filter((item) => item.kind === "equipment")
                .map((item) => ({
                    id: item.marcher_id,
                    radius: footprintRadius(item.model),
                })),
        [itemRows],
    );
    const resolver = useTimelineResolverStore((s) => s.resolver);
    const version = useTimelineResolverStore((s) => s.version);
    const pieces = useMemo((): PitAreaEquipment[] => {
        void version; // a new version means new positions
        if (!resolver) return [];
        const known = new Set(resolver.marcherIds());
        return equipment
            .filter(({ id }) => known.has(id))
            .map(({ id, radius }) => {
                const [x, y] = resolver.positionAt(id, 0);
                return { x, y, radius };
            });
    }, [resolver, version, equipment]);
    const key = JSON.stringify(pieces);
    const strips = useMemo(
        () => (fieldProperties ? pitAreasOf(fieldProperties, pieces) : []),
        // Only a change to where equipment stands makes new areas
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fieldProperties, key],
    );
    return {
        strips,
        loaded: isFetched && (equipment.length === 0 || resolver !== null),
    };
}

/** Half the diagonal of a built-in model's footprint in field units, or a meter's worth without one */
function footprintRadius(model: string | null): number {
    const name = pitModelName(model);
    const size = name ? PIT_MANIFEST[name]?.high.sizeM : null;
    const diagonal = size ? Math.hypot(size.width, size.depth) : 1;
    return (diagonal / 2) * PIXELS_PER_METER;
}

/**
 * The Edit field mode (#824) holds the field still, fitted inside its rulers: entering it glides
 * there, and leaving it glides back to the view from before.
 */
function useFieldEditFit(fieldEditing: boolean, ready: boolean) {
    const entered = useRef(false);
    useEffect(() => {
        if (!ready || fieldEditing === entered.current) return;
        entered.current = fieldEditing;
        if (fieldEditing) enterFieldEditView();
        else leaveFieldEditView();
    }, [fieldEditing, ready]);
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
    strips,
    ready,
    opened,
    settled,
}: {
    fieldProperties: FieldProperties;
    /** The strips beside the field, which the view fits and keeps in reach with it */
    strips: readonly FieldRect[];
    ready: boolean;
    opened: RefObject<boolean>;
    settled: RefObject<boolean>;
}) {
    const width = useThree((s) => s.size.width);
    const height = useThree((s) => s.size.height);
    const camera = useThree((s) => s.camera) as OrthographicCamera;
    const invalidate = useThree((s) => s.invalidate);

    useLayoutEffect(() => {
        const field = fieldViewSize(fieldProperties, strips);
        useFieldViewStore.setState({ width, height, field });
        if (width <= 0 || height <= 0 || !ready) return;
        if (!opened.current) {
            opened.current = true;
            resetView();
        } else {
            fitAfterResize(settled.current);
        }
    }, [width, height, fieldProperties, strips, ready, opened, settled]);

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
    hiddenIds,
}: {
    editor: FieldEditor;
    marchers: FieldMarchers;
    selectedIds: readonly number[];
    hiddenIds: ReadonlySet<number> | null;
}) {
    const canvas = useThree((s) => s.gl.domElement);
    const invalidate = useThree((s) => s.invalidate);
    // Preview edits nothing, and selects nothing: presses only move the view (`fieldNavigation`).
    // Nor does the Edit field mode (#824), whose overlay takes the presses
    const preview = useIsPreviewMode();
    const fieldEditing = useIsFieldEditMode();

    useEffect(
        () =>
            preview || fieldEditing
                ? undefined
                : attachFieldPointerInput(canvas, editor, {
                      penDrag: (press) => penDrag(editor, press),
                  }),
        [canvas, editor, preview, fieldEditing],
    );
    // A drag moves marchers outside the playhead's fills: draw them
    useEffect(() => marchers.subscribe(invalidate), [marchers, invalidate]);

    // A marcher hidden with its shape (#558) hides its selection ring too, so no ring follows the line
    const ringIds = useMemo(
        () => drawnSelection(selectedIds, hiddenIds),
        [selectedIds, hiddenIds],
    );
    useEffect(() => {
        marchers.setSelection(ringIds);
        invalidate();
    }, [marchers, ringIds, invalidate]);

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
