import { setModifierReleaseGraceForTests } from "@/input/modifierGrace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    FieldEditor,
    LOCKED_ITEM_MENU,
    type DropResult,
    type FieldEditorPorts,
    type FieldPoint,
    type FieldPointer,
} from "../fieldEditor";
import type { MarcherPosition } from "../moveGesture";
import { MIN_ITEM_SIZE, type ItemFrame, type ItemSize } from "../itemTransform";

// Keys let go mid-drag here redraw at once; the release grace has its own tests
beforeEach(() => setModifierReleaseGraceForTests(0));
afterEach(() => setModifierReleaseGraceForTests());

const ZOOM = 2;

/**
 * Marcher 1 at (100, 100), marcher 3 at (300, 100), and item 2 centered on
 * (300, 100): an Outline from x 250 to 350 and y 80 to 120, under marcher 3.
 */
function setup({
    dimmed = [] as number[],
    selected = [] as number[],
    rotation = 0,
    save = "saved" as DropResult,
    locked = false,
    keepsProportions = false,
    /** A cube-sized Outline, 10 field units across (20 CSS px): its handles cover it */
    small = false,
    /** Whether item 2's resize and turn handles were asked for (its Resize and turn) */
    handles = true,
} = {}) {
    const state = {
        selected: [...selected] as readonly number[],
        drops: [] as readonly MarcherPosition[][],
        /** The size and turn the field draws item 2 at, while one is dragged */
        preview: null as ItemSize | null,
        /** Each size and turn saved for item 2 */
        saves: [] as ItemSize[],
    };
    const frame: ItemFrame = {
        center: { x: 300, y: 100 },
        width: small ? 10 : 100,
        depth: small ? 10 : 40,
        rotation,
        ...(keepsProportions ? { keepsProportions } : {}),
    };
    const ports: FieldEditorPorts = {
        selection: {
            get: () => state.selected,
            set: vi.fn((ids: readonly number[]) => {
                state.selected = ids;
            }),
        },
        marchers: () => ({
            ids: [1, 2, 3],
            positions: Float64Array.from([100, 100, 300, 100, 300, 100]),
        }),
        isItem: (id) => id === 2,
        isLocked: (id) => locked && id === 2,
        itemAt: (point: FieldPoint, accept = () => true) =>
            Math.abs(point.x - 300) <= frame.width / 2 &&
            Math.abs(point.y - 100) <= frame.depth / 2 &&
            accept(2)
                ? 2
                : null,
        itemHandlesShown: () => handles,
        openMenu: vi.fn(),
        lockedItemClicked: vi.fn(),
        itemFrame: (id) => (id === 2 ? frame : null),
        previewItem: (id, size) => {
            state.preview = size;
        },
        saveItem: vi.fn((id: number, size: ItemSize) => {
            state.saves.push(size);
            return Promise.resolve(save);
        }),
        zoom: () => ZOOM,
        canSelect: (id) => !dimmed.includes(id),
        showPositions: vi.fn(),
        drop: vi.fn((positions: readonly MarcherPosition[]) => {
            state.drops = [...state.drops, [...positions]];
            return Promise.resolve<DropResult>("saved");
        }),
    };
    return { editor: new FieldEditor(ports, { now: () => 0 }), state, ports };
}

const at = (
    x: number,
    y: number,
    modifiers: Partial<Omit<FieldPointer, "field" | "screen">> = {},
): FieldPointer => ({
    field: { x, y },
    screen: { x: x * ZOOM, y: y * ZOOM },
    button: 0,
    kind: "mouse",
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    ...modifiers,
});

const key = (type: "keydown" | "keyup", init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent(type, init));

const click = (editor: FieldEditor, x: number, y: number) => {
    editor.pointerDown(at(x, y));
    editor.pointerUp(at(x, y));
};

