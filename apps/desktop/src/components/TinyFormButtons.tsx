import { FaEdit, FaTimes, FaCheck } from "react-icons/fa";

interface TinyFormButtonsProps {
    isEditing: boolean;
    setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
    handleCancel: () => void;
}

export default function TinyFormButtons({
    isEditing,
    setIsEditing,
    handleCancel,
}: TinyFormButtonsProps) {
    return (
        <div className="edit-form-button-container">
            {!isEditing ? (
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="btn-secondary text-sm"
                >
                    <FaEdit />
                </button>
            ) : (
                <>
                    <button // Cancel button
                        className="btn-secondary text-sm"
                        onClick={() => handleCancel()}
                    >
                        <FaTimes />
                    </button>
                    <button // Submit button
                        className="btn-primary text-sm"
                        type="submit"
                    >
                        <FaCheck />
                    </button>
                </>
            )}
        </div>
    );
}
