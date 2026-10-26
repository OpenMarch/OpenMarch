import { useState, useSyncExternalStore } from "react";
import { useTolgee } from "@tolgee/react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
    ArrowDownIcon,
    ArrowLeftIcon,
    ArrowRightIcon,
    ArrowUpIcon,
} from "@phosphor-icons/react";
import { ToggleGroup, ToggleGroupItem } from "@openmarch/ui";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import { useIsTouchMode } from "@/stores/InputModeStore";
import {
    getActionDefinition,
    type ActionArgs,
    type ActionId,
} from "@/shortcuts/definitions";
import {
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";

export type MovePadStep = "quarter" | "one" | "four";
type Direction = "Up" | "Down" | "Left" | "Right";

/**
 * Each pad step moves exactly that far from where the marchers are, without
 * snapping to the grid (directors count relative steps). It runs the free nudge
 * variants: ¼ step = Fine, 1 step = Free with an exact one-step distance,
 * 4 steps = CoarseFree. Undo matches the arrow keys.
 */
const STEP_VARIANT: Record<MovePadStep, "Fine" | "Free" | "CoarseFree"> = {
    quarter: "Fine",
    one: "Free",
    four: "CoarseFree",
};

export const movePadActionId = (
    direction: Direction,
    step: MovePadStep,
): ActionId =>
    `moveSelectedMarchers${direction}${STEP_VARIANT[step]}` as ActionId;

/** The action and the args a pad press runs. */
export function movePadAction(
    direction: Direction,
    step: MovePadStep,
): { id: ActionId; args: ActionArgs } {
    const id = movePadActionId(direction, step);
    const args = getActionDefinition(id).args ?? {};
    // "Free" alone moves by the coordinate rounding (grid); the pad means exactly one step
    return step === "one"
        ? { id, args: { ...args, step: "one", snap: false } }
        : { id, args: { ...args, snap: false } };
}

function PadButton({
    direction,
    step,
    label,
    caption,
    disabled,
    className,
    children,
}: {
    direction: Direction;
    step: MovePadStep;
    label: string;
    caption: string;
    disabled: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    const { id: action, args } = movePadAction(direction, step);
    const runnable = useSyncExternalStore(subscribeToActionHandlers, () =>
        isActionEnabled(action),
    );
    const off = disabled || !runnable;
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            data-action={action}
            disabled={off}
            // One tap, one move. A long press explains the button instead (the app's long-press guard)
            onClick={() => runAction(action, args)}
            className={clsx(
                "border-stroke bg-fg-2 rounded-6 text-text flex min-h-44 min-w-44 touch-none flex-col items-center justify-center gap-2 border px-4 py-4 select-none [-webkit-touch-callout:none]",
                "active:bg-accent active:text-text-invert disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
        >
            {children}
            <span className="text-sub leading-none whitespace-nowrap">
                {caption}
            </span>
        </button>
    );
}

/**
 * On-screen nudges for the selected marchers: a d-pad plus a step size.
 * Touch mode only; with a mouse the arrow-key nudges do this already.
 */
export default function MovePad({ disabled = false }: { disabled?: boolean }) {
    const { t } = useTolgee();
    const isTouch = useIsTouchMode();
    const [step, setStep] = useState<MovePadStep>("one");
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());

    if (!isTouch) return null;

    const sides = fieldProperties?.sideDescriptions;
    const sideLeft = sides?.verboseLeft ?? t("inspector.marcher.move.side1");
    const sideRight = sides?.verboseRight ?? t("inspector.marcher.move.side2");

    return (
        <div className="flex flex-col gap-8" data-testid="move-pad">
            <div className="flex items-center justify-between gap-8">
                <h5 className="text-h5">{t("inspector.marcher.move.title")}</h5>
                <ToggleGroup
                    type="single"
                    value={step}
                    onValueChange={(value) => {
                        if (value) setStep(value as MovePadStep);
                    }}
                    aria-label={t("inspector.marcher.move.stepSize")}
                >
                    <ToggleGroupItem value="quarter" className="px-8">
                        {t("inspector.marcher.move.quarterStep")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="one" className="px-8">
                        {t("inspector.marcher.move.oneStep")}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="four" className="px-8">
                        {t("inspector.marcher.move.fourSteps")}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div className="grid grid-cols-3 grid-rows-3 gap-4 self-center">
                <PadButton
                    direction="Up"
                    step={step}
                    disabled={disabled}
                    className="col-start-2 row-start-1"
                    label={t("inspector.marcher.move.towardBack")}
                    caption={t("inspector.marcher.move.back")}
                >
                    <ArrowUpIcon size={20} weight="bold" />
                </PadButton>
                <PadButton
                    direction="Left"
                    step={step}
                    disabled={disabled}
                    className="col-start-1 row-start-2"
                    label={t("inspector.marcher.move.towardSide", {
                        side: sideLeft,
                    })}
                    caption={sideLeft}
                >
                    <ArrowLeftIcon size={20} weight="bold" />
                </PadButton>
                <PadButton
                    direction="Right"
                    step={step}
                    disabled={disabled}
                    className="col-start-3 row-start-2"
                    label={t("inspector.marcher.move.towardSide", {
                        side: sideRight,
                    })}
                    caption={sideRight}
                >
                    <ArrowRightIcon size={20} weight="bold" />
                </PadButton>
                <PadButton
                    direction="Down"
                    step={step}
                    disabled={disabled}
                    className="col-start-2 row-start-3"
                    label={t("inspector.marcher.move.towardFront")}
                    caption={t("inspector.marcher.move.front")}
                >
                    <ArrowDownIcon size={20} weight="bold" />
                </PadButton>
            </div>
        </div>
    );
}
