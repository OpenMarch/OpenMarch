import {
    SquareIcon,
    CircleIcon,
    BezierCurveIcon,
    PolygonIcon,
    PencilSimpleIcon,
} from "@phosphor-icons/react";
import {
    usePropDrawingStore,
    PropDrawingMode,
} from "@/stores/PropDrawingStore";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";

const tools: { id: PropDrawingMode; label: string; icon: React.ReactNode }[] = [
    { id: "rectangle", label: "Rectangle", icon: <SquareIcon size={24} /> },
    { id: "circle", label: "Circle", icon: <CircleIcon size={24} /> },
    { id: "arc", label: "Arc", icon: <BezierCurveIcon size={24} /> },
    { id: "polygon", label: "Polygon", icon: <PolygonIcon size={24} /> },
    { id: "freehand", label: "Freehand", icon: <PencilSimpleIcon size={24} /> },
];

export default function PropToolSelector() {
    const { setDrawingMode } = usePropDrawingStore();
    const { toggleOpen } = useSidebarModalStore();

    const handleToolSelect = (mode: PropDrawingMode) => {
        setDrawingMode(mode);
        toggleOpen(); // Close the modal to start drawing
    };

    return (
        <div className="flex flex-col gap-12">
            <h5 className="text-text/70 text-sm font-medium">Draw a Prop</h5>
            <div className="grid grid-cols-5 gap-8">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => handleToolSelect(tool.id)}
                        className="bg-fg-2 hover:bg-fg-3 border-stroke rounded-6 flex flex-col items-center gap-4 border p-12 transition-colors"
                        title={tool.label}
                    >
                        {tool.icon}
                        <span className="text-xs">{tool.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
