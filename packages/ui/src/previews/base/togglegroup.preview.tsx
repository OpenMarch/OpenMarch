import { ToggleGroup, ToggleGroupItem } from "@/components/index";

export const PreviewProps = {
    title: "Toggle Group",
};

export default function Preview({ ...props }) {
    return (
        <ToggleGroup type="single">
            <ToggleGroupItem value="1">Option 1</ToggleGroupItem>
            <ToggleGroupItem value="2">Option 2</ToggleGroupItem>
            <ToggleGroupItem value="3">Option 3</ToggleGroupItem>
            <ToggleGroupItem value="4">Option 4</ToggleGroupItem>
            <ToggleGroupItem value="5">Option 5</ToggleGroupItem>
        </ToggleGroup>
    );
}
