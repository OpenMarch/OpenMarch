import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import {
    RegisteredAction,
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";
import { useRef, useEffect } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

interface registeredActionButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    registeredAction: RegisteredAction;
    instructionalString?: string;
    children?: React.ReactNode;
    showTooltip?: boolean;
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
    // idea
    // add "keyboardShortcut" prop with special mono font and outline
    if (showTooltip)
        return (
            <RadixTooltip.Root>
                <RadixTooltip.Trigger className="flex items-center">
                    <button
                        {...rest}
                        ref={buttonRef}
                        className={`${rest?.className ? rest.className : ""} group duration-150 ease-out hover:text-accent disabled:pointer-events-none disabled:opacity-50`}
                    >
                        {children}
                    </button>
                </RadixTooltip.Trigger>
                <RadixTooltip.Portal>
                    <RadixTooltip.Content
                        side="bottom"
                        className="z-[99] m-8 rounded-6 border border-stroke bg-fg-2 p-4 text-text backdrop-blur-2xl"
                    >
                        {instructionalString
                            ? instructionalString
                            : registeredAction.instructionalString}
                    </RadixTooltip.Content>
                </RadixTooltip.Portal>
            </RadixTooltip.Root>
        );
    else
        return (
            <button
                {...rest}
                ref={buttonRef}
                className={`${rest?.className ? rest.className : ""} group duration-150 ease-out hover:text-accent disabled:pointer-events-none disabled:opacity-50`}
            >
                {children}
            </button>
        );
}
