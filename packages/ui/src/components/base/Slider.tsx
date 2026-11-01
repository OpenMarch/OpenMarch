import React from "react";
import * as RadixSlider from "@radix-ui/react-slider";
import { type SliderProps } from "@radix-ui/react-slider";
import { twMerge } from "tailwind-merge";

export function Slider({
    "aria-label": ariaLabel,
    className,
    ...props
}: SliderProps) {
    return (
        <RadixSlider.Root
            {...props}
            className={twMerge(
                "touch:h-44 relative flex h-5 w-[200px] touch-none items-center select-none",
                className,
            )}
        >
            <RadixSlider.Track className="bg-stroke relative h-[3px] grow rounded-full">
                <RadixSlider.Range className="bg-accent/75 absolute h-full rounded-full" />
            </RadixSlider.Track>
            <RadixSlider.Thumb
                className="bg-accent touch:size-20 touch:before:absolute touch:before:-inset-12 touch:before:rounded-full touch:before:content-[''] relative block size-16 cursor-pointer rounded-full duration-150 hover:scale-110 focus:outline-none"
                aria-label={ariaLabel || "Slider"}
            />
        </RadixSlider.Root>
    );
}
