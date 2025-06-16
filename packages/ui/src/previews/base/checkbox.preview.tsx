import { Checkbox } from "@/components/index";

export const PreviewProps = {
    title: "Checkbox",
    variants: [
        {
            title: "disabled",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ...props }) {
    return <Checkbox {...props} />;
}
