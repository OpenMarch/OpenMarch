import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

interface ModalLauncherProps {
    components: React.ReactNode[];
    launchButton?: React.ReactNode | string;
    header?: string;
    bottomButton?: React.ReactNode;
    style?: React.CSSProperties;
    modalClassName?: string;
    buttonClassName?: string;
    setModelIsOpenProp?: (isOpen: boolean) => void;
}

/**
 * A button that launches a modal with the given components and header
 *
 * @param components: React.ReactNode[] - One or more React components to be rendered in the modal
 * @param launchButton: React.ReactNode | string - The content of the button that launches the modal
 * @param header: string - The header of the modal
 * @param bottomButton: React.ReactNode - A button to be rendered at the bottom of the modal
 * @param style: React.CSSProperties - The style of the modal
 * @param modalClassName: string - The class name of the modal
 * @param buttonClassName: string - The class name of the button
 * @param setModelIsOpenProp: (isOpen: boolean) => void - A function to set the modal's open state
 * @returns A button that launches a modal with the given components and header
 */
const ModalLauncher: React.FC<ModalLauncherProps> =
    ({ components,
        launchButton,
        header = "Modal",
        bottomButton = null,
        style = {},
        modalClassName = "",
        buttonClassName = "",
        setModelIsOpenProp = () => { }

    }) => {
        const [modalIsOpen, setModalIsOpen] = useState(false);

        const openModal = () => {
            setModelIsOpenProp && setModelIsOpenProp(true);
            setModalIsOpen(true);
        };

        const closeModal = () => {
            setModelIsOpenProp && setModelIsOpenProp(false);
            setModalIsOpen(false);
        };

        return (
            <div>
                {launchButton && <Button onClick={openModal} className={buttonClassName}>{launchButton}</Button>}
                <Modal
                    show={modalIsOpen} onHide={closeModal} style={style} className={modalClassName}
                >
                    <Modal.Header closeButton>
                        <Modal.Title>{header}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body className='modal-body'>
                        {components.map((component, index) => (
                            <React.Fragment key={index}>{component}</React.Fragment>
                        ))}
                    </Modal.Body>
                    <Modal.Footer className="justify-content-between">
                        {bottomButton || <div />}
                        <Button variant="secondary" onClick={closeModal}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>
            </div>
        );
    };

export default ModalLauncher;
