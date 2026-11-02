import { create } from "zustand";
import type { ShapeTarget } from "../frame/gestures";
import type { AnyToolKind, ToolMenuSection } from "../tool/toolKind";
import type { XY } from "../types";

/** A shape handle's right-click menu, open (#569) */
export interface OpenHandleMenu {
    /** Where it opens, in CSS pixels in the field's element */
    readonly at: XY;
    /** The handle it's for */
    readonly key: string;
    readonly sections: readonly ToolMenuSection[];
    /** Picks an entry, on the shape it was opened on */
    pick(value: string): void;
}

/** The handle menu open on the field, or null */
export const useHandleMenuStore = create<{ menu: OpenHandleMenu | null }>(
    () => ({ menu: null }),
);

export const closeHandleMenu = (): void =>
    useHandleMenuStore.setState({ menu: null });

/**
 * Opens the menu of the handle a right-click at `at` landed on, when it's a handle whose kind has
 * one (`ToolKind.menu`); says whether it did. `pick` applies an entry picked to handle `key` and
 * returns the shape after it, so a menu that stays open (a segmented either/or, #568) shows the
 * change; it closes when the handle has no menu any more.
 */
export function openHandleMenu(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    target: ShapeTarget | { type: "draw" } | null,
    at: XY,
    pick: (
        key: string,
        value: string,
    ) => { readonly params: unknown; readonly n: number } | null,
): boolean {
    if (target?.type !== "handle" || params === null) return false;
    const { key } = target;
    const sectionsOf = (p: unknown, count: number) => {
        const sections = p === null ? null : kind.menu?.sections(p, count, key);
        return sections?.some((s) => s.items.length > 0) ? sections : null;
    };
    const sections = sectionsOf(params, n);
    if (!sections) return false;
    const menu: OpenHandleMenu = {
        at,
        key,
        sections,
        pick(value) {
            const after = pick(key, value);
            // Only this menu, still open, follows the shape
            const { menu: now } = useHandleMenuStore.getState();
            if (!after || now?.pick !== menu.pick) return;
            const next = sectionsOf(after.params, after.n);
            useHandleMenuStore.setState({
                menu: next ? { ...now, sections: next } : null,
            });
        },
    };
    useHandleMenuStore.setState({ menu });
    return true;
}
