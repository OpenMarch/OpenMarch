import { describe, expect, it, vi } from "vitest";
import type { FieldPointer } from "@/field/editor/fieldEditor";
import type { FieldView } from "@/field/editor/view";
import { GESTURE_TIMING } from "@/components/canvas/touch/touchGestures";
import {
    FieldGestures,
    fieldGesturesOwn,
    type FieldGestureEvent,
    type FieldGestureOptions,
    type SingleFingerRole,
} from "../fieldGestures";

/**
 * The field's gesture adapter, driven by timestamped pointer events. The
 * field's element sits at (10, 20) on the page; the view starts at zoom 1 with
 * no pan over a field far bigger than the element, so the pan limit never
 * gets in the way.
 */
function setup({
    editor = true,
    singleFinger,
    holdDrag,
    claims = true,
    menuOpens = false,
}: {
    editor?: boolean;
    singleFinger?: (press: FieldPointer) => SingleFingerRole;
    holdDrag?: FieldGestureOptions["holdDrag"];
    claims?: boolean;
    /** What the editor's `longPress` answers: whether a menu opened */
    menuOpens?: boolean;
} = {}) {
    let view: FieldView = {
        width: 800,
        height: 600,
        zoom: 1,
        panX: 0,
        panY: 0,
    };
    const views: FieldView[] = [];
    const calls: string[] = [];
    const ed = {
        pointerDown: vi.fn((p: FieldPointer) => {
            calls.push(
                `down ${p.screen.x},${p.screen.y}${p.area ? ` ${p.area}` : ""}`,
            );
            return claims;
        }),
        pointerMove: vi.fn((p: FieldPointer) => {
            calls.push(`move ${p.screen.x},${p.screen.y}`);
        }),
        pointerUp: vi.fn((p: FieldPointer) => {
            calls.push(`up ${p.screen.x},${p.screen.y}`);
        }),
        pointerCancel: vi.fn(() => {
            calls.push("cancel");
        }),
        longPress: vi.fn((p: FieldPointer) => {
            calls.push(`longPress ${p.screen.x},${p.screen.y}`);
            return menuOpens;
        }),
    };
    const timers: { at: number; tick: () => void; live: boolean }[] = [];
    const history = vi.fn();
    const tap = vi.fn();
    const options: FieldGestureOptions = {
        editor: () => (editor ? ed : null),
        singleFinger,
        holdDrag,
        history,
        tap,
    };
    const gestures = new FieldGestures({
        ...options,
        pointer: (event) => ({
            field: { x: event.clientX - 10, y: event.clientY - 20 },
            screen: { x: event.clientX - 10, y: event.clientY - 20 },
            button: event.button,
            kind: event.pointerType as FieldPointer["kind"],
            shift: event.shiftKey,
            alt: event.altKey,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
        }),
        local: (x, y) => ({ x: x - 10, y: y - 20 }),
        view: () => ({ view, field: { width: 1e6, height: 1e6 } }),
        setView: (next) => {
            view = next;
            views.push(next);
        },
        schedule: (at, tick) => {
            const timer = { at, tick, live: true };
            timers.push(timer);
            return () => {
                timer.live = false;
            };
        },
    });
    const send = (
        type: string,
        pointerType: string,
        pointerId: number,
        x: number,
        y: number,
        t: number,
        extra: Partial<FieldGestureEvent> = {},
    ) =>
        gestures.handle({
            type,
            pointerId,
            pointerType,
            clientX: x,
            clientY: y,
            button: type === "pointermove" ? -1 : 0,
            buttons: type === "pointerup" ? 0 : 1,
            pressure: type === "pointerup" ? 0 : 0.5,
            shiftKey: false,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            timeStamp: t,
            ...extra,
        });
    const finger = (
        type: "down" | "move" | "up" | "cancel",
        id: number,
        x: number,
        y: number,
        t: number,
    ) => send(`pointer${type}`, "touch", id, x, y, t);
    const pen = (
        type: "down" | "move" | "up",
        x: number,
        y: number,
        t: number,
    ) => send(`pointer${type}`, "pen", 99, x, y, t);
    /** Fires the long press timer, as the browser would at its time */
    const fireTimers = () => {
        for (const timer of timers.splice(0)) if (timer.live) timer.tick();
    };
    return {
        gestures,
        ed,
        calls,
        views,
        view: () => view,
        finger,
        pen,
        send,
        fireTimers,
        timers,
        history,
        tap,
    };
}

