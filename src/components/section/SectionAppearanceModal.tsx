import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { X, CaretLeft } from "@phosphor-icons/react";
import { Button } from "../ui/Button";
import SectionAppearanceList from "./SectionAppearanceList";
import NewSectionAppearanceForm from "./NewSectionAppearanceForm";

export default function SectionAppearanceModal() {
    return (
        <SidebarModalLauncher
            contents={<SectionAppearanceListContents />}
            buttonLabel="Sections"
        />
    );
}

export function SectionAppearanceListContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Section Styles</h4>
                <div className="flex items-center gap-8">
                    <Button
                        onClick={() => {
                            setContent(<SectionAppearanceFormContents />);
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
            <SectionAppearanceList />
        </div>
    );
}

export function SectionAppearanceFormContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<SectionAppearanceListContents />);
                        }}
                        className="duration-150 ease-out hover:text-accent"
                    >
                        <CaretLeft size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Add Section Style</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="duration-150 ease-out hover:text-red"
                >
                    <X size={24} />
                </button>
            </header>
            <NewSectionAppearanceForm />
        </div>
    );
}
