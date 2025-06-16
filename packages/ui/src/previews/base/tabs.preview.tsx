import { Tabs, TabsList, TabContent, TabItem } from "@/components/index";

export const PreviewProps = {
    title: "Tabs",
};

export default function Preview() {
    return (
        <Tabs defaultValue="coordinate-sheets">
            <TabsList>
                <TabItem value="coordinate-sheets">Coordinate Sheets</TabItem>
                <TabItem value="drill-charts">Drill Charts</TabItem>
            </TabsList>

            <TabContent value="coordinate-sheets">Coords</TabContent>

            <TabContent value="drill-charts">Charts</TabContent>
        </Tabs>
    );
}
