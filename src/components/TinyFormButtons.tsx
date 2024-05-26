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
                < button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-sm btn-secondary"
                >
                    <FaEdit />
                </button>
                :
                <>
                    <button // Cancel button
                        className="text-sm btn-secondary"
                        onClick={() => handleCancel()}
                    >
                        <FaTimes />
                    </button>
                    <button // Submit button
                        className="text-sm btn-primary"
                        type="submit"
                    >
                        <FaCheck />
                    </button>
                </>
            }
        </div>
    );
}
