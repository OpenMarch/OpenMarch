import { useRegisteredActionsStore } from "@/stores/RegisteredActionsStore";
import {
    RegisteredAction,
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";
import { useRef, useEffect } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { TooltipContentProps } from "@radix-ui/react-tooltip";

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
                `RegisteredActionEnum does not contain ${enumString} for ${registeredAction.instructionalString}`,
            );
        const registeredActionEnum =
            RegisteredActionsEnum[
                registeredAction.enumString as keyof typeof RegisteredActionsEnum
            ];
        if (buttonRef.current)
            linkRegisteredAction(registeredActionEnum, buttonRef);

        // Remove on unmount
        return () => removeRegisteredAction(registeredActionEnum, buttonRef);
    }, [
        linkRegisteredAction,
        registeredAction.enumString,
        registeredAction.instructionalString,
        removeRegisteredAction,
    ]);

    if (showTooltip)
        return (
            <RadixTooltip.Root>
                <RadixTooltip.Trigger
                    {...rest}
                    ref={buttonRef}
                    className={twMerge(
                        clsx(
                            "enabled:hover:text-accent outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                            rest.className,
                        ),
                    )}
                >
                    {children}
                </RadixTooltip.Trigger>
                <TooltipContents side={tooltipPosition}>
                    {instructionalString
                        ? instructionalString
                        : registeredAction.instructionalString}
                </TooltipContents>
            </RadixTooltip.Root>
        );
    else
        return (
            <button
                {...rest}
                ref={buttonRef}
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

function TooltipContents({ children, ...rest }: TooltipContentProps) {
    return (
        <RadixTooltip.Portal>
            <RadixTooltip.Content
                {...rest}
                className={clsx(
                    rest.className,
                    "rounded-6 border-stroke bg-modal text-text shadow-modal backdrop-blur-32 z-[99] m-8 max-w-[80vw] border p-4",
                )}
            >
                {children}
            </RadixTooltip.Content>
        </RadixTooltip.Portal>
    );
}
