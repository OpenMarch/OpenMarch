import { SegmentedTextSwitch } from "@/components/index";
import { useState } from "react";

const options = [
    { value: "hotels", label: "Hotels" },
    { value: "apartments", label: "Apartments" },
    { value: "villas", label: "Villas" },
];

export const PreviewProps = {
    title: "Segmented Text Switch",
};

export default function Preview() {
    const [selected, setSelected] = useState(options[0].value);

    return (
        <div className="w-full max-w-[28rem]">
            <SegmentedTextSwitch
                options={options}
                selected={selected}
                setSelected={setSelected}
                ariaLabel="Lodging type"
            />
        </div>
    );
}
