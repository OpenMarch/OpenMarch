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
                    "rounded-6 border-stroke bg-fg-2 text-body text-text focus-visible:border-accent flex h-[2.5rem] w-fit items-center justify-between gap-12 overflow-clip border px-22 duration-150 ease-out focus-visible:outline-hidden enabled:hover:-translate-y-[2px] enabled:active:translate-y-4 data-disabled:cursor-not-allowed data-disabled:opacity-50",
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
                    "text-body text-text enabled:hover:text-accent flex h-fit w-fit items-center justify-center gap-2 p-0 leading-none outline-1 duration-150 ease-out data-disabled:cursor-not-allowed data-disabled:opacity-50",
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
                    "rounded-6 border-stroke bg-fg-2 text-body text-text placeholder-text/50 placeholder:text-body focus:border-accent flex h-[1.625rem] min-h-0 w-fit min-w-0 items-center justify-center border px-8 py-[4px] focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
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
                className="rounded-6 border-stroke bg-modal data-[state='open']:animate-scale-in relative z-50 mt-4 max-h-[512px] w-full max-w-[384px] overflow-hidden border px-22 font-sans backdrop-blur-3xl"
            >
                <RadixSelect.ScrollUpButton className="border-stroke text-text flex h-fit cursor-default items-center justify-center border-b py-2">
                    <CaretUp size={18} />
                </RadixSelect.ScrollUpButton>
                <RadixSelect.Viewport className="flex w-full flex-col gap-12 py-16">
                    {children}
                </RadixSelect.Viewport>
                <RadixSelect.ScrollDownButton className="border-stroke text-text flex h-fit cursor-default items-center justify-center border-t py-2">
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
            className="text-body text-text data-[state='checked']:text-accent flex h-fit w-full cursor-pointer items-center justify-between gap-12 font-sans leading-none outline-hidden duration-150 ease-out select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:translate-x-2"
            {...props}
            ref={forwardedRef}
        >
            <RadixSelect.ItemText className="text-body text-text w-full truncate leading-none whitespace-nowrap">
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
        <RadixSelect.Label className="text-sub text-text/90 px-24">
            {children}
        </RadixSelect.Label>
    );
};

export const SelectSeparator = () => {
    return <RadixSelect.Separator className="bg-stroke h-px w-full" />;
};
