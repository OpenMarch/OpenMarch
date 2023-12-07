import { Col, Row } from "react-bootstrap";
import ModalLauncher from "../ModalLauncher";
// import MarcherList from "./MarcherList";
// import NewMarcherForm from "./NewMarcherForm";
import { useState } from "react";
import FormButtons from "../FormButtons";
import PageList from "./PageList";

export default function MarcherListModal() {
    const [listIsEditing, setListIsEditing] = useState(false);
    const [submitActivator, setSubmitActivator] = useState(false);
    const [cancelActivator, setCancelActivator] = useState(false);

    function PageModalContents() {
        return (
            <Row>
                <Col style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <PageList isEditingProp={listIsEditing} setIsEditingProp={setListIsEditing}
                        submitActivator={submitActivator} setSubmitActivator={setSubmitActivator}
                        cancelActivator={cancelActivator} setCancelActivator={setCancelActivator} />
                    {/* <MarcherList /> */}
                </Col>
                {/* <Col md={5} className="px-4">
                    <NewMarcherForm hasHeader={true} />
                </Col> */}
            </Row>
        );
    }

    function editFormButtons() {
        return (
            <FormButtons handleCancel={() => setCancelActivator(true)} isEditingProp={listIsEditing}
                setIsEditingProp={setListIsEditing} editButton={"Edit Pages"}
                handleSubmit={() => setSubmitActivator(true)} />
        );
    }

    return (
        <ModalLauncher
            components={[PageModalContents()]} launchButton="Pages" header="Pages"
            className="modal-l" bottomButton={editFormButtons()}
        />
    );
}
