import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import * as platform from "@/shortcuts/platform";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import type { ShapeField } from "../../field/shapeField";
import { toolEnvFor } from "../../tool/toolEnv";
import { SPACING_FINE_RATE, spacingRate } from "../scrub";
import { ScrubNumber, type ScrubMove } from "../ScrubNumber";
import { watchKeyListeners } from "../../__test__/keyListeners";
import { stubPointerCapture } from "./pointerEvents";

/**
 * A number in the floating editor reads held roles (version A): Shift is fine, hundredths of a step
 * on a spacing (#411, Alt before); $mod is constrain. A role key pressed or released mid-drag
 * scrubs again where the pointer is. The Snap toggle off frees a spacing as fine does.
 */

let restorePointerCapture: () => void;

beforeEach(() => {
    vi.spyOn(platform, "isMacPlatform").mockReturnValue(false);
    restorePointerCapture = stubPointerCapture();
});

afterEach(() => {
    cleanup();
    act(() => {
        useUiSettingsStore.getState().setSnap(true);
    });
    restorePointerCapture();
    vi.restoreAllMocks();
});

const field = {
    fieldProperties:
        FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
    zoom: () => 1,
    marchers: () => [],
    drawn: () => new Map(),
} as unknown as ShapeField;

function shown() {
    const onScrub = vi.fn<(move: ScrubMove) => void>();
    const { unmount } = render(
        <ScrubNumber
            display="2"
            axis="x"
            label="Side-to-side spacing"
            testId="n"
            onScrubStart={() => {}}
            onScrub={onScrub}
            onScrubEnd={() => {}}
            onType={() => true}
        />,
    );
    return { button: screen.getByTestId("n"), onScrub, unmount };
}

const lastMove = (onScrub: ReturnType<typeof shown>["onScrub"]) =>
    onScrub.mock.calls.at(-1)![0];

describe("dragging a number", () => {
    it("is fine with Shift, so a spacing goes in hundredths of a step", () => {
        const { button, onScrub } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, {
            clientX: 10,
            clientY: 0,
            shiftKey: true,
        });
        const move = lastMove(onScrub);
        expect(move.roles).toEqual({
            fine: true,
            constrain: false,
            fromCenter: false,
        });
        const env = toolEnvFor(field, move.roles);
        expect(spacingRate(env.snap, move.axis)).toMatchObject(
            SPACING_FINE_RATE,
        );
    });

    it("goes in hundredths of a step on a spacing with the Snap toggle off, no key held", () => {
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
        });
        const { button, onScrub } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 10, clientY: 0 });
        const move = lastMove(onScrub);
        expect(move.roles.fine).toBe(false);
        const env = toolEnvFor(field, move.roles);
        expect(spacingRate(env.snap, move.axis)).toMatchObject(
            SPACING_FINE_RATE,
        );
    });

    it("isn't fine with Alt, and $mod is constrain", () => {
        const { button, onScrub } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, {
            clientX: 10,
            clientY: 0,
            altKey: true,
        });
        expect(lastMove(onScrub).roles.fine).toBe(false);
        fireEvent.pointerMove(button, {
            clientX: 12,
            clientY: 0,
            ctrlKey: true,
        });
        expect(lastMove(onScrub).roles).toMatchObject({
            fine: false,
            constrain: true,
        });
    });

    it("scrubs again where it is when Shift goes down or up mid-drag", () => {
        const { button, onScrub } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 10, clientY: 0 });
        const moves = onScrub.mock.calls.length;
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(onScrub.mock.calls.length).toBe(moves + 1);
        expect(lastMove(onScrub)).toMatchObject({ dx: 10, dy: 0 });
        expect(lastMove(onScrub).roles.fine).toBe(true);
        fireEvent.keyUp(window, { key: "Shift" });
        expect(lastMove(onScrub).roles.fine).toBe(false);
        // Released: the keys aren't followed any more
        fireEvent.pointerUp(button);
        const ended = onScrub.mock.calls.length;
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(onScrub.mock.calls.length).toBe(ended);
    });
});

describe("a number's drag stops following the keys", () => {
    it.each([
        ["released", (button: HTMLElement) => fireEvent.pointerUp(button)],
        ["cancelled", (button: HTMLElement) => fireEvent.pointerCancel(button)],
        [
            "when it loses the pointer",
            (button: HTMLElement) => fireEvent.lostPointerCapture(button),
        ],
        [
            "when it's unmounted mid-drag",
            (_: HTMLElement, unmount: () => void) => unmount(),
        ],
    ])("%s", (_, end) => {
        const keyListeners = watchKeyListeners();
        const { button, onScrub, unmount } = shown();
        fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(button, { clientX: 10, clientY: 0 });
        expect(keyListeners()).toBeGreaterThan(0);
        end(button, unmount);
        expect(keyListeners()).toBe(0);
        const calls = onScrub.mock.calls.length;
        fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
        expect(onScrub.mock.calls.length).toBe(calls);
    });
});
