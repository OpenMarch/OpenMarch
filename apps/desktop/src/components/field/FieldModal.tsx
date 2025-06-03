import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { X } from "@phosphor-icons/react";
import FieldProperties from "./FieldPropertiesSettings";

export default function FieldModal() {
    return (
        <SidebarModalLauncher
            contents={<FieldPropertiesContents />}
            buttonLabel="Field"
        />
    );
}

export function FieldPropertiesContents() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Field</h4>
                <div className="flex items-center gap-8">
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <X size={24} />
                    </button>
                </div>
            </header>
            <hr />
            <div className="flex grow flex-col gap-16 overflow-scroll">
                <FieldProperties />
            </div>
        </div>
    );
}
