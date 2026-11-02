import { afterEach, describe, expect, it } from "vitest";
import {
    onScreenToggles,
    useTouchModifierStore,
} from "@/stores/TouchModifierStore";
import {
    FieldEditor,
    type DropResult,
    type FieldEditorPorts,
    type FieldPoint,
    type FieldPointer,
} from "../fieldEditor";
import type { MarcherPosition } from "../moveGesture";
import { ruledMove } from "../moveRules";
import { clickOnMarcher } from "@/shapes/placed/boxClick";

/**
 * The touch pill's toggles on the field (modifier roles, version A, "Touch and Apple Pencil"):
 * Fine, Equal and From center count as held keys for every drag, latched mid-drag they re-run
 * the last move as a keydown does, and the press rule never blocks them. Add is the add press
 * choice for clicks, drags and area selection, as Shift is. A Pencil press reaches the editor as a
 * mouse press does, so these run on plain pointers.
 */

/** Marchers 1 to 4 in a row 100 field units apart, at zoom 2, on a 10-unit rounding grid */
function setup({
    selected = [] as number[],
    /** Whether the pill's toggles are wired in, as `ThreeField` does */
    wired = true,
    /** Marchers 1 and 2 are a placed box's members, as `ThreeField`'s box selection makes them */
    box = false,
} = {}) {
    const state = {
        inside: null as number | null,
        selected: [...selected] as readonly number[],
        shown: null as ReadonlyMap<number, FieldPoint> | null,
        drops: [] as (readonly MarcherPosition[])[],
    };
    const ports: FieldEditorPorts = {
        selection: {
            get: () => state.selected,
            set: (ids) => {
                state.selected = ids;
            },
        },
        marchers: () => ({
            ids: [1, 2, 3, 4],
            positions: Float64Array.from([
                100, 100, 200, 100, 300, 100, 400, 100,
            ]),
        }),
        zoom: () => ZOOM,
        canSelect: () => true,
        // Clear of the marchers, so a handle never takes a click on one
        selectionBoxPadding: () => 10,
        showPositions: (positions) => {
            state.shown = positions;
        },
        drop: (positions) => {
            state.drops.push(positions);
            return Promise.resolve<DropResult>("saved");
        },
    };
    if (box) {
        const placed = { id: 7, members: [1, 2] };
        const boxOf = (id: number) =>
            placed.members.includes(id) ? placed : null;
        ports.pressSelection = (hit, shift, reachInside) => {
            const out = clickOnMarcher({
                marcherId: hit,
                shift,
                reachInside,
                selected: new Set(state.selected),
                box: boxOf(hit),
                inside: state.inside,
            });
            state.inside = out.inside;
            return out.select;
        };
        ports.reachesInside = (hit) =>
            boxOf(hit) !== null && state.inside !== placed.id;
    }
    const editor = new FieldEditor(ports, {
        isMac: false,
        moveTransform: ruledMove(() => ({
            rounding: { nearestXSteps: 1, nearestYSteps: 1 },
            lockX: false,
            lockY: false,
            grid: {
                pixelsPerStep: 10,
                centerFrontPoint: { xPixels: 0, yPixels: 0 },
            },
        })),
        onScreen: wired ? onScreenToggles : undefined,
    });
    running = editor;
    return { editor, state };
}

const ZOOM = 2;

const at = (
    x: number,
    y: number,
    keys: Partial<Pick<FieldPointer, "shift" | "alt" | "ctrl" | "meta">> = {},
): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button: 0,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...keys,
});

const drag = (
    editor: FieldEditor,
    from: FieldPoint,
    to: FieldPoint,
    keys?: Parameters<typeof at>[2],
) => {
    editor.pointerDown(at(from.x, from.y, keys));
    editor.pointerMove(at((from.x + to.x) / 2, (from.y + to.y) / 2, keys));
    editor.pointerMove(at(to.x, to.y, keys));
    editor.pointerUp(at(to.x, to.y, keys));
};

const click = (editor: FieldEditor, x: number, y: number) => {
    editor.pointerDown(at(x, y));
    editor.pointerUp(at(x, y));
};

const shown = (state: ReturnType<typeof setup>["state"]) =>
    state.shown && Object.fromEntries(state.shown);

