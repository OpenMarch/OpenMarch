interface FormButtonsProps {
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
 * @returns
 */
export default function FormButtons({ handleCancel,
    handleSubmit = undefined, isEditingProp = true, setIsEditingProp = undefined,
    editButton = "Edit" }: FormButtonsProps) {
    return (
        <div style={{ display: 'flex' }}>
            {!isEditingProp ?
                <button
                    className="btn-primary rounded"
                    title="edit-form-button"
                    type="button"
                    onClick={setIsEditingProp && (() => setIsEditingProp(true))}
                >
                    {editButton}
                </button>
                :
                <>
                    {/* handle if handleSubmit is a function */}
                    {handleSubmit ?
                        <button className="btn-primary rounded" title="Submit form button" type="button" onClick={handleSubmit}>
                            Save Changes
                        </button> :
                        <button className="btn-primary rounded" title="Submit form button" type="submit">
                            Save Changes
                        </button>
                    }
                    <button className="btn-secondary rounded mx-1"
                        title="Cancel form button"
                        type="button"
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>
                </>
            }
        </div>
    );
}
