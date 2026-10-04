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

/** A small uppercase mono label inside a panel. */
export function PanelLabel({ children }: { children: ReactNode }) {
    return (
        <span className="text-sub text-text/60 shrink-0 px-6 font-mono tracking-wide uppercase">
            {children}
        </span>
    );
}

/** A thin vertical rule between groups in a panel. */
export function PanelSeparator() {
    return <span className="bg-stroke mx-4 w-px self-stretch" aria-hidden />;
}

/**
 * An on/off button in a panel, like Crowd and Pick a seat. Pressed shows a
 * soft accent fill. With `iconOnly`, the label is only the accessible name.
 */
export function ToggleButton({
    pressed,
    onClick,
    icon,
    label,
    tooltip,
    iconOnly = false,
    disabled,
    testId,
}: {
    pressed: boolean;
    onClick: () => void;
    icon: ReactNode;
    label: string;
    tooltip?: string;
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
            tooltipSide="bottom"
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
}: {
    value: T | null;
    options: readonly SegmentOption<T>[];
    onChange: (value: T) => void;
    label: string;
    testId?: string;
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
            className="h-auto! shrink-0 gap-2 border-0! bg-transparent! bg-none!"
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