const store = () => useTouchModifierStore.getState();

// A gesture left running keeps following the keys and the pill; end each one
let running: FieldEditor | undefined;
afterEach(() => {
    running?.pointerCancel();
    store().clear();
});

describe("Fine on the pill", () => {
    it("latched, drags a marcher at a quarter of the pointer's speed and off the grid, as Shift held does", () => {
        // On a selected marcher, so the Shift-press adds nothing and Shift is fine
        const shift = setup({ selected: [1] });
        drag(
            shift.editor,
            { x: 100, y: 100 },
            { x: 157, y: 121 },
            {
                shift: true,
            },
        );
        const plain = setup({ selected: [1] });
        drag(plain.editor, { x: 100, y: 100 }, { x: 157, y: 121 });
        expect(plain.state.drops[0]).toEqual([{ id: 1, x: 160, y: 120 }]);

        store().toggleLatched("fine");
        const fine = setup({ selected: [1] });
        drag(fine.editor, { x: 100, y: 100 }, { x: 157, y: 121 });
        expect(fine.state.drops[0]).toEqual([{ id: 1, x: 114.25, y: 105.25 }]);
        expect(fine.state.drops[0]).toEqual(shift.state.drops[0]);
    });

    it("latched mid-drag re-runs the last move with no pointer move, and tapped off snaps again", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(137, 100));
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        store().toggleLatched("fine");
        // Off the grid now, but still drawn where it was: no jump back to 137
        expect(shown(state)).toEqual({ 1: { x: 140, y: 100 } });
        editor.pointerMove(at(157, 100));
        expect(shown(state)).toEqual({ 1: { x: 145, y: 100 } });
        store().toggleLatched("fine");
        expect(shown(state)).toEqual({ 1: { x: 150, y: 100 } });
    });

    it("isn't followed once the drag ends", () => {
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 137, y: 100 });
        const after = state.shown;
        store().toggleLatched("fine");
        expect(state.shown).toBe(after);
    });

    it("changes nothing without the pill wired in", () => {
        store().toggleLatched("fine");
        const { editor, state } = setup({ wired: false });
        drag(editor, { x: 100, y: 100 }, { x: 157, y: 121 });
        expect(state.drops[0]).toEqual([{ id: 1, x: 160, y: 120 }]);
    });
});

describe("Equal on the pill", () => {
    it("held, keeps a drag on the axis it has gone further along, as $mod does", () => {
        store().setHeld("constrain", true);
        const { editor, state } = setup();
        drag(editor, { x: 100, y: 100 }, { x: 157, y: 121 });
        expect(state.drops[0]).toEqual([{ id: 1, x: 160, y: 100 }]);
    });
});

describe("From center on the pill", () => {
    // Marchers 1 and 4 span 100 to 400; the box's east handle is 10 out, at (410, 100)
    const scaleEast = (keys?: Parameters<typeof at>[2]) => {
        const { editor, state } = setup({ selected: [1, 4] });
        drag(editor, { x: 410, y: 100 }, { x: 440, y: 100 }, keys);
        return state;
    };

    it("latched, scales a selection about its center, as Alt held at the press does (#545)", () => {
        expect(scaleEast().drops[0]).toEqual([
            { id: 1, x: 100, y: 100 },
            { id: 4, x: 430, y: 100 },
        ]);
        const alt = scaleEast({ alt: true });
        // Alt on a handle is from center, not a subtract: the selection stays
        expect(alt.selected).toEqual([1, 4]);
        expect(alt.drops[0]).toEqual([
            { id: 1, x: 70, y: 100 },
            { id: 4, x: 430, y: 100 },
        ]);

        store().toggleLatched("fromCenter");
        expect(scaleEast().drops[0]).toEqual(alt.drops[0]);
    });
});

