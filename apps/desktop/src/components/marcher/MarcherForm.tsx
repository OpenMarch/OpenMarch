import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Marcher from "@/global/classes/Marcher";
import {
    getSectionObjectByName,
    SECTIONS,
    getTranslatedSectionName,
} from "@/global/classes/Sections";
import * as Form from "@radix-ui/react-form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    InfoNote,
    WarningNote,
    Button,
    Input,
    TextArea,
} from "@openmarch/ui";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { MarcherListContents } from "./MarchersModal";
import FormField from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    marcherQueryByIdOptions,
    createMarchersMutationOptions,
    updateMarchersMutationOptions,
} from "@/hooks/queries";
import { ModifiedMarcherArgs, NewMarcherArgs } from "@/db-functions";

export interface MarcherFormProps {
    disabledProp?: boolean;
    hideInfoNote?: boolean;
    skipSidebarContent?: boolean;
    onMarchersCreate?: (newMarchers: NewMarcherArgs[]) => void;
    existingMarchers?: Marcher[];
    wizardMode?: boolean;
    marcherIdToEdit?: number;
}

const defaultSection = (t: (key: string) => string) =>
    getTranslatedSectionName("Other", t) || "Other";

const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

// eslint-disable-next-line react/prop-types, max-lines-per-function
const MarcherForm: React.FC<MarcherFormProps> = ({
    disabledProp = false,
    hideInfoNote = false,
    skipSidebarContent = false,
    onMarchersCreate,
    existingMarchers,
    wizardMode = false,
    marcherIdToEdit,
}) => {
    const [quantity, setQuantity] = useState<number>(1);
    const [section, setSection] = useState<string>();
    const [name, setName] = useState<string>("");
    const [year, setYear] = useState<string>("");
    const [drillPrefix, setDrillPrefix] = useState<string>(defaultDrillPrefix);
    const [drillOrder, setDrillOrder] = useState<number>(defaultDrillOrder);
    const [notes, setNotes] = useState<string>("");
    const [sectionError, setSectionError] = useState<string>("");
    const [drillPrefixError, setDrillPrefixError] = useState<string>("");
    const [drillPrefixTouched, setDrillPrefixTouched] =
        useState<boolean>(false);
    const [drillOrderError, setDrillOrderError] = useState<string>("");
    const queryClient = useQueryClient();

    // Only query DB if existingMarchers prop is NOT provided AND not in wizard mode
    const { data: dbMarchers } = useQuery({
        ...allMarchersQueryOptions(),
        enabled: !existingMarchers && !wizardMode,
    });

    // Use prop if available, otherwise use query data
    const marchers = existingMarchers || dbMarchers;

    const createMarchersMutation = useMutation(
        createMarchersMutationOptions(queryClient),
    );
    const updateMarchersMutation = useMutation(
        updateMarchersMutationOptions(queryClient),
    );
    const [submitIsDisabled, setSubmitIsDisabled] = useState<boolean>(true);
    const formRef = useRef<HTMLFormElement>(null);
    const { setContent } = useSidebarModalStore();

    // Fetch existing marcher in edit mode
    const { data: existingMarcher } = useQuery({
        ...marcherQueryByIdOptions(marcherIdToEdit ?? -1),
        enabled: marcherIdToEdit !== undefined,
    });
    const isEditMode = marcherIdToEdit !== undefined;
    const isEditReady = !isEditMode || !!existingMarcher;

    const { t } = useTolgee();

    useEffect(() => {
        setSection(defaultSection(t));
    }, [t]);

    const resetForm = (preserveSection = false) => {
        if (!preserveSection) {
            setSection(defaultSection(t));
            setDrillPrefix(defaultDrillPrefix);
        }
        setQuantity(1);
        setName("");
        setYear("");
        if (!preserveSection) {
            setDrillOrder(defaultDrillOrder);
        }
        setNotes("");
        setSectionError("");
        setDrillPrefixError("");
        setDrillPrefixTouched(false);
        setDrillOrderError("");

        if (formRef.current) formRef.current.reset();
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        if (!skipSidebarContent) {
            setContent(<MarcherListContents />, "marchers");
        }
        event.preventDefault();

        if (submitIsDisabled || !isEditReady) return;

        let newDrillOrderOffset = 0;
        const existingDrillOrders = new Set<number>(
            (marchers || [])
                .filter(
                    (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
                )
                .map((marcher: Marcher) => marcher.drill_order),
        );

        if (isEditMode && existingMarcher) {
            const updatedMarcher: ModifiedMarcherArgs = {
                id: existingMarcher.id,
                section: section || "Other",
                name,
                year,
                drill_prefix: drillPrefix,
                drill_order: drillOrder,
                notes,
            };

            try {
                await updateMarchersMutation.mutateAsync([updatedMarcher]);
                resetForm();
            } catch (error) {
                console.error("Error updating marcher:", error);
            }
        } else if (!isEditMode) {
            const newMarchers: NewMarcherArgs[] = [];
            for (let i = 0; i < quantity; i++) {
                let newDrillOrder = drillOrder + newDrillOrderOffset;
                while (existingDrillOrders.has(newDrillOrder)) {
                    newDrillOrder++;
                }
                newDrillOrderOffset = newDrillOrder - drillOrder;
                existingDrillOrders.add(newDrillOrder);

                newMarchers.push({
                    section: section || "Other",
                    drill_prefix: drillPrefix,
                    drill_order: newDrillOrder,
                });
            }

            try {
                if (onMarchersCreate) {
                    onMarchersCreate(newMarchers);
                } else if (!wizardMode) {
                    await createMarchersMutation.mutateAsync(newMarchers);
                } else {
                    console.warn(
                        "MarcherForm: wizardMode is true but onMarchersCreate is not provided. Skipping DB mutation.",
                    );
                }
                resetForm(true);
            } catch (error) {
                console.error("Error creating marchers:", error);
            }
        }
    };

    const handleSectionChange = (value: string) => {
        const selectedSectionObject = getSectionObjectByName(value);
        if (selectedSectionObject) {
            const prevSection = section;
            setSection(selectedSectionObject.name);
            setDrillPrefix(selectedSectionObject.prefix);
            if (prevSection !== selectedSectionObject.name) resetDrillOrder();
            setSectionError("");
            setDrillPrefixTouched(false);
        } else {
            console.error("Section not found");
            setSection(defaultSection(t));
            setSectionError(t("marchers.sectionError.chooseSection"));
        }
    };

    const handlePrefixChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDrillPrefix(event.target.value);
        setDrillPrefixTouched(true);
    };

    const handleOrderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const drillOrder = parseInt(event.target.value);
        setDrillOrder(drillOrder);
        validateDrillOrder(drillOrder);
    };

    const validateDrillOrder = useCallback(
        (drillOrder: number) => {
            const existingMarchers = (marchers || []).filter(
                (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
            );
            if (
                existingMarchers.some(
                    (marcher: Marcher) =>
                        marcher.drill_order === drillOrder &&
                        marcher.id !== marcherIdToEdit,
                )
            ) {
                setDrillOrderError(t("marchers.drillOrderError.exists"));
            } else {
                setDrillOrderError("");
            }
        },
        [marchers, marcherIdToEdit, drillPrefix, t],
    );

    const handleQuantityChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        if (event.target.value === "") setQuantity(1);
        else setQuantity(parseInt(event.target.value));
    };

    const resetDrillOrder = useCallback(() => {
        if (existingMarcher && existingMarcher.section === section) {
            setDrillOrder(existingMarcher.drill_order);
            return existingMarcher.drill_order;
        }

        const i = { newOrder: 1 };
        const existingMarchers = (marchers || []).filter(
            (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
        );
        while (
            existingMarchers.some(
                (marcher: Marcher) => marcher.drill_order === i.newOrder,
            )
        ) {
            i.newOrder++;
        }
        const newDrillOrder = i.newOrder;
        setDrillOrder(newDrillOrder);
        return newDrillOrder;
    }, [existingMarcher, section, marchers, drillPrefix]);

    function makeButtonString(quantity: number, section: string | undefined) {
        if (isEditMode) {
            return t("marchers.updateButton");
        }

        return t("marchers.createButtonWithSection", {
            quantity,
            section,
        });
    }

    const isPrefixChanged = useMemo(() => {
        if (!section || section === defaultSection(t)) return false;
        const sectionObject = getSectionObjectByName(section);
        if (!sectionObject) return false;
        return drillPrefix !== sectionObject.prefix && drillPrefixTouched;
    }, [section, drillPrefix, drillPrefixTouched, t]);

    useEffect(() => {
        if (section && section !== defaultSection(t)) {
            const sectionObject = getSectionObjectByName(section);
            if (
                sectionObject &&
                drillPrefix !== sectionObject.prefix &&
                !drillPrefixTouched
            ) {
                setDrillPrefix(sectionObject.prefix);
            }
        }
    }, [section, t, drillPrefix, drillPrefixTouched]);

    useEffect(() => {
        resetDrillOrder();
        if (drillPrefix && drillPrefix.length > 0) {
            setDrillPrefixError("");
        } else if (drillPrefixTouched) {
            setDrillPrefixError("Please enter a drill prefix");
        }
    }, [drillPrefix, drillPrefixTouched, resetDrillOrder]);

    useEffect(() => {
        validateDrillOrder(resetDrillOrder());
    }, [quantity, validateDrillOrder, resetDrillOrder]);

    useEffect(() => {
        if (
            !isEditMode &&
            marchers &&
            section &&
            section !== defaultSection(t)
        ) {
            resetDrillOrder();
        }
    }, [marchers, section, resetDrillOrder, t, isEditMode]);

    useEffect(() => {
        if (existingMarcher) {
            setSection(existingMarcher.section);
            setName(existingMarcher.name || "");
            setYear(existingMarcher.year || "");
            setDrillPrefix(existingMarcher.drill_prefix);
            setDrillOrder(existingMarcher.drill_order);
            setNotes(existingMarcher.notes || "");
        }
    }, [existingMarcher]);

    useEffect(() => {
        setSubmitIsDisabled(
            section === undefined ||
                drillPrefix === undefined ||
                drillOrder === undefined ||
                sectionError !== "" ||
                drillPrefixError !== "" ||
                drillOrderError !== "",
        );
    }, [
        section,
        drillPrefix,
        drillOrder,
        sectionError,
        drillPrefixError,
        drillOrderError,
        t,
    ]);

    return (
        <Form.Root
            onSubmit={handleSubmit}
            id="marcherForm"
            ref={formRef}
            className="flex flex-col gap-16"
        >
            <div className="flex flex-col gap-16">
                {!isEditMode && (
                    <FormField label={t("marchers.quantity")}>
                        <Input
                            type="number"
                            defaultValue={1}
                            onChange={handleQuantityChange}
                            step={1}
                            min={1}
                            max={100}
                        />
                    </FormField>
                )}
                <FormField label={t("marchers.section")}>
                    <Select
                        value={section}
                        onValueChange={handleSectionChange}
                        required
                    >
                        <SelectTriggerButton
                            label={section || t("marchers.section")}
                        />
                        <SelectContent>
                            {Object.values(SECTIONS).map((section) => {
                                return (
                                    <SelectItem
                                        key={section.name}
                                        value={section.name}
                                    >
                                        {getTranslatedSectionName(
                                            section.name,
                                            t,
                                        )}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </FormField>
                {isEditMode && existingMarcher && (
                    <>
                        <FormField label={t("marchers.name")}>
                            <Input
                                type="text"
                                placeholder="-"
                                aria-label="Marcher name input"
                                title="Marcher name input"
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                value={name}
                            />
                        </FormField>
                        <FormField label={t("marchers.year")}>
                            <Input
                                type="text"
                                placeholder="-"
                                aria-label="Marcher year input"
                                title="Marcher year input"
                                onChange={(event) =>
                                    setYear(event.target.value)
                                }
                                value={year}
                            />
                        </FormField>
                    </>
                )}
                <FormField label={t("marchers.drillPrefix")}>
                    <Input
                        type="text"
                        placeholder="-"
                        onChange={handlePrefixChange}
                        value={drillPrefix}
                        required
                        maxLength={3}
                    />
                </FormField>
                <FormField label={t("marchers.drillOrder")}>
                    <Input
                        type="number"
                        placeholder="-"
                        onChange={handleOrderChange}
                        value={drillOrder}
                        required
                        maxLength={3}
                    />
                </FormField>
                {isPrefixChanged && (
                    <WarningNote>
                        <T keyName="marchers.prefixChangedWarning" />
                    </WarningNote>
                )}
                {isEditMode && existingMarcher && (
                    <FormField label={t("marchers.notes")}>
                        <TextArea
                            className="max-w-[60%]"
                            rows={5}
                            placeholder={t("marchers.notesPlaceholder")}
                            aria-label="Marcher notes input"
                            title="Marcher notes input"
                            onChange={(event) => setNotes(event.target.value)}
                            value={notes}
                        />
                    </FormField>
                )}
            </div>

            <div className="flex flex-col gap-8">
                <Button
                    type="submit"
                    className="w-full"
                    aria-label="Create Marcher Button"
                    disabled={submitIsDisabled || disabledProp || !isEditReady}
                >
                    {makeButtonString(
                        quantity,
                        getTranslatedSectionName(section || "Other", t),
                    )}
                </Button>
                {!hideInfoNote && !isEditMode && (
                    <InfoNote>
                        <T keyName="marchers.createInfo" />
                    </InfoNote>
                )}
            </div>
        </Form.Root>
    );
};

export default MarcherForm;
