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
            <div className="flex flex-grow flex-row h-full">
                <div className="h-[100%] w-3/5 overflow-scroll">
                    <MarcherList isEditingStateProp={[listIsEditing, setListIsEditing]}
                        submitActivatorStateProp={[submitActivator, setSubmitActivator]}
                        cancelActivatorStateProp={[cancelActivator, setCancelActivator]} />
                    {/* <MarcherList /> */}
                </div>
                <div className="w-2/5 px-4  overflow-scroll">
                    <NewMarcherForm hasHeader={true} disabledProp={listIsEditing} />
                </div>
            </div>
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
            components={[MarcherModalContents()]} launchButton="Marchers" header="Marchers" modalClassName=""
            bottomButton={marchers.length > 0 && editFormButtons()} buttonClassName={`btn-primary rounded-md ${className}`}
            setModelIsOpenProp={setModalIsOpen} bodyClassName="h-[75vh]"
        />
    );
}
