import { Col, Form, Row } from "react-bootstrap";
import ModalLauncher from "../ModalLauncher";
import MarcherList from "./MarcherList";
import NewMarcherForm from "./NewMarcherForm";
import { useState } from "react";
import FormButtons from "../FormButtons";
import { marcherListFormAttributes } from "../../Constants";

export default function MarcherListModal() {
    const [listIsEditing, setListIsEditing] = useState(false);
    const [submitActivator, setSubmitActivator] = useState(false);
    const [cancelActivator, setCancelActivator] = useState(false);

    function MarcherModalContents() {
        return (
            <Row>
                <Col md={7} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <MarcherList isEditingProp={listIsEditing} setIsEditingProp={setListIsEditing}
                        submitActivator={submitActivator} setSubmitActivator={setSubmitActivator}
                        cancelActivator={cancelActivator} setCancelActivator={setCancelActivator} />
                    {/* <MarcherList /> */}
                </Col>
                <Col md={5} className="px-4">
                    <NewMarcherForm hasHeader={true} />
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
            components={[MarcherModalContents()]} launchButton="Marchers" header="Marchers"
            className="modal-xl" bottomButton={editFormButtons()}
        />
    );
}
