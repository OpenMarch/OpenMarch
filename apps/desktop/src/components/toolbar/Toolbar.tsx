import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { FileTab } from "./tabs/FileTab";
import { CollisionsTab } from "./tabs/CollisionsTab";
import AlignmentTab from "./tabs/AlignmentTab";
import ViewTab from "./tabs/ViewTab";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { T, useTolgee } from "@tolgee/react";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import SelectTab from "./tabs/SelectTab";

/**
 * Touch mode: each tab is one row that scrolls sideways, so the toolbar keeps
 * its height whatever the tab shows (a wrapping second row made the field jump
 * under the finger, e.g. Select by > Tag with no tags).
 */
const tabRowClassName =
    "touch:[&>div]:flex-nowrap touch:[&>div]:overflow-x-auto touch:[&>div]:[scrollbar-width:none] touch:[&>div>*]:shrink-0";

export default function Topbar() {
    const { isFullscreen } = useFullscreenStore();
    const [activeTab, setActiveTab] = useState("alignment");
    const { selectedPage } = useSelectedPage()!;
    const { currentCollisions } = useCollisionStore();
    const { t } = useTolgee();
    // In fullscreen the toolbar hides until hovered; a tablet can't hover, so a button pins it open
    const [shownInFullscreen, setShownInFullscreen] = useState(false);
    const collapsed = isFullscreen && !shownInFullscreen;

    // Switch to "view" tab when entering fullscreen mode
    useEffect(() => {
        if (isFullscreen) {
            setActiveTab("view");
        }
        if (!isFullscreen) {
            setActiveTab("alignment");
            setShownInFullscreen(false);
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
            data-toolbar
            className={clsx("group", {
                "border-stroke bg-modal backdrop-blur-32 shadow-modal absolute z-50 flex w-full items-start gap-8 rounded-[18px] border p-8":
                    isFullscreen,
            })}
        >
            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className={clsx(
                    "flex flex-col gap-0 overflow-hidden transition-[max-height,opacity] duration-250 ease-in-out",
                    {
                        "min-w-0 flex-1": isFullscreen,
                        "pointer-events-none max-h-4 flex-row items-center gap-8 opacity-0":
                            collapsed,
                        "group-hover:pointer-events-auto group-hover:max-h-[80px] group-hover:opacity-100 group-has-focus-visible:pointer-events-auto group-has-focus-visible:max-h-[80px] group-has-focus-visible:opacity-100":
                            collapsed,
                    },
                )}
            >
                <TabsList className="gap-0 border-none">
                    <TabItem value="file">
                        <T keyName="inspector.shape.fileTab" />
                    </TabItem>
                    {!isFullscreen && (
                        <>
                            <TabItem value="alignment">
                                <T keyName="inspector.shape.alignmentTab" />
                            </TabItem>

                            <TabItem value="select">
                                <T keyName="inspector.shape.selectTab" />
                            </TabItem>
                        </>
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

                <TabContent value="file" className={tabRowClassName}>
                    <FileTab />
                </TabContent>

                {!isFullscreen && (
                    <>
                        <TabContent
                            value="alignment"
                            className={tabRowClassName}
                        >
                            <AlignmentTab />
                        </TabContent>

                        <TabContent value="select" className={tabRowClassName}>
                            <SelectTab />
                        </TabContent>
                    </>
                )}

                <TabContent value="view" className={tabRowClassName}>
                    <ViewTab />
                </TabContent>

                <TabContent value="collisions" className={tabRowClassName}>
                    <CollisionsTab />
                </TabContent>
            </Tabs>
            {isFullscreen && (
                <button
                    type="button"
                    aria-expanded={shownInFullscreen}
                    aria-label={t(
                        shownInFullscreen
                            ? "toolbar.hideToolbar"
                            : "toolbar.showToolbar",
                    )}
                    title={t(
                        shownInFullscreen
                            ? "toolbar.hideToolbar"
                            : "toolbar.showToolbar",
                    )}
                    onClick={() => setShownInFullscreen((shown) => !shown)}
                    className="hover:text-accent text-text touch:size-44 flex size-24 shrink-0 items-center justify-center rounded-full outline-hidden duration-150 ease-out focus-visible:-translate-y-4"
                >
                    {shownInFullscreen ? (
                        <CaretUpIcon size={18} />
                    ) : (
                        <CaretDownIcon size={18} />
                    )}
                </button>
            )}
        </div>
    );
}
