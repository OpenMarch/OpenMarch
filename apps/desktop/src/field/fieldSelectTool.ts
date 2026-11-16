import { create } from "zustand";
import type { AreaKind } from "@/field/editor/fieldEditor";
import { useInputModeStore } from "@/stores/InputModeStore";

/**
 * What a mouse drag from empty field draws: a box or a lasso, picked on the field's Select bar
 * (top right) or with its shortcut, and kept on this device. It stays until it's switched back.
 * A double-click and drag still draws a lasso with Box picked, as before there was a choice.
 *
 * The touch layout picks with the pill's drag mode instead (`fieldDragMode.ts`), so there the
 * field always draws a box for a mouse or a pen ({@link useFieldAreaTool}).
 */
export type FieldSelectTool = "box" | "lasso";

export const FIELD_SELECT_TOOL_KEY = "openmarch:fieldSelectTool";

export const parseFieldSelectTool = (raw: string | null): FieldSelectTool =>
    raw === "lasso" ? "lasso" : "box";

/** The editor's name for what a tool draws */
export const areaKindOf = (tool: FieldSelectTool): AreaKind =>
    tool === "lasso" ? "lasso" : "marquee";

const load = (): FieldSelectTool => {
    try {
        return parseFieldSelectTool(
            localStorage.getItem(FIELD_SELECT_TOOL_KEY),
        );
    } catch {
        return "box";
    }
};

interface FieldSelectToolState {
    tool: FieldSelectTool;
    setTool: (tool: FieldSelectTool) => void;
    /** Box to Lasso, or back, as the shortcut does */
    toggle: () => void;
}

export const useFieldSelectToolStore = create<FieldSelectToolState>(
    (set, get) => ({
        tool: load(),
        setTool: (tool) => {
            try {
                localStorage.setItem(FIELD_SELECT_TOOL_KEY, tool);
            } catch {
                // Storage may be unavailable; keep it for this session
            }
            set({ tool });
        },
        toggle: () => get().setTool(get().tool === "box" ? "lasso" : "box"),
    }),
);

/** Whether the Select bar shows: not in the touch layout, whose pill has its own drag modes */
export const useShowsSelectTool = (): boolean =>
    useInputModeStore((s) => s.mode !== "touch");

/** What the field editor draws from empty field when its press didn't choose ({@link FieldSelectTool}) */
export function useFieldAreaTool(): AreaKind {
    const tool = useFieldSelectToolStore((s) => s.tool);
    return useShowsSelectTool() ? areaKindOf(tool) : "marquee";
}
