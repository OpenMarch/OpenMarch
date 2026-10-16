/**
 * Which marchers the new field draws dimmed (fork #201; UI-9: while a move is
 * isolated, the marchers outside it), outside React. The marchers and labels
 * layers read it in their frame hooks and redraw when `version` changes.
 * Selection rules (that a dimmed marcher can't be selected or hit) are the
 * editor's: it asks the same `isMarcherDimmed`.
 */
export class FieldDimming {
    /** Goes up whenever who's dimmed changes. */
    version = 0;
    /** The isolated move's marchers, the only ones not dimmed; null dims nobody. */
    private members: ReadonlySet<number> | null = null;
    private readonly listeners = new Set<() => void>();

    /** Calls `listener` after each change (a layer asks for a frame). Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Dims every marcher but `members`; null dims nobody. Nothing changes, and
     * nothing redraws, when the set is the same as before, so moving the
     * playhead inside an isolated move costs nothing here.
     */
    set(members: ReadonlySet<number> | null) {
        if (sameMembers(members, this.members)) return;
        this.members = members;
        this.version++;
        for (const listener of this.listeners) listener();
    }

    isDimmed(id: number): boolean {
        return this.members !== null && !this.members.has(id);
    }
}

const sameMembers = (
    a: ReadonlySet<number> | null,
    b: ReadonlySet<number> | null,
) =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.size === b.size &&
        [...a].every((id) => b.has(id)));

/** How opaque a dimmed marcher and its label are. */
export const DIMMED_OPACITY = 0.25;
