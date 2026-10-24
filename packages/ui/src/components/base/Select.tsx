import React, { type ReactNode } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import type {
    SelectItemProps as RadixSelectItemProps,
    SelectProps as RadixSelectProps,
    SelectContentProps as RadixSelectContentProps,
    SelectTriggerProps as RadixSelectTriggerProps,
} from "@radix-ui/react-select";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CaretUpIcon, CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { forwardRef } from "react";
export interface SelectProps extends RadixSelectProps {
    children: React.ReactNode;
}
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
    ({ children, ...props }, ref) => {
        return (
            <RadixSelect.Root {...props}>
                {React.Children.map(children, (child) => {
                    if (
                        React.isValidElement(child) &&
                        (child.type === SelectTriggerButton ||
                            child.type === SelectTriggerText ||
                            child.type === SelectTriggerCompact)
                    ) {
                        return React.cloneElement(
                            child as React.ReactElement<any>,
                            { ref },
                        );
                    }
                    return child;
                })}
            </RadixSelect.Root>
        );
    },
);

export const SelectTriggerButton = forwardRef<
    HTMLButtonElement,
    RadixSelectTriggerProps & { label: string }
>(({ label, className, ...props }, ref) => {
    return (
        <RadixSelect.Trigger
            {...props}
            ref={ref}
            className={twMerge(
                clsx(
                    "rounded-6 border-stroke bg-fg-2 text-body text-text focus-visible:border-accent touch:h-44 flex h-[2.5rem] w-fit items-center justify-between gap-8 overflow-clip border px-22 duration-150 ease-out focus-visible:outline-none enabled:hover:-translate-y-[2px] enabled:active:translate-y-4 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                    className,
                ),
            )}
            aria-label={label}
        >
            <RadixSelect.Value placeholder={label} />
            <RadixSelect.Icon>
                <CaretDownIcon size={18} />
            </RadixSelect.Icon>
        </RadixSelect.Trigger>
    );
});

export const SelectTriggerText = forwardRef<
    HTMLButtonElement,
    RadixSelectTriggerProps & { label: string }
>(({ label, className }, ref) => {
    return (
        <RadixSelect.Trigger
            ref={ref}
            className={twMerge(
                clsx(
                    "text-body text-text enabled:hover:text-accent focus-visible:text-accent touch:min-h-44 flex h-fit w-fit items-center justify-center gap-2 p-0 leading-none outline-0 duration-150 ease-out data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                    className,
                ),
            )}
            aria-label={label}
        >
            <RadixSelect.Value placeholder={label} />
            <RadixSelect.Icon>
                <CaretDownIcon size={16} />
            </RadixSelect.Icon>
        </RadixSelect.Trigger>
    );
});

export const SelectTriggerCompact = forwardRef<
    HTMLButtonElement,
    RadixSelectTriggerProps & { label: string }
