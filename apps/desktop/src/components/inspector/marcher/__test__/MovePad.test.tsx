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
    NUDGE_ACTION_IDS,
    type ActionArgs,
    type ActionId,
} from "@/shortcuts/definitions";
import { useInputModeStore } from "@/stores/InputModeStore";
import MovePad, { movePadAction } from "../MovePad";

vi.mock("@/hooks/queries", () => ({
    fieldPropertiesQueryOptions: () => ({
        queryKey: ["fieldProperties"],
        queryFn: async () => ({
            sideDescriptions: { verboseLeft: "Side 1", verboseRight: "Side 2" },
        }),
    }),
}));

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
describe("MovePad", () => {
    let runs: ActionId[];
    let lastArgs: ActionArgs | undefined;
    let offs: (() => void)[];

    beforeAll(async () => {
        await tolgee.run();
    });

    beforeEach(() => {
        runs = [];
        offs = NUDGE_ACTION_IDS.map((id) =>
            registerActionHandler(id, {
                run: (args) => {
                    runs.push(id);
                    lastArgs = args;
                },
                isEnabled: () => true,
            }),
        );
        setMode("touch");
    });

    afterEach(() => {
        offs.forEach((off) => off());
        cleanup();
        setMode("auto");
        localStorage.clear();
    });

    it("moves exactly the chosen step, never snapping", () => {
        expect(movePadAction("Up", "one")).toEqual({
            id: "moveSelectedMarchersUpFree",
            args: { direction: "up", step: "one", snap: false },
        });
        expect(movePadAction("Left", "quarter")).toEqual({
            id: "moveSelectedMarchersLeftFine",
            args: { direction: "left", step: "quarter", snap: false },
        });
        expect(movePadAction("Down", "four")).toEqual({
            id: "moveSelectedMarchersDownCoarseFree",
            args: { direction: "down", step: "four", snap: false },
        });
    });

    it("a tap moves once with the chosen step", () => {
        renderPad();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move toward the back sideline",
            }),
        );
        expect(runs).toEqual(["moveSelectedMarchersUpFree"]);
        expect(lastArgs).toEqual({ direction: "up", step: "one", snap: false });

        fireEvent.click(screen.getByRole("radio", { name: "4 steps" }));
        fireEvent.click(
            screen.getByRole("button", { name: "Move toward Side 1" }),
        );
        expect(runs.at(-1)).toBe("moveSelectedMarchersLeftCoarseFree");

        fireEvent.click(screen.getByRole("radio", { name: "¼ step" }));
        fireEvent.click(
            screen.getByRole("button", {
                name: "Move toward the front sideline",
            }),
        );
        expect(runs.at(-1)).toBe("moveSelectedMarchersDownFine");
        expect(runs).toHaveLength(3);
    });

    it("pressing without releasing doesn't move (no hold-to-repeat)", () => {
        vi.useFakeTimers();
        renderPad();
        const side2 = screen.getByRole("button", {
            name: "Move toward Side 2",
        });
        fireEvent.pointerDown(side2);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(runs).toHaveLength(0);
        vi.useRealTimers();
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
