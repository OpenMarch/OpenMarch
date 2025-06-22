import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { UnitInput } from "@openmarch/ui";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ToggleGroupRoot, ToggleGroupItem } from "@openmarch/ui";

const labelClassname = clsx("text-body text-text/80 self-center col-span-5");

const STEP_OPTIONS = [2, 1, 0.5, 0.25];

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
        <div className="flex flex-col">
            <div className="flex flex-col gap-4">
                <span className="text-body text-text/80">
                    Nearest {axis}-steps
                </span>
                <ToggleGroupRoot
                    size="sm"
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
                        value="0"
                        title="None"
                        onClick={() => setCustomIsSelected(false)}
                    >
                        None
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="custom"
                        title="Custom"
                        onClick={() => setCustomIsSelected(true)}
                    >
                        Custom
                    </ToggleGroupItem>
                </ToggleGroupRoot>
                <UnitInput
                    unit="steps"
                    type="number"
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
                    <div className={"flex h-[40px] w-full justify-end gap-8"}>
                        <label className={labelClassname}>Offset</label>
                        <UnitInput
                            unit="steps"
                            type="number"
                            size={8}
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
        <div className="flex flex-col gap-16">
            <div className="flex items-center gap-4">
                <h4 className="text-h5 leading-none">Coordinate Rounding</h4>
                <button
                    onClick={() => setShowReferencePoint(!showReferencePoint)}
                    className={clsx(
                        "rounded border px-2 py-1 text-xs transition-colors",
                        showReferencePoint
                            ? "bg-accent/10 text-accent border-accent/20 hover:bg-accent/20"
                            : "bg-surface-raised text-text/60 border-border hover:bg-surface-raised/80",
                    )}
                >
                    {showReferencePoint ? "Disable Offset" : "Enable Offset"}
                </button>
            </div>
            <p className="text-sub text-text-subtitle">
                Does not yet work with groups
            </p>

            <AxisSettings
                axis="X"
                referencePoint={uiSettings.coordinateRounding?.referencePointX}
                nearestSteps={uiSettings.coordinateRounding?.nearestXSteps}
                onReferencePointChange={(value) =>
                    handleReferencePointChange("X", value)
                }
                onStepsChange={(value) => handleStepChange("X", value)}
                showReferencePoint={showReferencePoint}
            />

            <AxisSettings
                axis="Y"
                referencePoint={uiSettings.coordinateRounding?.referencePointY}
                nearestSteps={uiSettings.coordinateRounding?.nearestYSteps}
                onReferencePointChange={(value) =>
                    handleReferencePointChange("Y", value)
                }
                onStepsChange={(value) => handleStepChange("Y", value)}
                showReferencePoint={showReferencePoint}
            />
        </div>
    );
}
