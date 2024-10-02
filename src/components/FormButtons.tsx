import { Button, ButtonProps } from "@/components/ui/Button";

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
 * @param ButtonProps - also accepts components/ui/Button props, for styling it.
 * @returns
 */
export default function FormButtons({
    handleCancel,
    handleSubmit = undefined,
    isEditingProp = true,
    setIsEditingProp = undefined,
    editButton = "Edit",
    ...rest
}: FormButtonsProps) {
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
                        <Button {...rest} onClick={handleSubmit}>
                            Save Changes
                        </Button>
                    ) : (
                        <Button {...rest}>Save Changes</Button>
                    )}
                    <Button {...rest} onClick={handleCancel}>
                        Cancel
                    </Button>
                </>
            )}
        </>
    );
}
