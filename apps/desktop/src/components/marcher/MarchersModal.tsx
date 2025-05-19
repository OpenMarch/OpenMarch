import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import MarcherList from "./MarcherList";
import NewMarcherForm from "./NewMarcherForm";
import { X, CaretLeft } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";

export default function MarchersModal() {
    return (
        <SidebarModalLauncher
            contents={<MarcherListContents />}
            buttonLabel="Marchers"
        />
    );
}

export function MarcherListContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Marchers</h4>
                <div className="flex items-center gap-8">
                    <Button
                        onClick={() => {
                            setContent(<MarcherNewFormContents />);
                        }}
                        size="compact"
                    >
                        Add
                    </Button>
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <X size={24} />
                    </button>
                </div>
            </header>
            <MarcherList />
        </div>
    );
}
// Marcher add form
export function MarcherNewFormContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<MarcherListContents />);
                        }}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeft size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Add Marchers</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <X size={24} />
                </button>
            </header>
            <NewMarcherForm />
        </div>
    );
}
