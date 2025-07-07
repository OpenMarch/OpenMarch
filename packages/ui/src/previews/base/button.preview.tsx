import { Button } from "@/components/index";

export const PreviewProps = {
    title: "Button",
    variants: [
        {
            title: "variant",
            options: ["primary", "secondary", "red"],
            default: "primary",
        },
        {
            title: "size",
            options: ["default", "compact"],
            default: "default",
        },
        {
            title: "disabled",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ...props }) {
    return <Button {...props}>Button</Button>;
}
