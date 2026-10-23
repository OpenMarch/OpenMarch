import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
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
import type { ActionId } from "@/shortcuts/definitions";
import {
    isActionEnabled,
    runAction,
    subscribeToActionHandlers,
} from "@/shortcuts/registry";

export type MovePadStep = "quarter" | "one" | "four";
type Direction = "Up" | "Down" | "Left" | "Right";

/**
 * Each pad step is an existing nudge variant, so a tap does exactly what the
 * matching arrow-key nudge does (same snapping, same undo).
 * ¼ step = Shift+arrow (no snap), 1 step = arrow, 4 steps = Mod+arrow.
 */
const STEP_VARIANT: Record<MovePadStep, "" | "Fine" | "Coarse"> = {
    quarter: "Fine",
    one: "",
    four: "Coarse",
};

export const movePadActionId = (
    direction: Direction,
    step: MovePadStep,
): ActionId =>
    `moveSelectedMarchers${direction}${STEP_VARIANT[step]}` as ActionId;

export const HOLD_REPEAT_DELAY_MS = 400;
export const HOLD_REPEAT_INTERVAL_MS = 120;

/**
 * Runs `run` once on press, then again every `interval` ms once the press has
 * been held for `delay` ms. Stops on release, cancel, leave or unmount.
 */
export function useHoldRepeat(
    run: () => void,
    {
        delay = HOLD_REPEAT_DELAY_MS,
        interval = HOLD_REPEAT_INTERVAL_MS,
    }: { delay?: number; interval?: number } = {},
) {
    const runRef = useRef(run);
    runRef.current = run;
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const repeat = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = useCallback(() => {
        if (timeout.current) clearTimeout(timeout.current);
        if (repeat.current) clearInterval(repeat.current);
        timeout.current = null;
        repeat.current = null;
    }, []);

    useEffect(() => stop, [stop]);

    const start = useCallback(() => {
        stop();
        runRef.current();
        timeout.current = setTimeout(() => {
            repeat.current = setInterval(() => runRef.current(), interval);
        }, delay);
    }, [delay, interval, stop]);

    return {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (event.button !== 0) return;
            start();
        },
        onPointerUp: stop,
        onPointerCancel: stop,
        onPointerLeave: stop,
        onBlur: stop,
        // A press already moved on pointerdown; only a keyboard "click" (Enter/Space, detail 0) moves here
        onClick: (event: React.MouseEvent<HTMLElement>) => {
            if (event.detail === 0) runRef.current();
        },
        // Keep a held finger from opening the browser's callout menu
        onContextMenu: (event: React.MouseEvent<HTMLElement>) =>
            event.preventDefault(),
    };
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
    const action = movePadActionId(direction, step);
    const runnable = useSyncExternalStore(subscribeToActionHandlers, () =>
        isActionEnabled(action),
    );
    const handlers = useHoldRepeat(() => runAction(action));
    const off = disabled || !runnable;
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            data-action={action}
            disabled={off}
            {...handlers}
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
    const sideLeft = sides?.verboseLeft ?? "Side 1";
    const sideRight = sides?.verboseRight ?? "Side 2";

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