>(({ label, className }, ref) => {
    return (
        <RadixSelect.Trigger
            ref={ref}
            className={twMerge(
                clsx(
                    "rounded-6 border-stroke bg-fg-2 text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent touch:h-44 flex h-[1.625rem] min-h-0 w-fit min-w-0 items-center justify-center border px-8 py-[4px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                ),
            )}
            aria-label={label}
        >
            <RadixSelect.Value placeholder={label} />
        </RadixSelect.Trigger>
    );
});

/** A finger that moves more than this between press and release is scrolling, not choosing. */
const TAP_SLOP_PX = 10;
/** A tap this soon after the list scrolled is stopping a fling, not choosing. */
const FLING_STOP_MS = 200;

/**
 * Tracks presses in the list so only a real tap chooses an item with a finger
 * or pen: not a scroll drag (even one the browser cancelled), and not the tap
 * that stops a fling. Radix skips its own item click when the event is
 * default-prevented, so blocking it in the capture phase is enough.
 */
function useTouchTapOnly() {
    const press = React.useRef<{
        x: number;
        y: number;
        touch: boolean;
        invalid: boolean;
    } | null>(null);
    const lastScroll = React.useRef(0);
    return {
        onPointerDownCapture: (e: React.PointerEvent) => {
            const touch = e.pointerType === "touch" || e.pointerType === "pen";
            press.current = {
                x: e.clientX,
                y: e.clientY,
                touch,
                invalid:
                    touch &&
                    performance.now() - lastScroll.current < FLING_STOP_MS,
            };
        },
        onPointerMoveCapture: (e: React.PointerEvent) => {
            const p = press.current;
            if (
                p?.touch &&
                Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP_PX
            )
                p.invalid = true;
        },
        onPointerCancelCapture: () => {
            if (press.current?.touch) press.current.invalid = true;
        },
        onScrollCapture: () => {
            lastScroll.current = performance.now();
            if (press.current?.touch) press.current.invalid = true;
        },
        onClickCapture: (e: React.MouseEvent) => {
            if (press.current?.touch && press.current.invalid) {
                e.preventDefault();
                e.stopPropagation();
            }
            press.current = null;
        },
    };
}

export const SelectContent = ({ children }: RadixSelectContentProps) => {
    const tapOnly = useTouchTapOnly();

    // Open on the current choice. The viewport mounts each time the list opens;
    // Radix's own scroll runs before the popper has its final height, so a long
    // list opened at the top. Centre the choice once it has settled.
    const viewportRef = React.useCallback((viewport: HTMLDivElement | null) => {
        if (!viewport) return;
        const centre = () => {
            const checked = viewport.querySelector<HTMLElement>(
                '[data-state="checked"]',
            );
            if (!checked || viewport.scrollHeight <= viewport.clientHeight)
                return;
            viewport.scrollTop =
                checked.offsetTop -
                viewport.clientHeight / 2 +
                checked.offsetHeight / 2;
        };
        requestAnimationFrame(() => requestAnimationFrame(centre));
    }, []);

    return (
        <RadixSelect.Portal>
            <RadixSelect.Content
                position="popper"
                collisionPadding={8}
                className="rounded-6 border-stroke bg-modal data-[state='open']:animate-scale-in relative z-50 z-[9999] mt-4 max-h-[min(512px,var(--radix-select-content-available-height))] w-full max-w-[384px] overflow-hidden border px-22 font-sans backdrop-blur-3xl"
            >
                {/* A finger scrolls the list itself; these auto-scroll under a moving finger */}
                <RadixSelect.ScrollUpButton className="border-stroke text-text touch:hidden flex h-fit cursor-default items-center justify-center border-b py-2">
                    <CaretUpIcon size={18} />
                </RadixSelect.ScrollUpButton>
                <RadixSelect.Viewport
                    ref={viewportRef}
                    {...tapOnly}
                    className="touch:gap-0 touch:py-4 flex w-full flex-col gap-12 py-16"
                >
                    {children}
                </RadixSelect.Viewport>
                <RadixSelect.ScrollDownButton className="border-stroke text-text touch:hidden flex h-fit cursor-default items-center justify-center border-t py-2">
                    <CaretDownIcon size={18} />
                </RadixSelect.ScrollDownButton>
            </RadixSelect.Content>
        </RadixSelect.Portal>
    );
};

export type SelectItemProps = RadixSelectItemProps & {
    allowMultiline?: boolean;
};
export const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
    ({ children, allowMultiline, className, ...props }, forwardedRef) => {
        return (
            <RadixSelect.Item
                className={twMerge(
                    clsx(
                        "text-body text-text data-[state='checked']:text-accent touch:min-h-44 flex h-fit w-full cursor-pointer items-center justify-between gap-12 font-sans leading-none duration-150 ease-out outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:translate-x-2",
                        allowMultiline && "!items-start",
                        className,
                    ),
                )}
                {...props}
                ref={forwardedRef}
            >
                <RadixSelect.ItemText>
                    <span
                        className={twMerge(
                            clsx(
                                "text-body text-text w-full leading-none",
                                !allowMultiline && "truncate whitespace-nowrap",
                                allowMultiline && "whitespace-normal",
                            ),
                        )}
                    >
                        {children}
                    </span>
                </RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                    <CheckIcon size={20} />
                </RadixSelect.ItemIndicator>
            </RadixSelect.Item>
        );
    },
);

export const SelectGroup = ({ children }: { children: ReactNode }) => {
    return (
        <RadixSelect.Group className="flex flex-col gap-16">
            {children}
        </RadixSelect.Group>
    );
};

export const SelectLabel = ({ children }: { children: ReactNode }) => {
    return (
        <RadixSelect.Label className="text-sub text-text/90 w-full self-start px-24 text-left">
            {children}
        </RadixSelect.Label>
    );
};

export const SelectSeparator = () => {
    return <RadixSelect.Separator className="bg-stroke h-[1px] w-full" />;
};
