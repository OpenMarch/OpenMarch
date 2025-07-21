import { ListItem } from "@/components/index";

export const PreviewProps = {
    title: "List Item",
    variants: [
        {
            title: "selected",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ..._props }) {
    return <ListItem {...props}>List Item</ListItem>;
}
