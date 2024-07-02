// import ModalLauncher from "../toolbar/ModalLauncher";
import { topBarComponentProps } from "@/global/Interfaces";
import ModalLauncher from "../toolbar/ModalLauncher";
import { FaMusic } from "react-icons/fa";
import AudioSelector from "./AudioSelector";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import RegisteredActionButton from "../RegisteredActionButton";
import MeasureEditor from "./MeasureEditor";

export default function MusicModal({ className }: topBarComponentProps) {
    function MeasureModalContents() {
        return (
            <div className="pb-6 mt-0 pt-0">
                <h3 className="text-3xl w-full border-0 border-b-2 border-solid border-gray-400">
                    Measures
                </h3>
                <div id="measure editing container">
                    <MeasureEditor />
                    <div id="music xml importing container" className="mt-4">
                        <RegisteredActionButton
                            registeredAction={
                                RegisteredActionsObjects.launchImportMusicXmlFileDialogue
                            }
                            className="btn-primary w-full"
                        >
                            Import MusicXML file
                        </RegisteredActionButton>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <h3 className="text-3xl w-full border-0 border-b-2 border-solid border-gray-400">
                        Audio
                    </h3>
                    <AudioSelector />
                    <RegisteredActionButton
                        registeredAction={
                            RegisteredActionsObjects.launchInsertAudioFileDialogue
                        }
                        className="btn-secondary"
                    >
                        Import new audio file
                    </RegisteredActionButton>
                </div>
            </div>
        );
    }

    return (
        <ModalLauncher
            components={[MeasureModalContents()]}
            launchButton={<FaMusic />}
            header="Music Editor"
            modalClassName="modal-xl"
            buttonClassName={`btn-primary rounded-md ${className}`}
        />
    );
}
