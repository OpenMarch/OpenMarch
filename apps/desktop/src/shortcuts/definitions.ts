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

export interface ActionDefinition {
    /** i18n key, e.g. "actions.alignment.lockX" */
    labelKey: string;
    /** i18n key appended in parentheses, e.g. "(fine)" */
    labelSuffixKey?: string;
    labelParams?: Readonly<Record<string, string | number>>;
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
    hiddenFromPalette?: boolean;
    args?: ActionArgs;
}

export type NudgeDirection = "up" | "down" | "left" | "right";
export type NudgeStep = "grid" | "quarter" | "tenth" | "four";
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
                hiddenFromPalette: true,
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
            scope: "timeline",
            defaultBindings: [String(count)],
            hiddenFromPalette: true,
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
        scope: "global",
        defaultBindings: [],
    },
    launchSaveFileDialogue: {
        labelKey: "actions.file.saveDialogue",
        category: "file",
        scope: "global",
        defaultBindings: [],
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
        scope: "canvas",
        defaultBindings: ["E"],
    },
    lastPage: {
        labelKey: "actions.navigation.lastPage",
        category: "navigation",
        scope: "canvas",
        defaultBindings: ["Shift+E"],
    },
    previousPage: {
        labelKey: "actions.navigation.previousPage",
        category: "navigation",
        scope: "canvas",
        defaultBindings: ["Q"],
    },
    firstPage: {
        labelKey: "actions.navigation.firstPage",
        category: "navigation",
        scope: "canvas",
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
    toggleMetronome: {
        labelKey: "actions.playback.toggleMetronome",
        category: "playback",
        scope: "global",
        defaultBindings: ["$mod+M", "Control+M"],
    },

    // Batch editing
    setAllMarchersToPreviousPage: {
        labelKey: "actions.batchEdit.setAllToPrevious",
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["$mod+Shift+P", "Control+Shift+P"],
    },
    setSelectedMarchersToPreviousPage: {
        labelKey: "actions.batchEdit.setSelectedToPrevious",
        category: "batchEdit",
        scope: "canvas",
        defaultBindings: ["Shift+P"],
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
        defaultBindings: ["$mod+S", "Control+S"],
    },

    // UI
    togglePreviousPagePaths: {
        labelKey: "actions.ui.togglePreviousPaths",
        toggleOnKey: "actions.ui.showPreviousPaths",
        toggleOffKey: "actions.ui.hidePreviousPaths",
        category: "ui",
        scope: "canvas",
        defaultBindings: ["N"],
    },
    toggleNextPagePaths: {
        labelKey: "actions.ui.toggleNextPaths",
        toggleOnKey: "actions.ui.showNextPaths",
        toggleOffKey: "actions.ui.hideNextPaths",
        category: "ui",
        scope: "canvas",
        defaultBindings: ["M"],
    },
    focusCanvas: {
        labelKey: "actions.ui.focusCanvas",
        category: "ui",
        scope: "global",
        defaultBindings: ["Alt+C"],
    },
    focusTimeline: {
        labelKey: "actions.ui.focusTimeline",
        category: "ui",
        scope: "global",
        defaultBindings: ["Alt+T"],
    },
    exitTimelineFocus: {
        labelKey: "actions.ui.exitTimelineFocus",
        category: "ui",
        scope: "timeline",
        defaultBindings: ["Escape"],
        allowInInputs: true,
        hiddenFromPalette: true,
    },

    // Cursor mode
    applyQuickShape: {
        labelKey: "actions.shape.applyQuick",
        category: "cursor",
        scope: "canvas",
        defaultBindings: ["Shift+Enter"],
    },
    createMarcherShape: {
        labelKey: "actions.shape.create",
        category: "cursor",
        scope: "canvas",
        defaultBindings: ["Enter"],
    },
    cancelAlignmentUpdates: {
        labelKey: "actions.alignment.cancelUpdates",
        category: "cursor",
        scope: "canvas",
        defaultBindings: ["Escape"],
    },
    alignmentEventDefault: {
        labelKey: "actions.cursor.defaultMode",
        category: "cursor",
        scope: "canvas",
        defaultBindings: ["V"],
    },
    alignmentEventLine: {
        labelKey: "actions.cursor.lineMode",
        category: "cursor",
        scope: "canvas",
        defaultBindings: ["L"],
    },

    // Select
    selectAllMarchers: {
        labelKey: "actions.select.selectAll",
        category: "select",
        scope: "canvas",
        defaultBindings: ["$mod+A", "Control+A"],
    },

    // Shapes
    createCircle: {
        labelKey: "actions.shape.createCircle",
        category: "shape",
        scope: "canvas",
        defaultBindings: ["O"],
    },

    // Timeline (audio editor)
    timelinePlayPause: {
        labelKey: "actions.timeline.playPause",
        category: "timeline",
        scope: "timeline",
        defaultBindings: ["Space"],
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

export const TAP_BEATS_ACTION_IDS = ACTION_IDS.filter((id) =>
    id.startsWith("timelineTapBeats"),
);

export function getActionDefinition(id: ActionId): ActionDefinition {
    return ACTIONS[id];
}
