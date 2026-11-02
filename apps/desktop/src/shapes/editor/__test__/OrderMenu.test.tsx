import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { OrderChoice } from "../../assign";
import { OrderMenu } from "../OrderMenu";

/**
 * Who goes where on the floating editor (#528, #559): one menu of Least travel, Keep order and
 * Reverse order, each pictured as the new line read as numbers
 */

afterEach(cleanup);

const renderMenu = (current: OrderChoice, keepOffered = true) => {
    const pick = vi.fn();
    render(<OrderMenu target={{ order: { current, keepOffered, pick } }} />);
    return pick;
};
const openMenu = () => fireEvent.click(screen.getByTestId("shape-order"));
const sequence = (testId: string) =>
    screen.getByTestId(testId).getAttribute("data-sequence");

describe("who goes where's menu", () => {
    it("lists Least travel, Keep order and Reverse order, with no toggle beside it", () => {
        renderMenu("keep");
        openMenu();
        const items = screen.getAllByRole("menuitemradio");
        expect(items.map((item) => item.getAttribute("data-testid"))).toEqual([
            "shape-order-nearest",
            "shape-order-keep",
            "shape-order-reverse",
        ]);
        // The pictures are hidden, so each row is named by its label alone
        expect(
            items.map((item) => item.querySelector("span")?.textContent),
        ).toEqual(["Least travel", "Keep order", "Reverse order"]);
        expect(screen.queryByRole("button", { pressed: true })).toBeNull();
    });

    it("offers Reverse order on any line, Keep order only when offered", () => {
        renderMenu("nearest", false);
        openMenu();
        expect(
            screen
                .getAllByRole("menuitemradio")
                .map((item) => item.getAttribute("data-testid")),
        ).toEqual(["shape-order-nearest", "shape-order-reverse"]);
    });

    it("names Reverse order on a line saved reversed", () => {
        renderMenu("reverse");
        const button = screen.getByTestId("shape-order");
        expect(button).toHaveAttribute("data-value", "reverse");
        expect(button).toHaveAccessibleName("Who goes where: Reverse order");
        openMenu();
        expect(screen.getByTestId("shape-order-reverse")).toHaveAttribute(
            "aria-checked",
            "true",
        );
    });

    it("changes nothing when the answer it's on is picked", () => {
        for (const current of ["nearest", "keep", "reverse"] as const) {
            const pick = renderMenu(current);
            openMenu();
            fireEvent.click(screen.getByTestId(`shape-order-${current}`));
            expect(pick, current).not.toHaveBeenCalled();
            cleanup();
        }
    });

    it("picks another answer as one change", () => {
        const pick = renderMenu("keep");
        openMenu();
        fireEvent.click(screen.getByTestId("shape-order-reverse"));
        expect(pick).toHaveBeenCalledExactlyOnceWith("reverse");
        cleanup();
        const fromReverse = renderMenu("reverse");
        openMenu();
        fireEvent.click(screen.getByTestId("shape-order-nearest"));
        expect(fromReverse).toHaveBeenCalledExactlyOnceWith("nearest");
    });
});

describe("who goes where's pictures", () => {
    it("reads the new line as numbers: 2143, 1234 and 4321", () => {
        renderMenu("keep");
        openMenu();
        expect(sequence("shape-order-nearest-picture")).toBe("2143");
        expect(sequence("shape-order-keep-picture")).toBe("1234");
        expect(sequence("shape-order-reverse-picture")).toBe("4321");
    });

    it("shows the current answer's picture on the button", () => {
        for (const [current, seq] of [
            ["nearest", "2143"],
            ["keep", "1234"],
            ["reverse", "4321"],
        ] as const) {
            renderMenu(current);
            expect(sequence("shape-order-picture"), current).toBe(seq);
            openMenu();
            expect(screen.getByTestId("shape-order-picture").innerHTML).toBe(
                screen.getByTestId(`shape-order-${current}-picture`).innerHTML,
            );
            cleanup();
        }
    });

    it("draws in the text's color, so the highlight and greyed-out states follow", () => {
        renderMenu("nearest");
        const picture = screen.getByTestId("shape-order-picture");
        expect(picture).toHaveAttribute("width", "72");
        expect(picture).toHaveAttribute("height", "26");
        for (const el of picture.querySelectorAll("text, polygon"))
            expect(el.getAttribute("fill")).toBe("currentColor");
        for (const el of picture.querySelectorAll("line"))
            expect(el.getAttribute("stroke")).toBe("currentColor");
    });
});
