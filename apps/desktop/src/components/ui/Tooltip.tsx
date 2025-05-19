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
                    "rounded-6 border-stroke bg-modal text-text shadow-modal backdrop-blur-32 z-99 m-8 border p-4",
                )}
            >
                {children}
            </RadixTooltip.Content>
        </RadixTooltip.Portal>
    );
}
