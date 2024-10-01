import { topBarComponentProps } from "@/global/Interfaces";
import ModalLauncher from "../topbar/ModalLauncher";
import FieldPropertiesSettings from "./FieldPropertiesSettings";
import { FaGear } from "react-icons/fa6";

export default function SettingsModal({ className }: topBarComponentProps) {
    function SettingsModalContents() {
        return (
            <div className="pb-6 mt-0 pt-0 text-gray-700 min-w-[50vw]">
                <FieldPropertiesSettings />
            </div>
        );
    }

    return (
        <ModalLauncher
            components={[SettingsModalContents()]}
            launchButton={<FaGear />}
            header="Settings"
            modalClassName="modal-xl"
            buttonClassName={`btn-primary rounded-md ${className}`}
        />
    );
}
