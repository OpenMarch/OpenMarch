import {
    Button,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTriggerCompact,
} from "@openmarch/ui";
import {
    CaretLeftIcon,
    CaretDownIcon,
    CircleIcon,
    SquareIcon,
    TrashIcon,
    TriangleIcon,
    XIcon,
    EyeIcon,
    EyeClosedIcon,
    TextTSlashIcon,
    TextTIcon,
} from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { SECTIONS } from "@/global/classes/Sections";
import { toast } from "sonner";
import { MarcherListContents } from "../MarchersModal";
import { T, useTolgee } from "@tolgee/react";
import { getTranslatedSectionName } from "@/global/classes/Sections";
import {
    ModifiedSectionAppearanceArgs,
    NewSectionAppearanceArgs,
    SectionAppearance,
} from "@/db-functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    allSectionAppearancesQueryOptions,
    createSectionAppearancesMutationOptions,
    deleteSectionAppearancesMutationOptions,
    updateSectionAppearancesMutationOptions,
} from "@/hooks/queries";
import { RgbaColor } from "@openmarch/core";
import ColorPickerMini from "@/components/ui/ColorPickerMini";

export default function SectionAppearanceList() {
    const { t } = useTolgee();
    const { setContent, toggleOpen } = useSidebarModalStore();

    const queryClient = useQueryClient();
    const { data: sectionAppearances } = useQuery(
        allSectionAppearancesQueryOptions(),
    );
    const { mutateAsync: createSectionAppearances } = useMutation(
        createSectionAppearancesMutationOptions(queryClient),
    );
    const { mutateAsync: updateSectionAppearances } = useMutation(
        updateSectionAppearancesMutationOptions(queryClient),
    );
    const { mutateAsync: deleteSectionAppearances } = useMutation(
        deleteSectionAppearancesMutationOptions(queryClient),
    );

    const defaultShapeType = "circle";

    // Get available sections (sections without appearances)
    const availableSections = Object.values(SECTIONS)
        .map((section) => section.name)
        .filter(
            (sectionName) =>
                !sectionAppearances?.some(
                    (appearance) => appearance.section === sectionName,
                ),
        );

    async function handleCreateNewAppearance(sectionName: string) {
        if (!sectionName) {
            return;
        }

        const newAppearance: NewSectionAppearanceArgs = {
            section: sectionName,
            fill_color: null,
            outline_color: null,
            shape_type: defaultShapeType,
            visible: true,
            label_visible: true,
        };

        try {
            await createSectionAppearances([newAppearance]);
            toast.success(`Added style for ${sectionName}`);
        } catch (error) {
            toast.error("Failed to create section appearance");
            console.error("Error creating section appearance:", error);
        }
    }

    return (
        <div className="animate-scale-in flex flex-col gap-8">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() => {
                            setContent(<MarcherListContents />, "marchers");
                        }}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">
                        <T keyName="marchers.list.sectionStyles" />
                    </h4>
                </div>
                <div className="flex items-center gap-6">
                    <Dropdown.Root>
                        <Dropdown.Trigger
                            disabled={availableSections.length === 0}
                            asChild
                        >
                            <Button
                                variant="primary"
                                size="compact"
                                className="flex items-center gap-6"
                            >
                                <T keyName="marchers.list.addSectionStyle" />{" "}
                                <CaretDownIcon size={16} />
                            </Button>
                        </Dropdown.Trigger>
                        <Dropdown.Portal>
                            <Dropdown.Content className="bg-modal rounded-6 shadow-modal backdrop-blur-32 border-stroke z-[999] flex max-h-[70vh] flex-col items-start gap-0 overflow-y-auto border p-8">
                                {availableSections.map((sectionName) => (
                                    <Dropdown.Item
                                        key={sectionName}
                                        onSelect={() =>
                                            handleCreateNewAppearance(
                                                sectionName,
                                            )
                                        }
                                        className="text-text text-body hover:text-accent w-full cursor-pointer px-6 py-4 text-left duration-150 ease-out outline-none"
                                    >
                                        {getTranslatedSectionName(
                                            sectionName,
                                            t,
                                        )}
                                    </Dropdown.Item>
                                ))}
                            </Dropdown.Content>
                        </Dropdown.Portal>
                    </Dropdown.Root>
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>
            <div className="text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto">
                <div className="flex h-fit w-full min-w-0 flex-col gap-16">
                    {sectionAppearances && sectionAppearances.length > 0 ? (
                        <>
                            {sectionAppearances.map((appearance) => (
                                <SectionAppearanceEditor
                                    key={appearance.id}
                                    appearance={appearance}
                                    handleUpdateAppearance={(
                                        modifiedAppearance: ModifiedSectionAppearanceArgs,
                                    ) =>
                                        void updateSectionAppearances([
                                            modifiedAppearance,
                                        ])
                                    }
                                    handleDeleteAppearance={() =>
                                        void deleteSectionAppearances(
                                            new Set([appearance.id]),
                                        )
                                    }
                                />
                            ))}
                        </>
                    ) : (
                        <p className="text-body text-text/90">
                            <T keyName="marchers.list.noSectionStyles" />
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

const shapeOptions = ["circle", "square", "triangle", "x"] as const;
type ShapeType = (typeof shapeOptions)[number];

const shapeIcons: Record<ShapeType, React.ReactNode> = {
    circle: <CircleIcon size={18} />,
    square: <SquareIcon size={18} />,
    triangle: <TriangleIcon size={18} />,
    x: <XIcon size={18} />,
};

const defaultShapeType: ShapeType = "circle";

interface SectionAppearanceEditorProps {
    appearance: SectionAppearance;
    handleUpdateAppearance: (
        modifiedAppearance: ModifiedSectionAppearanceArgs,
    ) => void;
    handleDeleteAppearance: () => void;
}

function SectionAppearanceEditor({
    appearance,
    handleUpdateAppearance,
    handleDeleteAppearance,
}: SectionAppearanceEditorProps) {
    const { t } = useTolgee();

    async function handleChange(
        appearanceId: number,
        changes: Partial<
            Pick<
                ModifiedSectionAppearanceArgs,
                | "fill_color"
                | "outline_color"
                | "shape_type"
                | "visible"
                | "label_visible"
            >
        >,
    ) {
        await handleUpdateAppearance({
            id: appearanceId,
            visible: appearance.visible,
            label_visible: appearance.label_visible,
            ...changes,
        });
    }

    function onColorChange(
        appearanceId: number,
        attribute: "fill_color" | "outline_color",
        color: RgbaColor | null,
    ) {
        void handleChange(appearanceId, { [attribute]: color });
    }

    function onShapeChange(appearanceId: number, shape: string) {
        void handleChange(appearanceId, { shape_type: shape });
    }
    const handleVisibilityChange = () => {
        void handleChange(appearance.id, { visible: !appearance.visible });
    };
    const handleLabelVisibilityChange = () => {
        void handleChange(appearance.id, {
            label_visible: !appearance.label_visible,
        });
    };
    return (
        <div className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-12 border p-12">
            <div className="flex items-center justify-between">
                <h4 className="text-h5">
                    {getTranslatedSectionName(appearance.section, t)}
                </h4>
                <Button
                    type="button"
                    variant="red"
                    size="compact"
                    content="icon"
                    onClick={() => void handleDeleteAppearance()}
                    tooltipText={t("marchers.list.deleteSectionStyle")}
                    tooltipSide="left"
                >
                    <TrashIcon size={18} />
                </Button>
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
                    className="hover:text-accent cursor-pointer duration-150 ease-out"
                    onClick={handleLabelVisibilityChange}
                >
                    {appearance.label_visible ? (
                        <TextTIcon size={18} />
                    ) : (
                        <TextTSlashIcon size={18} />
                    )}
                </div>
                <ColorPickerMini
                    label={t("marchers.list.fillColor")}
                    initialColor={appearance.fill_color}
                    onBlur={(color) =>
                        onColorChange(appearance.id, "fill_color", color)
                    }
                    className="px-0"
                />

                <ColorPickerMini
                    label={t("marchers.list.outlineColor")}
                    initialColor={appearance.outline_color}
                    onBlur={(color) =>
                        onColorChange(appearance.id, "outline_color", color)
                    }
                    className="px-0"
                />

                <Select
                    value={appearance.shape_type ?? defaultShapeType}
                    onValueChange={(value) =>
                        onShapeChange(appearance.id, value)
                    }
                >
                    <SelectTriggerCompact label={t("marchers.list.shape")}>
                        {
                            shapeIcons[
                                (appearance.shape_type ??
                                    defaultShapeType) as ShapeType
                            ]
                        }
                    </SelectTriggerCompact>
                    <SelectContent>
                        <SelectGroup>
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
