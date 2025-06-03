import { Tabs, TabsList, TabContent, TabItem } from "@/components/index";

export function TabsPreview() {
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
