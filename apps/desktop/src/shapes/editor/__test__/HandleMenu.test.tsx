import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import HandleMenu from "../HandleMenu";
import { lineTool } from "../../line/lineTool";
import { setPointMarcher, type LineParams } from "../../line/lineGeometry";
import {
    closeHandleMenu,
    openHandleMenu,
    useHandleMenuStore,
} from "../../field/handleMenu";
import { filesDistribution } from "../../distribute/distribution";

/**
 * A Line point's right-click menu as rendered (#569, look #568): the corner type an either/or
 * that stays open as it changes, its hint tucked under it; following the line's marchers a switch
 * with what the line does under it and the answers always shown, greyed while following yet picked
 * to set one; and one Escape closing the menu with a reason tip open
 */

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    act(closeHandleMenu);
    cleanup();
});

const corner = (x: number, y: number) => ({ x, y, tension: 0 });
/** A closed square filled as files: its points' marcher answers greyed out */
const filled: LineParams = {
    points: [corner(0, 0), corner(40, 0), corner(40, 40), corner(0, 40)],
    closed: true,
    spacing: { mode: "fit" },
    distribution: filesDistribution(2),
};

const L: LineParams = {
    points: [corner(0, 0), corner(40, 0), corner(40, 40)],
    spacing: { mode: "fit" },
};

function renderMenu() {
    render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <HandleMenu />
        </TolgeeProvider>,
    );
}

function show(params: LineParams, pick = vi.fn(), key = "p1") {
    const sections = lineTool.menu!.sections(params, 8, key)!;
    act(() =>
        useHandleMenuStore.setState({
            menu: { at: { x: 0, y: 0 }, key, sections, pick },
        }),
    );
    renderMenu();
}

const env = {
    stepPx: 10,
    snap: false,
    pull: false,
    constrain: false,
    gridSnap: (p: { x: number; y: number }) => p,
    hitRadius: 3,
};

/** The real menu open on `start`'s point 1, each pick applied to the shape; the shape now */
function openLive(start: LineParams) {
    let params = start;
    const pick = vi.fn((_key: string, value: string) => {
        const out = lineTool.menu!.pick(params, 8, "p1", value, env);
        if (!out) return null;
        params = out.params;
        return { params, n: 8 };
    });
    act(() => {
        openHandleMenu(
            lineTool,
            params,
            8,
            { type: "handle", key: "p1" } as never,
            { x: 0, y: 0 },
            pick,
        );
    });
    renderMenu();
    return { pick, now: () => params };
}

const MARCHER = ["shape-menu-marcher-always", "shape-menu-marcher-even"];

const byTestId = (id: string) => screen.getByTestId(id);

