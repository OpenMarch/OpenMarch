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
import { T, useTranslate } from "@tolgee/react";

const tools: {
    id: PropDrawingMode;
    labelKey: string;
    icon: React.ReactNode;
}[] = [
    {
        id: "rectangle",
        labelKey: "inspector.prop.outlineType.rectangle",
        icon: <SquareIcon size={24} />,
    },
    {
        id: "circle",
        labelKey: "inspector.prop.outlineType.circle",
        icon: <CircleIcon size={24} />,
    },
    {
        id: "arc",
        labelKey: "inspector.prop.outlineType.arc",
        icon: <BezierCurveIcon size={24} />,
    },
    {
        id: "polygon",
        labelKey: "inspector.prop.outlineType.polygon",
        icon: <PolygonIcon size={24} />,
    },
    {
        id: "freehand",
        labelKey: "inspector.prop.outlineType.freehand",
        icon: <PencilSimpleIcon size={24} />,
    },
];

export default function PropToolSelector() {
    const { t } = useTranslate();
    const { setDrawingMode } = usePropDrawingStore();
    const { toggleOpen } = useSidebarModalStore();

    const handleToolSelect = (mode: PropDrawingMode) => {
        setDrawingMode(mode);
        toggleOpen(); // Close the modal to start drawing
    };

    return (
        <div className="flex flex-col gap-12">
            <h5 className="text-text/70 text-sm font-medium">
                <T keyName="props.drawing.title" />
            </h5>
            <div className="grid grid-cols-5 gap-8">
                {tools.map((tool) => (
                    <button
                        key={tool.id}
                        onClick={() => handleToolSelect(tool.id)}
                        className="bg-fg-2 hover:bg-fg-3 border-stroke rounded-6 flex flex-col items-center gap-4 border p-12 transition-colors"
                        title={t(tool.labelKey)}
                    >
                        {tool.icon}
                        <span className="text-xs">{t(tool.labelKey)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
