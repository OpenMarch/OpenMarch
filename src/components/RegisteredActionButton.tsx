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
}

/**
 * A registered action button triggers a RegisteredAction when clicked.
 * It also displays a tooltip with the instructions of the RegisteredAction in the top left corner of the screen.
 *
 * @param registeredAction The RegisteredActionObject to be triggered by the button.
 * @param children The content of the button.
 * @param instructionalString The instructional string to be displayed in the tooltip. Optional, by default `registeredAction.instructionalString`.
 * @param rest The rest of the button props. (e.g. className, onClick, etc.)
 * @returns
 */
export default function RegisteredActionButton({
    registeredAction,
    children,
    instructionalString,
    ...rest
}: registeredActionButtonProps) {
    const { linkRegisteredAction, removeRegisteredAction } =
        useRegisteredActionsStore();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const enumString = registeredAction.enumString;
        if (
            !Object.values(RegisteredActionsEnum).includes(
                enumString as RegisteredActionsEnum
            )
        )
            console.error(
                `RegisteredActionEnum does not contain ${enumString} for ${registeredAction.instructionalString}`
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
            className={`${rest?.className ? rest.className : ""} group`}
        >
            {children}
            <span
                className="absolute w-auto p-2 m-2 min-w-max
            bottom-0 right-[90%] left-0
            rounded-md shadow-md
            text-white bg-gray-900
            text-xs font-bold transition-opacity duration-200 opacity-0 scale-0 group-hover:opacity-100 group-hover:scale-100"
            >
                {instructionalString
                    ? instructionalString
                    : registeredAction.instructionalString}
            </span>
        </button>
    );
}
