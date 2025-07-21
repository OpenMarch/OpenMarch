import { UnitInput } from "@/components/index";

export const PreviewProps = {
    title: "Unit Input",
    variants: [
        {
            title: "disabled",
            options: [true, false],
            default: false,
        },
    ],
};

export default function Preview({ ..._props }) {
    return <UnitInput unit="cm" type="number" placeholder="10" {...props} />;
}
