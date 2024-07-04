import React, { useCallback, useEffect, useState } from "react";
import { FaX } from "react-icons/fa6";

interface ModalLauncherProps {
    components: React.ReactNode[];
    launchButton?: React.ReactNode | string;
    header?: string;
    bottomButton?: React.ReactNode;
    modalClassName?: string;
    buttonClassName?: string;
    bodyClassName?: string;
    setModelIsOpenProp?: (isOpen: boolean) => void;
}

/**
 * A button that launches a modal with the given components and header
 *
 * @param components: React.ReactNode[] - One or more React components to be rendered in the modal
 * @param launchButton: React.ReactNode | string - The content of the button that launches the modal
 * @param header: string - The header of the modal
 * @param bottomButton: React.ReactNode - A button to be rendered at the bottom of the modal
 * @param modalClassName: string - The class name of the modal
 * @param buttonClassName: string - The class name of the button
 * @param bodyClassName: string - The class name of the modal body
 * @param setModelIsOpenProp: (isOpen: boolean) => void - A function to set the modal's open state
 * @returns A button that launches a modal with the given components and header
 */
const ModalLauncher: React.FC<ModalLauncherProps> = ({
    components,
    launchButton,
    header = "Modal",
    bottomButton = null,
    modalClassName = "",
    buttonClassName = "",
    bodyClassName = "",
    setModelIsOpenProp = () => {},
}) => {
    const [modalIsOpen, setModalIsOpen] = useState(false);

    const openModal = useCallback(() => {
        setModelIsOpenProp && setModelIsOpenProp(true);
        setModalIsOpen(true);
    }, [setModelIsOpenProp]);

    const closeModal = useCallback(() => {
        setModelIsOpenProp && setModelIsOpenProp(false);
        setModalIsOpen(false);
    }, [setModelIsOpenProp]);

    /** Close the modal when Esc is pressed */
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeModal();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [closeModal]);

    return (
        <>
            {launchButton && (
                <button onClick={openModal} className={buttonClassName}>
                    {launchButton}
                </button>
            )}
            {modalIsOpen ? (
                <>
                    <div
                        className={`justify-center items-center flex fixed inset-0 z-50 outline-none focus:outline-none my-16 ${modalClassName}`}
                    >
                        <div className="relative w-auto my-6 mx-auto max-w-3xl h-full">
                            {/*content*/}
                            <div className="max-h-full border-1 rounded shadow-lg relative flex flex-col w-full bg-white outline-none focus:outline-none">
                                {/*header*/}
                                <div className="bg-gray-200 flex items-center px-5 border-0 border-b-2 border-solid border-b-gray-400  rounded-t">
                                    <h3 className="text-3xl font-sans text-gray-700 flex-grow">
                                        {header}
                                    </h3>
                                    <button
                                        className="transition-all duration-150 hover:cursor-pointer px-1 bg-transparent border-0 text-gray-600 hover:text-gray-800 opacity-80 text-xl"
                                        onClick={() => setModalIsOpen(false)}
                                    >
                                        <FaX />
                                    </button>
                                </div>
                                {/*body*/}
                                <div
                                    id="modal-body"
                                    className={
                                        "relative py-2 px-6 overflow-scroll flex-auto " +
                                        bodyClassName
                                    }
                                >
                                    {components.map((component, index) => (
                                        <div className="h-full" key={index}>
                                            {component}
                                        </div>
                                    ))}
                                </div>
                                {/*footer*/}
                                <div className="flex bg-gray-200 items-center p-3 border-0 border-t-2 border-t-gray-400 border-solid rounded-b">
                                    <div className="flex-grow">
                                        {bottomButton || <div />}
                                    </div>
                                    <button
                                        className="btn-secondary rounded-md float-right"
                                        onClick={closeModal}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
                </>
            ) : null}
        </>
    );
};

export default ModalLauncher;
