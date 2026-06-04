import { Button, ButtonProps } from "@openmarch/ui";
import {
    AlertDialog,
    AlertDialogTitle,
    AlertDialogContent,
    AlertDialogTrigger,
    AlertDialogDescription,
} from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";

interface FormButtonsProps extends ButtonProps {
    isEditingProp?: boolean;
    setIsEditingProp?: React.Dispatch<React.SetStateAction<boolean>>;
    editButton?: string | React.ReactNode;
    handleCancel: () => void;
    /**
     * Only used if the buttons are not a child of a form
     * @returns A function to be called when the form is submitted
     */
    handleSubmit?: () => void;
    isDangerButton?: boolean;
    alertDialogTitle?: string;
    alertDialogDescription?: string;
    alertDialogActions?: React.ReactNode;
}

/**
 * Form buttons for editing and submitting forms.
 * You can pass in state functions from the parent component to control the form.
 *
 * @param isEditingProp - A boolean state on whether the form is being edited
 * @param setIsEditingProp - A function to set the isEditingProp state
 * @param editButton - The text to display on the edit button
 * @param handleCancel - A function to call when the cancel button is clicked
 * @param handleSubmit - A function to call when the submit button is clicked. If not provided, the button will submit the form with the type="submit"
 * @param ButtonProps - Also accepts components/ui/Button props, for styling it.
 * @param isAlertButton - If true it will change the submit button to launch an AlertDialog
 * @param alertDialogTitle - Only use if isAlertButton - the title of the AlertDialog
 * @param alertDialogDescription - Only use if isAlertButton - the description of the AlertDialog
 * @param alertDialogActions - Only use if isAlertButton - use AlertDialogAction and AlertDialogCancel and buttons for the actions
 * @returns
 */
export default function FormButtons({
    handleCancel,
    handleSubmit = undefined,
    isEditingProp = true,
    setIsEditingProp = undefined,
    editButton = "Edit",
    isDangerButton,
    alertDialogTitle,
    alertDialogDescription,
    alertDialogActions,
    ...rest
}: FormButtonsProps) {
    const { t } = useTolgee();
    if (editButton === "Edit") {
        editButton = t("formButtons.editButton") || "Edit";
    }
    return (
        <>
            {!isEditingProp ? (
                <Button
                    {...rest}
                    onClick={setIsEditingProp && (() => setIsEditingProp(true))}
                >
                    {editButton}
                </Button>
            ) : (
                <>
                    {/* handle if handleSubmit is a function */}
                    {handleSubmit ? (
                        <>
                            {isDangerButton ? (
                                <AlertDialog>
                                    <AlertDialogTrigger>
                                        <Button {...rest}>Save Changes</Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogTitle>
                                            {alertDialogTitle}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {alertDialogDescription}
                                        </AlertDialogDescription>
                                        <div className="flex w-full justify-end gap-8">
                                            {alertDialogActions}
                                        </div>
                                    </AlertDialogContent>
                                </AlertDialog>
                            ) : (
                                <Button
                                    {...rest}
                                    onClick={handleSubmit}
                                    variant="primary"
                                >
                                    <T keyName="formButtons.saveChanges" />
                                </Button>
                            )}
                        </>
                    ) : (
                        <Button {...rest}>
                            <T keyName="formButtons.saveChanges" />
                        </Button>
                    )}
                    <Button
                        {...rest}
                        variant="secondary"
                        onClick={handleCancel}
                    >
                        <T keyName="formButtons.discardChanges" />
                    </Button>
                </>
            )}
        </>
    );
}
