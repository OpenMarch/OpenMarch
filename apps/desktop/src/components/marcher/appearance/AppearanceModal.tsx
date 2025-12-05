import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    TabContent,
    TabItem,
    Tabs,
    TabsList,
    ToggleGroup,
    ToggleGroupItem,
} from "@openmarch/ui";
import { PaletteIcon, TagIcon, UsersIcon, XIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import { useCallback, useMemo, useState } from "react";
import SectionAppearanceList from "./SectionAppearanceList";
import TagAppearanceList from "./TagAppearanceList";

const APPEARANCE_CATEGORY_KEY = "appearanceModalCategory";

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

export function AppearanceModalContents() {
    const { toggleOpen } = useSidebarModalStore();
    const [selectedAppearanceCategory, setSelectedAppearanceCategoryState] =
        useState<"section" | "tag">(() => {
            const stored = localStorage.getItem(APPEARANCE_CATEGORY_KEY);
            return stored === "tag" ? "tag" : "section";
        });

    const setSelectedAppearanceCategory = useCallback(
        (category: "section" | "tag") => {
            setSelectedAppearanceCategoryState(category);
            localStorage.setItem(APPEARANCE_CATEGORY_KEY, category);
        },
        [],
    );

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            {/* Header */}
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

            <Tabs defaultValue="section">
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
                    <TagAppearanceList />
                </TabContent>
            </Tabs>
        </div>
    );
}
