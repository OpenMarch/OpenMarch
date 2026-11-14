import { useEffect } from "react";
import clsx from "clsx";
import * as Popover from "@radix-ui/react-popover";
import { CaretDownIcon } from "@phosphor-icons/react";
import {
    DEFAULT_PIVOT,
    PIVOT_KEYS,
    isPivotKey,
    type Pivot,
    type PivotKey,
} from "../frame/frame";
import { keepFocus } from "./keepFocus";
import { Tip } from "@/components/ui/Tip";
import tolgee from "@/global/singletons/Tolgee";
import { setPivotPreview } from "../field/shapePointer";
import { screenCellOf, shapeKeyAt } from "./pivotScreen";
import { arrowFocus, useEditorMenu, useMenuFocus } from "./menuFocus";
import ActionButton from "@/shortcuts/ActionButton";

export const PIVOT_NAMES: Record<PivotKey, string> = {
    nw: "back left",
    n: "back",
    ne: "back right",
    w: "left",
    c: "center",
    e: "right",
    sw: "front left",
    s: "front",
    se: "front right",
};

/** A pivot's name, in the app's language */
export const pivotName = (key: PivotKey): string =>
    tolgee.t(`shapes.edit.pivot.names.${key}`, PIVOT_NAMES[key]);

/**
 * What turns, flips and scales go around: a corner, an edge's middle or the center. A shape's
 * pivot dragged elsewhere on the field (#350) lights none of them. In the inspector's Transform
 * section for a plain selection, and in the floating editor's pivot menu for a shape (#435).
 */
export function PivotGrid({
    pivot,
    onPick,
    onPreview,
    testId = "transform-pivot",
}: {
    pivot: Pivot;
    onPick: (key: PivotKey) => void;
    /** A cell pointed at or keyboard-focused, and null as it's left: shown, not picked (#437) */
    onPreview?: (key: PivotKey | null) => void;
    testId?: string;
}) {
    // One stop for Tab, on the pivot picked (the center for one dragged on the field); the arrows
    // move between the nine, Enter or Space picks (review)
    const stop = isPivotKey(pivot) ? pivot : "c";
    return (
        <div
            role="radiogroup"
            aria-label={tolgee.t("shapes.edit.pivot.label", "Pivot")}
            onKeyDown={(e) =>
                arrowFocus(
                    e,
                    [
                        ...e.currentTarget.querySelectorAll<HTMLElement>(
                            '[role="radio"]',
                        ),
                    ],
                    3,
                )
            }
            className="rounded-4 border-stroke grid shrink-0 grid-cols-3 gap-2 border p-4"
            data-testid={testId}
        >
            {PIVOT_KEYS.map((key) => (
                <Tip
                    key={key}
                    label={tolgee.t(
                        "shapes.edit.pivot.tip",
                        "Turn and flip around the {pivot}",
                        { pivot: pivotName(key) },
                    )}
                >
                    <button
                        type="button"
                        role="radio"
                        aria-checked={key === pivot}
                        tabIndex={key === stop ? 0 : -1}
                        aria-label={tolgee.t(
                            "shapes.edit.pivot.aria",
                            "Pivot: {pivot}",
                            { pivot: pivotName(key) },
                        )}
                        onPointerDown={keepFocus}
                        onClick={() => onPick(key)}
                        onPointerEnter={() => onPreview?.(key)}
                        onPointerLeave={() => onPreview?.(null)}
                        onFocus={() => onPreview?.(key)}
                        onBlur={() => onPreview?.(null)}
                        data-testid={`${testId}-${key}`}
                        className="flex size-16 items-center justify-center"
                    >
                        <span
                            className={clsx(
                                "block rounded-full",
                                key === pivot
                                    ? "bg-accent size-8"
                                    : "bg-text/30 hover:bg-accent/60 size-6",
                            )}
                        />
                    </button>
                </Tip>
            ))}
        </div>
    );
}

