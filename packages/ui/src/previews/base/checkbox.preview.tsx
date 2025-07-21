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

export default function Preview({ ..._props }) {
    return <Checkbox {...props} />;
}
