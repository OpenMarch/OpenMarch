import { Slider } from "@/components/index";

export const PreviewProps = {
    title: "Slider",
};

export default function Preview({ ..._props }) {
    return <Slider max={100} defaultValue={[50]} />;
}
