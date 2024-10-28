import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { X, CaretLeft } from "@phosphor-icons/react";
import { Button } from "../ui/Button";
import NewPageForm from "./NewPageForm";
import PageList from "./PageList";

export default function PagesModal() {
    return (
        <SidebarModalLauncher
            contents={<PageListContents />}
            buttonLabel="Pages"
        />
    );
}

export function PageListContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Pages</h4>
                <div className="flex items-center gap-8">
                    <Button
                        onClick={() => {
                            setContent(<PageNewFormContents />);
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
            <PageList />
        </div>
    );
}
// Marcher add form
export function PageNewFormContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="flex w-fit animate-scale-in flex-col gap-16 text-text">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<PageListContents />);
                        }}
                        className="duration-150 ease-out hover:text-accent"
                    >
                        <CaretLeft size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Add Pages</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="duration-150 ease-out hover:text-red"
                >
                    <X size={24} />
                </button>
            </header>
            <NewPageForm />
        </div>
    );
}
