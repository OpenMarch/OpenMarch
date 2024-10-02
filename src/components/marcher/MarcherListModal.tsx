import ModalLauncher from "../toolbar/ModalLauncher";
import MarcherListContents from "./MarcherListContents";
import NewMarcherForm from "./NewMarcherForm";
import { useEffect, useState } from "react";
import FormButtons from "../FormButtons";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { useSidebarModalStore } from "@/stores/ui/sidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { PencilSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

export default function MarcherListModal() {
    const { marchers } = useMarcherStore()!;
    const { setContent, toggleOpen } = useSidebarModalStore();

    function MarcherModalContents() {
        return (
            <div className="flex w-[21rem] flex-col gap-16 text-text">
                <header className="flex items-center justify-between">
                    <h4 className="text-h4 leading-none">Marchers</h4>
                    <Button variant="primary" size="compact">
                        Add
                    </Button>
                </header>
                <MarcherListContents />
            </div>
        );
    }
    function MarcherModalNew() {
        return (
            <div className="flex flex-col gap-16">
                <header className="flex justify-between">
                    <h4 className="text-h4 leading-none">Add Marchers</h4>
                    <div className="flex gap-8"></div>
                </header>
            </div>
        );
    }

    // Add modal content & turn off editing when the modal is closed/opened
    useEffect(() => {
        setContent(MarcherModalContents());
    }, [setContent]);

    /*return (
        <ModalLauncher
            components={[MarcherModalContents()]}
            launchButton="Marchers"
            header="Marchers"
            modalClassName=""
            bottomButton={marchers.length > 0 && editFormButtons()}
            buttonClassName={`btn-primary rounded-md`}
            setModelIsOpenProp={setModalIsOpen}
            bodyClassName="h-[75vh]"
        />
    ); */
    return <SidebarModalLauncher buttonLabel="Marchers" />;
}
