import * as RadixCheckbox from "@radix-ui/react-checkbox";
import type { CheckboxProps as RadixCheckboxProps } from "@radix-ui/react-checkbox";
import { Check } from "@phosphor-icons/react";

export type CheckboxProps = RadixCheckboxProps;

export const Checkbox = ({ ...props }: RadixCheckboxProps) => {
    return (
        <RadixCheckbox.Root
            className="rounded-6 border-stroke bg-fg-2 data-[state='checked']:bg-accent flex size-[28px] min-h-[28px] min-w-[28px] items-center justify-center border transition-colors duration-150 ease-out data-disabled:cursor-not-allowed data-disabled:opacity-50"
            {...props}
        >
            <RadixCheckbox.Indicator className="text-text-invert data-[state='checked']:animate-scale-in data-[state='unchecked']:animate-scale-out">
                <Check size={24} />
            </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
    );
};
