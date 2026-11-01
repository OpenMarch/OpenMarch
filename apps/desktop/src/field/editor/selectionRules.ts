/**
 * The selection a click leaves (#189 user stories 23, 24, 30):
 *
 * - on a marcher, only that marcher, even when it was one of several selected;
 * - Shift on a marcher adds it, or removes it when it's selected;
 * - on empty field, nothing; Shift (or Alt, so an Alt lasso has something to subtract from) on
 *   empty field keeps the selection.
 *
 * `hit` is the marcher clicked, or null on empty field. `keep`: the click keeps the selection
 * (Shift, or Alt on empty field), toggling `hit` in or out of it.
 */
export function selectionAfterClick(
    current: readonly number[],
    hit: number | null,
    keep: boolean,
): readonly number[] {
    if (hit === null) return keep ? current : [];
    if (!keep) return [hit];
    return current.includes(hit)
        ? current.filter((id) => id !== hit)
        : [...current, hit];
}
