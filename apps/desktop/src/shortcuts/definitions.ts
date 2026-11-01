import { isWebBuild } from "@/utilities/webBuild";
export type ActionScope = "global" | "canvas" | "timeline";
export type ActionCategory =
    | "file"
    | "edit"
    | "navigation"
    | "playback"
    | "batchEdit"
    | "movement"
    | "alignment"
    | "ui"
    | "cursor"
    | "select"
    | "shape"
    | "timeline";
export type ActionArgs = Readonly<Record<string, string | number | boolean>>;

/**
 * A number an action asks for before it runs (#354, spec #344 "The command bar"). Chosen from the
 * palette, an action that declares params docks the command bar and asks them one at a time,
 * then runs with the answers in its `args`, by `key`. The Shape branch asks its kinds' params the
 * same way through the palette tree.
 */
export interface ActionParam {
    /** Stable for the action: the answer's key in `args` */
    readonly key: string;
    /** i18n key of what it asks, e.g. "actions.timeline.pageCounts" */
    readonly labelKey: string;
    /** Counts are whole numbers; steps take halves ("2½"); degrees any number */
    readonly unit: "count" | "steps" | "degrees";
    /** The answer the bar starts from */
    readonly default?: number;
    readonly range?: { readonly min?: number; readonly max?: number };
}

export interface ActionDefinition {
    /** i18n key, e.g. "actions.alignment.lockX" */
    labelKey: string;
    /** i18n key of extra space-separated search words for the command palette, e.g. "print pdf" */
    keywordsKey?: string;
    /** i18n key appended in parentheses, e.g. "(fine)" */
    labelSuffixKey?: string;
    labelParams?: Readonly<Record<string, string | number>>;
    toggleOnKey?: string;
    toggleOffKey?: string;
    category: ActionCategory;
    /**
     * Whether the action edits the drill: the marchers' positions, the pages or the moves.
     * Visuals mode edits cues, not the drill, so it turns these off (`isActionOffInWorkspace`,
     * performer-behavior.md section 7.1). Required, so a new action has to say.
     */
    editsDrill: boolean;
    scope: ActionScope;
    /**
     * Binding strings, see bindings.ts. Empty = unbound. The first binding is the one shown in tooltips.
     * Legacy Ctrl shortcuts also list "Control+…" so Ctrl keeps working alongside Cmd on macOS.
     */
    defaultBindings: readonly string[];
    allowInInputs?: boolean;
    allowInModals?: boolean;
    /**
     * Left out of the command palette. Every action with a default shortcut is listed (#411)
     * unless it can't work without its key held, or the palette reaches it another way; the
     * definitions test lists those with why.
     */
    hiddenFromPalette?: boolean;
    /** A held key runs the action once, not again on each repeat (for toggles) */
    ignoreRepeat?: boolean;
    args?: ActionArgs;
    /** Joins `args` when the action is run from the command palette, which has no key to let go */
    paletteArgs?: ActionArgs;
    /** Asked in the command bar when chosen from the palette; the answers join `args` */
    params?: readonly ActionParam[];
}

export type NudgeDirection = "up" | "down" | "left" | "right";
/** "one" is exactly one step, for the touch Move pad (no binding uses it). */
export type NudgeStep = "grid" | "quarter" | "tenth" | "one" | "four";
export interface NudgeArgs {
    direction: NudgeDirection;
    step: NudgeStep;
    snap: boolean;
}

const NUDGE_KEYS = {
    Up: { direction: "up", letter: "W", arrow: "ArrowUp" },
    Down: { direction: "down", letter: "S", arrow: "ArrowDown" },
    Left: { direction: "left", letter: "A", arrow: "ArrowLeft" },
    Right: { direction: "right", letter: "D", arrow: "ArrowRight" },
} as const;

