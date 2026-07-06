import {
    defaultWipeEffectArgs,
    normalizeWipeDirectionDegrees,
    type WipeEffectArgs,
} from "@openmarch/core";
import { UnitInput } from "@openmarch/ui";
import ColorPicker from "@/components/ui/ColorPicker";
import { useTolgee } from "@tolgee/react";
import {
    type ChangeEvent,
    type KeyboardEvent,
    type PointerEvent,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { hex6ToRgba, isRgbaColor, rgbaToHex6 } from "./EffectItem.colors";

const getWipeDirectionDegreesFromPoint = ({
    centerX,
    centerY,
    pointX,
    pointY,
}: {
    centerX: number;
    centerY: number;
    pointX: number;
    pointY: number;
}): number =>
    normalizeWipeDirectionDegrees(
        (Math.atan2(centerY - pointY, pointX - centerX) * 180) / Math.PI,
    );

const snapWipeDirectionDegrees = (directionDegrees: number): number =>
    normalizeWipeDirectionDegrees(Math.round(directionDegrees / 15) * 15);

export type WipeEffectArgsInputProps = {
    currentArgs: WipeEffectArgs;
    currentArgsJson: string;
    argsChangeFn: (argsJson: string) => void;
};

export const WipeEffectArgsInput = ({
    currentArgs,
    currentArgsJson,
    argsChangeFn,
}: WipeEffectArgsInputProps) => {
    const { t } = useTolgee();
    const directionInputId = useId();
    const isDraggingDialRef = useRef(false);
    const draftDialDirectionRef = useRef(currentArgs.directionDegrees);
    const [colorHex, setColorHex] = useState(currentArgs.color);
    const [directionDegrees, setDirectionDegrees] = useState(
        currentArgs.directionDegrees,
    );
    const [directionInput, setDirectionInput] = useState(() =>
        String(currentArgs.directionDegrees),
    );

    useEffect(() => {
        setColorHex(currentArgs.color);
        setDirectionDegrees(currentArgs.directionDegrees);
        setDirectionInput(String(currentArgs.directionDegrees));
        draftDialDirectionRef.current = currentArgs.directionDegrees;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid array ref churn
    }, [currentArgsJson]);

    const commitArgs = (draft: WipeEffectArgs) => {
        const nextArgsJson = JSON.stringify(draft);
        if (nextArgsJson !== currentArgsJson) argsChangeFn(nextArgsJson);
    };

    const setDraftDirection = (nextDirection: number) => {
        const normalized = normalizeWipeDirectionDegrees(nextDirection);
        setDirectionDegrees(normalized);
        setDirectionInput(String(normalized));
        draftDialDirectionRef.current = normalized;
        return normalized;
    };

    const commitDirection = (nextDirection: number) => {
        const normalized = setDraftDirection(nextDirection);
        commitArgs({
            color: colorHex,
            directionDegrees: normalized,
        });
    };

    const restoreDirectionInput = () => {
        setDirectionInput(String(directionDegrees));
        draftDialDirectionRef.current = directionDegrees;
    };

    const handleDirectionChange = (e: ChangeEvent<HTMLInputElement>) => {
        setDirectionInput(e.currentTarget.value);
    };

    const handleDirectionBlur = () => {
        if (directionInput.trim() === "") {
            restoreDirectionInput();
            return;
        }

        const parsed = Number.parseFloat(directionInput);
        if (!Number.isFinite(parsed)) {
            restoreDirectionInput();
            return;
        }

        commitDirection(parsed);
    };

    const handleDirectionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleDirectionBlur();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            restoreDirectionInput();
            e.currentTarget.blur();
        }
    };

    const directionFromPointerEvent = (
        e: PointerEvent<HTMLButtonElement>,
    ): number => {
        if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) {
            return draftDialDirectionRef.current;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const directionDegrees = getWipeDirectionDegreesFromPoint({
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            pointX: e.clientX,
            pointY: e.clientY,
        });
        return e.shiftKey
            ? directionDegrees
            : snapWipeDirectionDegrees(directionDegrees);
    };

    const handleDialPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        isDraggingDialRef.current = true;
        setDraftDirection(directionFromPointerEvent(e));
    };

    const handleDialPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
        if (!isDraggingDialRef.current) return;
        setDraftDirection(directionFromPointerEvent(e));
    };

    const finishDialDrag = (e: PointerEvent<HTMLButtonElement>) => {
        if (!isDraggingDialRef.current) return;
        isDraggingDialRef.current = false;
        const nextDirection = directionFromPointerEvent(e);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        commitDirection(nextDirection);
    };

    const handleDialKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
        const step = e.shiftKey ? 15 : 1;
        let nextDirection: number | null = null;

        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            nextDirection = directionDegrees + step;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            nextDirection = directionDegrees - step;
        }
        if (e.key === "Home") nextDirection = 0;
        if (e.key === "End") nextDirection = 359;

        if (nextDirection == null) return;
        e.preventDefault();
        commitDirection(nextDirection);
    };

    const applyColor = (color: unknown) => {
        if (!isRgbaColor(color)) return;
        const nextHex = rgbaToHex6(color);
        setColorHex(nextHex);
        commitArgs({
            color: nextHex,
            directionDegrees,
        });
    };

    return (
        <div className="flex flex-col gap-12">
            <ColorPicker
                doNotUseForm
                disableAlpha
                className="px-0"
                label={
                    t("workspace.lightDesigner.effects.effectItem.color") ||
                    "Color"
                }
                initialColor={hex6ToRgba(colorHex)}
                defaultColor={hex6ToRgba(defaultWipeEffectArgs.color)}
                onBlur={applyColor}
            />
            <div className="flex items-center justify-between gap-6">
                <label
                    htmlFor={directionInputId}
                    className="text-body text-text/80"
                >
                    {t(
                        "workspace.lightDesigner.effects.effectItem.direction",
                    ) || "Direction"}
                </label>
                <div className="flex items-center gap-8">
                    <button
                        type="button"
                        role="slider"
                        aria-label={
                            t(
                                "workspace.lightDesigner.effects.effectItem.direction",
                            ) || "Direction"
                        }
                        aria-valuemin={0}
                        aria-valuemax={359}
                        aria-valuenow={directionDegrees}
                        className="border-stroke bg-fg-2 focus:border-accent relative h-36 w-36 rounded-full border focus-visible:outline-none"
                        onPointerDown={handleDialPointerDown}
                        onPointerMove={handleDialPointerMove}
                        onPointerUp={finishDialDrag}
                        onPointerCancel={finishDialDrag}
                        onKeyDown={handleDialKeyDown}
                    >
                        <span className="bg-text-subtitle/30 absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" />
                        <span
                            className="absolute inset-0"
                            style={{
                                transform: `rotate(${-directionDegrees}deg)`,
                            }}
                        >
                            <span className="bg-accent absolute top-1/2 right-3 h-8 w-8 -translate-y-1/2 rounded-full" />
                        </span>
                    </button>
                    <UnitInput
                        id={directionInputId}
                        unit="deg"
                        compact
                        type="number"
                        min={0}
                        max={359}
                        step={1}
                        className="w-[5.5rem]"
                        value={directionInput}
                        onChange={handleDirectionChange}
                        onBlur={handleDirectionBlur}
                        onKeyDown={handleDirectionKeyDown}
                    />
                </div>
            </div>
        </div>
    );
};
