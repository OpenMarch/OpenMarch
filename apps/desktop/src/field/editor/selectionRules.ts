/**
 * The selection a click leaves (#189 user stories 23, 24, 30):
 *
 * - on a marcher, only that marcher, even when it was one of several selected;
 * - Shift on a marcher adds it, or removes it when it's selected;
 * - on empty field, nothing; Shift on empty field keeps the selection.
 *
 * `hit` is the marcher clicked, or null on empty field.
 */
export function selectionAfterClick(
    current: readonly number[],
    hit: number | null,
    shift: boolean,
): readonly number[] {
    if (hit === null) return shift ? current : [];
    if (!shift) return [hit];
    return current.includes(hit)
        ? current.filter((id) => id !== hit)
        : [...current, hit];
}
