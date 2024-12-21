import React, { ReactNode } from "react";
import * as RadixSelect from "@radix-ui/react-select";
import {
    SelectItemProps as RadixSelectItemProps,
    SelectProps as RadixSelectProps,
    SelectContentProps as RadixSelectContentProps,
    SelectTriggerProps as RadixSelectTriggerProps,
} from "@radix-ui/react-select";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CaretUp, CaretDown, Check } from "@phosphor-icons/react";
import { forwardRef } from "react";

export type SelectProps = RadixSelectProps & {
    children: React.ReactNode;
};
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
                        return React.cloneElement(child, {
                            ...child.props,
                            ref: ref as any, // or use a more specific type if needed
                        });
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
>(({ label, className }, ref) => {
    return (
        <RadixSelect.Trigger
            className={twMerge(
                clsx(
                    "flex h-[2.5rem] w-fit items-center justify-between gap-12 overflow-clip rounded-6 border border-stroke bg-fg-2 px-22 text-body text-text duration-150 ease-out focus-visible:border-accent focus-visible:outline-none enabled:hover:-translate-y-[2px] enabled:active:translate-y-4 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                    className,
                ),
            )}
            aria-label={label}
        >
            <RadixSelect.Value placeholder={label} />
            <RadixSelect.Icon>
                <CaretDown size={24} />
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
                    "flex h-fit w-fit items-center justify-center gap-2 p-0 text-body leading-none text-text outline-1 duration-150 ease-out enabled:hover:text-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                    className,
                ),
            )}
            aria-label={label}
        >
            <RadixSelect.Value placeholder={label} />
            <RadixSelect.Icon>
                <CaretDown size={16} />
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
                    "flex h-[1.625rem] min-h-0 w-fit min-w-0 items-center justify-center rounded-6 border border-stroke bg-fg-2 px-8 py-[4px] text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                ),
            )}
            aria-label={label}
        >
            <RadixSelect.Value placeholder={label} />
        </RadixSelect.Trigger>
    );
});

export const SelectContent = ({ children }: RadixSelectContentProps) => {
    return (
        <RadixSelect.Portal>
            <RadixSelect.Content
                position="popper"
                className="relative z-50 mt-4 max-h-[512px] w-full max-w-[384px] overflow-hidden rounded-6 border border-stroke bg-modal px-22 font-sans backdrop-blur-3xl data-[state='open']:animate-scale-in"
            >
                <RadixSelect.ScrollUpButton className="flex h-fit cursor-default items-center justify-center border-b border-stroke py-2 text-text">
                    <CaretUp size={18} />
                </RadixSelect.ScrollUpButton>
                <RadixSelect.Viewport className="flex w-full flex-col gap-12 py-16">
                    {children}
                </RadixSelect.Viewport>
                <RadixSelect.ScrollDownButton className="flex h-fit cursor-default items-center justify-center border-t border-stroke py-2 text-text">
                    <CaretDown size={18} />
                </RadixSelect.ScrollDownButton>
            </RadixSelect.Content>
        </RadixSelect.Portal>
    );
};

export type SelectItemProps = RadixSelectItemProps;
export const SelectItem = React.forwardRef<
    HTMLDivElement,
    RadixSelectItemProps
>(({ children, ...props }, forwardedRef) => {
    return (
        <RadixSelect.Item
            className="flex h-fit w-full cursor-pointer select-none items-center justify-between gap-12 font-sans text-body leading-none text-text outline-none duration-150 ease-out data-[disabled]:pointer-events-none data-[highlighted]:translate-x-2 data-[state='checked']:text-accent data-[disabled]:opacity-50"
            {...props}
            ref={forwardedRef}
        >
            <RadixSelect.ItemText className="w-full truncate whitespace-nowrap text-body leading-none text-text">
                {children}
            </RadixSelect.ItemText>
            <RadixSelect.ItemIndicator>
                <Check size={20} />
            </RadixSelect.ItemIndicator>
        </RadixSelect.Item>
    );
});

export const SelectGroup = ({ children }: { children: ReactNode }) => {
    return (
        <RadixSelect.Group className="flex flex-col gap-16">
            {children}
        </RadixSelect.Group>
    );
};

export const SelectLabel = ({ children }: { children: ReactNode }) => {
    return (
        <RadixSelect.Label className="px-24 text-sub text-text/90">
            {children}
        </RadixSelect.Label>
    );
};

export const SelectSeparator = () => {
    return <RadixSelect.Separator className="h-[1px] w-full bg-stroke" />;
};
