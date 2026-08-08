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

const wipeArgs = JSON.stringify({
    color: "#112233",
    directionDegrees: 90,
});

describe("EffectItem type selector", () => {
    it("offers solid, wipe, flicker, and fade only", () => {
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

        const options = screen
            .getAllByRole("option")
            .map((el) => el.textContent);
        expect(options).toEqual(["Solid", "Wipe", "Flicker", "Fade"]);
        expect(screen.queryByText("Strobe")).toBeNull();
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

    it("enables flicker in the type selector", () => {
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
        const flickerOption = screen
            .getByText("Flicker")
            .closest("[role='option']");
        expect(flickerOption?.getAttribute("data-disabled")).toBeNull();

        fireEvent.click(screen.getByText("Flicker"));
        expect(typeChangeFn).toHaveBeenCalledWith("flicker");
    });

    it("enables fade in the type selector", () => {
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
        expect(fadeOption?.getAttribute("data-disabled")).toBeNull();

        fireEvent.click(screen.getByText("Fade"));
        expect(typeChangeFn).toHaveBeenCalledWith("fade");
    });
});

describe("EffectItem fade args editor", () => {
    it("renders start and end color fields for fade effects", () => {
        render(
            <EffectItem
                {...baseProps}
                type="fade"
                args={JSON.stringify({
                    startColor: "#000000",
                    endColor: "#ffffff",
                })}
            />,
        );

        expect(screen.getByText("Start color")).toBeTruthy();
        expect(screen.getByText("End color")).toBeTruthy();
    });
});

describe("EffectItem flicker args editor", () => {
    it("renders color and on/off dwell time fields for flicker effects", () => {
        render(
            <EffectItem
                {...baseProps}
                type="flicker"
                args={JSON.stringify({
                    color: "#ffffff",
                    onMinMs: 50,
                    onMaxMs: 200,
                    offMinMs: 50,
                    offMaxMs: 200,
                })}
            />,
        );

        expect(screen.getByLabelText("Min on time (s)")).toBeTruthy();
        expect(screen.getByLabelText("Max on time (s)")).toBeTruthy();
        expect(screen.getByLabelText("Min off time (s)")).toBeTruthy();
        expect(screen.getByLabelText("Max off time (s)")).toBeTruthy();
        expect(screen.getByText("Color")).toBeTruthy();
    });

    it("commits a dwell time field when typed into and blurred", () => {
        const argsChangeFn = vi.fn();

        render(
            <EffectItem
                {...baseProps}
                type="flicker"
                args={JSON.stringify({
                    color: "#ffffff",
                    onMinMs: 50,
                    onMaxMs: 200,
                    offMinMs: 50,
                    offMaxMs: 200,
                })}
                argsChangeFn={argsChangeFn}
            />,
        );

        const onMinInput = screen.getByLabelText("Min on time (s)");
        fireEvent.change(onMinInput, { target: { value: "0.1" } });
        fireEvent.blur(onMinInput);

        expect(argsChangeFn).toHaveBeenCalledTimes(1);
        expect(JSON.parse(argsChangeFn.mock.calls[0]![0] as string)).toEqual({
            color: "#ffffff",
            onMinMs: 100,
            onMaxMs: 200,
            offMinMs: 50,
            offMaxMs: 200,
        });
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
