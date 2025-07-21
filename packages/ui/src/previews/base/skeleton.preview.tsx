import { Skeleton } from "@/components/index";

export const PreviewProps = {
    title: "Skeleton",
};

export default function Preview({ ..._props }) {
    return <Skeleton />;
}
