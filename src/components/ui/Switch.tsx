import * as RadixSwitch from "@radix-ui/react-switch";
import type { SwitchProps as RadixSwitchProps } from "@radix-ui/react-switch";
import clsx from "clsx";

export type CheckboxProps = RadixSwitchProps;

export const Switch = ({ ...props }: RadixSwitchProps) => {
    const rootClassname = clsx(
        "bg-fg-2 relative h-[25px] w-[42px] cursor-pointer focus-visible:outline-none border-stroke rounded-full focus:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
    );
    const thumbClassname = clsx(
        "translate-x-0.5 block size-[21px] rounded-full bg-white shadow-[0_2px_2px] transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]",
    );
    return (
        <RadixSwitch.Root
            className={rootClassname}
            {...props}
            // style={{ "-webkit-tap-highlight-color": "rgba(0, 0, 0, 0)" }}
        >
            <RadixSwitch.Thumb className={thumbClassname} />
        </RadixSwitch.Root>
    );
};