const NUDGE_VARIANTS = {
    "": {
        step: "grid",
        snap: true,
        suffix: undefined,
        bindings: (l: string, a: string) => [l, a],
    },
    Free: {
        step: "grid",
        snap: false,
        suffix: "actions.movement.variants.free",
        bindings: (l: string, a: string) => [`Alt+${l}`, `Alt+${a}`],
    },
    Fine: {
        step: "quarter",
        snap: false,
        suffix: "actions.movement.variants.fine",
        bindings: (l: string, a: string) => [
            `Shift+${l}`,
            `Shift+${a}`,
            `Alt+Shift+${l}`,
            `Alt+Shift+${a}`,
        ],
    },
    Coarse: {
        step: "four",
        snap: true,
        suffix: "actions.movement.variants.coarse",
        bindings: (_l: string, a: string) => [`$mod+${a}`],
    },
    CoarseFree: {
        step: "four",
        snap: false,
        suffix: "actions.movement.variants.coarseFree",
        bindings: (_l: string, a: string) => [`$mod+Alt+${a}`],
    },
    Tenth: {
        step: "tenth",
        snap: false,
        suffix: "actions.movement.variants.tenth",
        bindings: (_l: string, a: string) => [
            `$mod+Shift+${a}`,
            `$mod+Alt+Shift+${a}`,
        ],
    },
} as const;

type NudgeActionId =
    `moveSelectedMarchers${keyof typeof NUDGE_KEYS}${keyof typeof NUDGE_VARIANTS}`;

function buildNudgeActions(): Record<NudgeActionId, ActionDefinition> {
    const result = {} as Record<NudgeActionId, ActionDefinition>;
    for (const [dirName, dir] of Object.entries(NUDGE_KEYS)) {
        for (const [variantName, variant] of Object.entries(NUDGE_VARIANTS)) {
            const id =
                `moveSelectedMarchers${dirName}${variantName}` as NudgeActionId;
            result[id] = {
                labelKey: `actions.movement.move${dirName}`,
                labelSuffixKey: variant.suffix,
                category: "movement",
                editsDrill: true,
                scope: "canvas",
                defaultBindings: variant.bindings(dir.letter, dir.arrow),
                args: {
                    direction: dir.direction,
                    step: variant.step,
                    snap: variant.snap,
                },
            };
        }
    }
    return result;
}

