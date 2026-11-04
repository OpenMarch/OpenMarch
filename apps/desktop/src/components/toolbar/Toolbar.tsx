import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { FileTab } from "./tabs/FileTab";
import AlignmentTab from "./tabs/AlignmentTab";
import ShapesTab from "@/shapes/tool/ShapesTab";
import { useState } from "react";
import { T } from "@tolgee/react";
import SelectTab from "./tabs/SelectTab";
import WorkspaceViewSwitch from "./WorkspaceViewSwitch";
import View3dButton from "./View3dButton";

export default function Topbar() {
    const [activeTab, setActiveTab] = useState("alignment");
    // The Collisions tab (CollisionsTab.tsx) is hidden for now, with collision detection
    // unmounted (TimelineResolverHost): the field never drew the markers it reviews.

    return (
        <div className="group @container relative">
            <div className="absolute top-0 right-0 z-10 flex items-center gap-8">
                {/* Its words go first, then the whole button, so it never covers the tabs at the
                    narrowest window (the shortcut and ⌘K still open the 3D View) */}
                <View3dButton
                    className="@max-[480px]:hidden"
                    labelClassName="@max-[600px]:sr-only"
                />
                <WorkspaceViewSwitch />
            </div>
            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-col gap-0 overflow-hidden"
            >
                <TabsList className="gap-0 border-none">
                    <TabItem value="file">
                        <T keyName="inspector.shape.fileTab" />
                    </TabItem>
                    <TabItem value="alignment">
                        <T keyName="inspector.shape.alignmentTab" />
                    </TabItem>
                    <TabItem value="shapes" data-testid="toolbar-shapes-tab">
                        <T keyName="inspector.shape.shapesTab" />
                    </TabItem>

                    <TabItem value="select">
                        <T keyName="inspector.shape.selectTab" />
                    </TabItem>
                </TabsList>

                <TabContent value="file">
                    <FileTab />
                </TabContent>

                <TabContent value="alignment">
                    <AlignmentTab />
                </TabContent>

                <TabContent value="shapes">
                    <ShapesTab />
                </TabContent>

                <TabContent value="select">
                    <SelectTab />
                </TabContent>
            </Tabs>
        </div>
    );
}