/** One finger dragged from `from` by (dx, dy) in `steps` moves, from time `t` */
function drag(
    s: ReturnType<typeof setup>,
    id: number,
    from: { x: number; y: number },
    dx: number,
    dy: number,
    t = 0,
    steps = 10,
) {
    s.finger("down", id, from.x, from.y, t);
    for (let i = 1; i <= steps; i++)
        s.finger(
            "move",
            id,
            from.x + (dx * i) / steps,
            from.y + (dy * i) / steps,
            t + i * 16,
        );
    s.finger("up", id, from.x + dx, from.y + dy, t + steps * 16 + 16);
}

describe("which presses are the adapter's", () => {
    it("takes fingers; watches the pen, which goes on to the editor; ignores the mouse", () => {
        const s = setup();
        expect(s.send("pointerdown", "mouse", 1, 100, 100, 0)).toBe(false);
        expect(s.send("pointermove", "mouse", 1, 200, 100, 16)).toBe(false);
        expect(s.pen("down", 100, 100, 32)).toBe(false);
        expect(s.finger("down", 2, 100, 100, 40)).toBe(true);
        expect(s.views).toEqual([]);
        expect(s.calls).toEqual([]);
        expect(fieldGesturesOwn({ pointerType: "touch" })).toBe(true);
        expect(fieldGesturesOwn({ pointerType: "pen" })).toBe(false);
        expect(fieldGesturesOwn({ pointerType: "mouse" })).toBe(false);
    });
});

describe("one finger", () => {
    it("pans one to one: the field stays under the finger (the baseline panned half as far)", () => {
        const s = setup();
        drag(s, 1, { x: 300, y: 300 }, 100, 60);
        expect(s.view()).toMatchObject({ zoom: 1, panX: 100, panY: 60 });
        // Never edits: fingers navigate by default
        expect(s.calls).toEqual([]);
    });

    it("catches up with the whole drag once it leaves the tap slop", () => {
        const s = setup();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 305, 300, 16);
        expect(s.views).toEqual([]);
        s.finger("move", 1, 330, 300, 32);
        expect(s.view().panX).toBe(30);
    });

    it("follows a quick flick to where the finger lifted, even with no moves between", () => {
        const s = setup();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 320, 300, 8);
        s.finger("up", 1, 400, 340, 24);
        expect(s.view()).toMatchObject({ panX: 100, panY: 40 });
    });

    it("doesn't move the view for a tap, and reports it", () => {
        const s = setup();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 303, 302, 30);
        s.finger("up", 1, 303, 302, 60);
        expect(s.views).toEqual([]);
        expect(s.tap).toHaveBeenCalledOnce();
        expect(s.tap.mock.calls[0][0].screen).toEqual({ x: 293, y: 282 });
    });

    it("still pans where nothing is edited (Preview)", () => {
        const s = setup({ editor: false, singleFinger: () => "edit" });
        drag(s, 1, { x: 300, y: 300 }, -50, 20);
        expect(s.view()).toMatchObject({ panX: -50, panY: 20 });
        expect(s.calls).toEqual([]);
    });
});

describe("a finger that edits", () => {
    const editing = () => setup({ singleFinger: () => "edit" });

    it("goes to the editor: down, moves and up, in the field's element", () => {
        const s = editing();
        s.finger("down", 1, 110, 120, 0);
        s.finger("move", 1, 150, 120, 16);
        s.finger("up", 1, 150, 120, 32);
        expect(s.calls).toEqual(["down 100,100", "move 140,100", "up 140,100"]);
        expect(s.ed.pointerDown.mock.calls[0][0].kind).toBe("touch");
        expect(s.views).toEqual([]);
    });

    it("navigates instead when the editor declines the press", () => {
        const s = setup({ singleFinger: () => "edit", claims: false });
        drag(s, 1, { x: 300, y: 300 }, 40, 0);
        expect(s.calls).toEqual(["down 290,280"]);
        expect(s.view().panX).toBe(40);
    });

    it("is cancelled by a second finger, and the two fingers navigate", () => {
        const s = editing();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 340, 300, 16);
        s.finger("down", 2, 400, 300, 32);
        expect(s.calls).toEqual(["down 290,280", "move 330,280", "cancel"]);
        // Both fingers move 20 px down: the view pans with them
        s.finger("move", 1, 340, 320, 48);
        s.finger("move", 2, 400, 320, 48);
        expect(s.view()).toMatchObject({ zoom: 1, panX: 0, panY: 20 });
        // Nothing more reaches the editor, even as the fingers lift
        s.finger("up", 1, 340, 320, 64);
        s.finger("up", 2, 400, 320, 64);
        expect(s.calls).toHaveLength(3);
    });
});

