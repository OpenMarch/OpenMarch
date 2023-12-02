import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

interface ModalLauncherProps {
    components: React.ReactNode[];
    buttonContent?: React.ReactNode | string;
    header?: string;
}

/**
 * A button that launches a modal with the given components and header
 *
 * @param components: React.ReactNode[] - One or more React components to be rendered in the modal
 * @param buttonContent: React.ReactNode | string - The content of the button that launches the modal
 * @param header: string - The header of the modal
 * @returns A button that launches a modal with the given components and header
 */
const ModalLauncher: React.FC<ModalLauncherProps> =
    ({ components, buttonContent = "Open Modal", header = "Modal" }) => {
        const [modalIsOpen, setModalIsOpen] = useState(false);

        const openModal = () => {
            setModalIsOpen(true);
        };

        const closeModal = () => {
            setModalIsOpen(false);
        };

        return (
            <div>
                <Button onClick={openModal}>{buttonContent}</Button>
                <Modal show={modalIsOpen} onHide={closeModal}>
                    <Modal.Header closeButton>
                        <Modal.Title>{header}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body className='modal-body'>
                        {components.map((component, index) => (
                            <React.Fragment key={index}>{component}</React.Fragment>
                        ))}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={closeModal}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>
            </div>
        );
    };

export default ModalLauncher;