/** The pivot as a small 3 × 3 of dots, the pivot's lit; a pivot dragged elsewhere lights none */
function PivotGlyph({ pivot }: { pivot: Pivot }) {
    return (
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
            {PIVOT_KEYS.map((key, i) => {
                const on = key === pivot;
                return (
                    <circle
                        key={key}
                        cx={2 + (i % 3) * 5}
                        cy={2 + Math.floor(i / 3) * 5}
                        r={on ? 2 : 1.1}
                        fill="currentColor"
                        className={on ? "text-accent" : "opacity-60"}
                    />
                );
            })}
        </svg>
    );
}

/**
 * The floating editor's pivot (#435): a small button beside the turn whose icon shows the pivot,
 * opening the 3 × 3 grid. Picking one closes it. The grid is in screen terms (#437): its top-left
 * cell is whichever of the shape's points is at the top left now, however the shape is turned.
 * With the pivot away from the center, a row under the grid sends it back there, as a double-click
 * on the pivot does (`shapeCenterPivot`, tablet 1.5).
 */
export function PivotMenu({
    pivot,
    rotation,
    onPick,
    testId,
}: {
    /** The shape's pivot, in its own terms */
    pivot: Pivot;
    /** The shape's turn: the grid shows its points as they sit on screen (#437) */
    rotation: number;
    onPick: (key: PivotKey) => void;
    testId: string;
}) {
    // The grid, its icon and its preview in screen terms; what's picked back in the shape's
    const shown = isPivotKey(pivot) ? screenCellOf(rotation, pivot) : pivot;
    const [open, setOpen] = useEditorMenu();
    // The pivot a cell points at shows on the field until the menu closes (#437)
    useEffect(() => {
        if (!open) setPivotPreview(null);
        return () => setPivotPreview(null);
    }, [open]);
    // Opened by keyboard, focus goes to the pivot picked now (review)
    const focus = useMenuFocus((el) =>
        el.querySelector<HTMLElement>('[role="radio"][tabindex="0"]'),
    );
    const label = isPivotKey(shown)
        ? tolgee.t("shapes.edit.pivot.aria", "Pivot: {pivot}", {
              pivot: pivotName(shown),
          })
        : tolgee.t(
              "shapes.edit.pivot.custom",
              "Pivot: where it was dragged on the field",
          );
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label={label}>
                <Popover.Trigger asChild>
                    <button
                        type="button"
                        aria-label={label}
                        {...focus.trigger}
                        data-testid={testId}
                        data-pivot={isPivotKey(pivot) ? pivot : "custom"}
                        className="rounded-4 hover:text-accent flex min-h-24 items-center justify-center gap-2 p-4"
                    >
                        <PivotGlyph pivot={shown} />
                        <CaretDownIcon size={8} />
                    </button>
                </Popover.Trigger>
            </Tip>
            <Popover.Portal>
                <Popover.Content
                    side="bottom"
                    align="center"
                    sideOffset={6}
                    {...focus.content}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="rounded-6 border-stroke bg-bg-1 bg-modal shadow-modal z-50 border p-4"
                >
                    <PivotGrid
                        pivot={shown}
                        onPick={(cell) => {
                            onPick(shapeKeyAt(rotation, cell));
                            setOpen(false);
                        }}
                        onPreview={(cell) =>
                            setPivotPreview(cell && shapeKeyAt(rotation, cell))
                        }
                        testId={`${testId}-grid`}
                    />
                    {pivot !== DEFAULT_PIVOT && (
                        <ActionButton
                            action="shapeCenterPivot"
                            onRun={() => setOpen(false)}
                            data-testid={`${testId}-center`}
                            className="rounded-4 text-sub text-text hover:text-accent touch:min-h-44 mt-4 flex w-full items-center px-4 py-2"
                        >
                            {tolgee.t(
                                "shapes.edit.pivot.backToCenter",
                                "Back to the center",
                            )}
                        </ActionButton>
                    )}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
