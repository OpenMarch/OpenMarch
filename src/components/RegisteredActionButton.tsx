import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { RegisteredAction, RegisteredActionsEnum } from "@/utilities/RegisteredActionsHandler";
import { useRef, useEffect } from "react";
import { Button } from "react-bootstrap";

interface registeredActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    registeredAction: RegisteredAction;
    children?: React.ReactNode;
}

/**
 * A registered action button triggers a RegisteredAction when clicked.
 * It also displays a tooltip with the instructions of the RegisteredAction in the top left corner of the screen.
 *
 * @param registeredAction The RegisteredActionObject to be triggered by the button.
 * @param children The content of the button.
 * @param rest The rest of the button props. (e.g. className, onClick, etc.)
 * @returns
 */
export default function RegisteredActionButton({ registeredAction, children, ...rest }: registeredActionButtonProps) {
    const { linkRegisteredAction } = useRegisteredActionsStore();
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const enumString = registeredAction.enumString;
        if (!Object.values(RegisteredActionsEnum).includes(enumString as RegisteredActionsEnum))
            console.error(`RegisteredActionEnum does not contain ${enumString} for ${registeredAction.instructionalString}`);
        const registeredActionEnum = RegisteredActionsEnum[registeredAction.enumString as keyof typeof RegisteredActionsEnum];
        if (buttonRef.current) linkRegisteredAction(registeredActionEnum, buttonRef);
    }, [linkRegisteredAction, registeredAction.enumString, registeredAction.instructionalString]);

    return (
        <Button
            title={registeredAction.instructionalString}
            aria-label={registeredAction.instructionalString}
            {...rest}
            ref={buttonRef}
            className={`${rest?.className ? rest.className : ""} group`}
        >
            {children}
            <span className="tooltip group-hover:opacity-100">
                {registeredAction.instructionalString}
            </span>
        </Button>
    );
}
