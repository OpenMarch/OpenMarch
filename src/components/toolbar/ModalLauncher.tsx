import React, { useCallback, useEffect, useState } from "react";
import { FaX } from "react-icons/fa6";
import ToolbarSection from "./ToolbarSection";

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
                <ToolbarSection>
                    <button onClick={openModal} className={buttonClassName}>
                        {launchButton}
                    </button>
                </ToolbarSection>
            )}
            {modalIsOpen ? (
                <>
                    <div
                        className={`fixed inset-0 z-50 my-16 flex items-center justify-center outline-none focus:outline-none ${modalClassName}`}
                    >
                        <div className="relative mx-auto my-6 h-full w-auto max-w-3xl">
                            {/*content*/}
                            <div className="border-1 rounded relative flex max-h-full w-full flex-col bg-white shadow-lg outline-none focus:outline-none">
                                {/*header*/}
                                <div className="bg-gray-200 px-5 border-b-gray-400 rounded-t flex items-center border-0 border-b-2 border-solid">
                                    <h3 className="text-3xl text-gray-700 flex-grow font-sans">
                                        {header}
                                    </h3>
                                    <button
                                        className="px-1 text-gray-600 hover:text-gray-800 text-xl border-0 bg-transparent opacity-80 transition-all duration-150 hover:cursor-pointer"
                                        onClick={() => setModalIsOpen(false)}
                                    >
                                        <FaX />
                                    </button>
                                </div>
                                {/*body*/}
                                <div
                                    id="modal-body"
                                    className={
                                        "relative flex-auto overflow-scroll px-6 py-2 " +
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
                                <div className="bg-gray-200 p-3 border-t-gray-400 rounded-b flex items-center border-0 border-t-2 border-solid">
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
                    <div className="fixed inset-0 z-40 bg-black opacity-25"></div>
                </>
            ) : null}
        </>
    );
};

export default ModalLauncher;
