import ModalLauncher from "../toolbar/ModalLauncher";
import { useEffect, useState } from "react";
import FormButtons from "../FormButtons";
import PageList from "./PageList";
import NewPageForm from "./NewPageForm";
import { topBarComponentProps } from "@/global/Interfaces";
import { usePageStore } from "@/stores/PageStore";

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
            <div className="flex flex-grow flex-row h-full">
                <div className="h-[100%] w-3/5 overflow-scroll">
                    <PageList
                        isEditingStateProp={[listIsEditing, setListIsEditing]}
                        submitActivatorStateProp={[
                            submitActivator,
                            setSubmitActivator,
                        ]}
                        cancelActivatorStateProp={[
                            cancelActivator,
                            setCancelActivator,
                        ]}
                    />
                    {/* <MarcherList /> */}
                </div>
                <div className="w-2/5 px-4 overflow-scroll">
                    <NewPageForm
                        hasHeader={true}
                        disabledProp={listIsEditing}
                    />
                </div>
            </div>
        );
    }

    function editFormButtons() {
        return (
            <FormButtons
                handleCancel={() => setCancelActivator(true)}
                isEditingProp={listIsEditing}
                setIsEditingProp={setListIsEditing}
                editButton={"Edit Pages"}
                handleSubmit={() => setSubmitActivator(true)}
            />
        );
    }

    return (
        <ModalLauncher
            components={[PageModalContents()]}
            launchButton="Pages"
            header="Pages"
            modalClassName="modal-lg"
            bottomButton={pages.length > 0 && editFormButtons()}
            buttonClassName={`btn-primary ${className}`}
            setModelIsOpenProp={setModalIsOpen}
            bodyClassName="h-[75vh]"
        />
    );
}
