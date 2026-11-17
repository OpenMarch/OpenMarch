import { create } from "zustand";
import type { FieldLineRef } from "./lines";
import type { LineSelection } from "./lineSelection";

/**
 * The Field panel (#824). While it's open (`active`) the field holds still, fitted beside it, and
 * the drill can't be picked; the panel's tabs hold the field's settings. The Lines tab is the mode
 * for lines (`lines`): while it's showing, the field draws rulers, its lines can be picked and
 * dragged, the line keys work and the marchers step back. The picked lines are the only subject:
 * the tab's Line section shows and changes them. Everything goes through the field edits
 * (`src/field/edits`), one undo step each.
 *
 * This store holds view state only (nothing here is saved): the tab, what's picked, what the
 * pointer is over, and whether edits mirror across the 50.
 */
export interface FieldEditDrag {
    /** "add": out of a ruler; "move": a line (or the selection) dragged */
    readonly kind: "add" | "move";
    readonly axis: "x" | "y";
    /** Where it would go, in steps */
    readonly steps: number;
    /** Over its ruler: letting go deletes the dragged lines (move) or adds nothing (add) */
    readonly overRuler: boolean;
    /** The lines being moved */
    readonly lines: readonly FieldLineRef[];
}

export type FieldPanelTab = "setup" | "lines" | "appearance";

export interface FieldEditModeState {
    /** The Field panel is open */
    readonly active: boolean;
    /** The Lines tab is showing: the field's lines can be picked, dragged and added */
    readonly lines: boolean;
    /** The Field panel's tab */
    readonly tab: FieldPanelTab;
    /** The Lines tab's list: side to side (X) or front to back (Y); ⌘A picks its lines */
    readonly axis: "x" | "y";
    /** Edits on an X line also edit its twin across the 50 (on by default) */
    readonly mirror: boolean;
    readonly selection: LineSelection;
    /** The line under the pointer, on the field or in the Field panel's list */
    readonly hover: FieldLineRef | null;
    /**
     * The keyboard should go to the Line section's Position (a double-click or Enter on a line):
     * the section focuses it and clears this
     */
    readonly focusPosition: boolean;
    /** A drag in progress, for the readout and the field test API */
    readonly drag: FieldEditDrag | null;
    /** Taps add to the selection (the touch layout's Select many) */
    readonly selectMany: boolean;
    /** Where the pointer last was over the field, in steps on each axis; X and Y add there */
    readonly pointer: { readonly x: number; readonly y: number } | null;
}

const IDLE = {
    selection: [],
    hover: null,
    drag: null,
    selectMany: false,
    pointer: null,
} as const;

export const useFieldEditModeStore = create<FieldEditModeState>(() => ({
    active: false,
    lines: false,
    tab: "setup",
    axis: "x",
    mirror: true,
    focusPosition: false,
    ...IDLE,
}));

export const fieldEditMode = {
    get: () => useFieldEditModeStore.getState(),
    isActive: () => useFieldEditModeStore.getState().active,
    isEditingLines: () => useFieldEditModeStore.getState().lines,
    /** Opens the panel on Setup, or on Lines */
    enter: ({ lines = false }: { lines?: boolean } = {}) =>
        useFieldEditModeStore.setState({
            active: true,
            lines,
            tab: lines ? "lines" : "setup",
            ...IDLE,
        }),
    exit: () =>
        useFieldEditModeStore.setState({
            active: false,
            lines: false,
            ...IDLE,
        }),
    /** The Lines tab is the mode for lines: leaving it drops the pick and any drag */
    setTab: (tab: FieldPanelTab) =>
        useFieldEditModeStore.setState({
            tab,
            lines: tab === "lines",
            ...IDLE,
        }),
    select: (selection: LineSelection) =>
        useFieldEditModeStore.setState({ selection }),
    setHover: (hover: FieldLineRef | null) =>
        useFieldEditModeStore.setState({ hover }),
    setAxis: (axis: "x" | "y") => useFieldEditModeStore.setState({ axis }),
    setMirror: (mirror: boolean) => useFieldEditModeStore.setState({ mirror }),
    /** Picks `line` and puts the keyboard in the Line section's Position */
    editPosition: (line: FieldLineRef) =>
        useFieldEditModeStore.setState({
            selection: [line],
            focusPosition: true,
        }),
    positionFocused: () =>
        useFieldEditModeStore.setState({ focusPosition: false }),
    setDrag: (drag: FieldEditDrag | null) =>
        useFieldEditModeStore.setState({ drag }),
    setSelectMany: (selectMany: boolean) =>
        useFieldEditModeStore.setState({ selectMany }),
    setPointer: (pointer: FieldEditModeState["pointer"]) =>
        useFieldEditModeStore.setState({ pointer }),
};

/** The Field panel is open */
export const useIsFieldEditMode = () => useFieldEditModeStore((s) => s.active);
/** The Lines tab is showing: lines can be picked and dragged */
export const useIsEditingFieldLines = () =>
    useFieldEditModeStore((s) => s.active && s.lines);
