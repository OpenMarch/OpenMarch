import { Col, Row } from "react-bootstrap";
import ModalLauncher from "../toolbar/ModalLauncher";
import MarcherList from "./MarcherList";
import NewMarcherForm from "./NewMarcherForm";
import { useEffect, useState } from "react";
import FormButtons from "../FormButtons";
import { topBarComponentProps } from "@/global/Interfaces";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";

export default function MarcherListModal({ className }: topBarComponentProps) {
    const [listIsEditing, setListIsEditing] = useState(false);
    const [submitActivator, setSubmitActivator] = useState(false);
    const [cancelActivator, setCancelActivator] = useState(false);
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const { marchers } = useMarcherStore()!;

    // Turn off editing when the modal is closed/opened
    useEffect(() => {
        setListIsEditing(false);
    }, [modalIsOpen]);

    function MarcherModalContents() {
        return (
            <Row>
                <Col md={7} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <MarcherList isEditingStateProp={[listIsEditing, setListIsEditing]}
                        submitActivatorStateProp={[submitActivator, setSubmitActivator]}
                        cancelActivatorStateProp={[cancelActivator, setCancelActivator]} />
                    {/* <MarcherList /> */}
                </Col>
                <Col md={5} className="px-4">
                    <NewMarcherForm hasHeader={true} disabledProp={listIsEditing} />
                </Col>
            </Row>
        );
    }

    function editFormButtons() {
        return (
            <FormButtons handleCancel={() => setCancelActivator(true)} isEditingProp={listIsEditing}
                setIsEditingProp={setListIsEditing} editButton={"Edit Marchers"}
                handleSubmit={() => setSubmitActivator(true)} />
        );
    }

    return (
        <ModalLauncher
            components={[MarcherModalContents()]} launchButton="Marchers" header="Marchers" modalClassName="modal-xl"
            bottomButton={marchers.length > 0 && editFormButtons()} buttonClassName={`${className} rounded-lg`}
            setModelIsOpenProp={setModalIsOpen}
        />
    );
}
