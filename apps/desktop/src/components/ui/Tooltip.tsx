import * as RadixTooltip from "@radix-ui/react-tooltip";
import { TooltipContentProps } from "@radix-ui/react-tooltip";
import { clsx } from "clsx";

export function TooltipContents({ children, ...rest }: TooltipContentProps) {
    return (
        <RadixTooltip.Portal>
            <RadixTooltip.Content
                {...rest}
                className={clsx(
                    rest.className,
                    "z-[99] m-8 rounded-6 border border-stroke bg-modal p-4 text-text shadow-modal backdrop-blur-32",
                )}
            >
                {children}
            </RadixTooltip.Content>
        </RadixTooltip.Portal>
    );
}
