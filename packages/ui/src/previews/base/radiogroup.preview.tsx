import { RadioGroup, RadioGroupItem } from "@/components/index";

export const PreviewProps = {
    title: "Radio Group",
};

export default function Preview({ ...props }) {
    return (
        <RadioGroup>
            <RadioGroupItem value="option1">Option 1</RadioGroupItem>
            <RadioGroupItem value="option2">Option 2</RadioGroupItem>
            <RadioGroupItem disabled value="option3">
                Option 3
            </RadioGroupItem>
            <RadioGroupItem value="option4">Option 4</RadioGroupItem>
        </RadioGroup>
    );
}
