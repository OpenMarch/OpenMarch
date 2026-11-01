import { describe, expect, it } from "vitest";
import { clickOnMarcher } from "../placed/boxClick";

/** A box of marchers 1–4 (recipe 7) */
const box = { id: 7, members: [1, 2, 3, 4] };

describe("clicking a marcher with boxes on the field", () => {
    it("a click on a box member selects the whole box", () => {
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: false,
                selected: new Set(),
                box,
                inside: null,
            }),
        ).toEqual({ select: [1, 2, 3, 4], inside: null });
    });

    it("a click on a box that's already selected leaves the press to the canvas, to drag it", () => {
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: false,
                selected: new Set([1, 2, 3, 4]),
                box,
                inside: null,
            }),
        ).toEqual({ select: null, inside: null });
    });

    it("a press on a marcher that's already selected leaves it to the canvas, to drag what's selected", () => {
        // Picked by a marquee: dragging it moves just it
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: false,
                selected: new Set([2]),
                box,
                inside: null,
            }),
        ).toEqual({ select: null, inside: null });
    });

    it("inside a box, a press is the canvas's (a click picks one marcher, Shift adds one), and Shift takes a selected one out", () => {
        for (const shift of [false, true]) {
            expect(
                clickOnMarcher({
                    marcherId: 3,
                    shift,
                    selected: new Set([2]),
                    box,
                    inside: 7,
                }),
            ).toEqual({ select: null, inside: 7 });
        }
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: true,
                selected: new Set([2, 3]),
                box,
                inside: 7,
            }),
        ).toEqual({ select: [3], inside: 7 });
    });

    it("Shift-click from outside adds or removes the whole box", () => {
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: true,
                selected: new Set([9]),
                box,
                inside: null,
            }),
        ).toEqual({ select: [9, 1, 2, 3, 4], inside: null });
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: true,
                selected: new Set([9, 1, 2, 3, 4]),
                box,
                inside: null,
            }),
        ).toEqual({ select: [9], inside: null });
    });

    it("a marcher in no box is the canvas's, and leaves any box you were inside", () => {
        expect(
            clickOnMarcher({
                marcherId: 9,
                shift: false,
                selected: new Set([2]),
                box: null,
                inside: 7,
            }),
        ).toEqual({ select: null, inside: null });
    });

    it("a click on another box's member leaves the box you were inside", () => {
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: false,
                selected: new Set([12]),
                box,
                inside: 8,
            }),
        ).toEqual({ select: [1, 2, 3, 4], inside: null });
    });

    it("reaching inside ($mod) enters the box, and the press is then a press inside it", () => {
        for (const shift of [false, true]) {
            expect(
                clickOnMarcher({
                    marcherId: 2,
                    shift,
                    reachInside: true,
                    selected: new Set(shift ? [9] : [1, 2, 3, 4]),
                    box,
                    inside: null,
                }),
            ).toEqual({ select: null, inside: 7 });
        }
        // Shift+$mod on a selected member takes it out, as Shift does inside the box
        expect(
            clickOnMarcher({
                marcherId: 2,
                shift: true,
                reachInside: true,
                selected: new Set([1, 2, 3, 4]),
                box,
                inside: null,
            }),
        ).toEqual({ select: [1, 3, 4], inside: 7 });
        // From inside another box
        expect(
            clickOnMarcher({
                marcherId: 3,
                shift: false,
                reachInside: true,
                selected: new Set([8]),
                box,
                inside: 9,
            }),
        ).toEqual({ select: null, inside: 7 });
    });

    it("reaching inside on a marcher in no box is the canvas's, as a click is", () => {
        expect(
            clickOnMarcher({
                marcherId: 9,
                shift: false,
                reachInside: true,
                selected: new Set(),
                box: null,
                inside: 7,
            }),
        ).toEqual({ select: null, inside: null });
    });
});
