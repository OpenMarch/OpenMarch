import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { registerActionHandler } from "@/shortcuts/registry";
import {
    getActionDefinition,
    NUDGE_ACTION_IDS,
    type ActionId,
} from "@/shortcuts/definitions";
import { useInputModeStore } from "@/stores/InputModeStore";
import MovePad, {
    HOLD_REPEAT_DELAY_MS,
    HOLD_REPEAT_INTERVAL_MS,
    movePadActionId,
} from "../MovePad";

vi.mock("@/hooks/queries", () => ({
    fieldPropertiesQueryOptions: () => ({
        queryKey: ["fieldProperties"],
        queryFn: async () => ({
            sideDescriptions: { verboseLeft: "Side 1", verboseRight: "Side 2" },
        }),
    }),
}));

/** jsdom has no PointerEvent, so give a mouse event a pointerType. */
const pointer = (type: string, el: Element, pointerType = "touch") => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(el, event);
};

const renderPad = (props: { disabled?: boolean } = {}) => {
    const queryClient = new QueryClient();
    return render(
        <TolgeeProvider tolgee={tolgee} fallback="Loading...">
            <QueryClientProvider client={queryClient}>
                <MovePad {...props} />
            </QueryClientProvider>
        </TolgeeProvider>,
    );
};

const setMode = (preference: "touch" | "mouse" | "auto") => {
    act(() => {
        useInputModeStore.getState().setPreference(preference);
    });
};
const advance = (ms: number) => {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
};

describe("MovePad", () => {
    let runs: ActionId[];
    let offs: (() => void)[];

    beforeAll(async () => {
        await tolgee.run();
    });

    beforeEach(() => {
        runs = [];
        offs = NUDGE_ACTION_IDS.map((id) =>
            registerActionHandler(id, {
                run: () => runs.push(id),
                isEnabled: () => true,
            }),
        );
        setMode("touch");
    });

    afterEach(() => {
        offs.forEach((off) => off());
        cleanup();
        vi.useRealTimers();
        setMode("auto");
        localStorage.clear();
    });

    it("maps pad steps to the existing nudge variants", () => {
        const args = (id: ActionId) => getActionDefinition(id).args;
        expect(movePadActionId("Up", "one")).toBe("moveSelectedMarchersUp");
        expect(args(movePadActionId("Up", "one"))).toEqual({
            direction: "up",
            step: "grid",
            snap: true,
        });
        expect(args(movePadActionId("Left", "quarter"))).toEqual({
            direction: "left",
            step: "quarter",
            snap: false,
        });
        expect(args(movePadActionId("Down", "four"))).toEqual({
            direction: "down",
            step: "four",
            snap: true,
        });
    });

    it("a tap moves once with the chosen step", () => {
        renderPad();
        const back = screen.getByRole("button", {
            name: "Move toward the back sideline",
        });
        pointer("pointerdown", back);
        pointer("pointerup", back);
        fireEvent.click(back, { detail: 1 });
        expect(runs).toEqual(["moveSelectedMarchersUp"]);

        fireEvent.click(screen.getByRole("radio", { name: "4 steps" }));
        const side1 = screen.getByRole("button", {
            name: "Move toward Side 1",
        });
        pointer("pointerdown", side1);
        pointer("pointerup", side1);
        expect(runs.at(-1)).toBe("moveSelectedMarchersLeftCoarse");

        fireEvent.click(screen.getByRole("radio", { name: "¼ step" }));
        const front = screen.getByRole("button", {
            name: "Move toward the front sideline",
        });
        pointer("pointerdown", front);
        pointer("pointerup", front);
        expect(runs.at(-1)).toBe("moveSelectedMarchersDownFine");
        expect(runs).toHaveLength(3);
    });

    it("a keyboard press (click without a pointer) moves once", () => {
        renderPad();
        fireEvent.click(
            screen.getByRole("button", { name: "Move toward Side 2" }),
            { detail: 0 },
        );
        expect(runs).toEqual(["moveSelectedMarchersRight"]);
    });

    it("holding repeats until release", () => {
        vi.useFakeTimers();
        renderPad();
        const side2 = screen.getByRole("button", {
            name: "Move toward Side 2",
        });
        pointer("pointerdown", side2);
        expect(runs).toHaveLength(1);
        advance(HOLD_REPEAT_DELAY_MS - 10);
        expect(runs).toHaveLength(1);
        advance(10 + HOLD_REPEAT_INTERVAL_MS * 3 + 5);
        expect(runs).toHaveLength(4);
        pointer("pointerup", side2);
        advance(HOLD_REPEAT_INTERVAL_MS * 5);
        expect(runs).toHaveLength(4);
        expect(new Set(runs)).toEqual(new Set(["moveSelectedMarchersRight"]));
    });

    it("stops repeating on cancel and on leave", () => {
        vi.useFakeTimers();
        renderPad();
        const back = screen.getByRole("button", {
            name: "Move toward the back sideline",
        });
        const ends = [
            () => pointer("pointercancel", back),
            // React builds onPointerLeave from pointerout; fireEvent.pointerLeave fires both
            () => fireEvent.pointerLeave(back),
        ];
        for (const end of ends) {
            runs = [];
            pointer("pointerdown", back);
            advance(HOLD_REPEAT_DELAY_MS + HOLD_REPEAT_INTERVAL_MS);
            end();
            const count = runs.length;
            expect(count).toBeGreaterThan(1);
            advance(1000);
            expect(runs).toHaveLength(count);
        }
    });

    it("is disabled when editing is disabled", () => {
        renderPad({ disabled: true });
        expect(
            screen.getByRole("button", {
                name: "Move toward the back sideline",
            }),
        ).toBeDisabled();
    });

    it("is hidden in mouse mode", () => {
        setMode("mouse");
        renderPad();
        expect(screen.queryByTestId("move-pad")).toBeNull();
    });
});