describe("a finger that draws an area (drag modes, tablet 1.3)", () => {
    it("hands the press to the editor with what to draw: a marquee or a lasso", () => {
        for (const area of ["marquee", "lasso"] as const) {
            const s = setup({ singleFinger: () => area });
            drag(s, 1, { x: 110, y: 120 }, 40, 0, 0, 2);
            expect(s.calls).toEqual([
                `down 100,100 ${area}`,
                "move 120,100",
                "move 140,100",
                "up 140,100",
            ]);
            expect(s.views).toEqual([]);
        }
    });

    it("navigates when the editor declines it", () => {
        const s = setup({ singleFinger: () => "marquee", claims: false });
        drag(s, 1, { x: 300, y: 300 }, 40, 0);
        expect(s.calls).toEqual(["down 290,280 marquee"]);
        expect(s.view().panX).toBe(40);
    });

    it("is cancelled by a second finger, which navigates (finger selects, two fingers move the view)", () => {
        const s = setup({ singleFinger: () => "marquee" });
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 340, 300, 16);
        s.finger("down", 2, 400, 300, 32);
        s.finger("move", 1, 340, 320, 48);
        s.finger("move", 2, 400, 320, 48);
        expect(s.calls).toEqual([
            "down 290,280 marquee",
            "move 330,280",
            "cancel",
        ]);
        expect(s.view()).toMatchObject({ panX: 0, panY: 20 });
    });
});

describe("a finger that draws an area, held still (Box and Lasso with #870's long press)", () => {
    it("held and lifted without moving: the editor's long press (the field's menu), no click", () => {
        const s = setup({ singleFinger: () => "marquee", menuOpens: true });
        s.finger("down", 1, 300, 300, 0);
        s.fireTimers();
        s.finger("up", 1, 302, 300, 700);
        expect(s.calls).toEqual(["down 290,280 marquee", "longPress 292,280"]);
    });

    it("held, then dragged: the area carries on, and no menu is asked for", () => {
        const s = setup({ singleFinger: () => "lasso", menuOpens: true });
        s.finger("down", 1, 300, 300, 0);
        s.fireTimers();
        s.finger("move", 1, 340, 300, 700);
        s.finger("up", 1, 340, 300, 716);
        expect(s.calls).toEqual([
            "down 290,280 lasso",
            "move 330,280",
            "up 330,280",
        ]);
        expect(s.views).toEqual([]);
    });
});

describe("a navigating finger held, then dragged (Auto's hold then drag)", () => {
    it("draws what holdDrag says from where it went down, instead of panning", () => {
        const holdDrag = vi.fn(() => "marquee" as const);
        const s = setup({ holdDrag });
        s.finger("down", 1, 300, 300, 0);
        s.fireTimers();
        s.finger("move", 1, 320, 300, 700);
        s.finger("move", 1, 360, 310, 716);
        s.finger("up", 1, 360, 310, 732);
        expect(holdDrag.mock.calls[0][0].screen).toEqual({ x: 290, y: 280 });
        // Holding only arms the long press: no menu, and the drag draws a box
        expect(s.calls).toEqual([
            "down 290,280 marquee",
            "move 310,280",
            "move 350,290",
            "up 350,290",
        ]);
        expect(s.views).toEqual([]);
    });

    it("pans on when holdDrag says no, or the editor declines", () => {
        for (const s of [
            setup({ holdDrag: () => null }),
            setup({ holdDrag: () => "marquee", claims: false }),
        ]) {
            s.finger("down", 1, 300, 300, 0);
            s.fireTimers();
            s.finger("move", 1, 340, 300, 700);
            expect(s.view().panX).toBe(40);
        }
    });

    it("held and lifted without moving: asks for the menu, never holdDrag (#870's rule)", () => {
        const holdDrag = vi.fn(() => "marquee" as const);
        const s = setup({ holdDrag, menuOpens: true });
        s.finger("down", 1, 300, 300, 0);
        s.fireTimers();
        s.finger("up", 1, 303, 301, 700);
        expect(holdDrag).not.toHaveBeenCalled();
        expect(s.calls).toEqual(["longPress 293,281"]);
        expect(s.views).toEqual([]);
    });

    it("pans, as ever, when the finger moved before the hold", () => {
        const holdDrag = vi.fn(() => "marquee" as const);
        const s = setup({ holdDrag });
        drag(s, 1, { x: 300, y: 300 }, 40, 0);
        expect(holdDrag).not.toHaveBeenCalled();
        expect(s.view().panX).toBe(40);
    });
});

