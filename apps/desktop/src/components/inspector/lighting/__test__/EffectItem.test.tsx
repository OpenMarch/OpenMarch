import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EffectItem from "../EffectItem";

vi.mock("@tolgee/react", () => ({
    T: ({ defaultValue }: { defaultValue: string }) => <>{defaultValue}</>,
    useTolgee: () => ({
        t: () => undefined,
    }),
}));

vi.mock("@/components/ui/ColorPicker", () => ({
    default: ({ label }: { label: string }) => <div>{label}</div>,
}));

const baseProps = {
    effectId: 7,
    name: "",
    nameChangeFn: vi.fn(),
    typeChangeFn: vi.fn(),
    argsChangeFn: vi.fn(),
    deleteEffectFn: vi.fn(),
};

const fadeArgsWithTwoColors = JSON.stringify({
    changeDurationMs: 2000,
    colors: ["#ff0000", "#00ff00"],
});

const wipeArgs = JSON.stringify({
    color: "#112233",
    directionDegrees: 90,
});

describe("EffectItem type selector", () => {
    it("enables fade but keeps strobe disabled", () => {
        const typeChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="solid"
                args={JSON.stringify({ color: "#112233" })}
                typeChangeFn={typeChangeFn}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Effect type" }));

        const fadeOption = screen.getByText("Fade").closest("[role='option']");
        const strobeOption = screen
            .getByText("Strobe")
            .closest("[role='option']");

        expect(fadeOption?.getAttribute("data-disabled")).toBeNull();
        expect(strobeOption?.getAttribute("data-disabled")).not.toBeNull();

        fireEvent.click(screen.getByText("Fade"));
        expect(typeChangeFn).toHaveBeenCalledWith("fade");

        fireEvent.click(screen.getByRole("button", { name: "Effect type" }));
        fireEvent.click(screen.getByText("Strobe"));
        expect(typeChangeFn).toHaveBeenCalledTimes(1);
    });

    it("enables wipe in the type selector", () => {
        const typeChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="solid"
                args={JSON.stringify({ color: "#112233" })}
                typeChangeFn={typeChangeFn}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Effect type" }));
        fireEvent.click(screen.getByText("Wipe"));
        expect(typeChangeFn).toHaveBeenCalledWith("wipe");
    });
});

describe("EffectItem fade args editor", () => {
    it("renders duration field and color labels for fade effects", () => {
        render(
            <EffectItem
                {...baseProps}
                type="fade"
                args={fadeArgsWithTwoColors}
            />,
        );

        expect(screen.getByLabelText("Change duration")).toBeTruthy();
        expect(screen.getByText("Color 1")).toBeTruthy();
        expect(screen.getByText("Color 2")).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Remove color" }),
        ).toBeNull();
    });

    it("adds a color when Add color is clicked", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="fade"
                args={fadeArgsWithTwoColors}
                argsChangeFn={argsChangeFn}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Add color" }));

        expect(argsChangeFn).toHaveBeenCalledTimes(1);
        const nextArgs = JSON.parse(argsChangeFn.mock.calls[0]![0] as string);
        expect(nextArgs.colors).toHaveLength(3);
        expect(nextArgs.colors).toEqual(["#ff0000", "#00ff00", "#00ff00"]);
    });

    it("keeps local edits when parent re-renders with the same args", () => {
        const argsChangeFn = vi.fn();
        const { rerender } = render(
            <EffectItem
                {...baseProps}
                type="fade"
                args={fadeArgsWithTwoColors}
                argsChangeFn={argsChangeFn}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Add color" }));
        expect(screen.getByText("Color 3")).toBeTruthy();

        rerender(
            <EffectItem
                {...baseProps}
                type="fade"
                args={fadeArgsWithTwoColors}
                argsChangeFn={argsChangeFn}
            />,
        );

        expect(screen.getByText("Color 3")).toBeTruthy();
    });

    it("shows remove only on the third color and removes it", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="fade"
                args={JSON.stringify({
                    changeDurationMs: 2000,
                    colors: ["#ff0000", "#00ff00", "#0000ff"],
                })}
                argsChangeFn={argsChangeFn}
            />,
        );

        const removeButtons = screen.getAllByRole("button", {
            name: "Remove color",
        });
        expect(removeButtons).toHaveLength(1);

        fireEvent.click(removeButtons[0]!);

        expect(argsChangeFn).toHaveBeenCalledTimes(1);
        const nextArgs = JSON.parse(argsChangeFn.mock.calls[0]![0] as string);
        expect(nextArgs.colors).toEqual(["#ff0000", "#00ff00"]);
    });
});

