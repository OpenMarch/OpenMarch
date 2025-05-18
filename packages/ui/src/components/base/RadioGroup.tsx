import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import type {
    RadioGroupProps as RadixRadioGroupProps,
    RadioGroupItemProps as RadixRadioGroupItemProps,
} from "@radix-ui/react-radio-group";
import React, { type ReactNode } from "react";

export type RadioGroupProps = RadixRadioGroupProps & { children: ReactNode };

export const RadioGroup = ({ children, ...props }: RadioGroupProps) => {
    return (
        <RadixRadioGroup.Root
            className="flex flex-col gap-4"
            aria-label="View density"
            {...props}
        >
            {children}
        </RadixRadioGroup.Root>
    );
};

export type RadioGroupItemProps = RadixRadioGroupItemProps;

export const RadioGroupItem = ({
    children,
    value,
    ...props
}: RadioGroupItemProps) => {
    return (
        <div className="flex items-center gap-8">
            <RadixRadioGroup.Item
                className="border-stroke bg-fg-2 data-[state='checked']:bg-accent size-[28px] rounded-full border transition-colors duration-150 ease-out data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                id={value}
                value={value}
                {...props}
            >
                <RadixRadioGroup.Indicator className="relative flex size-full items-center justify-center after:block after:size-14 after:rounded-full after:bg-black after:content-['']" />
            </RadixRadioGroup.Item>
            <label className="text-body text-text leading-none" htmlFor={value}>
                {children}
            </label>
        </div>
    );
};
