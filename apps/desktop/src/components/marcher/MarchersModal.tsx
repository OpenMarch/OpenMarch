import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import MarcherList from "./MarcherList";
import NewMarcherForm from "./NewMarcherForm";
import { XIcon, CaretLeftIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import SectionAppearanceList from "./section/SectionAppearanceList";

export default function MarchersModal() {
    return (
        <SidebarModalLauncher
            contents={<MarcherListContents />}
            newContentId="marchers"
            buttonLabel={<UsersThreeIcon size={24} />}
        />
    );
}

export function MarcherListContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Marchers</h4>
                <div className="flex items-center gap-8">
                    <Button
                        onClick={() => {
                            setContent(<SectionAppearanceList />, "marchers");
                        }}
                        size="compact"
                        variant="secondary"
                    >
                        Section Styles
                    </Button>
                    <Button
                        onClick={() => {
                            setContent(<MarcherNewFormContents />, "marchers");
                        }}
                        size="compact"
                    >
                        Add
                    </Button>
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <MarcherList />
            </div>
        </div>
    );
}
// Marcher add form
export function MarcherNewFormContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<MarcherListContents />, "marchers");
                        }}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">Add Marchers</h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <NewMarcherForm />
            </div>
        </div>
    );
}
