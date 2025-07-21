import { TextArea } from "@/components/index";

export const PreviewProps = {
    title: "Text Area",
    variants: [
        {
            title: "disabled",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ..._props }) {
    return <TextArea placeholder="Text Area" {...props} />;
}
