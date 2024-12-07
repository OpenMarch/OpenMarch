import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import type {
    RadioGroupProps as RadixRadioGroupProps,
    RadioGroupItemProps as RadixRadioGroupItemProps,
} from "@radix-ui/react-radio-group";
import React, { ReactNode } from "react";

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
                className="size-[28px] rounded-full border border-stroke bg-fg-2 transition-colors duration-150 ease-out data-[disabled]:cursor-not-allowed data-[state='checked']:bg-accent data-[disabled]:opacity-50"
                id={value}
                value={value}
                {...props}
            >
                <RadixRadioGroup.Indicator className="relative flex size-full items-center justify-center after:block after:size-14 after:rounded-full after:bg-black after:content-['']" />
            </RadixRadioGroup.Item>
            <label className="text-body leading-none text-text" htmlFor={value}>
                {children}
            </label>
        </div>
    );
};