describe("FieldEditor with items", () => {
    it("selects an item clicked anywhere inside its Outline", () => {
        const { editor, state } = setup();
        click(editor, 340, 115);
        expect(state.selected).toEqual([2]);
    });

    it("selects a marcher standing on an item, not the item", () => {
        const { editor, state } = setup();
        click(editor, 301, 100);
        expect(state.selected).toEqual([3]);
    });

    it("selects every marcher and prop with Ctrl/Cmd+A", () => {
        const { editor, state } = setup();
        editor.selectAll();
        expect(state.selected).toEqual([1, 2, 3]);
    });

    it("leaves a locked item out of Ctrl/Cmd+A", () => {
        const { editor, state } = setup({ locked: true });
        editor.selectAll();
        expect(state.selected).toEqual([1, 3]);
    });

    it("marquees the marchers over an item and the item with them", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(50, 50));
        editor.pointerMove(at(400, 150));
        editor.pointerUp(at(400, 150));
        expect(state.selected).toEqual([1, 2, 3]);
    });

    it("marquees the marchers over a locked item, and not the item", () => {
        const { editor, state } = setup({ locked: true });
        editor.pointerDown(at(50, 50));
        editor.pointerMove(at(400, 150));
        editor.pointerUp(at(400, 150));
        expect(state.selected).toEqual([1, 3]);
    });

    it("marquees an item when no performer is inside", () => {
        // Marcher 3 stands on the item; dimmed, it can't be selected
        const { editor, state } = setup({ dimmed: [3] });
        editor.pointerDown(at(200, 50));
        editor.pointerMove(at(400, 150));
        editor.pointerUp(at(400, 150));
        expect(state.selected).toEqual([2]);
    });

    it("never marquees a locked item, even with nothing else inside", () => {
        const { editor, state } = setup({ dimmed: [3], locked: true });
        editor.pointerDown(at(200, 50));
        editor.pointerMove(at(400, 150));
        editor.pointerUp(at(400, 150));
        expect(state.selected).toEqual([]);
    });

    it("never lassos a locked item", () => {
        const { editor, state } = setup({ dimmed: [3], locked: true });
        // A double-click's second press starts a lasso; it closes back at its start
        click(editor, 200, 50);
        editor.pointerDown(at(200, 50));
        for (const [x, y] of [
            [400, 50],
            [400, 150],
            [200, 150],
            [200, 60],
        ])
            editor.pointerMove(at(x, y));
        editor.pointerUp(at(200, 60));
        expect(state.selected).toEqual([]);
    });

    it("passes a click on a locked item, and a drag from it boxes the field", () => {
        const clicked = setup({ locked: true, selected: [1] });
        click(clicked.editor, 340, 115);
        expect(clicked.state.selected).toEqual([]);
        // It says why: the item is locked (no dead click)
        expect(clicked.ports.lockedItemClicked).toHaveBeenLastCalledWith(2, {
            x: 340,
            y: 115,
        });
        // A click anywhere else puts that away
        click(clicked.editor, 60, 300);
        expect(clicked.ports.lockedItemClicked).toHaveBeenLastCalledWith(null, {
            x: 60,
            y: 300,
        });
        // A drag from inside it is a marquee, which takes the marchers and never the item
        const { editor, state } = setup({ locked: true });
        editor.pointerDown(at(340, 115));
        editor.pointerMove(at(60, 60));
        editor.pointerUp(at(60, 60));
        expect(state.drops).toEqual([]);
        expect(state.selected).toEqual([1, 3]);
    });

    it("opens a locked item's own menu at a right-click on it, with it selected alone", () => {
        const { editor, state, ports } = setup({ locked: true, selected: [1] });
        editor.pointerDown(at(340, 115, { button: 2 }));
        editor.pointerUp(at(340, 115, { button: 2 }));
        expect(state.selected).toEqual([2]);
        expect(ports.openMenu).toHaveBeenCalledWith(
            expect.anything(),
            2,
            LOCKED_ITEM_MENU,
        );
    });

    it("leaves a locked item selected with a marcher out of a drag of the marcher", () => {
        const { editor, state } = setup({ locked: true, selected: [2, 1] });
        editor.pointerDown(at(100, 100));
        editor.pointerMove(at(120, 100));
        editor.pointerUp(at(120, 100));
        expect(state.drops).toEqual([[{ id: 1, x: 120, y: 100 }]]);
    });

    it("opens the field's own menu at a right-click on an unlocked item", () => {
        const { editor, state, ports } = setup();
        editor.pointerDown(at(340, 115, { button: 2 }));
        editor.pointerUp(at(340, 115, { button: 2 }));
        expect(state.selected).toEqual([2]);
        expect(ports.openMenu).toHaveBeenCalledWith(expect.anything(), 2);
    });

    it("moves a selected item without handles from anywhere inside it, even near its edge", () => {
        const { editor, state } = setup({ selected: [2], handles: false });
        // On the right side's handle, were it drawn
        editor.pointerDown(at(350, 100));
        editor.pointerMove(at(370, 100));
        editor.pointerUp(at(370, 100));
        expect(state.saves).toEqual([]);
        expect(state.drops).toEqual([[{ id: 2, x: 320, y: 100 }]]);
    });

    it("passes over a dimmed item", () => {
        const { editor, state } = setup({ dimmed: [2] });
        click(editor, 340, 115);
        expect(state.selected).toEqual([]);
    });

    it("moves an item dragged from inside its Outline, through the drop", () => {
        const { editor, state } = setup();
        editor.pointerDown(at(340, 115));
        editor.pointerMove(at(360, 115));
        editor.pointerUp(at(360, 115));
        expect(state.selected).toEqual([2]);
        expect(state.drops).toEqual([[{ id: 2, x: 320, y: 100 }]]);
    });

    describe("with one item selected", () => {
        const drag = (
            editor: FieldEditor,
            from: FieldPoint,
            to: FieldPoint,
            { release = true } = {},
        ) => {
            editor.pointerDown(at(from.x, from.y));
            editor.pointerMove(at(to.x, to.y));
            if (release) editor.pointerUp(at(to.x, to.y));
        };

        it("resizes it from a side handle with the opposite side put, moving its center", async () => {
            const { editor, state, ports } = setup({ selected: [2] });
            drag(
                editor,
                { x: 350, y: 100 },
                { x: 370, y: 100 },
                {
                    release: false,
                },
            );
            expect(editor.activeGesture()).toBe("scale");
            // The west side stays at 250: 120 across, centered on 310
            expect(state.preview).toEqual({
                width: 120,
                depth: 40,
                rotation: 0,
                center: { x: 310, y: 100 },
            });
            expect(ports.showPositions).toHaveBeenLastCalledWith(
                new Map([[2, { x: 310, y: 100 }]]),
            );
            editor.pointerUp(at(370, 100));
            expect(state.saves).toEqual([
                {
                    width: 120,
                    depth: 40,
                    rotation: 0,
                    center: { x: 310, y: 100 },
                },
            ]);
            // Saved with the size, not as a drop of its own
            expect(state.drops).toEqual([]);
            await Promise.resolve();
            expect(state.preview).toBeNull();
            expect(ports.showPositions).toHaveBeenLastCalledWith(null);
        });

        it("resizes a small item from a handle pressed inside it: its handles were asked for", () => {
            // Marcher 3 stands on it; dimmed, the press finds the item
            const { editor, state } = setup({
                selected: [2],
                small: true,
                dimmed: [3],
            });
            // Just inside the south-east corner, where its handle reaches
            drag(editor, { x: 304, y: 104 }, { x: 314, y: 114 });
            expect(state.saves).toHaveLength(1);
            expect(state.drops).toEqual([]);
        });

        it("still resizes a small item from a handle pressed outside it", () => {
            const { editor, state } = setup({ selected: [2], small: true });
            drag(editor, { x: 306, y: 106 }, { x: 316, y: 116 });
            expect(state.saves).toHaveLength(1);
            expect(state.drops).toEqual([]);
        });

        it("resizes it about its center with from center (Alt), without moving it", () => {
            const { editor, state } = setup({ selected: [2] });
            editor.pointerDown(at(350, 100, { alt: true }));
            editor.pointerMove(at(370, 100, { alt: true }));
            editor.pointerUp(at(370, 100, { alt: true }));
            expect(state.saves).toEqual([
                { width: 140, depth: 40, rotation: 0 },
            ]);
        });

        it("resizes both ways from a corner, its opposite corner put", () => {
            const { editor, state } = setup({ selected: [2] });
            drag(editor, { x: 350, y: 120 }, { x: 360, y: 130 });
            const [saved] = state.saves;
            expect(saved.width).toBeCloseTo(110);
            expect(saved.depth).toBeCloseTo(50);
            expect(saved.center?.x).toBeCloseTo(305);
            expect(saved.center?.y).toBeCloseTo(105);
        });

        it("keeps its proportions with constrain (Ctrl/Cmd), from a side or a corner", () => {
            // A side scales the other axis evenly about the center line: 120 / 100 across, so
            // 48 deep, still centered on y 100
            const side = setup({ selected: [2] });
            side.editor.pointerDown(at(350, 100, { ctrl: true }));
            side.editor.pointerMove(at(370, 100, { ctrl: true }));
            side.editor.pointerUp(at(370, 100, { ctrl: true }));
            expect(side.state.saves[0].width).toBeCloseTo(120);
            expect(side.state.saves[0].depth).toBeCloseTo(48);
            expect(side.state.saves[0].center?.x).toBeCloseTo(310);
            expect(side.state.saves[0].center?.y).toBeCloseTo(100);
            // A corner along its diagonal from the opposite corner, with from center from the
            // center: the pointer 10 out on each axis
            const corner = setup({ selected: [2] });
            corner.editor.pointerDown(at(350, 120, { ctrl: true, alt: true }));
            corner.editor.pointerMove(at(360, 130, { ctrl: true, alt: true }));
            corner.editor.pointerUp(at(360, 130, { ctrl: true, alt: true }));
            // (60 * 50 + 30 * 20) / (50 * 50 + 20 * 20) = 3600 / 2900 of the way out
            expect(corner.state.saves[0].width).toBeCloseTo(
                100 * (3600 / 2900),
            );
            expect(corner.state.saves[0].depth).toBeCloseTo(40 * (3600 / 2900));
            expect(corner.state.saves[0].center).toBeUndefined();
        });

        it("resizes an imported model's prop evenly, from a side or a corner (#1078)", () => {
            const side = setup({ selected: [2], keepsProportions: true });
            drag(side.editor, { x: 350, y: 100 }, { x: 370, y: 100 });
            expect(side.state.saves[0].width).toBeCloseTo(120);
            expect(side.state.saves[0].depth).toBeCloseTo(48);
            // A corner scales along its diagonal from the opposite corner: the pointer at
            // (110, 50) from it, of a (100, 40) diagonal, is 13000 / 11600 of the way out
            const corner = setup({ selected: [2], keepsProportions: true });
            drag(corner.editor, { x: 350, y: 120 }, { x: 360, y: 130 });
            expect(corner.state.saves[0].width).toBeCloseTo(
                100 * (13000 / 11600),
            );
            expect(corner.state.saves[0].depth).toBeCloseTo(
                40 * (13000 / 11600),
            );
        });

        it("shrinks an imported model's prop from a corner pulled in one way only", () => {
            const { editor, state } = setup({
                selected: [2],
                keepsProportions: true,
            });
            drag(editor, { x: 350, y: 120 }, { x: 340, y: 120 });
            expect(state.saves[0].width).toBeLessThan(100);
            expect(state.saves[0].depth / state.saves[0].width).toBeCloseTo(
                0.4,
            );
        });

        it("resizes along the item's own sides when it's turned", () => {
            // Turned 90° clockwise, its east side faces down: its west side stays at y 50
            const { editor, state } = setup({ selected: [2], rotation: 90 });
            drag(editor, { x: 300, y: 150 }, { x: 300, y: 170 });
            expect(state.saves[0].width).toBeCloseTo(120);
            expect(state.saves[0].depth).toBeCloseTo(40);
            expect(state.saves[0].rotation).toBe(90);
            expect(state.saves[0].center?.x).toBeCloseTo(300);
            expect(state.saves[0].center?.y).toBeCloseTo(110);
        });

        it("never shrinks it past its opposite side into nothing", () => {
            const { editor, state } = setup({ selected: [2] });
            drag(editor, { x: 350, y: 100 }, { x: 150, y: 100 });
            expect(state.saves[0].width).toBe(MIN_ITEM_SIZE);
            // Its west side stayed at 250
            expect(state.saves[0].center?.x).toBeCloseTo(251);
        });

        it("turns it from the rotate handle, snapped to 15°", () => {
            const { editor, state } = setup({ selected: [2] });
            // The rotate handle sits 40 CSS px (20 field units) above the top middle
            drag(editor, { x: 300, y: 60 }, { x: 395, y: 103 });
            expect(editor.activeGesture()).toBeNull();
            expect(state.saves).toEqual([
                { width: 100, depth: 40, rotation: 90 },
            ]);
        });

        it("turns past 360° rather than wrapping, so the change eases the short way", () => {
            const { editor, state } = setup({ selected: [2], rotation: 350 });
            // The rotate handle of a box turned 350°: above the top middle, turned with it
            const rad = (350 * Math.PI) / 180;
            const handle = {
                x: 300 + 40 * Math.sin(rad),
                y: 100 - 40 * Math.cos(rad),
            };
            const target = (deg: number) => ({
                x: 300 + 40 * Math.sin((deg * Math.PI) / 180),
                y: 100 - 40 * Math.cos((deg * Math.PI) / 180),
            });
            editor.pointerDown(at(handle.x, handle.y));
            editor.pointerMove(at(target(0).x, target(0).y));
            editor.pointerMove(at(target(10).x, target(10).y));
            editor.pointerUp(at(target(10).x, target(10).y));
            // 20° turned, snapped to 15°
            expect(state.saves[0].rotation).toBeCloseTo(365);
        });

        /** The pointer `degrees` clockwise round item 2's center from its rotate handle, 40 units out. */
        const round = (
            degrees: number,
            modifiers: Parameters<typeof at>[2] = {},
        ) => {
            const radians = (degrees * Math.PI) / 180;
            return at(
                300 + 40 * Math.sin(radians),
                100 - 40 * Math.cos(radians),
                modifiers,
            );
        };
        const HANDLE = { rot: { x: 300, y: 60 }, e: { x: 350, y: 100 } };

        it("turns it in 15° steps, in whole degrees with fine (Shift), and isn't freed by Alt", () => {
            const turned = (modifiers: Parameters<typeof at>[2]) => {
                const { editor, state } = setup({ selected: [2] });
                editor.pointerDown(at(HANDLE.rot.x, HANDLE.rot.y, modifiers));
                editor.pointerMove(round(20, modifiers));
                editor.pointerMove(round(37, modifiers));
                editor.pointerUp(round(37, modifiers));
                return state.saves[0].rotation;
            };
            expect(turned({})).toBe(30);
            expect(turned({ alt: true })).toBe(30);
            expect(turned({ ctrl: true })).toBe(30);
            // Fine from the press: all 37°, in whole degrees
            expect(turned({ shift: true })).toBe(37);
        });

        it("turns at full speed with fine, in whole degrees where the pointer is", () => {
            const { editor, state } = setup({ selected: [2] });
            editor.pointerDown(at(HANDLE.rot.x, HANDLE.rot.y));
            editor.pointerMove(round(37));
            expect(state.preview?.rotation).toBe(30);
            editor.pointerMove(round(37, { shift: true }));
            expect(state.preview?.rotation).toBe(37);
            // 40° more turns 40°: fine doesn't slow the pointer
            editor.pointerMove(round(77.3, { shift: true }));
            expect(state.preview?.rotation).toBe(77);
        });

        it("saves the turn drawn when the release didn't move, whatever keys it reports", () => {
            const { editor, state } = setup({ selected: [2] });
            editor.pointerDown(at(HANDLE.rot.x, HANDLE.rot.y));
            editor.pointerMove(round(37));
            editor.pointerMove(round(37, { shift: true }));
            editor.pointerMove(round(81, { shift: true }));
            expect(state.preview?.rotation).toBe(81);
            // No keyboard event came; the release reports Shift up, which
            // would snap to 75°: it saves the 81° drawn
            editor.pointerUp(round(81));
            expect(state.saves).toEqual([
                { width: 100, depth: 40, rotation: 81 },
            ]);
        });

        it("resizes at a quarter speed with fine (Shift)", () => {
            const { editor, state } = setup({ selected: [2] });
            // 40 across at a quarter: the east side goes out 10 (from center, to see the size alone)
            editor.pointerDown(at(HANDLE.e.x, HANDLE.e.y, { alt: true }));
            editor.pointerMove(at(390, 100, { alt: true }));
            editor.pointerUp(at(390, 100, { alt: true }));
            const plain = state.saves[0];
            const fine = setup({ selected: [2] });
            const both = { shift: true, alt: true };
            fine.editor.pointerDown(at(HANDLE.e.x, HANDLE.e.y, both));
            fine.editor.pointerMove(at(390, 100, both));
            fine.editor.pointerUp(at(390, 100, both));
            expect(plain).toEqual({ width: 180, depth: 40, rotation: 0 });
            expect(fine.state.saves).toEqual([
                { width: 120, depth: 40, rotation: 0 },
            ]);
        });

        describe("keys pressed or released mid-drag, with no pointer move", () => {
            let running: FieldEditor | undefined;
            afterEach(() => running?.pointerCancel());

            it("re-runs a resize: fine on and off keeps the size drawn, and the pointer counts a quarter between", () => {
                const { editor, state } = setup({ selected: [2] });
                running = editor;
                editor.pointerDown(at(HANDLE.e.x, HANDLE.e.y));
                editor.pointerMove(at(370, 100));
                expect(state.preview?.width).toBe(120);
                key("keydown", { key: "Shift", shiftKey: true });
                expect(state.preview?.width).toBe(120);
                editor.pointerMove(at(410, 100, { shift: true }));
                expect(state.preview?.width).toBe(130);
                key("keyup", { key: "Shift" });
                expect(state.preview?.width).toBe(130);
                editor.pointerMove(at(420, 100));
                expect(state.preview?.width).toBe(140);
            });

            it("re-runs a resize: Alt down resizes from the center, Alt up puts the opposite side back", () => {
                const { editor, state } = setup({ selected: [2] });
                running = editor;
                editor.pointerDown(at(HANDLE.e.x, HANDLE.e.y));
                editor.pointerMove(at(370, 100));
                expect(state.preview).toMatchObject({
                    width: 120,
                    center: { x: 310, y: 100 },
                });
                key("keydown", { key: "Alt", altKey: true });
                expect(state.preview).toEqual({
                    width: 140,
                    depth: 40,
                    rotation: 0,
                });
                key("keyup", { key: "Alt" });
                expect(state.preview).toMatchObject({
                    width: 120,
                    center: { x: 310, y: 100 },
                });
            });

            it("re-runs a rotation: Shift down draws whole degrees where the pointer is, Shift up snaps it to 15° again", () => {
                const { editor, state } = setup({ selected: [2] });
                running = editor;
                editor.pointerDown(at(HANDLE.rot.x, HANDLE.rot.y));
                editor.pointerMove(round(37));
                expect(state.preview?.rotation).toBe(30);
                key("keydown", { key: "Shift", shiftKey: true });
                expect(state.preview?.rotation).toBe(37);
                editor.pointerMove(round(77, { shift: true }));
                expect(state.preview?.rotation).toBe(77);
                key("keyup", { key: "Shift" });
                expect(state.preview?.rotation).toBe(75);
                editor.pointerUp(round(77));
                expect(state.saves).toEqual([
                    { width: 100, depth: 40, rotation: 75 },
                ]);
            });
        });

        it("draws it as it was when the drag is cancelled", () => {
            const { editor, state } = setup({ selected: [2] });
            drag(
                editor,
                { x: 350, y: 100 },
                { x: 370, y: 100 },
                {
                    release: false,
                },
            );
            editor.pointerCancel();
            expect(state.preview).toBeNull();
            expect(state.saves).toEqual([]);
        });

        it("draws the size and center it was given until a refused save, then the stored ones", async () => {
            const { editor, state, ports } = setup({
                selected: [2],
                save: "refused",
            });
            drag(editor, { x: 350, y: 100 }, { x: 370, y: 100 });
            expect(state.preview).toEqual({
                width: 120,
                depth: 40,
                rotation: 0,
                center: { x: 310, y: 100 },
            });
            expect(ports.showPositions).toHaveBeenLastCalledWith(
                new Map([[2, { x: 310, y: 100 }]]),
            );
            await Promise.resolve();
            expect(state.preview).toBeNull();
            expect(ports.showPositions).toHaveBeenLastCalledWith(null);
        });

        it("keeps a moved center drawn while its save is pending, when an earlier drop settles first", async () => {
            const { editor, ports } = setup({ selected: [1] });
            let settleDrop = (_: DropResult) => {};
            vi.mocked(ports.drop).mockImplementation(
                () => new Promise((resolve) => (settleDrop = resolve)),
            );
            let settleSave = (_: DropResult) => {};
            vi.mocked(ports.saveItem!).mockImplementation(
                () => new Promise((resolve) => (settleSave = resolve)),
            );
            drag(editor, { x: 100, y: 100 }, { x: 100, y: 140 });
            click(editor, 340, 115);
            drag(editor, { x: 350, y: 100 }, { x: 370, y: 100 });
            const both = new Map([
                [1, { x: 100, y: 140 }],
                [2, { x: 310, y: 100 }],
            ]);
            expect(ports.showPositions).toHaveBeenLastCalledWith(both);
            // The marchers' save answers first: the item's center stays where the resize left it
            settleDrop("saved");
            await Promise.resolve();
            await Promise.resolve();
            expect(ports.showPositions).toHaveBeenLastCalledWith(both);
            settleSave("saved");
            await Promise.resolve();
            await Promise.resolve();
            expect(ports.showPositions).toHaveBeenLastCalledWith(null);
        });

        it("leaves a second resize's size drawn when the first one's save settles", async () => {
            const { editor, state, ports } = setup({ selected: [2] });
            let settleSave = (_: DropResult) => {};
            vi.mocked(ports.saveItem!).mockImplementationOnce(
                () => new Promise((resolve) => (settleSave = resolve)),
            );
            editor.pointerDown(at(350, 100, { alt: true }));
            editor.pointerMove(at(370, 100, { alt: true }));
            editor.pointerUp(at(370, 100, { alt: true }));
            // The handle is where the stored Outline has it
            editor.pointerDown(at(350, 100, { alt: true }));
            editor.pointerMove(at(360, 100, { alt: true }));
            expect(state.preview?.width).toBe(120);
            settleSave("saved");
            await Promise.resolve();
            expect(state.preview?.width).toBe(120);
            editor.pointerCancel();
        });

        it("still moves it when dragged from inside, away from the handles", () => {
            const { editor, state } = setup({ selected: [2] });
            drag(editor, { x: 320, y: 100 }, { x: 320, y: 140 });
            expect(state.drops).toEqual([[{ id: 2, x: 300, y: 140 }]]);
            expect(state.saves).toEqual([]);
        });
    });
});
