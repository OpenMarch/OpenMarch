<<<<<<< HEAD
import { Tabs, TabContent, TabItem, TabsList } from "@openmarch/ui";
import { FileTab } from "./tabs/FileTab";
import AlignmentTab from "./tabs/AlignmentTab";
import ViewTab from "./tabs/ViewTab";

export default function Topbar() {
    return (
        <Tabs defaultValue="alignment" className="flex flex-col gap-0">
            <TabsList className="gap-0 border-none">
                <TabItem value="file">File</TabItem>
                <TabItem value="alignment">Alignment</TabItem>
                <TabItem value="view">View</TabItem>
            </TabsList>

            <TabContent value="file">
                <FileTab />
            </TabContent>

            <TabContent value="alignment">
                <AlignmentTab />
            </TabContent>

            <TabContent value="view">
                <ViewTab />
            </TabContent>
        </Tabs>
=======
import PlaybackControls from "./sections/PlaybackControls";
import UiSettingsToolbar from "./sections/UiSettingsToolbar";
import AlignmentToolbar from "./sections/AlignmentToolbar";

export default function Topbar() {
    return (
        <div className="flex w-full flex-wrap gap-8">
            <PlaybackControls />
            <UiSettingsToolbar />
            <AlignmentToolbar />
        </div>
>>>>>>> 1f8fe29 (ui: add new sidebar layout, fix icon imports)
    );
}
