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

export default function FormButtons({ handleCancel,
    handleSubmit = undefined, isEditingProp = true, setIsEditingProp = undefined,
    editButton = "Edit" }: FormButtonsProps) {
    return (
        <div style={{ display: 'flex' }}>
            {!isEditingProp ?
                <button
                    className="btn-primary rounded-md"
                    title="edit-form-button"
                    onClick={setIsEditingProp && (() => setIsEditingProp(true))}
                >
                    {editButton}
                </button>
                :
                <>
                    {/* handle if handleSubmit is a function */}
                    {handleSubmit ?
                        <button className="btn-primary rounded-md" title="Submit form button" onClick={handleSubmit}>
                            Save Changes
                        </button> :
                        <button className="btn-primary rounded-md" title="Submit form button" type="submit">
                            Save Changes
                        </button>
                    }
                    <button className="btn-secondary rounded-md mx-1"
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
