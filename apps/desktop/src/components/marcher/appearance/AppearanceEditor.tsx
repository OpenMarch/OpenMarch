import {
    Select,
    SelectTriggerCompact,
    SelectContent,
    SelectGroup,
    SelectItem,
} from "@openmarch/ui";
import {
    CircleIcon,
    SquareIcon,
    TriangleIcon,
    XIcon,
    TrashIcon,
    EyeIcon,
    EyeClosedIcon,
    TextTIcon,
    TextTSlashIcon,
    MinusIcon,
} from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { RgbaColor } from "@uiw/react-color";
import ColorPickerMini from "@/components/ui/ColorPickerMini";
import {
    AppearanceComponent,
    AppearanceComponentOptional,
} from "@/entity-components/appearance";
import { twMerge } from "tailwind-merge";

const shapeOptions = ["circle", "square", "triangle", "x"] as const;
type ShapeType = (typeof shapeOptions)[number];

const shapeIcons: Record<ShapeType, React.ReactNode> = {
    circle: <CircleIcon size={18} />,
    square: <SquareIcon size={18} />,
    triangle: <TriangleIcon size={18} />,
    x: <XIcon size={18} />,
};

export function AppearanceEditor({
    label,
    className,
    appearance,
    handleUpdateAppearance,
    handleDeleteAppearance,
}: {
    label: string;
    className?: string;
    appearance: AppearanceComponent;
    handleUpdateAppearance: (
        modifiedAppearance: AppearanceComponentOptional,
    ) => void;
    handleDeleteAppearance: () => void;
}) {
    const { t } = useTolgee();

    async function handleChange(changes: Partial<AppearanceComponentOptional>) {
        await handleUpdateAppearance({
            visible:
                changes.visible !== undefined
                    ? changes.visible
                    : appearance.visible,
            label_visible:
                changes.label_visible !== undefined
                    ? changes.label_visible
                    : appearance.label_visible,
            ...changes,
        });
    }

    function onColorChange(
        attribute: "fill_color" | "outline_color",
        color: RgbaColor | null,
    ) {
        void handleChange({ [attribute]: color });
    }

    function onShapeChange(shape: string) {
        // Convert the special "__none__" value to null
        void handleChange({ shape_type: shape === "__none__" ? null : shape });
    }
    const handleVisibilityChange = () => {
        void handleChange({ visible: !appearance.visible });
    };
    const handleLabelVisibilityChange = () => {
        void handleChange({
            label_visible: !appearance.label_visible,
        });
    };
    return (
        <div
            className={twMerge(
                "bg-fg-1 rounded-6 border-stroke flex flex-col gap-12 border p-12",
                className,
            )}
        >
            <div className="flex items-center justify-between">
                <h4 className="text-h5">{label}</h4>
                <div
                    className="hover:text-red cursor-pointer duration-150 ease-out"
                    onClick={() => void handleDeleteAppearance()}
                >
                    <TrashIcon size={18} />
                </div>
            </div>
            <div className="flex gap-12">
                <div
                    className="hover:text-accent cursor-pointer duration-150 ease-out"
                    onClick={handleVisibilityChange}
                >
                    {appearance.visible ? (
                        <EyeIcon size={18} />
                    ) : (
                        <EyeClosedIcon size={18} />
                    )}
                </div>
                <div
                    className={twMerge(
                        appearance.visible
                            ? "hover:text-accent cursor-pointer duration-150 ease-out"
                            : "text-text-disabled",
                    )}
                    onClick={
                        appearance.visible
                            ? handleLabelVisibilityChange
                            : undefined
                    }
                >
                    {appearance.label_visible && appearance.visible ? (
                        <TextTIcon size={18} />
                    ) : (
                        <TextTSlashIcon size={18} />
                    )}
                </div>
                <ColorPickerMini
                    label={t("marchers.list.fillColor")}
                    initialColor={appearance.fill_color}
                    onBlur={(color) => onColorChange("fill_color", color)}
                    className="px-0"
                />

                <ColorPickerMini
                    label={t("marchers.list.outlineColor")}
                    initialColor={appearance.outline_color}
                    onBlur={(color) => onColorChange("outline_color", color)}
                    className="px-0"
                />

                <Select
                    value={appearance.shape_type ?? "__none__"}
                    onValueChange={(value) => onShapeChange(value)}
                >
                    <SelectTriggerCompact label={t("marchers.list.shape")}>
                        {appearance.shape_type ? (
                            shapeIcons[appearance.shape_type as ShapeType]
                        ) : (
                            <MinusIcon size={10} />
                        )}
                    </SelectTriggerCompact>
                    <SelectContent>
                        <SelectGroup>
                            <SelectItem value="__none__">
                                <MinusIcon size={10} />
                            </SelectItem>
                            {shapeOptions.map((shape) => (
                                <SelectItem key={shape} value={shape}>
                                    {shapeIcons[shape]}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
