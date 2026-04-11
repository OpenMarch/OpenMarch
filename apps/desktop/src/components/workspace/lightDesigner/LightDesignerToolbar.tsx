import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { FileTab } from "@/components/toolbar/tabs/FileTab";
import ViewTab from "@/components/toolbar/tabs/ViewTab";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { T } from "@tolgee/react";

/**
 * Light Designer toolbar: file + view only (no drill alignment/select/collisions).
 */
export default function LightDesignerToolbar() {
    const { isFullscreen } = useFullscreenStore();
    const [activeTab, setActiveTab] = useState("view");

    useEffect(() => {
        if (isFullscreen) {
            setActiveTab("view");
        } else {
            setActiveTab("view");
        }
    }, [isFullscreen]);

    return (
        <div
            className={clsx("group", {
                "border-stroke bg-modal backdrop-blur-32 shadow-modal absolute z-50 flex w-full justify-between rounded-[18px] border p-8":
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
                    <TabItem value="view">
                        <T keyName="inspector.shape.viewTab" />
                    </TabItem>
                </TabsList>

                <TabContent value="file">
                    <FileTab />
                </TabContent>

                <TabContent value="view">
                    <ViewTab />
                </TabContent>
            </Tabs>
        </div>
    );
}
