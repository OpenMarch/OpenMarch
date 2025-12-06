import { TagIcon, XIcon } from "@phosphor-icons/react";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { T } from "@tolgee/react";

export default function TagsModalLauncher({
    label = <TagIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<TagsModalContents />}
            newContentId="@openmarch/tags"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

function TagsModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="tags.title" />
                </h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[30rem] grow flex-col gap-16 overflow-y-auto"></div>
        </div>
    );
}
