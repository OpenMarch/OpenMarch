/**
 * Building blocks shared by the overlay's floating panels (ui.md UI-2).
 */
import type { ReactNode } from "react";
import { Button, ToggleGroup, ToggleGroupItem } from "@openmarch/ui";
import clsx from "clsx";

/** A floating panel in the editor's overlay style. */
export function Panel({
    children,
    className,
    label,
    testId,
}: {
    children: ReactNode;
    className?: string;
    /** Accessible name for the group. */
    label?: string;
    testId?: string;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            data-testid={testId}
            className={clsx(
                "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-auto flex min-w-0 items-center gap-4 border p-4",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** A thin vertical rule between groups in a panel. */
export function PanelSeparator() {
    return <span className="bg-stroke mx-4 w-px self-stretch" aria-hidden />;
}

/**
 * A button in a panel, like Pick a seat or Play. With `pressed` it is an
 * on/off toggle, and pressed shows a soft accent fill. With `iconOnly`, the
 * label is only the accessible name.
 */
export function ToggleButton({
    pressed,
    onClick,
    icon,
    label,
    tooltip,
    tooltipSide = "bottom",
    iconOnly = false,
    disabled,
    testId,
}: {
    /** Undefined for a plain action button that has no on/off state. */
    pressed?: boolean;
    onClick: () => void;
    icon: ReactNode;
    label: string;
    tooltip?: string;
    tooltipSide?: "top" | "bottom" | "left" | "right";
    iconOnly?: boolean;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <Button
            variant="ghost"
            size="compact"
            content={iconOnly ? "icon" : "text"}
            aria-pressed={pressed}
            aria-label={label}
            tooltipText={tooltip}
            tooltipSide={tooltipSide}
            disabled={disabled}
            onClick={onClick}
            data-testid={testId}
            className={clsx(
                "rounded-4 text-text enabled:hover:bg-text/10 h-28 shrink-0 gap-6 border border-transparent whitespace-nowrap",
                iconOnly ? "size-28 p-0" : "px-10",
                pressed &&
                    "bg-accent/15 text-accent border-accent enabled:hover:bg-accent/20",
            )}
        >
            {icon}
            {!iconOnly && label}
        </Button>
    );
}

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    title?: string;
}

/**
 * A segmented control: one of several options, the active one in accent.
 * Built on the `ToggleGroup` primitive.
 */
export function Segmented<T extends string>({
    value,
    options,
    onChange,
    label,
    testId,
    className,
}: {
    value: T | null;
    options: readonly SegmentOption<T>[];
    onChange: (value: T) => void;
    label: string;
    testId?: string;
    /** Layout for the group, for example a grid instead of a row. */
    className?: string;
}) {
    return (
        <ToggleGroup
            type="single"
            value={value ?? ""}
            // Radix sends "" when the active item is clicked again; keep it.
            onValueChange={(next: string) => {
                if (next) onChange(next as T);
            }}
            aria-label={label}
            data-testid={testId}
            className={clsx(
                "h-auto! shrink-0 gap-2 border-0! bg-transparent! bg-none!",
                className,
            )}
        >
            {options.map((option) => (
                <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    title={option.title}
                    data-value={option.value}
                    className="text-body rounded-4! hover:bg-text/10! data-[state=on]:bg-accent! data-[state=on]:hover:bg-accent! data-[state=on]:text-text-invert! h-28 border-0! px-10! whitespace-nowrap"
                >
                    {option.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}
