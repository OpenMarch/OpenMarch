import { useState, useRef, useEffect } from "react";
import { useSectionAppearanceStore } from "@/stores/SectionAppearanceStore";
import {
    Button,
    SelectTriggerCompact,
    Select,
    SelectContent,
    SelectItem,
    SelectGroup,
} from "@openmarch/ui";
import { TrashIcon, CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@openmarch/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    SectionAppearance,
    ModifiedSectionAppearanceArgs,
    NewSectionAppearanceArgs,
} from "@/global/classes/SectionAppearance";
import * as Form from "@radix-ui/react-form";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import ColorPicker from "../../ui/ColorPicker";
import { SECTIONS } from "@/global/classes/Sections";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { toast } from "sonner";
import { MarcherListContents } from "../MarchersModal";
import FormField from "@/components/ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import { getTranslatedSectionName } from "@/global/classes/Sections";

export default function SectionAppearanceList() {
    const { t } = useTolgee();
    const { setContent, toggleOpen } = useSidebarModalStore();

    const { sectionAppearances, fetchSectionAppearances } =
        useSectionAppearanceStore();
    const [localAppearances, setLocalAppearances] = useState<
        SectionAppearance[]
    >([]);
    const changesRef = useRef<{ [key: number]: any }>({});
    const deletionsRef = useRef<number[]>([]);

    function clearChanges() {
        changesRef.current = {};
        deletionsRef.current = [];
    }

    const defaultFillColor = CanvasMarcher.theme.defaultMarcher.fill;
    const defaultOutlineColor = CanvasMarcher.theme.defaultMarcher.outline;
    const defaultShapeType = "circle";

    const shapeOptions = ["circle", "square", "triangle", "x"];

    useEffect(() => {
        fetchSectionAppearances();
    }, [fetchSectionAppearances]);

    // Reset change tracking when source data changes
    useEffect(() => {
        setLocalAppearances(sectionAppearances);
        clearChanges();
    }, [sectionAppearances]);

    async function handleSubmit() {
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

        if (deletionsRef.current.length > 0) {
            await SectionAppearance.deleteSectionAppearances(
                deletionsRef.current,
            );
        }

        window.location.reload();

        await fetchSectionAppearances();
    }

    // Handle canceling edits
    function handleCancel() {
        setLocalAppearances(sectionAppearances);
        clearChanges();
    }

    function handleDeleteAppearance(appearanceId: number) {
        deletionsRef.current.push(appearanceId);
        setLocalAppearances(
            localAppearances.filter(
                (appearance) => appearance.id !== appearanceId,
            ),
        );
    }

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

    const hasPendingChanges =
        Object.keys(changesRef.current).length > 0 ||
        deletionsRef.current.length > 0;

    function getDeletedSectionNames() {
        return deletionsRef.current
            .map((id) => {
                const sectionName = sectionAppearances.find(
                    (appearance) => appearance.id === id,
                )?.section;
                return getTranslatedSectionName(sectionName || "", t);
            })
            .join(", ");
    }

    // Get available sections (sections without appearances)
    const availableSections = Object.values(SECTIONS)
        .map((section) => section.name)
        .filter(
            (sectionName) =>
                !sectionAppearances.some(
                    (appearance) => appearance.section === sectionName,
                ),
        );

    async function handleCreateNewAppearance(sectionName: string) {
        if (!sectionName) {
            return;
        }

        const newAppearance: NewSectionAppearanceArgs = {
            section: sectionName,
            fill_color: defaultFillColor,
            outline_color: defaultOutlineColor,
            shape_type: defaultShapeType,
        };

        try {
            await SectionAppearance.createSectionAppearances([newAppearance]);
            await fetchSectionAppearances();
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
            <Form.Root
                onSubmit={(event) => {
                    event.preventDefault();
                    handleSubmit();
                }}
                className="text-body text-text flex w-[28rem] flex-col gap-8 overflow-y-auto"
            >
                <div className="flex w-full items-center justify-between">
                    {localAppearances && hasPendingChanges && (
                        <div className="flex w-full justify-between gap-8">
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={handleCancel}
                            >
                                <T keyName="marchers.list.discardChanges" />
                            </Button>
                            {deletionsRef.current.length > 0 ? (
                                <AlertDialog>
                                    <AlertDialogTrigger>
                                        <Button variant="red" size="compact">
                                            <T keyName="marchers.list.saveChanges" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogTitle>
                                            <T keyName="marchers.deleteTitle" />
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {t("marchers.deleteDescription", {
                                                sections:
                                                    getDeletedSectionNames(),
                                            })}
                                        </AlertDialogDescription>
                                        <div className="flex w-full justify-end gap-8">
                                            <AlertDialogCancel>
                                                <Button
                                                    variant="secondary"
                                                    size="compact"
                                                >
                                                    <T keyName="marchers.cancelDeleteButton" />
                                                </Button>
                                            </AlertDialogCancel>
                                            <AlertDialogAction>
                                                <Button
                                                    variant="red"
                                                    size="compact"
                                                    onClick={handleSubmit}
                                                >
                                                    <T keyName="marchers.deleteButton" />
                                                </Button>
                                            </AlertDialogAction>
                                        </div>
                                    </AlertDialogContent>
                                </AlertDialog>
                            ) : hasPendingChanges ? (
                                <Button
                                    variant="primary"
                                    size="compact"
                                    onClick={handleSubmit}
                                >
                                    <T keyName="marchers.list.saveChanges" />
                                </Button>
                            ) : null}
                        </div>
                    )}
                </div>
                {hasPendingChanges && (
                    <div className="bg-fg-2 text-text text-sub border-stroke rounded-full border px-8 py-4 text-center">
                        <T keyName="marchers.list.pendingChanges" />
                    </div>
                )}

                <div className="flex h-fit w-full min-w-0 flex-col gap-16">
                    {localAppearances && localAppearances.length > 0 ? (
                        <>
                            {localAppearances.map((appearance) => (
                                <div
                                    key={appearance.id}
                                    className="bg-fg-1 rounded-6 border-stroke flex flex-col gap-12 border p-12"
                                >
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-h5">
                                            {getTranslatedSectionName(
                                                appearance.section,
                                                t,
                                            )}
                                        </h4>
                                        <Button
                                            variant="red"
                                            size="compact"
                                            content="icon"
                                            onClick={() =>
                                                handleDeleteAppearance(
                                                    appearance.id,
                                                )
                                            }
                                            tooltipText={t(
                                                "marchers.list.deleteSectionStyle",
                                            )}
                                            tooltipSide="left"
                                        >
                                            <TrashIcon size={18} />
                                        </Button>
                                    </div>

                                    <ColorPicker
                                        label={t("marchers.list.fillColor")}
                                        initialColor={appearance.fill_color}
                                        onChange={(color) => {
                                            handleChange(
                                                color,
                                                "fill_color",
                                                appearance.id,
                                            );
                                        }}
                                        className="px-0"
                                        defaultColor={{
                                            r: 0,
                                            g: 0,
                                            b: 0,
                                            a: 1,
                                        }}
                                    />

                                    <ColorPicker
                                        label={t("marchers.list.outlineColor")}
                                        initialColor={appearance.outline_color}
                                        onChange={(color) => {
                                            handleChange(
                                                color,
                                                "outline_color",
                                                appearance.id,
                                            );
                                        }}
                                        className="px-0"
                                        defaultColor={{
                                            r: 255,
                                            g: 255,
                                            b: 255,
                                            a: 1,
                                        }}
                                    />

                                    <FormField
                                        label={t("marchers.list.shape")}
                                        className="px-0"
                                    >
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
                                            <SelectTriggerCompact
                                                label={t("marchers.list.shape")}
                                            >
                                                {t(
                                                    `shapes.${appearance.shape_type}`,
                                                )}
                                            </SelectTriggerCompact>
                                            <SelectContent>
                                                <SelectGroup>
                                                    {shapeOptions.map(
                                                        (shape) => (
                                                            <SelectItem
                                                                key={shape}
                                                                value={shape}
                                                            >
                                                                {t(
                                                                    `shapes.${shape}`,
                                                                )}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </FormField>
                                </div>
                            ))}
                        </>
                    ) : (
                        <p className="text-body text-text/90">
                            <T keyName="marchers.list.noSectionStyles" />
                        </p>
                    )}
                </div>
            </Form.Root>
        </div>
    );
}
