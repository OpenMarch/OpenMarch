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
    /**
     * The open shape's marchers (08-shape-system-ux.md, "fade the rest"); null dims nobody. A
     * second set beside isolation's, so each can come and go without the other.
     */
    private focus: ReadonlySet<number> | null = null;
    /** The open shape is drawn: its own marchers' dots hide, its spots show where they'll be */
    private hideFocus = false;
    /** The edited shape's marchers while it's seen on its own (#558, H): not drawn at all */
    private hidden: ReadonlySet<number> | null = null;
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

    /**
     * Fades every marcher but `members` while a shape is open; null ends it. With
     * `hideMembers` (the shape is drawn, #417) the members' own dots hide too: the shape's spots
     * show where they'll be, and its pathways where they come from.
     */
    setFocus(
        members: ReadonlySet<number> | null,
        { hideMembers = false }: { hideMembers?: boolean } = {},
    ) {
        const hide = members !== null && hideMembers;
        if (sameMembers(members, this.focus) && hide === this.hideFocus) return;
        this.focus = members;
        this.hideFocus = hide;
        this.version++;
        for (const listener of this.listeners) listener();
    }

    /**
     * Hides `ids` (the edited shape's marchers, #558) whatever else would draw them; null hides
     * nobody. Everyone else keeps their look.
     */
    setHidden(ids: ReadonlySet<number> | null) {
        if (sameMembers(ids, this.hidden)) return;
        this.hidden = ids;
        this.version++;
        for (const listener of this.listeners) listener();
    }

    /** Whether a marcher is hidden by {@link setHidden} */
    isHidden(id: number): boolean {
        return this.hidden?.has(id) ?? false;
    }

    /** How opaque a marcher's dot is drawn: hidden 0, faded by a shape, dimmed, or 1 */
    opacityOf(id: number): number {
        if (this.isHidden(id)) return 0;
        if (this.focus !== null) {
            if (!this.focus.has(id)) return SHAPE_FADED_OPACITY;
            if (this.hideFocus) return 0;
        }
        return this.members !== null && !this.members.has(id)
            ? DIMMED_OPACITY
            : 1;
    }

    /** Whether a marcher's label is drawn: not for an open shape's hidden members */
    labelShown(id: number): boolean {
        return this.opacityOf(id) > 0;
    }

    isDimmed(id: number): boolean {
        return (
            (this.members !== null && !this.members.has(id)) ||
            (this.focus !== null && !this.focus.has(id))
        );
    }
}

/** Whether two sets (or nulls) hold the same ids. */
export const sameMembers = (
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

/**
 * How opaque the marchers outside an open shape and their labels are (#417): secondary but
 * readable as context. 12% made the field look empty (owner lab feedback).
 */
export const SHAPE_FADED_OPACITY = 0.4;
