import * as RadixSwitch from "@radix-ui/react-switch";
import type { SwitchProps as RadixSwitchProps } from "@radix-ui/react-switch";
import clsx from "clsx";
import { forwardRef } from "react";

export const Switch = forwardRef<HTMLButtonElement, RadixSwitchProps>(
    ({ className, ...props }, ref) => {
        const rootClassname = clsx(
            "bg-fg-2 relative h-[25px] w-[42px] cursor-pointer border focus-visible:outline-none border-stroke rounded-full focus-visible:border-accent bg-fg-2 disabled:cursor-not-allowed disabled:opacity-50 duration-150 ease-out",
            className,
        );
        const thumbClassname = clsx(
            "translate-x-[1px] block size-[20px] rounded-full bg-text/80 data-[state=checked]:bg-accent transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[17.5px]",
        );
        return (
            <RadixSwitch.Root ref={ref} className={rootClassname} {...props}>
                <RadixSwitch.Thumb className={thumbClassname} />
            </RadixSwitch.Root>
        );
    },
);

Switch.displayName = "Switch";
