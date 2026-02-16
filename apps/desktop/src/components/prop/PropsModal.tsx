import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import PropList from "./PropList";
import NewPropForm from "./NewPropForm";
import PropToolSelector from "./PropToolSelector";
import PropEditForm from "./PropEditForm";
import { XIcon, CaretLeftIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { CubeIcon } from "@phosphor-icons/react";
import { PropWithMarcher } from "@/global/classes/Prop";

export default function PropsModal() {
    return (
        <SidebarModalLauncher
            contents={<PropListContents />}
            newContentId="props"
            buttonLabel={<CubeIcon size={24} />}
        />
    );
}

export function PropListContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    const handleEditProp = (prop: PropWithMarcher) => {
        setContent(<PropEditContents prop={prop} />, "props");
    };

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Props</h4>
                <div className="flex items-center gap-8">
                    <Button
                        onClick={() => {
                            setContent(<PropNewFormContents />, "props");
                        }}
                        size="compact"
                    >
                        Add Prop
                    </Button>
                    <button
                        onClick={toggleOpen}
                        aria-label="Close props modal"
                        title="Close props modal"
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <PropToolSelector />
                <div className="border-stroke border-t pt-12">
                    <PropList onEditProp={handleEditProp} />
                </div>
            </div>
        </div>
    );
}

export function PropEditContents({ prop }: { prop: PropWithMarcher }) {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<PropListContents />, "props");
                        }}
                        aria-label="Back to props list"
                        title="Back to props list"
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Edit Prop</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    aria-label="Close props modal"
                    title="Close props modal"
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <PropEditForm prop={prop} />
            </div>
        </div>
    );
}

export function PropNewFormContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<PropListContents />, "props");
                        }}
                        className="hover:text-accent duration-150 ease-out"
                        aria-label="Back to list"
                        title="Back to list"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Add Prop</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                    aria-label="Close"
                    title="Close"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <NewPropForm
                    onSuccess={() => {
                        setContent(<PropListContents />, "props");
                    }}
                />
            </div>
        </div>
    );
}
