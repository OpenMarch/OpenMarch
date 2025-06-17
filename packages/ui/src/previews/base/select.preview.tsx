import {
    Select,
    SelectItem,
    SelectGroup,
    SelectLabel,
    SelectContent,
    SelectSeparator,
    SelectTriggerButton,
    SelectTriggerText,
    SelectTriggerCompact,
} from "@/components/index";

export const PreviewProps = {
    title: "Select",
};

export default function Preview({ ...props }) {
    return (
        <div className="flex flex-col gap-32">
            <Select>
                <SelectTriggerButton label="Button Select" />
                <SelectContentDemo />
            </Select>
            <Select>
                <SelectTriggerCompact label="Compact Select" />
                <SelectContentDemo />
            </Select>
            <Select>
                <SelectTriggerText label="Text Select" />
                <SelectContentDemo />
            </Select>
        </div>
    );
}

function SelectContentDemo() {
    return (
        <SelectContent>
            <SelectGroup>
                <SelectLabel>Section 1</SelectLabel>
                <SelectItem value="item1">Item 1</SelectItem>
                <SelectItem value="item2">Item 2</SelectItem>
                <SelectItem value="item3">Item 3</SelectItem>
                <SelectItem value="item4">Item 4</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
                <SelectLabel>Section 2</SelectLabel>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
                <SelectItem value="option3">Option 3</SelectItem>
                <SelectItem value="option4">Option 4</SelectItem>
            </SelectGroup>
        </SelectContent>
    );
}
