import { create } from "zustand";
import { DEFAULT_PIVOT, type PivotKey } from "./frame";

/**
 * The shape editor's own choices (08-shape-system-ux.md): what a plain selection turns and flips
 * around (the Transform section's pivot grid, #349; the center by default, in Basic and Expert
 * alike), the box's ratio lock and an Arc's width-and-depth lock (both off by default; each its
 * own, so locking one doesn't lock the other, owner on #634). They last for the session, not the
 * show. A shape keeps its own pivot in its params instead (`pivot.ts`, #350).
 */
export const useShapeEditorStore = create<{
    pivot: PivotKey;
    ratioLocked: boolean;
    sizesLocked: boolean;
}>(() => ({ pivot: DEFAULT_PIVOT, ratioLocked: false, sizesLocked: false }));

export const setShapePivot = (pivot: PivotKey): void =>
    useShapeEditorStore.setState({ pivot });

export const toggleRatioLock = (): void =>
    useShapeEditorStore.setState((s) => ({ ratioLocked: !s.ratioLocked }));

/** Flips an Arc's width-and-depth lock (#634) */
export const toggleSizesLock = (): void =>
    useShapeEditorStore.setState((s) => ({ sizesLocked: !s.sizesLocked }));

/**
 * The lock `kind` reads: an Arc's width and depth for a kind whose sizes lock
 * (`ToolParam.ratioLockAfter`), the box's spacings otherwise
 */
export const locksSizes = (kind: {
    readonly params: readonly { readonly ratioLockAfter?: boolean }[];
}): boolean => kind.params.some((p) => p.ratioLockAfter === true);
