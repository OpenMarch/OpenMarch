import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Profiler } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { IsPlayingProvider, useIsPlaying } from "@/context/IsPlayingContext";
import type { HonoredRoles } from "@/input/gestureChipStore";
import { clearGestureChip, syncGestureChip } from "@/input/gestureChipSync";
import { VERSION_A, type Roles } from "@/input/modifierRoles";
import * as platform from "@/shortcuts/platform";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import en from "../../../../i18n/en.json";
import es from "../../../../i18n/es.json";
import fr from "../../../../i18n/fr.json";
import ja from "../../../../i18n/ja.json";
import ptBR from "../../../../i18n/pt-BR.json";
import { GESTURE_CHIP_KEYS, gestureChipSegments } from "../heldRoleChipText";
import HeldRolesChip, { HeldRolesChipBelowTip } from "../HeldRolesChip";

const { chipT } = vi.hoisted(() => ({
    chipT: (key: string) =>
        ({
            "field.gestureChip.fine": "fine",
            "field.gestureChip.wholeDegrees": "whole degrees",
            "field.gestureChip.fromCenter": "from center",
            "field.gestureChip.oneAxis": "one axis",
            "field.gestureChip.equalSpacings": "equal spacings",
            "field.gestureChip.freeRatio": "free ratio",
            "field.gestureChip.keepRatio": "keep ratio",
            "field.gestureChip.snapOff": "Snap off",
        })[key] ?? `?${key}`,
}));

vi.mock("@tolgee/react", () => ({
    useTranslate: () => ({ t: chipT }),
}));

beforeEach(() => {
    vi.spyOn(platform, "isMacPlatform").mockReturnValue(false);
});

afterEach(() => {
    cleanup();
    act(() => {
        clearGestureChip();
        useUiSettingsStore.getState().setSnap(true);
    });
    vi.restoreAllMocks();
});

const NONE: Roles = { fine: false, constrain: false, fromCenter: false };
const ALL: Roles = { fine: true, constrain: true, fromCenter: true };

/** A marcher move: fine and one axis, snapping */
const MOVE: HonoredRoles = {
    context: "field",
    fine: "fine",
    constrain: "oneAxis",
    snaps: true,
};

let setPlaying: (playing: boolean) => void = () => {};
function PlayingSwitch() {
    setPlaying = useIsPlaying()!.setIsPlaying;
    return null;
}

const renderChip = (onRender?: () => void) =>
    render(
        <IsPlayingProvider>
            <PlayingSwitch />
            <Profiler id="chip" onRender={onRender ?? (() => {})}>
                <HeldRolesChip />
            </Profiler>
        </IsPlayingProvider>,
    );

const chip = () => screen.queryByTestId("heldRolesChip");

const sync = (...args: Parameters<typeof syncGestureChip>) =>
    act(() => {
        syncGestureChip(...args);
    });

describe("gestureChipSegments", () => {
    it("names only the roles the gesture honors, in its own words, and Snap off where it snaps", () => {
        expect(gestureChipSegments(MOVE, ALL, false, false, chipT)).toEqual([
            "Shift fine",
            "Ctrl one axis",
            "Snap off",
        ]);
    });

    it("leaves Snap off out for a gesture that doesn't snap", () => {
        const scale: HonoredRoles = {
            context: "field",
            fine: "fine",
            constrain: "freeRatio",
            snaps: false,
        };
        expect(gestureChipSegments(scale, ALL, false, false, chipT)).toEqual([
            "Shift fine",
            "Ctrl free ratio",
        ]);
    });

    it("reads each key in the gesture's own context", () => {
        const map = {
            ...VERSION_A,
            shape: { ...VERSION_A.shape, fine: "Alt" as const },
        };
        const pivot: HonoredRoles = {
            context: "shape",
            fine: "fine",
            snaps: false,
        };
        expect(
            gestureChipSegments(
                pivot,
                { ...NONE, fine: true },
                true,
                false,
                chipT,
                map,
            ),
        ).toEqual(["Alt fine"]);
    });
});

