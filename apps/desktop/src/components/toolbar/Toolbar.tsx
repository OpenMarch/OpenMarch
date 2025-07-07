import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { FileTab } from "./tabs/FileTab";
import AlignmentTab from "./tabs/AlignmentTab";
import ViewTab from "./tabs/ViewTab";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

export default function Topbar() {
    const { isFullscreen } = useFullscreenStore();
    const [activeTab, setActiveTab] = useState("alignment");

    // Switch to "view" tab when entering fullscreen mode
    useEffect(() => {
        if (isFullscreen) {
            setActiveTab("view");
        }
        if (!isFullscreen) {
            setActiveTab("alignment");
        }
    }, [isFullscreen]);

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
                    <TabItem value="file">File</TabItem>
                    {!isFullscreen && (
                        <TabItem value="alignment">Alignment</TabItem>
                    )}
                    <TabItem value="view">View</TabItem>
                </TabsList>

                <TabContent value="file">
                    <FileTab />
                </TabContent>

                {!isFullscreen && (
                    <TabContent value="alignment">
                        <AlignmentTab />
                    </TabContent>
                )}

                <TabContent value="view">
                    <ViewTab />
                </TabContent>
            </Tabs>
        </div>
    );
}
