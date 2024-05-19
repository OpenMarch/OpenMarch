import { Col, Row } from "react-bootstrap";
import ModalLauncher from "../toolbar/ModalLauncher";
import { useEffect, useState } from "react";
import FormButtons from "../FormButtons";
import PageList from "./PageList";
import NewPageForm from "./NewPageForm";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/page/usePageStore";

export default function MarcherListModal({ className }: topBarComponentProps) {
    const [listIsEditing, setListIsEditing] = useState(false);
    const [submitActivator, setSubmitActivator] = useState(false);
    const [cancelActivator, setCancelActivator] = useState(false);
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const { pages } = usePageStore()!;

    // Turn off editing when the modal is closed/opened
    useEffect(() => {
        setListIsEditing(false);
    }, [modalIsOpen]);

    function PageModalContents() {
        return (
            <Row>
                <Col md={6} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <PageList isEditingStateProp={[listIsEditing, setListIsEditing]}
                        submitActivatorStateProp={[submitActivator, setSubmitActivator]}
                        cancelActivatorStateProp={[cancelActivator, setCancelActivator]} />
                    {/* <MarcherList /> */}
                </Col>
                <Col md={6} className="px-4">
                    <NewPageForm hasHeader={true} disabledProp={listIsEditing} />
                </Col>
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
            components={[PageModalContents()]} launchButton="Pages" header="Pages" modalClassName="modal-lg"
            bottomButton={pages.length > 0 && editFormButtons()} buttonClassName={`${className} rounded-lg`}
            setModelIsOpenProp={setModalIsOpen}
        />
    );
}