describe("an editing finger held still (tablet 1.2, 1.5)", () => {
    it("ends the editor's press as a release where it lifted when no menu opened: a slow tap", () => {
        const s = setup({ singleFinger: () => "edit" });
        s.finger("down", 1, 110, 120, 0);
        s.fireTimers();
        s.finger("up", 1, 112, 120, GESTURE_TIMING.longPressMs + 100);
        expect(s.calls).toEqual([
            "down 100,100",
            "longPress 102,100",
            "up 102,100",
        ]);
        expect(s.tap).not.toHaveBeenCalled();
    });

    it("asks for the menu only on the release, and nothing more once it opened", () => {
        const s = setup({ singleFinger: () => "edit", menuOpens: true });
        s.finger("down", 1, 110, 120, 0);
        s.fireTimers();
        // Armed: the press is still the editor's, no menu yet
        expect(s.calls).toEqual(["down 100,100"]);
        s.finger("up", 1, 112, 120, GESTURE_TIMING.longPressMs + 100);
        // The editor gave its press up itself (`longPress`): no release follows
        expect(s.calls).toEqual(["down 100,100", "longPress 102,100"]);
        expect(s.views).toEqual([]);
        expect(s.tap).not.toHaveBeenCalled();
    });

    it("drags when the finger moves on after the hold: a hesitant finger, no menu", () => {
        const s = setup({ singleFinger: () => "edit", menuOpens: true });
        s.finger("down", 1, 110, 120, 0);
        s.fireTimers();
        const t = GESTURE_TIMING.longPressMs + 100;
        s.finger("move", 1, 140, 120, t);
        s.finger("move", 1, 170, 120, t + 16);
        s.finger("up", 1, 170, 120, t + 32);
        expect(s.calls).toEqual([
            "down 100,100",
            "move 130,100",
            "move 160,100",
            "up 160,100",
        ]);
        expect(s.ed.longPress).not.toHaveBeenCalled();
    });
});

describe("two fingers", () => {
    it("pan together, without zooming (the baseline did nothing)", () => {
        const s = setup();
        s.finger("down", 1, 250, 300, 0);
        s.finger("down", 2, 350, 300, 5);
        for (let i = 1; i <= 10; i++) {
            s.finger("move", 1, 250 + 6 * i, 300 - 4 * i, 5 + i * 16);
            s.finger("move", 2, 350 + 6 * i, 300 - 4 * i, 5 + i * 16);
        }
        s.finger("up", 1, 310, 260, 200);
        s.finger("up", 2, 410, 260, 200);
        expect(s.view().zoom).toBeCloseTo(1);
        expect(s.view().panX).toBeCloseTo(60);
        expect(s.view().panY).toBeCloseTo(-40);
    });

    it("pinch by as much as the fingers spread, at the point between them (the baseline zoomed twice as far)", () => {
        const s = setup();
        // 100 px apart around (300, 300), spread to 200 px apart
        s.finger("down", 1, 250, 300, 0);
        s.finger("down", 2, 350, 300, 5);
        for (let i = 1; i <= 10; i++) {
            s.finger("move", 1, 250 - 5 * i, 300, 5 + i * 16);
            s.finger("move", 2, 350 + 5 * i, 300, 5 + i * 16);
        }
        expect(s.view().zoom).toBeCloseTo(2);
        // The field point under the middle (290, 280 in the element) stays there
        const { panX, panY, zoom } = s.view();
        expect(290 * zoom + panX).toBeCloseTo(290);
        expect(280 * zoom + panY).toBeCloseTo(280);
        // Each finger keeps its own field point: the left one began at x 240
        expect(240 * zoom + panX).toBeCloseTo(240 - 50);
    });

    it("don't jump when one finger lifts and the other carries on panning", () => {
        const s = setup();
        s.finger("down", 1, 250, 300, 0);
        s.finger("down", 2, 350, 300, 5);
        s.finger("move", 1, 250, 320, 20);
        s.finger("move", 2, 350, 320, 20);
        s.finger("up", 2, 350, 320, 40);
        const before = s.view();
        s.finger("move", 1, 260, 320, 60);
        expect(s.view().panX).toBeCloseTo(before.panX + 10);
        expect(s.view().panY).toBeCloseTo(before.panY);
    });

    it("tap: two fingers undo, three redo", () => {
        const s = setup();
        s.finger("down", 1, 250, 300, 0);
        s.finger("down", 2, 350, 300, 10);
        s.finger("up", 1, 250, 300, 100);
        s.finger("up", 2, 350, 300, 110);
        s.finger("down", 1, 250, 300, 1000);
        s.finger("down", 2, 300, 300, 1010);
        s.finger("down", 3, 350, 300, 1020);
        s.finger("up", 1, 250, 300, 1100);
        s.finger("up", 2, 300, 300, 1100);
        s.finger("up", 3, 350, 300, 1100);
        expect(s.history.mock.calls).toEqual([["undo"], ["redo"]]);
    });
});

