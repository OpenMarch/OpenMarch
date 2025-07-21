import { Input } from "@/components/index";

export const PreviewProps = {
    title: "Input",
    variants: [
        {
            title: "compact",
            options: [true, false],
            default: false,
        },
        {
            title: "disabled",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ..._props }) {
    return <Input placeholder="Input" {...props} />;
}
