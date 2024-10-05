import { useSidebarModalStore } from "@/stores/ui/sidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import MarcherList from "./MarcherList";
import MarcherNewForm from "./MarcherNewForm";
import { X, CaretLeft } from "@phosphor-icons/react";
import { Button } from "../ui/Button";

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
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
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
                        className="duration-150 ease-out hover:text-red"
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
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<MarcherListContents />);
                        }}
                        className="duration-150 ease-out hover:text-accent"
                    >
                        <CaretLeft size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Add Marchers</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="duration-150 ease-out hover:text-red"
                >
                    <X size={24} />
                </button>
            </header>
            <MarcherNewForm />
        </div>
    );
}
