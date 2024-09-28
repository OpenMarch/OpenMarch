import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import {
    RegisteredAction,
    RegisteredActionsEnum,
} from "@/utilities/RegisteredActionsHandler";
import { useRef, useEffect } from "react";

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

    return (
        <button
            title={registeredAction.instructionalString}
            aria-label={registeredAction.instructionalString}
            {...rest}
            ref={buttonRef}
            className={`${rest?.className ? rest.className : ""} group duration-150 ease-out hover:text-accent disabled:pointer-events-none disabled:opacity-50`}
        >
            {children}
            {showTooltip && (
                <span className="absolute bottom-0 left-0 right-[90%] m-8 mb-36 w-auto min-w-max scale-0 rounded-6 border border-stroke bg-fg-1 p-6 text-body text-text opacity-0 drop-shadow-sm backdrop-blur-3xl transition-opacity duration-200 group-hover:scale-100 group-hover:opacity-100">
                    {instructionalString
                        ? instructionalString
                        : registeredAction.instructionalString}
                </span>
            )}
        </button>
    );
}
