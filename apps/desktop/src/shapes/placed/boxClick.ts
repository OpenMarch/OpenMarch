/**
 * What a press on a marcher selects when placed boxes are on the field, Figma-style
 * (docs/timeline/research/shapes/07-placed-boxes.md):
 *
 * - A click on a box member selects the whole box. A press on a marcher that's already selected
 *   (the whole box, or one picked by a marquee) is left to the canvas, so it drags the selection.
 * - Inside a box (after a double click), a press is the canvas's: a click selects one marcher,
 *   and Shift adds one (a drag then moves the selection). Shift on a selected marcher takes it
 *   out, and the press ends there.
 * - From outside, Shift-click adds or removes the whole box.
 * - Reaching inside ($mod, `reachInside`) goes inside the box from anywhere, and the press is then
 *   a press inside it: it picks just that marcher, and Shift+$mod toggles it.
 * - A marcher in no box is the canvas's as before, and leaves the box you were inside.
 *
 * @returns the marchers to select, or null to leave the press to the canvas; and the box you're
 *   inside after it
 */
export function clickOnMarcher({
    marcherId,
    shift,
    reachInside = false,
    selected,
    box,
    inside,
}: {
    marcherId: number;
    shift: boolean;
    /** The press reaches inside the box ($mod) */
    reachInside?: boolean;
    selected: ReadonlySet<number>;
    box: { readonly id: number; readonly members: readonly number[] } | null;
    inside: number | null;
}): { select: number[] | null; inside: number | null } {
    if (!box) return { select: null, inside: null };
    if (reachInside || inside === box.id) {
        // The canvas's, except that Shift takes a selected marcher out, so the press ends there
        // instead of dragging the selection
        if (!shift || !selected.has(marcherId))
            return { select: null, inside: box.id };
        return {
            select: [...selected].filter((id) => id !== marcherId),
            inside: box.id,
        };
    }
    const all = box.members.every((id) => selected.has(id));
    if (shift) {
        const members = new Set(box.members);
        return {
            select: all
                ? [...selected].filter((id) => !members.has(id))
                : [
                      ...selected,
                      ...box.members.filter((id) => !selected.has(id)),
                  ],
            inside: null,
        };
    }
    if (all || selected.has(marcherId)) return { select: null, inside: null };
    return { select: [...box.members], inside: null };
}
