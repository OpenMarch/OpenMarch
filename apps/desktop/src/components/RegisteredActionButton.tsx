import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import {
    RegisteredAction,
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";
import { useRef, useEffect } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { TooltipClassName } from "@openmarch/ui";

interface registeredActionButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    registeredAction: RegisteredAction;
    instructionalString?: string;
    children?: React.ReactNode;
    showTooltip?: boolean;
    tooltipPosition?: "top" | "bottom" | "left" | "right";
}

/**
 * A registered action button triggers a RegisteredAction when clicked.
 * It also displays a tooltip with the instructions of the RegisteredAction in the top left corner of the screen.
 *
 * @param registeredAction The RegisteredActionObject to be triggered by the button.
 * @param children The content of the button.
 * @param instructionalString The instructional string to be displayed in the tooltip. Optional, by default `registeredAction.instructionalString`.
 * @param showTooltip Whether to show the tooltip or not. Optional, by default `true`.
 * @param rest The rest of the button props. (e.g. className, onClick, etc.)
 * @returns
 */
// eslint-disable-next-line max-lines-per-function
export default function RegisteredActionButton({
    registeredAction,
    children,
    instructionalString,
    showTooltip = true,
    tooltipPosition = "top",
    ...rest
}: registeredActionButtonProps) {
    const { linkRegisteredAction, removeRegisteredAction } =
        useRegisteredActionsStore();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const enumString = registeredAction.enumString;
        if (
            !Object.values(RegisteredActionsEnum).includes(
                enumString as RegisteredActionsEnum,
            )
        )
            console.error(
                `RegisteredActionEnum does not contain ${enumString} for ${registeredAction.descKey}`,
            );
        const registeredActionEnum =
            RegisteredActionsEnum[
                registeredAction.enumString as keyof typeof RegisteredActionsEnum
            ];

        // Use a callback to ensure the button ref is set before linking
        const linkAction = () => {
            if (buttonRef.current) {
                linkRegisteredAction(registeredActionEnum, buttonRef);
            }
        };

        // Use setTimeout to ensure the ref is set after the component mounts
        const timeoutId = setTimeout(linkAction, 0);

        // Remove on unmount
        return () => {
            clearTimeout(timeoutId);
            removeRegisteredAction(registeredActionEnum, buttonRef);
        };
    }, [
        linkRegisteredAction,
        registeredAction.enumString,
        registeredAction.descKey,
        removeRegisteredAction,
    ]);

    // if (showTooltip)
    //     return (
    //         <RadixTooltip.Root>
    //             <RadixTooltip.Trigger
    //                 {...rest}
    //                 ref={buttonRef}
    //                 className={twMerge(
    //                     clsx(
    //                         "enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    //                         rest.className,
    //                     ),
    //                 )}
    //             >
    //                 {children}
    //             </RadixTooltip.Trigger>
    //             <RadixTooltip.Portal>
    //                 <RadixTooltip.Content
    //                     className={TooltipClassName}
    //                     side={tooltipPosition}
    //                 >
    //                     {instructionalString
    //                         ? instructionalString
    //                         : registeredAction.getInstructionalString()}
    //                 </RadixTooltip.Content>
    //             </RadixTooltip.Portal>
    //         </RadixTooltip.Root>
    //     );
    // else
    return (
        <button
            {...rest}
            ref={buttonRef}
            title={
                instructionalString
                    ? instructionalString
                    : registeredAction.getInstructionalString()
            }
            className={twMerge(
                clsx(
                    "enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                    rest.className,
                ),
            )}
        >
            {children}
        </button>
    );
}