describe("long press", () => {
    it("asks the editor for a menu when a finger held still is lifted, where it lifted", () => {
        const s = setup();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 303, 301, 100);
        expect(s.timers.at(-1)?.at).toBe(GESTURE_TIMING.longPressMs);
        s.fireTimers();
        expect(s.calls).toEqual([]);
        s.finger("up", 1, 303, 301, 700);
        expect(s.calls).toEqual(["longPress 293,281"]);
        expect(s.views).toEqual([]);
        expect(s.tap).not.toHaveBeenCalled();
    });

    it("asks for nothing when the finger moves first, lifts too soon, or a second finger lands", () => {
        const s = setup();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 340, 300, 100);
        s.fireTimers();
        s.finger("up", 1, 340, 300, 600);
        s.finger("down", 1, 300, 300, 800);
        s.finger("up", 1, 300, 300, 900);
        s.finger("down", 1, 300, 300, 1000);
        s.finger("down", 2, 400, 300, 1100);
        s.fireTimers();
        s.finger("up", 1, 300, 300, 1700);
        s.finger("up", 2, 400, 300, 1700);
        expect(s.calls).toEqual([]);
    });

    it("pans, and asks for no menu, when the finger moves on after the hold", () => {
        const s = setup({ menuOpens: true });
        s.finger("down", 1, 300, 300, 0);
        s.fireTimers();
        s.finger("move", 1, 340, 300, 700);
        s.finger("up", 1, 340, 300, 750);
        expect(s.view().panX).toBe(40);
        expect(s.calls).toEqual([]);
    });
});

