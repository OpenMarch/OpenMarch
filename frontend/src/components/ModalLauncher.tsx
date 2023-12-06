import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

interface ModalLauncherProps {
    components: React.ReactNode[];
    launchButton?: React.ReactNode | string;
    header?: string;
    bottomButton?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * A button that launches a modal with the given components and header
 *
 * @param components: React.ReactNode[] - One or more React components to be rendered in the modal
 * @param launchButton: React.ReactNode | string - The content of the button that launches the modal
 * @param header: string - The header of the modal
 * @param bottomButton: React.ReactNode - A button to be rendered at the bottom of the modal
 * @param style: React.CSSProperties - The style of the modal
 * @param className: string - The class name of the modal
 * @returns A button that launches a modal with the given components and header
 */
const ModalLauncher: React.FC<ModalLauncherProps> =
    ({ components,
        launchButton = "Open Modal",
        header = "Modal",
        bottomButton = null,
        style = {},
        className = ""
    }) => {
        const [modalIsOpen, setModalIsOpen] = useState(false);

        const openModal = () => {
            setModalIsOpen(true);
        };

        const closeModal = () => {
            setModalIsOpen(false);
        };

        return (
            <div>
                <Button onClick={openModal} className='mx-2'>{launchButton}</Button>
                <Modal show={modalIsOpen} onHide={closeModal} style={style} className={className}>
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
