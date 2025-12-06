import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { TabContent, TabItem, Tabs, TabsList } from "@openmarch/ui";
import { PaletteIcon, XIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import SectionAppearanceList from "./SectionAppearanceList";
import TagAppearanceList from "./TagAppearanceList";

export default function MetronomeModal({
    label = <PaletteIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<AppearanceModalContents />}
            newContentId="marcher-appearance"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

export function AppearanceModalContents({
    mode,
    launchArgs,
}: {
    mode?: "section" | "tag";
    launchArgs?: { targetTagId?: number; targetPageId?: number };
}) {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16 overflow-y-auto">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="marchers.marcherAppearance" />
                </h4>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <Tabs defaultValue={mode ?? "section"}>
                <TabsList>
                    <TabItem value="section">
                        <T keyName="marchers.sectionText" />
                    </TabItem>
                    <TabItem value="tag">
                        <T keyName="marchers.tagText" />
                    </TabItem>
                </TabsList>

                <TabContent value="section">
                    <SectionAppearanceList />
                </TabContent>
                <TabContent value="tag">
                    <TagAppearanceList
                        targetTagId={launchArgs?.targetTagId}
                        targetPageId={launchArgs?.targetPageId}
                    />
                </TabContent>
            </Tabs>
        </div>
    );
}
