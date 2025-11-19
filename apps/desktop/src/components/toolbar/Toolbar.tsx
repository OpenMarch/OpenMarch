import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { FileTab } from "./tabs/FileTab";
import { CollisionsTab } from "./tabs/CollisionsTab";
import AlignmentTab from "./tabs/AlignmentTab";
import ViewTab from "./tabs/ViewTab";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { T } from "@tolgee/react";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import ShapeTab from "./tabs/ShapeTab";

export default function Topbar() {
    const { isFullscreen } = useFullscreenStore();
    const [activeTab, setActiveTab] = useState("alignment");
    const { selectedPage } = useSelectedPage()!;
    const { currentCollisions } = useCollisionStore();

    // Switch to "view" tab when entering fullscreen mode
    useEffect(() => {
        if (isFullscreen) {
            setActiveTab("view");
        }
        if (!isFullscreen) {
            setActiveTab("alignment");
        }
    }, [isFullscreen]);

    // Switch from collisions tab to alignment when page changes and no collisions exist
    useEffect(() => {
        if (activeTab === "collisions" && currentCollisions.length === 0) {
            setActiveTab("alignment");
        }
    }, [selectedPage, currentCollisions.length, activeTab]);

    return (
        <div
            className={clsx("group", {
                "border-stroke bg-modal backdrop-blur-32 shadow-modal absolute z-50 w-full rounded-[18px] border p-8":
                    isFullscreen,
            })}
        >
            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className={clsx(
                    "flex flex-col gap-0 overflow-hidden transition-[max-height,opacity] duration-250 ease-in-out",
                    {
                        "pointer-events-none max-h-4 flex-row items-center gap-8 opacity-0":
                            isFullscreen,
                        "group-hover:pointer-events-auto group-hover:max-h-[80px] group-hover:opacity-100":
                            isFullscreen,
                    },
                )}
            >
                <TabsList className="gap-0 border-none">
                    <TabItem value="file">
                        <T keyName="inspector.shape.fileTab" />
                    </TabItem>
                    {!isFullscreen && (
                        <TabItem value="alignment">
                            <T keyName="inspector.shape.alignmentTab" />
                        </TabItem>
                    )}
                    {!isFullscreen && (
                        <TabItem value="shapes">
                            <T keyName="inspector.shape.shapesTab" />
                        </TabItem>
                    )}
                    <TabItem value="view">
                        <T keyName="inspector.shape.viewTab" />
                    </TabItem>
                    {selectedPage && currentCollisions.length > 0 && (
                        <TabItem value="collisions">
                            <div className="flex items-center gap-4">
                                <WarningIcon
                                    width={18}
                                    height={18}
                                    className="text-yellow size-20"
                                />
                                {/*<T keyName="inspector.shape.collisionsTab" /> */}
                                Collisions
                            </div>
                        </TabItem>
                    )}
                </TabsList>

                <TabContent value="file">
                    <FileTab />
                </TabContent>

                {!isFullscreen && (
                    <TabContent value="alignment">
                        <AlignmentTab />
                    </TabContent>
                )}
                {!isFullscreen && (
                    <TabContent value="shapes">
                        <ShapeTab />
                    </TabContent>
                )}

                <TabContent value="view">
                    <ViewTab />
                </TabContent>

                <TabContent value="collisions">
                    <CollisionsTab />
                </TabContent>
            </Tabs>
        </div>
    );
}
