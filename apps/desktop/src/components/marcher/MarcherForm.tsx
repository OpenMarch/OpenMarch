import { useCallback, useEffect, useRef, useState } from "react";
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
    marcherIdToEdit?: number;
}

const defaultSection = (t: (key: string) => string) =>
    getTranslatedSectionName("Other", t) || "Other";

const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

// eslint-disable-next-line react/prop-types, max-lines-per-function
const MarcherForm: React.FC<MarcherFormProps> = ({
    disabledProp = false,
    marcherIdToEdit,
}: MarcherFormProps) => {
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
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const createMarchers = useMutation(
        createMarchersMutationOptions(queryClient),
    ).mutate;
    const updateMarchers = useMutation(
        updateMarchersMutationOptions(queryClient),
    ).mutate;
    const [submitIsDisabled, setSubmitIsDisabled] = useState<boolean>(true);
    const formRef = useRef<HTMLFormElement>(null);
    const { setContent } = useSidebarModalStore();

    // Fetch existing marcher in edit mode
    const { data: existingMarcher } = useQuery({
        ...marcherQueryByIdOptions(marcherIdToEdit ?? -1),
        enabled: marcherIdToEdit !== undefined,
    });

    const { t } = useTolgee();

    useEffect(() => {
        setSection(defaultSection(t));
    }, [t]);

    const resetForm = () => {
        setQuantity(1);
        setSection(defaultSection(t));
        setName("");
        setYear("");
        setDrillPrefix(defaultDrillPrefix);
        setDrillOrder(defaultDrillOrder);
        setNotes("");
        setSectionError("");
        setDrillPrefixError("");
        setDrillPrefixTouched(false);
        setDrillOrderError("");

        if (formRef.current) formRef.current.reset();
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        setContent(<MarcherListContents />, "marchers");
        event.preventDefault();
        let newDrillOrderOffset = 0;
        const existingDrillOrders = new Set<number>(
            (marchers || [])
                .filter(
                    (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
                )
                .map((marcher: Marcher) => marcher.drill_order),
        );

        // if (!drillOrderError && section && drillPrefix && drillOrder && quantity) {
        if (!submitIsDisabled) {
            if (existingMarcher) {
                const updatedMarcher: ModifiedMarcherArgs = {
                    id: existingMarcher.id,
                    section: section || "Other",
                    name,
                    year,
                    drill_prefix: drillPrefix,
                    drill_order: drillOrder,
                    notes,
                };

                updateMarchers([updatedMarcher]);
            } else {
                const newMarchers: NewMarcherArgs[] = [];
                for (let i = 0; i < quantity; i++) {
                    // Check to see if the drill order already exists
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
                createMarchers(newMarchers);
            }
        }
        resetForm();
    };

    const handleSectionChange = (value: string) => {
        const selectedSectionObject = getSectionObjectByName(value);
        if (selectedSectionObject) {
            setSection(selectedSectionObject.name);
            setDrillPrefix(selectedSectionObject.prefix);
            setSectionError("");
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
        if (existingMarcher) {
            setDrillOrder(existingMarcher.drill_order);
            return existingMarcher.drill_order;
        }

        // this is an object to avoid an unsafe reference warning
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
    }, [existingMarcher, marchers, drillPrefix]);

    function makeButtonString(quantity: number, section: string | undefined) {
        if (section === t("section.other") || section === undefined) {
            return t("marchers.createButton", { quantity });
        }

        if (existingMarcher) {
            return t("marchers.updateButton");
        }

        return t("marchers.createButtonWithSection", {
            quantity,
            section,
        });
    }

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

    // Set state based on existing marcher in edit mode
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
            section === defaultSection(t) ||
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
            id="newMarcherForm"
            ref={formRef}
            className="flex h-full flex-col gap-16"
        >
            <div className="flex flex-col gap-16">
                {!existingMarcher && (
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
                {existingMarcher && (
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
                {existingMarcher && (
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
                    disabled={submitIsDisabled || disabledProp}
                >
                    {makeButtonString(
                        quantity,
                        getTranslatedSectionName(section || "Other", t),
                    )}
                </Button>
                <InfoNote>
                    <T keyName="marchers.createInfo" />
                </InfoNote>
            </div>
        </Form.Root>
    );
};

export default MarcherForm;
