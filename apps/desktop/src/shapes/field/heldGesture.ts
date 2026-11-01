import { CLICK_SLOP, type FieldPointer } from "@/field/editor/fieldEditor";
import { startGestureKeys } from "@/input/gestureKeys";
import {
    clearGestureChip,
    holdsHonored,
    syncGestureChip,
} from "@/input/gestureChipSync";
import type { GestureChipScreen, HonoredRoles } from "@/input/gestureChipStore";
import {
    pressChoiceOf,
    REACH_INSIDE,
    type HeldKeys,
    type RoleKey,
    type Roles,
} from "@/input/modifierRoles";
import { onScreenRoles, subscribeOnScreen } from "@/stores/TouchModifierStore";
import type { ShapeTarget } from "../frame/gestures";
import { useShapeEditorStore } from "../frame/shapeEditorStore";
import type { AnyToolKind, KindHonors } from "../tool/toolKind";
import type { XY } from "../types";

/**
 * The held roles of one shape gesture, from its press to its end (version A,
 * docs/timeline/research/shapes/modifier-roles.md), and the move to run again when a role key is
 * pressed or released mid-drag. The touch pill's role toggles count as held keys, and a toggle
 * latched or let go mid-drag runs the move again too. Until a move hands it `last`, the press is
 * still a click, and a key changes nothing.
 */
export interface HeldGesture<A> {
    /** The held roles now */
    roles(): Roles;
    /** A pointer move's keys, and the move to run again (null while the press is still a click) */
    move(keys: HeldKeys, last: A | null): Roles;
    /** The gesture ended (released, cancelled, unmounted): stops following the keyboard */
    end(): void;
}

/**
 * Starts following a gesture's keys; `rerun` is the last move again, with the roles now. `isMac`:
 * $mod is Cmd (the platform's by default). With `chip`, the chip near the cursor names the roles it
 * honors: from the press when one of them is held, else once the press is a drag.
 */
export function holdGesture<A>(
    press: HeldKeys,
    rerun: (last: A, roles: Roles) => void,
    usedByPress: readonly RoleKey[] = [],
    isMac?: boolean,
    chip?: {
        honored: HonoredRoles;
        screen: () => GestureChipScreen;
    },
): HeldGesture<A> {
    let last: A | null = null;
    let ended = false;
    let chipShown = false;
    /** This gesture, as the chip's owner */
    const owner = {};
    const touchChip = (roles: Roles) => {
        if (!chip || ended) return;
        if (!chipShown && last === null && !holdsHonored(chip.honored, roles))
            return;
        chipShown = true;
        syncGestureChip(chip.honored, roles, chip.screen(), owner);
    };
    const keys = startGestureKeys({
        context: "shape",
        press,
        usedByPress,
        onScreen: onScreenRoles,
        onScreenChange: subscribeOnScreen,
        isMac,
        onRolesChange: (roles) => {
            if (!ended && last !== null) rerun(last, roles);
            touchChip(roles);
        },
    });
    touchChip(keys.roles());
    return {
        roles: keys.roles,
        move(next, at) {
            keys.update(next);
            if (at !== null) last = at;
            touchChip(keys.roles());
            return keys.roles();
        },
        end() {
            ended = true;
            keys.dispose();
            if (chip) clearGestureChip(owner);
        },
    };
}

/** A shape gesture on the field: a move hands its pointer, which counts once past the click slop */
export interface HeldFieldGesture extends Omit<HeldGesture<XY>, "move"> {
    move(pointer: FieldPointer): Roles;
}

/** The shape a press lands on: its kind, its params (null before it's drawn) and its spot count */
export interface PressedShape {
    readonly kind: AnyToolKind;
    readonly params: unknown;
    readonly n: number;
}

/**
 * What a drag of `kind` reads, from what its press grabbed, for the chip (modifier roles: it names
 * only these). Every shape drag snaps and reads fine; constrain is one axis on a move, and on a
 * draw or a handle constrain and from center are the kind's own (`ToolKind.honors`). A turn
 * and the pivot read neither, and fine on a turn is whole degrees.
 */
export function shapeDragHonors(
    { kind, params, n }: PressedShape,
    grabbed: ShapeTarget | { type: "draw" } | null,
    ratioLocked: boolean,
): HonoredRoles {
    const honors = (own: KindHonors = {}): HonoredRoles => ({
        context: "shape",
        fine: "fine",
        ...own,
        snaps: true,
    });
    switch (grabbed?.type) {
        case undefined:
            return { context: "shape", snaps: false };
        case "draw":
            return honors(kind.honors?.draw);
        case "handle":
            return honors(
                kind.honors?.handle?.(grabbed.key, ratioLocked, params, n),
            );
        case "move":
        case "center":
            return honors({ constrain: "oneAxis" });
        case "rotate":
            return { context: "shape", fine: "wholeDegrees", snaps: true };
        case "pivot":
            return honors();
    }
}

/**
 * The held roles of a shape gesture on the field. `grabs` is what the press takes, with reach
 * inside on or off; a press that pulls the pivot out of the center dot uses reach inside's key
 * ($mod), so that key isn't `constrain` until it's released and pressed again. Once the pointer has
 * gone past the field's click slop, a role key pressed or released calls `rerun` at the last
 * pointer; before, the press is still a click and stays one. The chip names what a drag of
 * `shape` on what the press took reads ({@link shapeDragHonors}). `isMac` is the field editor's:
 * $mod is Cmd.
 */
export function pressShapeKeys(
    pointer: FieldPointer,
    shape: PressedShape,
    grabs: (reachInside: boolean) => ShapeTarget | { type: "draw" } | null,
    rerun: (at: XY, roles: Roles) => void,
    isMac: boolean,
): { held: HeldFieldGesture; reachInside: boolean } {
    const reach = pressChoiceOf(pointer, "shape", {
        applicable: REACH_INSIDE,
        isMac,
    });
    const target = grabs(reach !== null);
    const pulled = target?.type === "pivot" && target.pulled === true;
    let lastScreen: GestureChipScreen = pointer.screen;
    const held = holdGesture<XY>(
        pointer,
        rerun,
        pulled && reach ? [reach.key] : [],
        isMac,
        {
            honored: shapeDragHonors(
                shape,
                target,
                useShapeEditorStore.getState().ratioLocked,
            ),
            screen: () => lastScreen,
        },
    );
    let dragging = false;
    return {
        held: {
            roles: held.roles,
            end: held.end,
            move(p) {
                lastScreen = p.screen;
                dragging ||=
                    Math.hypot(
                        p.screen.x - pointer.screen.x,
                        p.screen.y - pointer.screen.y,
                    ) >= CLICK_SLOP;
                return held.move(p, dragging ? p.field : null);
            },
        },
        reachInside: reach !== null,
    };
}
