import { create } from "zustand";

/**
 * The shape editor's own choices (08-shape-system-ux.md): the box's ratio lock and an Arc's
 * width-and-depth lock (both off by default; each its own, so locking one doesn't lock the other,
 * owner on #634). They last for the session, not the show. A shape keeps its own pivot in its
 * params (`pivot.ts`, #350); a plain selection's is the field editor's (`selectionPivot.ts`).
 */
export const useShapeEditorStore = create<{
    ratioLocked: boolean;
    sizesLocked: boolean;
}>(() => ({ ratioLocked: false, sizesLocked: false }));

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
