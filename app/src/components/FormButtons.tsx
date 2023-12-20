import { Button } from "react-bootstrap";
interface ListContainerProps {
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
    editButton = "Edit" }: ListContainerProps) {
    return (
        <div style={{ display: 'flex' }}>
            {!isEditingProp ?
                <Button variant="primary" onClick={setIsEditingProp && (() => setIsEditingProp(true))}>
                    {editButton}
                </Button>
                :
                <>
                    {handleSubmit ?
                        <Button variant="primary" onClick={handleSubmit}>
                            Save Changes
                        </Button> :
                        <Button variant="primary" type="submit">
                            Save Changes
                        </Button>
                    }
                    <Button variant="secondary" type="button" onClick={handleCancel} className="mx-1">
                        Cancel
                    </Button>
                </>
            }
        </div>
    );
}
