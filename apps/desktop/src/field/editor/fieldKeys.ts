import type { HonoredRoles } from "@/input/gestureChipStore";
import { clearGestureChip, syncGestureChip } from "@/input/gestureChipSync";
import { startGestureKeys, type GestureKeys } from "@/input/gestureKeys";
import type { HeldKeys, RoleKey, Roles } from "@/input/modifierRoles";
import type { FieldOnScreen, FieldPoint, FieldPointer } from "./fieldEditor";

/**
 * Starts following one field gesture's held roles (`startGestureKeys` in the
 * "field" context; version A: Shift fine, $mod constrain), calling `changed`
 * when a key pressed or released mid-drag changes them. A gesture starts it
 * once, at its press, and disposes it when it ends or is cancelled.
 */
export type FieldKeys = (changed: (roles: Roles) => void) => GestureKeys;

/**
 * The {@link FieldKeys} of a press: `press` is the pointer-down (a
 * `FieldPointer` carries its keys), `usedByPress` the key a selection choice
 * used (a Shift-press that added the marcher), which is no role until it's
 * released and pressed again. `isMac` resolves $mod; the editor passes its own.
 * `onScreen` is the touch pill's toggles, OR'd in and followed as keys are.
 */
export function fieldKeys(
    press: HeldKeys,
    {
        usedByPress,
        isMac,
        onScreen,
    }: {
        usedByPress?: readonly RoleKey[];
        isMac: boolean;
        onScreen?: FieldOnScreen;
    },
): FieldKeys {
    return (changed) =>
        startGestureKeys({
            context: "field",
            press,
            usedByPress,
            isMac,
            onScreen: onScreen?.roles,
            onScreenChange: onScreen?.subscribe,
            onRolesChange: changed,
        });
}

/**
 * What one drag draws, kept in step with its held roles. Every pointer move
 * takes the keys it carries and draws at the pointer; a role key pressed or
 * released mid-drag redraws at the last pointer, with no move. A release
 * where the last move left the pointer keeps what's drawn: a key changed
 * since has redrawn it already, and one the release reports that no keyboard
 * event did mustn't change the drop (user stories 41 and 42). The chip near
 * the cursor names the held roles `honored` declares, from the first move:
 * the field editor starts a drag only past the click slop, since until then it
 * can't tell what the press becomes (a click, a move, a marquee).
 */
export class FieldDrag<T> {
    private readonly keys: GestureKeys;
    /** What was drawn last, and where the pointer was for it. */
    private shown: { at: FieldPoint; drawn: T } | null = null;
    private lastScreen: FieldPointer["screen"] | undefined;

    constructor(
        keys: FieldKeys,
        /** What the drag draws for the pointer at `at`, with these roles held. */
        private readonly draw: (at: FieldPoint, roles: Roles) => T,
        private readonly show: (drawn: T) => void,
        /** The roles the drag reads, and their words, for the chip */
        private readonly honored: HonoredRoles,
    ) {
        this.keys = keys((roles) => {
            if (this.shown) this.drawAt(this.shown.at);
            syncGestureChip(this.honored, roles, this.lastScreen, this);
        });
    }

    move(pointer: FieldPointer): void {
        this.lastScreen = pointer.screen;
        this.keys.update(pointer);
        this.drawAt(pointer.field);
        syncGestureChip(this.honored, this.keys.roles(), pointer.screen, this);
    }

    /** Stops following the keys, and returns what the release drops. */
    end(pointer: FieldPointer): T {
        const shown = this.shown;
        const still =
            shown !== null &&
            shown.at.x === pointer.field.x &&
            shown.at.y === pointer.field.y;
        if (!still) this.keys.update(pointer);
        this.keys.dispose();
        clearGestureChip(this);
        return still
            ? shown.drawn
            : this.draw(pointer.field, this.keys.roles());
    }

    /** Stops following the keys; nothing is dropped. */
    cancel(): void {
        this.keys.dispose();
        clearGestureChip(this);
    }

    private drawAt(at: FieldPoint) {
        const drawn = this.draw(at, this.keys.roles());
        this.shown = { at, drawn };
        this.show(drawn);
    }
}
