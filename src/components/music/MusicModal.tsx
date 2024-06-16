// import ModalLauncher from "../toolbar/ModalLauncher";
import { topBarComponentProps } from "@/global/Interfaces";
import ModalLauncher from "../toolbar/ModalLauncher";
import { FaMusic } from "react-icons/fa";
import AudioSelector from "./AudioSelector";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";
import MeasureEditor from "./MeasureEditor";
// import useMeasureStore from "@/stores/measure/useMeasureStore";
// import { OpenSheetMusicDisplay as OSMD } from "opensheetmusicdisplay";
// import { useState, useRef, useEffect } from "react";
// import { Vex } from "vexflow";


export default function MusicModal({ className }: topBarComponentProps) {

    function MeasureModalContents() {
        return (
            <div>
                <AudioSelector />
                <RegisteredActionButton
                    registeredAction={RegisteredActionsObjects.launchInsertAudioFileDialogue}
                    className="btn-secondary"
                >
                    Import new audio file
                </RegisteredActionButton>
                <MeasureEditor />
            </div>
        );
    }


    return (
        <ModalLauncher
            components={[MeasureModalContents()]} launchButton={<FaMusic />} header="Music Editor" modalClassName="modal-xl"
            buttonClassName={`btn-primary rounded-md ${className}`} bodyClassName="h-[75vh]"
        />
    );
}