describe("a Line point's menu (#569)", () => {
    it("follows the line with a switch, saying what the line does, its answers greyed but there", () => {
        show(L);
        const follow = byTestId("shape-menu-marcher-follow");
        expect(follow.getAttribute("role")).toBe("menuitemcheckbox");
        expect(follow.getAttribute("aria-checked")).toBe("true");
        expect(follow.textContent).toBe("Follow line's marchers");
        const caption = byTestId("shape-menu-caption");
        expect(caption.textContent).toBe("Line puts a marcher here");
        expect(follow.getAttribute("aria-describedby")).toBe(caption.id);
        // Greyed, not off: still operable, the caption saying the line's answer
        const [always, even] = MARCHER.map(byTestId);
        for (const el of [always!, even!]) {
            expect(el.hasAttribute("aria-disabled")).toBe(false);
            expect(el.hasAttribute("data-disabled")).toBe(false);
        }
        expect(
            screen
                .getByRole("group", { name: "Marcher on this point" })
                .getAttribute("aria-describedby"),
        ).toBe(caption.id);
        expect(always!.getAttribute("aria-checked")).toBe("true");
        expect(even!.getAttribute("aria-checked")).toBe("false");
        expect(screen.queryByText("Override")).toBeNull();
        expect(screen.queryByTestId("shape-menu-marcher-line")).toBeNull();
    });

    it("reads the marcher answers as one set by its name", () => {
        show(L);
        const set = screen.getByRole("group", {
            name: "Marcher on this point",
        });
        expect(
            [...set.querySelectorAll('[role="menuitemradio"]')].map((el) =>
                el.getAttribute("data-testid"),
            ),
        ).toEqual(MARCHER);
    });

    it("shows a point's own answer with the switch off and its answers live", () => {
        show(setPointMarcher(L, 8, 1, false, {}));
        expect(
            byTestId("shape-menu-marcher-follow").getAttribute("aria-checked"),
        ).toBe("false");
        expect(byTestId("shape-menu-caption").textContent).toBe(
            "Line would put a marcher here",
        );
        const [always, even] = MARCHER.map(byTestId);
        expect(always!.hasAttribute("data-disabled")).toBe(false);
        expect(even!.getAttribute("aria-checked")).toBe("true");
    });

    it("switches following off to the other answer than the line's, staying open", () => {
        const { pick, now } = openLive(L);
        act(() => {
            fireEvent.click(byTestId("shape-menu-marcher-follow"));
        });
        expect(pick).toHaveBeenCalledWith("p1", "marcher-follow");
        expect(now().points[1]!.marcher).toBe(false);
        expect(byTestId("shape-menu")).toBeTruthy();
        expect(
            byTestId("shape-menu-marcher-follow").getAttribute("aria-checked"),
        ).toBe("false");
        expect(
            byTestId("shape-menu-marcher-even").getAttribute("aria-checked"),
        ).toBe("true");
        // On again: the point's answer is gone, not set
        act(() => {
            fireEvent.click(byTestId("shape-menu-marcher-follow"));
        });
        expect("marcher" in now().points[1]!).toBe(false);
        expect(
            byTestId("shape-menu-marcher-follow").getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("sets an answer picked from the greyed ones, even the line's own", () => {
        const { pick, now } = openLive(L);
        act(() => {
            fireEvent.click(byTestId("shape-menu-marcher-always"));
        });
        expect(pick).toHaveBeenCalledWith("p1", "marcher-always");
        expect(now().points[1]!.marcher).toBe(true);
        expect(byTestId("shape-menu")).toBeTruthy();
        expect(
            byTestId("shape-menu-marcher-follow").getAttribute("aria-checked"),
        ).toBe("false");
        expect(
            byTestId("shape-menu-marcher-always").hasAttribute("aria-disabled"),
        ).toBe(false);
        // The answer it has now does nothing
        act(() => {
            fireEvent.click(byTestId("shape-menu-marcher-always"));
        });
        expect(pick).toHaveBeenCalledTimes(1);
        act(() => {
            fireEvent.click(byTestId("shape-menu-marcher-even"));
        });
        expect(now().points[1]!.marcher).toBe(false);
    });

    it("greys out the whole section where the answer does nothing, with why", () => {
        show(filled);
        expect(byTestId("shape-menu-caption").textContent).toBe(
            "A filled line's spots follow its fill",
        );
        for (const id of ["shape-menu-marcher-follow", ...MARCHER]) {
            const el = byTestId(id);
            expect(el.getAttribute("aria-disabled")).toBe("true");
            expect(el.hasAttribute("data-disabled")).toBe(true);
        }
        // The line's setting counts for nothing on a filled line: nothing marked
        for (const id of MARCHER)
            expect(byTestId(id).getAttribute("aria-checked")).toBe("false");
    });

    it("still lets a stored answer go where it does nothing", () => {
        const pick = vi.fn();
        show(setPointMarcher(filled, 8, 1, true, {}), pick);
        const follow = byTestId("shape-menu-marcher-follow");
        expect(follow.hasAttribute("data-disabled")).toBe(false);
        expect(follow.getAttribute("aria-checked")).toBe("false");
        expect(
            byTestId("shape-menu-marcher-always").getAttribute("aria-checked"),
        ).toBe("true");
        expect(
            byTestId("shape-menu-marcher-always").hasAttribute("data-disabled"),
        ).toBe(true);
        fireEvent.click(follow);
        expect(pick).toHaveBeenCalledWith("marcher-follow");
    });

    it("shows the corner type as a labelled either/or with its double-click hint", () => {
        show(L);
        const set = screen.getByRole("group", { name: "Corner type" });
        const answers = [...set.querySelectorAll('[role="menuitemradio"]')];
        expect(answers.map((el) => el.textContent)).toEqual([
            "Corner",
            "Smooth",
        ]);
        expect(answers.map((el) => el.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
        ]);
        const hint = byTestId("shape-menu-hint");
        expect(hint.textContent).toBe("Double-click a point to swap");
        expect(set.getAttribute("aria-describedby")).toBe(hint.id);
        // Tucked under its switch
        expect(hint.previousElementSibling).toBe(set);
    });

    it("reaches every entry with the arrow keys, greyed answers included", async () => {
        show(L);
        const reached: (string | null)[] = [];
        for (let i = 0; i < 6; i++) {
            fireEvent.keyDown(document.activeElement ?? document.body, {
                key: "ArrowDown",
            });
            // The menu moves focus a moment later
            await act(() => new Promise((done) => setTimeout(done, 0)));
            reached.push(document.activeElement!.getAttribute("data-testid"));
        }
        expect(reached).toEqual([
            "shape-menu-corner",
            "shape-menu-smooth",
            "shape-menu-marcher-follow",
            ...MARCHER,
            "shape-menu-delete",
        ]);
    });

    it("swaps the corner type without closing, showing Roundness on a smooth point", () => {
        const { pick } = openLive(L);
        expect(screen.queryByTestId("shape-menu-roundness")).toBeNull();
        act(() => {
            fireEvent.click(byTestId("shape-menu-smooth"));
        });
        expect(pick).toHaveBeenCalledWith("p1", "smooth");
        expect(byTestId("shape-menu")).toBeTruthy();
        expect(byTestId("shape-menu-smooth").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(byTestId("shape-menu-roundness")).toBeTruthy();
        // The answer it has already does nothing
        act(() => {
            fireEvent.click(byTestId("shape-menu-smooth"));
        });
        expect(pick).toHaveBeenCalledTimes(1);
    });

    it("puts a trash can on Delete point", () => {
        show(L);
        const del = byTestId("shape-menu-delete");
        expect(del.textContent).toBe("Delete point");
        expect(del.querySelector("svg")).toBeTruthy();
    });

    it("closes with one Escape while a reason tip is open", () => {
        // Two points: neither can go
        show(
            { points: [corner(0, 0), corner(40, 0)], spacing: { mode: "fit" } },
            vi.fn(),
            "p1",
        );
        fireEvent.click(byTestId("shape-menu-delete"));
        expect(screen.getByRole("tooltip")).toBeTruthy();
        fireEvent.keyDown(document.activeElement ?? document.body, {
            key: "Escape",
        });
        expect(useHandleMenuStore.getState().menu).toBeNull();
        expect(screen.queryByTestId("shape-menu")).toBeNull();
    });
});