type TapBeatsActionId = `timelineTapBeats${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

function buildTapBeatsActions(): Record<TapBeatsActionId, ActionDefinition> {
    const result = {} as Record<TapBeatsActionId, ActionDefinition>;
    for (let count = 1; count <= 9; count++) {
        result[`timelineTapBeats${count}` as TapBeatsActionId] = {
            labelKey: "actions.timeline.tapBeats",
            labelParams: { count },
            category: "timeline",
            editsDrill: false,
            scope: "timeline",
            defaultBindings: [String(count)],
            args: { count },
        };
    }
    return result;
}

const STATIC_ACTIONS = {
    // File
    launchLoadFileDialogue: {
        labelKey: "actions.file.loadDialogue",
        category: "file",
        editsDrill: false,
        scope: "global",
        // Electron binds this in the native menu; the web build has none.
        defaultBindings: isWebBuild ? ["$mod+O"] : [],
    },
    launchSaveFileDialogue: {
        labelKey: "actions.file.saveDialogue",
        category: "file",
        editsDrill: false,
        scope: "global",
        // Electron binds this in the native menu; the web build has none.
        defaultBindings: isWebBuild ? ["$mod+S"] : [],
    },
    launchNewFileDialogue: {
        labelKey: "actions.file.newDialogue",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    launchInsertAudioFileDialogue: {
        labelKey: "actions.file.insertAudio",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    closeFile: {
        labelKey: "actions.file.closeFile",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    openExportDialog: {
        labelKey: "actions.file.openExport",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
        args: { tab: "mobile" },
    },
    exportCoordinateSheets: {
        labelKey: "actions.file.exportCoordinateSheets",
        keywordsKey: "actions.file.exportCoordinateSheetsKeywords",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
        args: { tab: "coordinate-sheets" },
    },
    exportDrillCharts: {
        labelKey: "actions.file.exportDrillCharts",
        keywordsKey: "actions.file.exportDrillChartsKeywords",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
        args: { tab: "drill-charts" },
    },
    exportVideo: {
        labelKey: "actions.file.exportVideo",
        keywordsKey: "actions.file.exportVideoKeywords",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
        args: { tab: "video" },
    },
    exportToMobile: {
        labelKey: "actions.file.exportToMobile",
        keywordsKey: "actions.file.exportToMobileKeywords",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
        args: { tab: "mobile" },
    },
    launchImportMusicXmlFileDialogue: {
        labelKey: "actions.file.importMusicXml",
        category: "file",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
        hiddenFromPalette: true,
    },

    // Edit
    performUndo: {
        labelKey: "actions.edit.undo",
        category: "edit",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+Z", "Control+Z"],
    },
    performRedo: {
        labelKey: "actions.edit.redo",
        category: "edit",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+Shift+Z", "Control+Shift+Z"],
    },

    // Navigation and playback
    nextPage: {
        labelKey: "actions.navigation.nextPage",
        category: "navigation",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["E"],
    },
    lastPage: {
        labelKey: "actions.navigation.lastPage",
        category: "navigation",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Alt+E", "End", "Alt+Shift+E"],
    },
    previousPage: {
        labelKey: "actions.navigation.previousPage",
        category: "navigation",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Q"],
    },
    firstPage: {
        labelKey: "actions.navigation.firstPage",
        category: "navigation",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Alt+Q", "Home", "Alt+Shift+Q"],
    },
    // Shift with Q and E steps the playhead a beat instead of a page; Alt (with or without Shift, as
    // the transport's buttons read it) goes to the start or end
    nextBeat: {
        labelKey: "actions.navigation.nextBeat",
        category: "navigation",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Shift+E"],
    },
    previousBeat: {
        labelKey: "actions.navigation.previousBeat",
        category: "navigation",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Shift+Q"],
    },
    playPause: {
        labelKey: "actions.playback.playPause",
        toggleOnKey: "actions.playback.play",
        toggleOffKey: "actions.playback.pause",
        category: "playback",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["Space"],
    },
    // Shift+Space plays on from the playhead (timeline mode); Space plays from the start flag
    playPage: {
        labelKey: "actions.playback.playPage",
        category: "playback",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["Shift+Space"],
    },
    // UI-26: Alt+Space plays on from the start flag past the playhead (Expert timeline); Space
    // plays the window once
    playOn: {
        labelKey: "actions.playback.playOn",
        category: "playback",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["Alt+Space"],
    },
    // UI-17: C turns looping on over the page being edited, or off (timeline mode)
    toggleLoop: {
        labelKey: "actions.playback.toggleLoop",
        category: "playback",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["C"],
    },
    // Playback speed: held, ] plays at double the speed and [ at half, back on release (VLC and
    // mpv use the brackets for speed). Hidden from the palette, which can't hold a key
    holdFasterPlayback: {
        labelKey: "actions.playback.holdFaster",
        category: "playback",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["BracketRight"],
        ignoreRepeat: true,
        hiddenFromPalette: true,
    },
    holdSlowerPlayback: {
        labelKey: "actions.playback.holdSlower",
        category: "playback",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["BracketLeft"],
        ignoreRepeat: true,
        hiddenFromPalette: true,
    },
    nextPlaybackSpeed: {
        labelKey: "actions.playback.nextSpeed",
        keywordsKey: "actions.playback.speedKeywords",
        category: "playback",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    previousPlaybackSpeed: {
        labelKey: "actions.playback.previousSpeed",
        keywordsKey: "actions.playback.speedKeywords",
        category: "playback",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    resetPlaybackSpeed: {
        labelKey: "actions.playback.resetSpeed",
        keywordsKey: "actions.playback.speedKeywords",
        category: "playback",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    toggleMetronome: {
        labelKey: "actions.playback.toggleMetronome",
        category: "playback",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+M", "Control+M"],
    },

    // Batch editing
    setAllMarchersToPreviousPage: {
        labelKey: "actions.batchEdit.setAllToPrevious",
        category: "batchEdit",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["$mod+Shift+P", "Control+Shift+P"],
    },
    setSelectedMarchersToPreviousPage: {
        labelKey: "actions.batchEdit.setSelectedToPrevious",
        category: "batchEdit",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Shift+P"],
    },
    setAllMarchersToNextPage: {
        labelKey: "actions.batchEdit.setAllToNext",
        category: "batchEdit",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["$mod+Shift+N", "Control+Shift+N"],
    },
    setSelectedMarchersToNextPage: {
        labelKey: "actions.batchEdit.setSelectedToNext",
        category: "batchEdit",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Shift+N"],
    },

    // Alignment
    snapToNearestCustomFraction: {
        labelKey: "actions.alignment.snapToCustomFraction",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["1"],
    },
    lockX: {
        labelKey: "actions.alignment.lockX",
        toggleOnKey: "actions.alignment.lockXOn",
        toggleOffKey: "actions.alignment.lockXOff",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Y"],
    },
    lockY: {
        labelKey: "actions.alignment.lockY",
        toggleOnKey: "actions.alignment.lockYOn",
        toggleOffKey: "actions.alignment.lockYOff",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["X"],
    },
    // The Snap toggle (modifier roles, version A). Shift+S is the fine nudge down, so M, for the
    // magnet on its buttons
    toggleSnap: {
        labelKey: "actions.alignment.toggleSnap",
        toggleOnKey: "actions.alignment.snapOn",
        toggleOffKey: "actions.alignment.snapOff",
        keywordsKey: "actions.alignment.toggleSnapKeywords",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Shift+M"],
        ignoreRepeat: true,
    },
    alignVertically: {
        labelKey: "actions.alignment.alignVertically",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Alt+V"],
    },
    alignHorizontally: {
        labelKey: "actions.alignment.alignHorizontally",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Alt+H"],
    },
    evenlyDistributeVertically: {
        labelKey: "actions.alignment.distributeVertically",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Shift+V"],
    },
    evenlyDistributeHorizontally: {
        labelKey: "actions.alignment.distributeHorizontally",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Shift+H"],
    },
    flipHorizontal: {
        labelKey: "actions.alignment.flipHorizontal",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Alt+F"],
    },
    flipVertical: {
        labelKey: "actions.alignment.flipVertical",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Alt+Shift+F"],
    },
    swapMarchers: {
        labelKey: "actions.swap.swap",
        category: "alignment",
        editsDrill: true,
        scope: "canvas",
        // On the web, Cmd/Ctrl+S downloads the show (saving), so swap moves.
        defaultBindings: isWebBuild
            ? ["$mod+Shift+S"]
            : ["$mod+S", "Control+S"],
    },

    // UI
    // Start flag positions (#331): hold N to peek at the Hold N state, tap to latch it
    toggleStartFlagPositions: {
        labelKey: "actions.ui.toggleStartFlagPositions",
        keywordsKey: "actions.ui.toggleStartFlagPositionsKeywords",
        toggleOnKey: "actions.ui.showStartFlagPositions",
        toggleOffKey: "actions.ui.hideStartFlagPositions",
        category: "ui",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["N"],
        ignoreRepeat: true,
    },
    toggleNextPagePaths: {
        labelKey: "actions.ui.toggleNextPaths",
        toggleOnKey: "actions.ui.showNextPaths",
        toggleOffKey: "actions.ui.hideNextPaths",
        category: "ui",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["M"],
    },
    focusCanvas: {
        labelKey: "actions.ui.focusCanvas",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Alt+C"],
    },
    // #315: the field's right-click menu, from the keyboard, at the selection. Enabled only with
    // a selection
    openFieldMenu: {
        labelKey: "actions.ui.openFieldMenu",
        category: "ui",
        editsDrill: false,
        scope: "canvas",
        defaultBindings: ["ContextMenu", "Shift+F10"],
        hiddenFromPalette: true,
    },
    focusTimeline: {
        labelKey: "actions.ui.focusTimeline",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Alt+T"],
    },
    openSettings: {
        labelKey: "actions.ui.openSettings",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+Comma"],
    },
    // Measures the field's frame rate on this machine (ADR 0005, #205); both fields register it
    // until #209. Unbound
    runFieldBenchmark: {
        labelKey: "actions.ui.runFieldBenchmark",
        keywordsKey: "actions.ui.runFieldBenchmarkKeywords",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    // Opens the 3D View window, or focuses it (3D View UI-1). Unbound by default.
    openView3d: {
        labelKey: "actions.ui.openView3d",
        keywordsKey: "actions.ui.openView3dKeywords",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: [],
    },
    // Switches between the Editor and Visuals mode (performer-behavior.md section 7.1). Expert
    // only: Basic has no Visuals mode
    toggleWorkspace: {
        labelKey: "actions.ui.toggleWorkspace",
        keywordsKey: "actions.ui.toggleWorkspaceKeywords",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+Shift+V"],
        ignoreRepeat: true,
    },
    // Preview: watch the show without editing it (the workspace switch's third mode)
    togglePreview: {
        labelKey: "actions.ui.togglePreview",
        keywordsKey: "actions.ui.togglePreviewKeywords",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Alt+P"],
        ignoreRepeat: true,
    },
    // UI-17 follow-up: ? lists every shortcut
    showShortcuts: {
        labelKey: "actions.ui.showShortcuts",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Shift+Slash"],
    },
    openCommandPalette: {
        labelKey: "actions.ui.openCommandPalette",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+K"],
        allowInInputs: true,
        hiddenFromPalette: true,
    },
    // #354: `/` opens the same bar as ⌘K. Its own action so it isn't taken from inputs, where a
    // slash is typed
    openCommandBar: {
        labelKey: "actions.ui.openCommandBar",
        category: "ui",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["Slash"],
        hiddenFromPalette: true,
    },
    exitTimelineFocus: {
        labelKey: "actions.ui.exitTimelineFocus",
        category: "ui",
        editsDrill: false,
        scope: "timeline",
        defaultBindings: ["Escape"],
        allowInInputs: true,
        hiddenFromPalette: true,
    },

    // Shape tool (docs/timeline/research/shapes/06-box-v1.md): select marchers, open a shape, draw
    // it on the field, Enter places them. Escape is cancelAlignmentUpdates, which the open tool
    // takes over (shapes/tool/ShapeToolKeys).
    shapeBlock: {
        labelKey: "actions.shape.block",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["B"],
        args: { kind: "block" },
        // The command bar lists Shape › Box instead (#354), which asks the box's numbers
        hiddenFromPalette: true,
    },
    shapeCircle: {
        labelKey: "actions.shape.circle",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["O"],
        args: { kind: "circle" },
        // The command bar lists Shape › Circle instead, which asks the circle's numbers
        hiddenFromPalette: true,
    },
    // The favorites ring (#351): hold to aim and let go to pick a shape, tap to keep it open.
    // The ring takes the key's release, so a held key doesn't repeat it. From the palette it opens
    // latched, as a tap does (#411).
    openShapeRing: {
        labelKey: "actions.shape.ring",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["R"],
        ignoreRepeat: true,
        paletteArgs: { latched: true },
    },
    applyShape: {
        labelKey: "actions.shape.apply",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Enter"],
    },
    // The floating editor's turn and Recalculate (#429), for the open or selected shape only. While
    // one is shown, Alt+F and Alt+Shift+F (flipHorizontal/flipVertical) flip the shape instead of
    // the marchers (shapes/editor/ShapeEditorBar)
    shapeQuarterTurn: {
        labelKey: "actions.shape.quarterTurn",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Alt+R"],
        // One press, one turn or recalculation: a held key doesn't repeat it (review)
        ignoreRepeat: true,
    },
    shapeEvenOut: {
        labelKey: "actions.shape.evenOut",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        // No key: every letter a designer would reach for is taken (Shift+E steps a beat)
        defaultBindings: [],
        ignoreRepeat: true,
    },
    // Expand and Shrink keeping the proportions (#489): from the palette and the editor's buttons,
    // no key until one is asked for
    shapeExpand: {
        labelKey: "actions.shape.expand",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: [],
    },
    shapeShrink: {
        labelKey: "actions.shape.shrink",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: [],
    },
    shapeRecalculate: {
        labelKey: "actions.shape.recalculate",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Shift+R"],
        // One press, one turn or recalculation: a held key doesn't repeat it (review)
        ignoreRepeat: true,
    },

    // Cursor mode
    cancelAlignmentUpdates: {
        labelKey: "actions.alignment.cancelUpdates",
        category: "cursor",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["Escape"],
    },

    // Select
    // Global so it works right after clicking a set on the timeline (shape sims)
    selectAllMarchers: {
        labelKey: "actions.select.selectAll",
        category: "select",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["$mod+A", "Control+A"],
    },

    // UI-18 keep later pages: K keeps the selection where it holds on this page, or lets it
    // follow again (timeline mode)
    toggleKeepOnPage: {
        labelKey: "actions.timeline.toggleKeepOnPage",
        category: "timeline",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: ["K"],
        ignoreRepeat: true,
    },

    // Set vs Following (#304): the selected marchers Set on the count shown lose that
    // coordinate and follow from earlier; later pages keep their spots. Unbound
    timelineUnsetHere: {
        labelKey: "actions.timeline.unsetHere",
        keywordsKey: "actions.timeline.unsetHereKeywords",
        category: "timeline",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: [],
    },

    // Set vs Following (#305): as Unset here, but the later pages that followed the spot follow
    // back to the earlier one. Its handler names the pages ("Unset here and on Pages 3–5"). Unbound
    timelineUnsetHereAndFollowing: {
        labelKey: "actions.timeline.unsetHereAndFollowing",
        keywordsKey: "actions.timeline.unsetHereKeywords",
        category: "timeline",
        editsDrill: true,
        scope: "canvas",
        defaultBindings: [],
    },

    // Opens the transport's go-to box: type a page, a measure ("m23") or a rehearsal mark
    timelineGoTo: {
        labelKey: "actions.timeline.goTo",
        category: "timeline",
        editsDrill: false,
        scope: "global",
        defaultBindings: ["G", "$mod+G", "Control+G"],
        ignoreRepeat: true,
    },

    // UI-9: a page flag at the paused playhead, as its right-click menu does. F for flag; Shift
    // for the smaller step (as Shift+Q/E steps a beat), a subset page keeping later pages' numbers
    timelineCreatePageAtPlayhead: {
        labelKey: "actions.timeline.createPageAtPlayhead",
        category: "timeline",
        editsDrill: true,
        scope: "global",
        defaultBindings: ["F"],
        ignoreRepeat: true,
    },
    timelineCreateSubsetAtPlayhead: {
        labelKey: "actions.timeline.createSubsetAtPlayhead",
        category: "timeline",
        editsDrill: true,
        scope: "global",
        defaultBindings: ["Shift+F"],
        ignoreRepeat: true,
    },

    // UI-27: the move the playhead is inside becomes two that meet there (Expert); unbound
    timelineSplitMoveAtPlayhead: {
        labelKey: "actions.timeline.splitMoveAtPlayhead",
        category: "timeline",
        editsDrill: true,
        scope: "global",
        defaultBindings: [],
    },
    // UI-25: split the selected marchers off the window's move, or merge a split move back into
    // its page (Expert timeline mode; not registered in Basic, so hidden there)
    splitSelectedIntoNewMove: {
        labelKey: "actions.timeline.splitSelectedIntoNewMove",
        category: "timeline",
        editsDrill: true,
        scope: "global",
        defaultBindings: [],
    },
    mergeMoveIntoPage: {
        labelKey: "actions.timeline.mergeMoveIntoPage",
        category: "timeline",
        editsDrill: true,
        scope: "global",
        defaultBindings: [],
    },

    // Timeline (audio editor)
    timelinePlayPause: {
        labelKey: "actions.timeline.playPause",
        category: "timeline",
        editsDrill: false,
        scope: "timeline",
        defaultBindings: ["Space"],
        hiddenFromPalette: true,
    },
    // Arrow keys step between pages while the timeline has focus (on the canvas they nudge marchers).
    timelinePreviousPage: {
        labelKey: "actions.timeline.previousPage",
        category: "timeline",
        editsDrill: false,
        scope: "timeline",
        defaultBindings: ["ArrowLeft"],
        hiddenFromPalette: true,
    },
    timelineNextPage: {
        labelKey: "actions.timeline.nextPage",
        category: "timeline",
        editsDrill: false,
        scope: "timeline",
        defaultBindings: ["ArrowRight"],
        hiddenFromPalette: true,
    },
} satisfies Record<string, ActionDefinition>;

export const ACTIONS = {
    ...STATIC_ACTIONS,
    ...buildNudgeActions(),
    ...buildTapBeatsActions(),
} as const satisfies Record<string, ActionDefinition>;

export type ActionId = keyof typeof ACTIONS;

export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export const NUDGE_ACTION_IDS = ACTION_IDS.filter((id) =>
    id.startsWith("moveSelectedMarchers"),
);

export const EXPORT_ACTION_IDS = [
    "openExportDialog",
    "exportCoordinateSheets",
    "exportDrillCharts",
    "exportVideo",
    "exportToMobile",
] as const satisfies readonly ActionId[];

export const TAP_BEATS_ACTION_IDS = ACTION_IDS.filter((id) =>
    id.startsWith("timelineTapBeats"),
);

export function getActionDefinition(id: ActionId): ActionDefinition {
    return ACTIONS[id];
}