describe("the chip's words", () => {
    const lookup = (locale: object, key: string): unknown =>
        key
            .split(".")
            .reduce<unknown>(
                (at, part) => (at as Record<string, unknown>)?.[part],
                locale,
            );

    it.each([
        ["en", en],
        ["es", es],
        ["fr", fr],
        ["ja", ja],
        ["pt-BR", ptBR],
    ])("are all in %s", (_, locale) => {
        for (const key of GESTURE_CHIP_KEYS)
            expect(typeof lookup(locale, key), key).toBe("string");
    });

    // The Snap toggle's caption names the term each locale uses for snapping
    it.each([
        ["es", es],
        ["fr", fr],
        ["ja", ja],
        ["pt-BR", ptBR],
    ])("say Snap off in %s with the Snap toggle's term", (_, locale) => {
        const caption = lookup(
            locale,
            "toolbar.alignment.snapToggleCaption",
        ) as string;
        const snapOff = lookup(locale, "field.gestureChip.snapOff") as string;
        expect(snapOff.toLowerCase()).toContain(caption.toLowerCase());
    });
});

describe("HeldRolesChip", () => {
    it("renders at the pointer offset while a held role is honored", () => {
        renderChip();
        sync(MOVE, { ...NONE, fine: true }, { x: 100, y: 200 });
        expect(chip()).toHaveTextContent("Shift fine");
        expect(chip()).toHaveStyle({ left: "116px", top: "218px" });
    });

    it("isn't there when nothing is held and snapping is on", () => {
        renderChip();
        sync(MOVE, NONE, { x: 0, y: 0 });
        expect(chip()).toBeNull();
    });

    it("isn't there for a held role the gesture doesn't read", () => {
        renderChip();
        sync(MOVE, { ...NONE, fromCenter: true }, { x: 0, y: 0 });
        expect(chip()).toBeNull();
    });

    it("shows Snap off with nothing held while snapping is off", () => {
        renderChip();
        act(() => {
            useUiSettingsStore.getState().setSnap(false);
            syncGestureChip(MOVE, NONE, { x: 0, y: 0 });
        });
        expect(chip()).toHaveTextContent(/^Snap off$/);
    });

    it("hides during playback and comes back when it stops", () => {
        renderChip();
        sync(MOVE, { ...NONE, fine: true }, { x: 0, y: 0 });
        expect(chip()).not.toBeNull();
        act(() => setPlaying(true));
        expect(chip()).toBeNull();
        act(() => setPlaying(false));
        expect(chip()).not.toBeNull();
    });

    it("shows a Mac's symbols", () => {
        vi.mocked(platform.isMacPlatform).mockReturnValue(true);
        renderChip();
        sync({ ...MOVE, fromCenter: "fromCenter" }, ALL, {
            x: 0,
            y: 0,
        });
        expect(chip()).toHaveTextContent("⇧ fine · ⌘ one axis · ⌥ from center");
    });

    it("doesn't render again as the pointer moves while it's hidden", () => {
        const rendered = vi.fn();
        renderChip(rendered);
        sync(MOVE, NONE, { x: 0, y: 0 });
        rendered.mockClear();
        for (let x = 1; x <= 5; x++) sync(MOVE, NONE, { x, y: x });
        expect(rendered).not.toHaveBeenCalled();
    });
});

describe("with a drag readout showing", () => {
    it("stacks under the readout instead of floating over it at the pointer", () => {
        render(
            <IsPlayingProvider>
                <HeldRolesChip belowTip />
                <HeldRolesChipBelowTip />
            </IsPlayingProvider>,
        );
        sync(MOVE, ALL, { x: 10, y: 10 });
        const chips = screen.getAllByTestId("heldRolesChip");
        expect(chips).toHaveLength(1);
        // The stacked one sits in the readout's column, not at the pointer
        expect(chips[0].style.left).toBe("");
        expect(chips[0].textContent).toContain("Shift fine");
    });
});