describe("the pen and a resting palm", () => {
    it("ignores a palm resting before the pen comes down: the view stays put while the pen draws", () => {
        const s = setup();
        s.finger("down", 1, 500, 500, 0);
        s.finger("move", 1, 502, 501, 20);
        s.pen("down", 200, 200, 40);
        for (let i = 1; i <= 10; i++) {
            s.pen("move", 200 + i * 10, 200, 40 + i * 16);
            s.finger("move", 1, 502 + i * 6, 501 + i * 3, 40 + i * 16);
        }
        s.pen("up", 300, 200, 220);
        s.finger("up", 1, 562, 531, 240);
        expect(s.views).toEqual([]);
        expect(s.calls).toEqual([]);
    });

    it("ignores fingers that land while the pen is down, even two", () => {
        const s = setup();
        s.pen("down", 200, 200, 0);
        s.finger("down", 1, 400, 400, 10);
        s.finger("down", 2, 500, 400, 20);
        s.finger("move", 1, 420, 440, 40);
        s.finger("move", 2, 540, 440, 40);
        expect(s.views).toEqual([]);
    });

    it("takes a panning finger's view no further once the pen comes down", () => {
        const s = setup();
        s.finger("down", 1, 300, 300, 0);
        s.finger("move", 1, 340, 300, 16);
        expect(s.view().panX).toBe(40);
        s.pen("down", 100, 100, 32);
        s.finger("move", 1, 400, 300, 48);
        expect(s.view().panX).toBe(40);
    });

    it("lets one finger do nothing just after the pen lifts (the palm between strokes); two fingers navigate", () => {
        const s = setup();
        s.pen("down", 200, 200, 0);
        s.pen("up", 260, 200, 100);
        drag(s, 1, { x: 500, y: 500 }, 30, 10, 150);
        expect(s.views).toEqual([]);
        s.finger("down", 1, 250, 300, 400);
        s.finger("down", 2, 350, 300, 410);
        s.finger("move", 1, 250, 330, 430);
        s.finger("move", 2, 350, 330, 430);
        expect(s.view().panY).toBeCloseTo(30);
    });

    it("lets one finger pan again once the pen has been away a while", () => {
        const s = setup();
        s.pen("down", 200, 200, 0);
        s.pen("up", 260, 200, 100);
        drag(
            s,
            1,
            { x: 500, y: 500 },
            30,
            0,
            100 + GESTURE_TIMING.palmRejectMs,
        );
        expect(s.view().panX).toBe(30);
    });

    it("doesn't count a hovering pen as in use", () => {
        const s = setup();
        s.send("pointermove", "pen", 99, 200, 200, 0, {
            buttons: 0,
            pressure: 0,
        });
        drag(s, 1, { x: 500, y: 500 }, 30, 0, 50);
        expect(s.view().panX).toBe(30);
    });

    it("cancels an editing finger when the pen comes down", () => {
        const s = setup({ singleFinger: () => "edit" });
        s.finger("down", 1, 300, 300, 0);
        s.pen("down", 100, 100, 20);
        expect(s.calls).toEqual(["down 290,280", "cancel"]);
    });
});

describe("dispose", () => {
    it("drops the long press timer and cancels an editing finger", () => {
        const s = setup({ singleFinger: () => "edit" });
        s.finger("down", 1, 300, 300, 0);
        s.gestures.dispose();
        s.fireTimers();
        expect(s.calls).toEqual(["down 290,280", "cancel"]);
    });
});

describe("attachFieldGestures", () => {
    const pointerEvent = (
        type: string,
        init: { x: number; y: number; id: number; t: number },
    ) => {
        const event = new MouseEvent(type, {
            clientX: init.x,
            clientY: init.y,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            bubbles: true,
            cancelable: true,
        });
        Object.assign(event, {
            pointerId: init.id,
            pointerType: "touch",
            pressure: 0.5,
        });
        Object.defineProperty(event, "timeStamp", { value: init.t });
        return event;
    };

    async function mount() {
        const { attachFieldGestures } = await import("../fieldGestures");
        const { useFieldViewStore } = await import("../fieldView");
        useFieldViewStore.setState({
            width: 800,
            height: 600,
            zoom: 1,
            panX: 0,
            panY: 0,
            field: { width: 1e6, height: 1e6 },
        });
        const surface = document.createElement("div");
        const canvas = document.createElement("canvas");
        const button = document.createElement("button");
        surface.append(canvas, button);
        document.body.append(surface);
        const detach = attachFieldGestures(surface, () => canvas, {
            editor: () => null,
        });
        const press = (target: Element, dx: number) => {
            target.dispatchEvent(
                pointerEvent("pointerdown", { x: 100, y: 100, id: 7, t: 0 }),
            );
            target.dispatchEvent(
                pointerEvent("pointermove", {
                    x: 100 + dx,
                    y: 100,
                    id: 7,
                    t: 16,
                }),
            );
            target.dispatchEvent(
                pointerEvent("pointerup", {
                    x: 100 + dx,
                    y: 100,
                    id: 7,
                    t: 32,
                }),
            );
        };
        const panX = () => useFieldViewStore.getState().panX;
        return { surface, canvas, button, detach, press, panX };
    }

    it("pans the view store with a finger on the field", async () => {
        const m = await mount();
        m.press(m.canvas, 50);
        expect(m.panX()).toBe(50);
        m.detach();
        m.surface.remove();
    });

    it("leaves a finger on one of the field's controls to the control", async () => {
        const m = await mount();
        m.press(m.button, 50);
        expect(m.panX()).toBe(0);
        m.detach();
        m.surface.remove();
    });

    it("hears nothing more once detached", async () => {
        const m = await mount();
        m.detach();
        m.press(m.canvas, 50);
        expect(m.panX()).toBe(0);
        m.surface.remove();
    });
});
