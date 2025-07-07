import { Switch } from "@/components/index";

export const PreviewProps = {
    title: "Switch",
    variants: [
        {
            title: "disabled",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ...props }) {
    return <Switch {...props} />;
}
