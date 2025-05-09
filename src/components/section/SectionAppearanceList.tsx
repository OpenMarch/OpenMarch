import { useState, useRef, useEffect } from "react";
import { useSectionAppearanceStore } from "@/stores/SectionAppearanceStore";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { Button } from "../ui/Button";
import { Trash } from "@phosphor-icons/react";
import { ModifiedSectionAppearanceArgs } from "electron/database/tables/SectionAppearanceTable";
import { AlertDialogAction, AlertDialogCancel } from "../ui/AlertDialog";
import FormButtons from "../FormButtons";
import { ColorPicker } from "../ui/ColorPicker";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerText,
} from "../ui/Select";
import { SectionAppearance } from "@/global/classes/SectionAppearance";

export default function SectionAppearanceList() {
    const { isOpen } = useSidebarModalStore();
    const [isEditingLocal, setIsEditingLocal] = useState(false);
    const [isEditing, setIsEditing] = [isEditingLocal, setIsEditingLocal];
    const { sectionAppearances, fetchSectionAppearances } =
        useSectionAppearanceStore();

    // Local state for appearance data
    const [localAppearances, setLocalAppearances] = useState<
        SectionAppearance[]
    >([]);
    const changesRef = useRef<{ [key: number]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    // Shape options
    const shapeOptions = ["circle", "square", "triangle"];

    // Get all section appearances on mount
    useEffect(() => {
        fetchSectionAppearances();
    }, [fetchSectionAppearances]);

    // Update local appearances when section appearances change
    useEffect(() => {
        setLocalAppearances(sectionAppearances);
    }, [sectionAppearances]);

    // Turn off editing if the modal closes
    useEffect(() => {
        setIsEditing(false);
    }, [isOpen, setIsEditing]);

    // Handle form submission (saving changes)
    async function handleSubmit() {
        setIsEditing(false);

        // Process modifications
        const modifiedAppearances: ModifiedSectionAppearanceArgs[] = [];
        for (const [appearanceId, changes] of Object.entries(
            changesRef.current,
        )) {
            modifiedAppearances.push({
                id: parseInt(appearanceId),
                ...changes,
            });
        }

        if (modifiedAppearances.length > 0) {
            await SectionAppearance.updateSectionAppearances(
                modifiedAppearances,
            );
        }

        // Process deletions
        if (deletionsRef.current.length > 0) {
            await SectionAppearance.deleteSectionAppearances(
                deletionsRef.current,
            );
        }

        // Refresh data
        await fetchSectionAppearances();

        // Reset change tracking
        changesRef.current = {};
        deletionsRef.current = [];
    }

    // Handle canceling edits
    function handleCancel() {
        setIsEditing(false);
        setLocalAppearances(sectionAppearances);
        deletionsRef.current = [];
        changesRef.current = {};
    }

    // Handle deleting a section appearance
    function handleDeleteAppearance(appearanceId: number) {
        deletionsRef.current.push(appearanceId);
        setLocalAppearances(
            localAppearances.filter(
                (appearance) => appearance.id !== appearanceId,
            ),
        );
    }

    // Handle changing a section appearance property
    function handleChange(value: any, attribute: string, appearanceId: number) {
        // Create an entry for the appearance if it doesn't exist
        if (!changesRef.current[appearanceId])
            changesRef.current[appearanceId] = {};

        // Record the change
        changesRef.current[appearanceId][attribute] = value;

        // Update local state to reflect the change
        setLocalAppearances((prevAppearances) =>
            prevAppearances.map((appearance) =>
                appearance.id === appearanceId
                    ? { ...appearance, [attribute]: value }
                    : appearance,
            ),
        );
    }

    // Function to determine text color based on background
    const getTextColor = (bgColor: string) => {
        try {
            const match = bgColor.match(
                /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/,
            );
            if (!match) return "#000000";

            const r = parseInt(match[1], 10);
            const g = parseInt(match[2], 10);
            const b = parseInt(match[3], 10);

            // Calculate luminance - if bright background, use dark text
            return r * 0.299 + g * 0.587 + b * 0.114 > 186
                ? "#000000"
                : "#ffffff";
        } catch {
            return "#000000";
        }
    };

    return (
        <form
            id="sectionAppearanceListForm"
            onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
            }}
            className="flex flex-col gap-16 text-body text-text"
        >
            <div className="flex w-full items-center justify-between">
                <p className="text-body text-text">Section Styles</p>
                <div className="flex gap-8">
                    {localAppearances && localAppearances.length > 0 ? (
                        <>
                            {deletionsRef.current.length > 0 ? (
                                <FormButtons
                                    variant="primary"
                                    size="compact"
                                    handleCancel={handleCancel}
                                    editButton="Edit Styles"
                                    isEditingProp={isEditing}
                                    setIsEditingProp={setIsEditing}
                                    handleSubmit={handleSubmit}
                                    isDangerButton={true}
                                    alertDialogTitle="Warning"
                                    alertDialogDescription={`
                                        You are about to delete these section styles:
                                        ${deletionsRef.current
                                            .map((id) => {
                                                const sectionName =
                                                    sectionAppearances.find(
                                                        (appearance) =>
                                                            appearance.id ===
                                                            id,
                                                    )?.section;
                                                return sectionName || "Unknown";
                                            })
                                            .join(
                                                ", ",
                                            )}. This can be undone with [Ctrl/Cmd+Z].
                                    `}
                                    alertDialogActions={
                                        <>
                                            <AlertDialogAction>
                                                <Button
                                                    variant="red"
                                                    size="compact"
                                                    onClick={handleSubmit}
                                                >
                                                    Delete
                                                </Button>
                                            </AlertDialogAction>
                                            <AlertDialogCancel>
                                                <Button
                                                    variant="secondary"
                                                    size="compact"
                                                    onClick={handleCancel}
                                                >
                                                    Cancel
                                                </Button>
                                            </AlertDialogCancel>
                                        </>
                                    }
                                />
                            ) : (
                                <FormButtons
                                    variant="secondary"
                                    size="compact"
                                    handleCancel={handleCancel}
                                    editButton="Edit Styles"
                                    isEditingProp={isEditing}
                                    setIsEditingProp={setIsEditing}
                                    handleSubmit={handleSubmit}
                                />
                            )}
                        </>
                    ) : (
                        <button type="submit" hidden={true} />
                    )}
                </div>
            </div>

            <div className="flex h-fit w-full min-w-0 flex-col gap-6">
                {localAppearances && localAppearances.length > 0 && (
                    <>
                        {localAppearances.map((appearance) => (
                            <div
                                key={appearance.id}
                                className="flex flex-col gap-4"
                            >
                                <div className="flex items-center justify-between">
                                    <h4 className="font-medium">
                                        {appearance.section}
                                    </h4>
                                    {isEditing && (
                                        <Button
                                            variant="primary"
                                            size="compact"
                                            onClick={() =>
                                                handleDeleteAppearance(
                                                    appearance.id,
                                                )
                                            }
                                        >
                                            <Trash className="text-red-500" />
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm text-text/70">
                                            Fill Color
                                        </label>
                                        {isEditing ? (
                                            <ColorPicker
                                                color={appearance.fill_color}
                                                onChange={(color) =>
                                                    handleChange(
                                                        color,
                                                        "fill_color",
                                                        appearance.id,
                                                    )
                                                }
                                            />
                                        ) : (
                                            <div
                                                className="text-xs flex h-10 w-full cursor-pointer items-center justify-center rounded-full border border-stroke font-mono tracking-wider"
                                                style={{
                                                    backgroundColor:
                                                        appearance.fill_color,
                                                    color: getTextColor(
                                                        appearance.fill_color,
                                                    ),
                                                }}
                                            >
                                                {appearance.fill_color}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm text-text/70">
                                            Outline Color
                                        </label>
                                        {isEditing ? (
                                            <ColorPicker
                                                color={appearance.outline_color}
                                                onChange={(color) =>
                                                    handleChange(
                                                        color,
                                                        "outline_color",
                                                        appearance.id,
                                                    )
                                                }
                                            />
                                        ) : (
                                            <div
                                                className="text-xs flex h-10 w-full cursor-pointer items-center justify-center rounded-full border border-stroke font-mono tracking-wider"
                                                style={{
                                                    backgroundColor:
                                                        appearance.outline_color,
                                                    color: getTextColor(
                                                        appearance.outline_color,
                                                    ),
                                                }}
                                            >
                                                {appearance.outline_color}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm text-text/70">
                                        Shape
                                    </label>
                                    {isEditing ? (
                                        <Select
                                            value={appearance.shape_type}
                                            onValueChange={(value) =>
                                                handleChange(
                                                    value,
                                                    "shape_type",
                                                    appearance.id,
                                                )
                                            }
                                        >
                                            <SelectTriggerText label="Shape">
                                                {appearance.shape_type}
                                            </SelectTriggerText>
                                            <SelectContent>
                                                {shapeOptions.map((shape) => (
                                                    <SelectItem
                                                        key={shape}
                                                        value={shape}
                                                    >
                                                        {shape}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <div className="flex h-10 w-full cursor-pointer items-center rounded-full border border-stroke px-4">
                                            {appearance.shape_type}
                                        </div>
                                    )}
                                </div>

                                <div className="h-px w-full bg-stroke/30"></div>
                            </div>
                        ))}
                    </>
                )}

                {(!localAppearances || localAppearances.length === 0) && (
                    <p className="text-body text-text/50">
                        No section styles defined yet. Add one to customize how
                        sections appear.
                    </p>
                )}
            </div>
        </form>
    );
}
