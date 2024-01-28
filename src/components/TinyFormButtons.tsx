import { Button } from "react-bootstrap";
import { FaEdit, FaTimes, FaCheck } from "react-icons/fa";

interface TinyFormButtonsProps {
    isEditing: boolean;
    setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
    handleCancel: () => void;
}

export default function TinyFormButtons({ isEditing, setIsEditing, handleCancel }: TinyFormButtonsProps) {
    return (
        <div className="edit-form-button-container">
            {!isEditing ?
                < Button size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    className="edit-form-button" variant="light"
                >
                    <FaEdit />
                </Button>
                :
                <>
                    <Button // Cancel button
                        size="sm" variant="outline-danger"
                        className="edit-form-button"
                        onClick={() => handleCancel()}
                    >
                        <FaTimes />
                    </Button>
                    <Button // Submit button
                        size="sm" variant="success"
                        className="edit-form-button"
                        type="submit"
                    >
                        <FaCheck />
                    </Button>
                </>
            }
        </div>
    );
}
