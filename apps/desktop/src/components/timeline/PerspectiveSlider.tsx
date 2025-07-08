import { Slider } from "@openmarch/ui";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { useEffect, useState } from "react";

export default function PerspectiveSlider() {
    const { perspective, setPerspective } = useFullscreenStore();
    const [value, setValue] = useState(perspective);

    // Sync with external changes to perspective
    useEffect(() => {
        setValue(perspective);
    }, [perspective]);

    const handleValueChange = (values: number[]) => {
        const newValue = values[0];
        setValue(newValue);
        setPerspective(newValue);
    };

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-4 border px-16 py-12">
            <div className="text-text-subtitle text-sub flex justify-between">
                <span>Perspective</span>
                <span>{value}°</span>
            </div>
            <Slider
                value={[value]}
                min={0}
                max={65}
                step={1}
                onValueChange={handleValueChange}
            />
        </div>
    );
}