describe("EffectItem wipe args editor", () => {
    it("renders color and direction fields for wipe effects", () => {
        render(<EffectItem {...baseProps} type="wipe" args={wipeArgs} />);

        expect(screen.getByText("Color")).toBeTruthy();
        expect(
            screen.getByRole("spinbutton", { name: "Direction" }),
        ).toBeTruthy();
        expect(screen.getByRole("slider", { name: "Direction" })).toBeTruthy();
    });

    it("normalizes direction degrees when the input is committed", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="wipe"
                args={wipeArgs}
                argsChangeFn={argsChangeFn}
            />,
        );

        const directionInput = screen.getByRole("spinbutton", {
            name: "Direction",
        });
        fireEvent.change(directionInput, { target: { value: "370" } });
        fireEvent.blur(directionInput);

        expect(argsChangeFn).toHaveBeenCalledTimes(1);
        expect(JSON.parse(argsChangeFn.mock.calls[0]![0] as string)).toEqual({
            color: "#112233",
            directionDegrees: 10,
        });
    });

    it("does not commit dial changes until pointer up", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="wipe"
                args={wipeArgs}
                argsChangeFn={argsChangeFn}
            />,
        );

        const dial = screen.getByRole("slider", { name: "Direction" });
        vi.spyOn(dial, "getBoundingClientRect").mockReturnValue({
            left: 0,
            top: 0,
            right: 100,
            bottom: 100,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            toJSON: () => ({}),
        });
        Object.assign(dial, {
            setPointerCapture: vi.fn(),
            hasPointerCapture: vi.fn(() => true),
            releasePointerCapture: vi.fn(),
        });

        const dispatchPointerEvent = (
            type: string,
            clientX: number,
            clientY: number,
            shiftKey = false,
        ) => {
            const event = new Event(type, {
                bubbles: true,
                cancelable: true,
            });
            Object.defineProperties(event, {
                pointerId: { value: 1 },
                clientX: { value: clientX },
                clientY: { value: clientY },
                shiftKey: { value: shiftKey },
            });
            fireEvent(dial, event);
        };

        dispatchPointerEvent("pointerdown", 50, 0);
        dispatchPointerEvent("pointermove", 100, 50);

        expect(argsChangeFn).not.toHaveBeenCalled();

        dispatchPointerEvent("pointerup", 0, 50);

        expect(argsChangeFn).toHaveBeenCalledTimes(1);
        expect(JSON.parse(argsChangeFn.mock.calls[0]![0] as string)).toEqual({
            color: "#112233",
            directionDegrees: 180,
        });
    });

    it("snaps dial pointer changes to 15 degrees unless shift is held", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="wipe"
                args={wipeArgs}
                argsChangeFn={argsChangeFn}
            />,
        );

        const dial = screen.getByRole("slider", { name: "Direction" });
        vi.spyOn(dial, "getBoundingClientRect").mockReturnValue({
            left: 0,
            top: 0,
            right: 100,
            bottom: 100,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            toJSON: () => ({}),
        });
        Object.assign(dial, {
            setPointerCapture: vi.fn(),
            hasPointerCapture: vi.fn(() => true),
            releasePointerCapture: vi.fn(),
        });

        const dispatchPointerEvent = (
            type: string,
            clientX: number,
            clientY: number,
            shiftKey = false,
        ) => {
            const event = new Event(type, {
                bubbles: true,
                cancelable: true,
            });
            Object.defineProperties(event, {
                pointerId: { value: 1 },
                clientX: { value: clientX },
                clientY: { value: clientY },
                shiftKey: { value: shiftKey },
            });
            fireEvent(dial, event);
        };

        dispatchPointerEvent("pointerdown", 100, 41);
        dispatchPointerEvent("pointerup", 100, 41);

        expect(JSON.parse(argsChangeFn.mock.calls[0]![0] as string)).toEqual({
            color: "#112233",
            directionDegrees: 15,
        });

        dispatchPointerEvent("pointerdown", 100, 41, true);
        dispatchPointerEvent("pointerup", 100, 41, true);

        expect(JSON.parse(argsChangeFn.mock.calls[1]![0] as string)).toEqual({
            color: "#112233",
            directionDegrees: 10,
        });
    });

    it("commits keyboard changes from the dial", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="wipe"
                args={wipeArgs}
                argsChangeFn={argsChangeFn}
            />,
        );

        fireEvent.keyDown(screen.getByRole("slider", { name: "Direction" }), {
            key: "ArrowUp",
        });

        expect(argsChangeFn).toHaveBeenCalledTimes(1);
        expect(JSON.parse(argsChangeFn.mock.calls[0]![0] as string)).toEqual({
            color: "#112233",
            directionDegrees: 91,
        });
    });
});