describe("Add on the pill, as Shift at the press", () => {
    it("a click adds a marcher, and removes a selected one", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [1] });
        click(editor, 300, 100);
        expect(state.selected).toEqual([1, 3]);
        click(editor, 100, 100);
        expect(state.selected).toEqual([3]);
    });

    it("a click on empty field keeps the selection", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [1, 2] });
        click(editor, 250, 300);
        expect(state.selected).toEqual([1, 2]);
    });

    it("a press-drag on an unselected marcher adds it and moves the selection", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [2] });
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 140 });
        expect(state.selected).toEqual([2, 1]);
        expect(state.drops[0]).toEqual([
            { id: 1, x: 100, y: 140 },
            { id: 2, x: 200, y: 140 },
        ]);
    });

    it("with Fine latched too, the drag that adds is still fine: the press rule is only for keys", () => {
        store().toggleLatched("add");
        store().toggleLatched("fine");
        const { editor, state } = setup({ selected: [2] });
        drag(editor, { x: 100, y: 100 }, { x: 100, y: 140 });
        expect(state.selected).toEqual([2, 1]);
        expect(state.drops[0]).toEqual([
            { id: 1, x: 100, y: 110 },
            { id: 2, x: 200, y: 110 },
        ]);
    });

    it("a marquee adds to the selection", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [1] });
        drag(editor, { x: 250, y: 50 }, { x: 350, y: 150 });
        expect(state.selected).toEqual([1, 3]);
    });

    it("a marquee starts inside a multi-selection's box and adds, as Shift does", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [1, 3] });
        drag(editor, { x: 250, y: 100 }, { x: 450, y: 150 });
        expect(state.selected).toEqual([1, 3, 4]);
        expect(state.drops).toEqual([]);
    });

    it("a lasso adds to the selection", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [1] });
        const points = [
            [150, 50],
            [350, 50],
            [350, 150],
            [150, 150],
            [150, 60],
        ] as const;
        click(editor, 150, 50);
        editor.pointerDown(at(150, 50));
        for (const [x, y] of points.slice(1)) editor.pointerMove(at(x, y));
        editor.pointerUp(at(150, 60));
        expect(state.selected).toEqual([1, 2, 3]);
    });

    it("isn't fine: a drag of a selected marcher with only Add goes at full speed", () => {
        store().toggleLatched("add");
        const { editor, state } = setup({ selected: [1] });
        drag(editor, { x: 100, y: 100 }, { x: 157, y: 121 });
        expect(state.drops[0]).toEqual([{ id: 1, x: 160, y: 120 }]);
    });

    describe("on a placed box's member, as Shift does", () => {
        /** The same press with Shift held, and with the pill's Add latched instead */
        const both = (
            selected: number[],
            press: (
                editor: FieldEditor,
                keys: Parameters<typeof at>[2],
            ) => void,
        ) => {
            const shift = setup({ selected, box: true });
            press(shift.editor, { shift: true });
            store().toggleLatched("add");
            const add = setup({ selected, box: true });
            press(add.editor, {});
            return { shift: shift.state, add: add.state };
        };
        const tapOn = (editor: FieldEditor, keys: Parameters<typeof at>[2]) => {
            editor.pointerDown(at(100, 100, keys));
            editor.pointerUp(at(100, 100, keys));
        };

        it("a click adds the whole box", () => {
            const { shift, add } = both([3], tapOn);
            expect(shift.selected).toEqual([3, 1, 2]);
            expect(add.selected).toEqual(shift.selected);
        });

        it("a press-drag adds the whole box and drags it", () => {
            const { shift, add } = both([3], (editor, keys) =>
                drag(editor, { x: 100, y: 100 }, { x: 100, y: 140 }, keys),
            );
            expect(shift.selected).toEqual([3, 1, 2]);
            expect(shift.drops[0]).toEqual([
                { id: 1, x: 100, y: 140 },
                { id: 2, x: 200, y: 140 },
                { id: 3, x: 300, y: 140 },
            ]);
            expect(add.selected).toEqual(shift.selected);
            expect(add.drops).toEqual(shift.drops);
        });

        it("a press-drag on a box selected whole takes it out, and moves nothing", () => {
            const { shift, add } = both([1, 2, 3], (editor, keys) =>
                drag(editor, { x: 100, y: 100 }, { x: 100, y: 140 }, keys),
            );
            expect(shift.selected).toEqual([3]);
            expect(shift.drops).toEqual([]);
            expect(add.selected).toEqual(shift.selected);
            expect(add.drops).toEqual(shift.drops);
        });
    });
});
