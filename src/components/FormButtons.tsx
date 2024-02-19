import { Button } from "react-bootstrap";
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
                <Button
                    variant="primary"
                    title="edit-form-button"
                    onClick={setIsEditingProp && (() => setIsEditingProp(true))}
                >
                    {editButton}
                </Button>
                :
                <>
                    {/* handle if handleSubmit is a function */}
                    {handleSubmit ?
                        <Button variant="primary" title="Submit form button" onClick={handleSubmit}>
                            Save Changes
                        </Button> :
                        <Button variant="primary" title="Submit form button" type="submit">
                            Save Changes
                        </Button>
                    }
                    <Button variant="secondary"
                        title="Cancel form button"
                        type="button"
                        onClick={handleCancel}
                        className="mx-1"
                    >
                        Cancel
                    </Button>
                </>
            }
        </div>
    );
}
