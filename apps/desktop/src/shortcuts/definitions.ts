import { isWebBuild } from "@/utilities/webBuild";
export type ActionScope = "global" | "canvas";
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
    | "path"
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
    /** The label names a page state or a hold command, filled from `holdTerms` */
    labelHoldTerms?: true;
    toggleOnKey?: string;
    toggleOffKey?: string;
    category: ActionCategory;
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
    /**
     * Turned off in Basic mode (UI-19), so left out of the command palette and the Shortcuts
     * dialog there. The app menu marks its own items the same way (`menuActions.ts`).
     */
    expertOnly?: boolean;
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

const STATIC_ACTIONS = {
    // File
    launchLoadFileDialogue: {
        labelKey: "actions.file.loadDialogue",
        category: "file",
        scope: "global",
        // Electron binds this in the native menu; the web build has none.
        defaultBindings: isWebBuild ? ["$mod+O"] : [],
    },
    launchSaveFileDialogue: {
        labelKey: "actions.file.saveDialogue",
        category: "file",
        scope: "global",
        // Electron binds this in the native menu; the web build has none.
        defaultBindings: isWebBuild ? ["$mod+S"] : [],
    },
    launchNewFileDialogue: {
        labelKey: "actions.file.newDialogue",
        category: "file",
        scope: "global",
        defaultBindings: [],
    },
    launchInsertAudioFileDialogue: {
        labelKey: "actions.file.insertAudio",
        category: "file",
        scope: "global",
        defaultBindings: [],
    },
    closeFile: {
        labelKey: "actions.file.closeFile",
        category: "file",
        scope: "global",
        defaultBindings: [],
    },
    openExportDialog: {
        labelKey: "actions.file.openExport",
        category: "file",
        scope: "global",
        defaultBindings: [],
        args: { tab: "mobile" },
    },
    exportCoordinateSheets: {
        labelKey: "actions.file.exportCoordinateSheets",
        keywordsKey: "actions.file.exportCoordinateSheetsKeywords",
        category: "file",
        scope: "global",
        defaultBindings: [],
        args: { tab: "coordinate-sheets" },
    },
    exportDrillCharts: {
        labelKey: "actions.file.exportDrillCharts",
        keywordsKey: "actions.file.exportDrillChartsKeywords",
        category: "file",
        scope: "global",
        defaultBindings: [],
        args: { tab: "drill-charts" },
    },
    exportVideo: {
        labelKey: "actions.file.exportVideo",
        keywordsKey: "actions.file.exportVideoKeywords",
        category: "file",
        scope: "global",
        defaultBindings: [],
        args: { tab: "video" },
    },
    exportToMobile: {
        labelKey: "actions.file.exportToMobile",
        keywordsKey: "actions.file.exportToMobileKeywords",
        category: "file",
        scope: "global",
        defaultBindings: [],
        args: { tab: "mobile" },
    },
    launchImportMusicXmlFileDialogue: {
        labelKey: "actions.file.importMusicXml",
        category: "file",
        scope: "global",
        defaultBindings: [],
        hiddenFromPalette: true,
    },

    // Edit
    performUndo: {
        labelKey: "actions.edit.undo",
        category: "edit",
        scope: "global",
        defaultBindings: ["$mod+Z", "Control+Z"],
    },
    performRedo: {
        labelKey: "actions.edit.redo",
        category: "edit",
        scope: "global",
        defaultBindings: ["$mod+Shift+Z", "Control+Shift+Z"],
    },

    // Navigation and playback
    nextPage: {
        labelKey: "actions.navigation.nextPage",
        category: "navigation",
        scope: "global",
        defaultBindings: ["E"],
    },
    lastPage: {
        labelKey: "actions.navigation.lastPage",
        category: "navigation",
        scope: "global",
        defaultBindings: ["Alt+E", "End", "Alt+Shift+E"],
    },
    previousPage: {
        labelKey: "actions.navigation.previousPage",
        category: "navigation",
        scope: "global",
        defaultBindings: ["Q"],
    },
    firstPage: {
        labelKey: "actions.navigation.firstPage",
        category: "navigation",
        scope: "global",
        defaultBindings: ["Alt+Q", "Home", "Alt+Shift+Q"],
    },
    // Shift with Q and E steps the playhead a beat instead of a page; Alt (with or without Shift, as
    // the transport's buttons read it) goes to the start or end
    nextBeat: {
        labelKey: "actions.navigation.nextBeat",
        category: "navigation",
        scope: "global",
        defaultBindings: ["Shift+E"],
    },
    previousBeat: {
        labelKey: "actions.navigation.previousBeat",
        category: "navigation",
        scope: "global",
        defaultBindings: ["Shift+Q"],
    },
    playPause: {
        labelKey: "actions.playback.playPause",
        toggleOnKey: "actions.playback.play",
        toggleOffKey: "actions.playback.pause",
        category: "playback",
        scope: "canvas",
        defaultBindings: ["Space"],
    },
    // Shift+Space plays on from the playhead (timeline mode); Space plays from the start flag
    playPage: {
        labelKey: "actions.playback.playPage",
        category: "playback",
        scope: "canvas",
        defaultBindings: ["Shift+Space"],
    },
    // UI-26: Alt+Space plays on from the start flag past the playhead (Expert timeline); Space
    // plays the window once
    playOn: {
        labelKey: "actions.playback.playOn",
        category: "playback",
        scope: "canvas",
        defaultBindings: ["Alt+Space"],
        expertOnly: true,
    },
    // UI-17: C turns looping on over the page being edited, or off (timeline mode)
    toggleLoop: {
        labelKey: "actions.playback.toggleLoop",
        category: "playback",
        scope: "canvas",
        defaultBindings: ["C"],
        expertOnly: true,
    },
    // Playback speed: held, ] plays at double the speed and [ at half, back on release (VLC and
    // mpv use the brackets for speed). Hidden from the palette, which can't hold a key
    holdFasterPlayback: {
        labelKey: "actions.playback.holdFaster",
        category: "playback",
        scope: "canvas",
        defaultBindings: ["BracketRight"],
        ignoreRepeat: true,
        hiddenFromPalette: true,
    },
    holdSlowerPlayback: {
        labelKey: "actions.playback.holdSlower",
        category: "playback",
        scope: "canvas",
        defaultBindings: ["BracketLeft"],
        ignoreRepeat: true,
        hiddenFromPalette: true,
    },
    nextPlaybackSpeed: {
        labelKey: "actions.playback.nextSpeed",
        keywordsKey: "actions.playback.speedKeywords",
        category: "playback",
        scope: "global",
        defaultBindings: [],
    },
    previousPlaybackSpeed: {
        labelKey: "actions.playback.previousSpeed",
        keywordsKey: "actions.playback.speedKeywords",
        category: "playback",
        scope: "global",
        defaultBindings: [],
    },
    resetPlaybackSpeed: {
        labelKey: "actions.playback.resetSpeed",
        keywordsKey: "actions.playback.speedKeywords",
        category: "playback",
        scope: "global",
        defaultBindings: [],
    },
    toggleMetronome: {
        labelKey: "actions.playback.toggleMetronome",
        category: "playback",
        scope: "global",
        defaultBindings: ["$mod+M", "Control+M"],
    },

    // Batch editing
    setAllMarchersToPreviousPage: {
        labelKey: "actions.batchEdit.clearThisPageAll",
        labelHoldTerms: true,
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["$mod+Shift+P", "Control+Shift+P"],
    },
    setSelectedMarchersToPreviousPage: {
        labelKey: "actions.batchEdit.clearThisPageSelected",
        labelHoldTerms: true,
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["Shift+P"],
    },
    // #573: as Clear this page, but the later pages that showed the page's spot move back to the
    // page before instead of keeping where they were. Its handler names the pages ("Clear Page 3,
    // Pages 4–6 move back too"). Unbound
    setAllMarchersToPreviousPageAndFollowing: {
        labelKey: "actions.batchEdit.clearThisPageAllAndFollowing",
        labelHoldTerms: true,
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: [],
    },
    setSelectedMarchersToPreviousPageAndFollowing: {
        labelKey: "actions.batchEdit.clearThisPageSelectedAndFollowing",
        labelHoldTerms: true,
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: [],
    },
    // Holds: the selected marchers on the current page box become Defined where they are shown
    // (the page box menu's entry and the inspector's button run this). Unbound
    timelineDefineAsShown: {
        labelKey: "actions.batchEdit.defineAsShown",
        labelHoldTerms: true,
        keywordsKey: "actions.batchEdit.holdKeywords",
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: [],
    },
    // Holds (#472): the selected marchers on the current page box are Held where the previous
    // page leaves them, as the page box menu's entry. ⌘H / Ctrl+H for hold (owner, 2026-11-02); plain
    // H is the shape editor's hide-marchers. On macOS the app menu's Hide takes ⌘H, so Control+H is
    // listed as well, as Metronome does with ⌘M
    timelineHoldFromPrevious: {
        labelKey: "actions.batchEdit.holdFromPrevious",
        labelHoldTerms: true,
        keywordsKey: "actions.batchEdit.holdKeywords",
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["$mod+H", "Control+H"],
    },
    setAllMarchersToNextPage: {
        labelKey: "actions.batchEdit.setAllToNext",
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["$mod+Shift+N", "Control+Shift+N"],
    },
    setSelectedMarchersToNextPage: {
        labelKey: "actions.batchEdit.setSelectedToNext",
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["Shift+N"],
    },

    // Alignment
    snapToNearestCustomFraction: {
        labelKey: "actions.alignment.snapToCustomFraction",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["1"],
    },
    lockX: {
        labelKey: "actions.alignment.lockX",
        toggleOnKey: "actions.alignment.lockXOn",
        toggleOffKey: "actions.alignment.lockXOff",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Y"],
    },
    lockY: {
        labelKey: "actions.alignment.lockY",
        toggleOnKey: "actions.alignment.lockYOn",
        toggleOffKey: "actions.alignment.lockYOff",
        category: "alignment",
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
        scope: "canvas",
        defaultBindings: ["Shift+M"],
        ignoreRepeat: true,
    },
    alignVertically: {
        labelKey: "actions.alignment.alignVertically",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Alt+V"],
    },
    alignHorizontally: {
        labelKey: "actions.alignment.alignHorizontally",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Alt+H"],
    },
    evenlyDistributeVertically: {
        labelKey: "actions.alignment.distributeVertically",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Shift+V"],
    },
    evenlyDistributeHorizontally: {
        labelKey: "actions.alignment.distributeHorizontally",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Shift+H"],
    },
    flipHorizontal: {
        labelKey: "actions.alignment.flipHorizontal",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Alt+F"],
    },
    flipVertical: {
        labelKey: "actions.alignment.flipVertical",
        category: "alignment",
        scope: "canvas",
        defaultBindings: ["Alt+Shift+F"],
    },
    swapMarchers: {
        labelKey: "actions.swap.swap",
        category: "alignment",
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
        scope: "canvas",
        defaultBindings: ["N"],
        ignoreRepeat: true,
    },
    toggleNextPagePaths: {
        labelKey: "actions.ui.toggleNextPaths",
        toggleOnKey: "actions.ui.showNextPaths",
        toggleOffKey: "actions.ui.hideNextPaths",
        category: "ui",
        scope: "canvas",
        defaultBindings: ["M"],
    },
    // #315: the field's right-click menu, from the keyboard, at the selection. Enabled only with
    // a selection
    openFieldMenu: {
        labelKey: "actions.ui.openFieldMenu",
        category: "ui",
        scope: "canvas",
        defaultBindings: ["ContextMenu", "Shift+F10"],
        hiddenFromPalette: true,
    },
    openSettings: {
        labelKey: "actions.ui.openSettings",
        category: "ui",
        scope: "global",
        defaultBindings: ["$mod+Comma"],
    },
    // Opens the 3D View window, or focuses it (3D View UI-1). Unbound by default.
    openView3d: {
        labelKey: "actions.ui.openView3d",
        keywordsKey: "actions.ui.openView3dKeywords",
        category: "ui",
        scope: "global",
        defaultBindings: [],
    },
    // Preview: watch the show without editing it (the workspace switch's other mode)
    togglePreview: {
        labelKey: "actions.ui.togglePreview",
        keywordsKey: "actions.ui.togglePreviewKeywords",
        category: "ui",
        scope: "global",
        defaultBindings: ["Alt+P"],
        ignoreRepeat: true,
    },
    // UI-17 follow-up: ? lists every shortcut
    showShortcuts: {
        labelKey: "actions.ui.showShortcuts",
        category: "ui",
        scope: "global",
        defaultBindings: ["Shift+Slash"],
    },
    openCommandPalette: {
        labelKey: "actions.ui.openCommandPalette",
        category: "ui",
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
        scope: "global",
        defaultBindings: ["Slash"],
        hiddenFromPalette: true,
    },

    // Shape tool (docs/timeline/research/shapes/06-box-v1.md): select marchers, open a shape, draw
    // it on the field, Enter places them. Escape is cancelAlignmentUpdates, which the open tool
    // takes over (shapes/tool/ShapeToolKeys).
    shapeBlock: {
        labelKey: "actions.shape.block",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
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
        scope: "canvas",
        defaultBindings: ["O"],
        args: { kind: "circle" },
        // The command bar lists Shape › Circle instead, which asks the circle's numbers
        hiddenFromPalette: true,
    },
    shapeLine: {
        labelKey: "actions.shape.line",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["L"],
        args: { kind: "line" },
        // The command bar lists Shape › Line instead, which asks the line's numbers
        hiddenFromPalette: true,
    },
    // The Curve (#525): a Line whose points start smooth. No key of its own yet
    shapeCurve: {
        labelKey: "actions.shape.curve",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: [],
        args: { kind: "curve" },
        hiddenFromPalette: true,
    },
    // The Arc (#634): a Line of two points bent as a circular arc. No key of its own yet
    shapeArc: {
        labelKey: "actions.shape.arc",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: [],
        args: { kind: "arc" },
        hiddenFromPalette: true,
    },
    // The favorites ring (#351): hold to aim and let go to pick a shape, tap to keep it open.
    // The ring takes the key's release, so a held key doesn't repeat it. From the palette it opens
    // latched, as a tap does (#411).
    openShapeRing: {
        labelKey: "actions.shape.ring",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["R"],
        ignoreRepeat: true,
        paletteArgs: { latched: true },
    },
    applyShape: {
        labelKey: "actions.shape.apply",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["Enter"],
    },
    // While drawing a line point by point, the last point taken back (owner, option A on #522).
    // Handled only then (shapes/tool/ShapeToolKeys), so the keys do nothing else meanwhile
    shapeRemoveLastPoint: {
        labelKey: "actions.shape.removeLastPoint",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["Backspace", "Delete"],
        // One point a press: a held key doesn't run the line back to its start
        ignoreRepeat: true,
        hiddenFromPalette: true,
    },
    // The floating editor's turn and Recalculate (#429), for the open or selected shape only. While
    // one is shown, Alt+F and Alt+Shift+F (flipHorizontal/flipVertical) flip the shape instead of
    // the marchers (shapes/editor/ShapeEditorBar)
    shapeQuarterTurn: {
        labelKey: "actions.shape.quarterTurn",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["Alt+R"],
        // One press, one turn or recalculation: a held key doesn't repeat it (review)
        ignoreRepeat: true,
    },
    shapeEvenOut: {
        labelKey: "actions.shape.evenOut",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
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
        scope: "canvas",
        defaultBindings: [],
    },
    shapeShrink: {
        labelKey: "actions.shape.shrink",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: [],
    },
    shapeRecalculate: {
        labelKey: "actions.shape.recalculate",
        keywordsKey: "actions.shape.keywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["Shift+R"],
        // One press, one turn or recalculation: a held key doesn't repeat it (review)
        ignoreRepeat: true,
    },
    // The shape on its own (#558): hold H to hide the marchers, its spots and walks, tap to keep
    // them hidden; the editor's eye button and the palette turn the latch over. Drawing only, but
    // filed with the shape's keys, which Preview turns off: no shape is edited there
    shapeHideMarchers: {
        labelKey: "actions.shape.hideMarchers",
        keywordsKey: "actions.shape.hideMarchersKeywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["H"],
        ignoreRepeat: true,
    },

    // Group the selected marchers into a shape as they stand (#603): nobody moves. ⌘G / Ctrl+G, as
    // in design tools, paired with Ungroup; Go to keeps plain G (owner, 2026-11-02)
    // (shapes/placed/groupMarchers)
    shapeGroup: {
        labelKey: "actions.shape.group",
        keywordsKey: "actions.shape.groupKeywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["$mod+G", "Control+G"],
        ignoreRepeat: true,
    },

    // Ungroup the selected placed shape: its marchers stay put and stop being a shape. On a later
    // page it's that page's change, as an edit there is (shapes/placed/ungroupShape)
    shapeUngroup: {
        labelKey: "actions.shape.ungroup",
        keywordsKey: "actions.shape.ungroupKeywords",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["$mod+Shift+G", "Control+Shift+G"],
        ignoreRepeat: true,
    },

    // Pathways step 1 (ADR 0014): the Path pen draws a cornered path for one selected marcher's
    // move at the playhead. P as in design tools' pen. While it draws, Enter (applyShape) finishes,
    // Backspace (shapeRemoveLastPoint) takes the last corner back and Escape
    // (cancelAlignmentUpdates) cancels, handled only then (pathways/PathPenKeys)
    pathPen: {
        labelKey: "actions.path.pen",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: ["P"],
        ignoreRepeat: true,
    },
    // Opens the selected marcher's path at the playhead for editing, as a double-click on it does
    // (owner, 2026-11-04). No key: shapes have none for editing points (Enter places a shape)
    editPath: {
        labelKey: "actions.path.edit",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    // Remove path (AP-R2), the path open or not: the move goes straight again. No key, so it
    // can't happen by accident (owner, 2026-11-04): the path's menu, its bar and the palette
    removePath: {
        labelKey: "actions.path.remove",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },

    // Pathways step 3b: Re-fit stretches the path onto where its marchers stand now; the rest act on
    // the lane or key picked on the open group path. No keys of their own: the path's bar, its
    // menus and the palette
    refitPath: {
        labelKey: "actions.path.refit",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    adjustRemoveKey: {
        labelKey: "actions.path.adjustRemoveKey",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    // Edit <name>'s line (pathways interaction round 3, was Adjust): the selected member's line
    // alone, editable, its handles shown at once. On the floating path bar, the Path menus and in
    // the palette; no keys
    editLine: {
        labelKey: "actions.path.editLine",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    adjustResetSpot: {
        labelKey: "actions.path.adjustResetSpot",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    adjustAcknowledge: {
        labelKey: "actions.path.adjustAcknowledge",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },

    // Pathways step 3c: a group path's members break off with a copy of it that keeps the group's
    // counts (Detach, AP-R9) or follow it again (Rejoin, AP-R10). On the floating path bar and in
    // the palette; no keys
    detachPath: {
        labelKey: "actions.path.detachFromGroup",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    // Detach all (round 5): with every member of a group path selected, each gets its own copy and
    // the group path ends. Under the bar's ···, beside Remove path, and in the Path menus and palette
    detachAllPath: {
        labelKey: "actions.path.detachAll",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    rejoinPath: {
        labelKey: "actions.path.rejoinGroup",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },

    // Pathways step 4 (spec Appendix K): Follow draws a trail for the selected line with the Path
    // pen, and the line follows it, leader first, into its end spots (AP-T1). Shift+L as in
    // "leader", beside the Line's L. Reverse makes the other end lead (AP-T3), on the leader's
    // mark, the path bar, the trail's menu and Alt+L
    followTrail: {
        labelKey: "actions.path.follow",
        keywordsKey: "actions.path.followKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: ["Shift+L"],
        ignoreRepeat: true,
    },
    // Pathways step 4c (DL-17): ▶ Preview on the Follow tool's bar loops the line's walk. No key:
    // the bar's button and the palette
    followPreview: {
        labelKey: "actions.path.followPreview",
        keywordsKey: "actions.path.followKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    // Pathways step 9 (spec L.10, RP-1): the Follow tool's Ends, as commands so the bar, the
    // palette and a custom key reach the same choice. No keys by default
    followEndsTrail: {
        labelKey: "actions.path.followEndsTrail",
        keywordsKey: "actions.path.followKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    followEndsKeep: {
        labelKey: "actions.path.followEndsKeep",
        keywordsKey: "actions.path.followKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    followEndsRipple: {
        labelKey: "actions.path.followEndsRipple",
        keywordsKey: "actions.path.followKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    reverseTrail: {
        labelKey: "actions.path.reverse",
        keywordsKey: "actions.path.followKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: ["Alt+L"],
        ignoreRepeat: true,
    },

    // Pathways step 4g: a line's order on the field. Show order cycles the field display bar's
    // setting (off and while selected; Always is picked on the bar). Set order sweeps the
    // selected marchers in order. O is the Circle's, so Alt+O shows and Shift+O sets. Reverse and
    // Clear have no key: the toolbar, the field's menu and the palette
    toggleMarcherOrder: {
        labelKey: "actions.path.showOrder",
        keywordsKey: "actions.path.orderKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: ["Alt+O"],
        ignoreRepeat: true,
    },
    setMarcherOrder: {
        labelKey: "actions.path.setOrder",
        keywordsKey: "actions.path.orderKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: ["Shift+O"],
        ignoreRepeat: true,
    },
    reverseMarcherOrder: {
        labelKey: "actions.path.reverseOrder",
        keywordsKey: "actions.path.orderKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    clearMarcherOrder: {
        labelKey: "actions.path.clearOrder",
        keywordsKey: "actions.path.orderKeywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },

    // Pathways step 2: the selected point of an open path made a corner, or smooth, as a Line's
    // Corner | Smooth (the point's menu, a double-click, the path's floating editor). No keys,
    // as a Line's corner type has none
    pathPointCorner: {
        labelKey: "actions.path.pointCorner",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },
    pathPointSmooth: {
        labelKey: "actions.path.pointSmooth",
        keywordsKey: "actions.path.keywords",
        category: "path",
        scope: "canvas",
        defaultBindings: [],
        ignoreRepeat: true,
    },

    // Cursor mode
    cancelAlignmentUpdates: {
        labelKey: "actions.alignment.cancelUpdates",
        category: "cursor",
        scope: "canvas",
        defaultBindings: ["Escape"],
    },

    // Select
    // Global so it works right after clicking a set on the timeline (shape sims)
    selectAllMarchers: {
        labelKey: "actions.select.selectAll",
        category: "select",
        scope: "global",
        defaultBindings: ["$mod+A", "Control+A"],
    },

    // Set vs Following (#304): the selected marchers Set on the count shown lose that
    // coordinate and follow from earlier; later pages keep their spots. Unbound
    timelineUnsetHere: {
        labelKey: "actions.timeline.unsetHere",
        labelHoldTerms: true,
        keywordsKey: "actions.timeline.unsetHereKeywords",
        category: "timeline",
        scope: "canvas",
        defaultBindings: [],
    },

    // Set vs Following (#305): as Unset here, but the later pages that followed the spot follow
    // back to the earlier one. Its handler names the pages ("Unset here and on Pages 3–5"). Unbound
    timelineUnsetHereAndFollowing: {
        labelKey: "actions.timeline.unsetHereAndFollowing",
        labelHoldTerms: true,
        keywordsKey: "actions.timeline.unsetHereKeywords",
        category: "timeline",
        scope: "canvas",
        defaultBindings: [],
    },

    // Opens the transport's go-to box: type a page, a measure ("m23") or a rehearsal mark
    timelineGoTo: {
        labelKey: "actions.timeline.goTo",
        category: "timeline",
        scope: "global",
        defaultBindings: ["G"],
        ignoreRepeat: true,
    },

    // UI-9: a page flag at the paused playhead, as its right-click menu does. F for flag; Shift
    // for the smaller step (as Shift+Q/E steps a beat), a subset page keeping later pages' numbers
    timelineCreatePageAtPlayhead: {
        labelKey: "actions.timeline.createPageAtPlayhead",
        category: "timeline",
        scope: "global",
        defaultBindings: ["F"],
        ignoreRepeat: true,
    },
    timelineCreateSubsetAtPlayhead: {
        labelKey: "actions.timeline.createSubsetAtPlayhead",
        category: "timeline",
        scope: "global",
        defaultBindings: ["Shift+F"],
        ignoreRepeat: true,
    },

    // UI-27: the move the playhead is inside becomes two that meet there (Expert); unbound
    timelineSplitMoveAtPlayhead: {
        labelKey: "actions.timeline.splitMoveAtPlayhead",
        category: "timeline",
        scope: "global",
        defaultBindings: [],
    },
    // UI-25: split the selected marchers off the window's move, or merge a split move back into
    // its page (Expert timeline mode; not registered in Basic, so hidden there)
    splitSelectedIntoNewMove: {
        labelKey: "actions.timeline.splitSelectedIntoNewMove",
        category: "timeline",
        scope: "global",
        defaultBindings: [],
    },
    mergeMoveIntoPage: {
        labelKey: "actions.timeline.mergeMoveIntoPage",
        category: "timeline",
        scope: "global",
        defaultBindings: [],
    },
} satisfies Record<string, ActionDefinition>;

export const ACTIONS = {
    ...STATIC_ACTIONS,
    ...buildNudgeActions(),
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

export function getActionDefinition(id: ActionId): ActionDefinition {
    return ACTIONS[id];
}
