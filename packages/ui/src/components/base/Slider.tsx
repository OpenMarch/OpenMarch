import React from "react";
import * as RadixSlider from "@radix-ui/react-slider";
import { type SliderProps } from "@radix-ui/react-slider";

export function Slider({ "aria-label": ariaLabel, ...props }: SliderProps) {
    return (
        <RadixSlider.Root
            className="relative flex h-5 w-[200px] touch-none items-center select-none"
            {...props}
        >
            <RadixSlider.Track className="bg-stroke relative h-[3px] grow rounded-full">
                <RadixSlider.Range className="bg-accent/75 absolute h-full rounded-full" />
            </RadixSlider.Track>
            <RadixSlider.Thumb
                className="bg-accent block size-16 cursor-pointer rounded-full duration-150 hover:scale-110 focus:outline-none"
                aria-label={ariaLabel || "Slider"}
            />
        </RadixSlider.Root>
    );
}
