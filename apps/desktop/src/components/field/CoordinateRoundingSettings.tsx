import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Input } from "@openmarch/ui";
import { useEffect, useState, useCallback } from "react";
import clsx from "clsx";
import { ToggleGroup, ToggleGroupItem, UnitInput } from "@openmarch/ui";
import * as Popover from "@radix-ui/react-popover";
import ToolbarSection from "../toolbar/ToolbarSection";
import { CaretDownIcon } from "@phosphor-icons/react";

const STEP_OPTIONS = [0.25, 0.5, 1, 2];
const ALL_STEP_OPTIONS = [0, ...STEP_OPTIONS]; // Include "None" option (0) first

interface AxisSettingsProps {
    axis: "X" | "Y";
    referencePoint: number | undefined;
    nearestSteps: number | undefined;
    onReferencePointChange: (value: number | undefined) => void;
    onStepsChange: (value: number) => void;
    showReferencePoint?: boolean;
}

function AxisSettings({
    axis,
    referencePoint,
    nearestSteps,
    onReferencePointChange,
    onStepsChange,
    showReferencePoint = true,
}: AxisSettingsProps) {
    const [customSteps, setCustomSteps] = useState<string>("");
    const [customIsSelected, setCustomIsSelected] = useState(false);

    const handleReferencePointChange = (value: string) => {
        const numValue = value === "" ? undefined : parseFloat(value);
        if (numValue === undefined || !isNaN(numValue)) {
            onReferencePointChange(numValue);
        }
    };

    useEffect(() => {
        setCustomSteps(nearestSteps?.toString() ?? "0");
        if (
            (nearestSteps ?? 0) !== 0 &&
            !STEP_OPTIONS.includes(nearestSteps ?? 0)
        ) {
            setCustomIsSelected(true);
        }
    }, [nearestSteps]);

    return (
        <div className="border-stroke rounded-6 flex flex-col gap-8 border p-8">
            <div className="flex flex-col gap-4">
                <span className="text-body text-text/80">
                    Nearest {axis}-steps
                </span>
                <ToggleGroup
                    type="single"
                    value={
                        customIsSelected
                            ? "custom"
                            : (nearestSteps?.toString() ?? "custom")
                    }
                    onValueChange={(value: string) => {
                        if (value === "custom") {
                            setCustomIsSelected(true);
                            if (customSteps) {
                                onStepsChange(parseFloat(customSteps));
                            }
                        } else if (value) {
                            onStepsChange(parseFloat(value));
                        }
                    }}
                >
                    <ToggleGroupItem
                        value="0"
                        title="None"
                        onClick={() => setCustomIsSelected(false)}
                    >
                        None
                    </ToggleGroupItem>
                    {STEP_OPTIONS.map((step) => (
                        <ToggleGroupItem
                            key={step}
                            value={step.toString()}
                            onClick={() => setCustomIsSelected(false)}
                            title={`Round ${axis} to nearest ${
                                step === 0.25
                                    ? "quarter"
                                    : step === 0.5
                                      ? "half"
                                      : step === 0.33
                                        ? "third"
                                        : step
                            } ${step <= 1 ? "step" : "steps"}`}
                        >
                            {step === 0.25
                                ? "¼"
                                : step === 0.5
                                  ? "½"
                                  : step === 0.33
                                    ? "⅓"
                                    : step}
                        </ToggleGroupItem>
                    ))}
                    <ToggleGroupItem
                        value="custom"
                        title="Custom"
                        onClick={() => setCustomIsSelected(true)}
                    >
                        Custom
                    </ToggleGroupItem>
                </ToggleGroup>
                <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*\.?[0-9]*"
                    className="w-[6rem]"
                    value={customSteps}
                    hidden={!customIsSelected}
                    onChange={(e) => {
                        setCustomSteps(e.target.value);
                    }}
                    step={1}
                    onBlur={() => {
                        if (customSteps === "") {
                            setCustomSteps(nearestSteps?.toString() ?? "0");
                        } else {
                            onStepsChange(parseFloat(customSteps));
                        }
                    }}
                    placeholder="steps"
                />
                {showReferencePoint && (
                    <div
                        className={
                            "flex h-fit w-full items-center justify-end gap-8 py-6"
                        }
                    >
                        <p className="text-body text-text/80 w-full">Offset</p>
                        <UnitInput
                            unit="steps"
                            type="number"
                            size={8}
                            compact
                            className="w-[6rem]"
                            inputMode="numeric"
                            pattern="-?[0-9]*\.?[0-9]*"
                            value={referencePoint ?? ""}
                            onChange={(e) =>
                                handleReferencePointChange(e.target.value)
                            }
                            placeholder="0"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CoordinateRoundingSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const [showReferencePoint, setShowReferencePoint] = useState(() =>
        JSON.parse(
            localStorage.getItem("coordinateRounding.offsetEnabled") ?? "true",
        ),
    );

    const handleStepChange = (axis: "X" | "Y", value: number) => {
        setUiSettings({
            ...uiSettings,
            coordinateRounding: {
                ...uiSettings.coordinateRounding,
                [`nearest${axis}Steps`]: value,
            },
        });
    };

    const cycleStepOption = (
        axis: "X" | "Y",
        direction: "forward" | "backward" = "forward",
    ) => {
        const currentValue =
            uiSettings.coordinateRounding?.[`nearest${axis}Steps`] ?? 0;
        const currentIndex = ALL_STEP_OPTIONS.indexOf(currentValue);

        let nextIndex;
        if (direction === "forward") {
            nextIndex = (currentIndex + 1) % ALL_STEP_OPTIONS.length;
        } else {
            nextIndex =
                (currentIndex - 1 + ALL_STEP_OPTIONS.length) %
                ALL_STEP_OPTIONS.length;
        }

        const nextValue = ALL_STEP_OPTIONS[nextIndex];
        handleStepChange(axis, nextValue);
    };

    const formatStepValue = (value: number | undefined) => {
        if (!value || value === 0) return "None";
        if (value === 0.25) return "¼";
        if (value === 0.5) return "½";
        return value.toString();
    };

    const handleReferencePointChange = useCallback(
        (axis: "X" | "Y", value: number | undefined) => {
            const currentValue =
                uiSettings.coordinateRounding?.[`referencePoint${axis}`];
            if (currentValue !== value) {
                setUiSettings({
                    ...uiSettings,
                    coordinateRounding: {
                        ...uiSettings.coordinateRounding,
                        [`referencePoint${axis}`]: value,
                    },
                });
            }
        },
        [setUiSettings, uiSettings],
    );

    useEffect(() => {
        localStorage.setItem(
            "coordinateRounding.offsetEnabled",
            JSON.stringify(showReferencePoint),
        );
        if (!showReferencePoint) {
            handleReferencePointChange("X", 0);
            handleReferencePointChange("Y", 0);
        }
    }, [handleReferencePointChange, showReferencePoint]);

    return (
        <ToolbarSection>
            <Popover.Root>
                <Popover.Trigger className="hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    Coordinate Rounding <CaretDownIcon size={18} />
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className="bg-modal text-text rounded-6 shadow-modal backdrop-blur-32 border-stroke z-50 m-8 flex flex-col items-start gap-0 border p-8">
                        <div className="flex flex-col gap-16">
                            <div className="flex items-center gap-4">
                                <h4 className="text-h5 leading-none">
                                    Coordinate Rounding
                                </h4>
                                <button
                                    onClick={() =>
                                        setShowReferencePoint(
                                            !showReferencePoint,
                                        )
                                    }
                                    className={clsx(
                                        "text-sub rounded-6 bg-fg-2 border px-2 py-1 transition-colors",
                                        showReferencePoint
                                            ? "border-accent"
                                            : "text-text border-stroke hover:bg-white/20",
                                    )}
                                >
                                    {showReferencePoint
                                        ? "Disable Offset"
                                        : "Enable Offset"}
                                </button>
                            </div>
                            <p className="text-sub text-text-subtitle">
                                Does not yet work with groups
                            </p>

                            <AxisSettings
                                axis="X"
                                referencePoint={
                                    uiSettings.coordinateRounding
                                        ?.referencePointX
                                }
                                nearestSteps={
                                    uiSettings.coordinateRounding?.nearestXSteps
                                }
                                onReferencePointChange={(value) =>
                                    handleReferencePointChange("X", value)
                                }
                                onStepsChange={(value) =>
                                    handleStepChange("X", value)
                                }
                                showReferencePoint={showReferencePoint}
                            />

                            <AxisSettings
                                axis="Y"
                                referencePoint={
                                    uiSettings.coordinateRounding
                                        ?.referencePointY
                                }
                                nearestSteps={
                                    uiSettings.coordinateRounding?.nearestYSteps
                                }
                                onReferencePointChange={(value) =>
                                    handleReferencePointChange("Y", value)
                                }
                                onStepsChange={(value) =>
                                    handleStepChange("Y", value)
                                }
                                showReferencePoint={showReferencePoint}
                            />
                        </div>
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
            <button
                className="text-text-subtitle hover:text-accent cursor-pointer transition-colors select-none"
                onClick={() => cycleStepOption("X", "forward")}
                onContextMenu={(e) => {
                    e.preventDefault();
                    cycleStepOption("X", "backward");
                }}
                title="Left-click to cycle forward, right-click to cycle backward through X-step options"
            >
                X:{" "}
                {formatStepValue(uiSettings.coordinateRounding?.nearestXSteps)}
            </button>
            <button
                className="text-text-subtitle hover:text-accent cursor-pointer transition-colors select-none"
                onClick={() => cycleStepOption("Y", "forward")}
                onContextMenu={(e) => {
                    e.preventDefault();
                    cycleStepOption("Y", "backward");
                }}
                title="Left-click to cycle forward, right-click to cycle backward through Y-step options"
            >
                Y:{" "}
                {formatStepValue(uiSettings.coordinateRounding?.nearestYSteps)}
            </button>
        </ToolbarSection>
    );
}
