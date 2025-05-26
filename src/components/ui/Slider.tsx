import * as RadixSlider from "@radix-ui/react-slider";

interface SliderProps extends RadixSlider.SliderProps {
    className?: string;
}

export function Slider({ className, ...props }: SliderProps) {
    return (
        <RadixSlider.Root
            className={
                "h-5 relative flex w-full touch-none select-none items-center" +
                (className ? ` ${className}` : "")
            }
            {...props}
        >
            <RadixSlider.Track className="relative h-[3px] grow rounded-full bg-stroke">
                <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
            </RadixSlider.Track>
            <RadixSlider.Thumb
                className="block h-4 w-4 rounded-full bg-accent hover:bg-accent/80 focus:outline-none focus:ring-2 focus:ring-accent/50"
                aria-label="Value"
            />
        </RadixSlider.Root>
    );
}
