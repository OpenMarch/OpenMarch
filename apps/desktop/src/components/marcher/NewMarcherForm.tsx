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
} from "@openmarch/ui";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { MarcherListContents } from "./MarchersModal";
import FormField from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    allMarchersQueryOptions,
    createMarchersMutationOptions,
} from "@/hooks/queries";
import { NewMarcherArgs } from "@/db-functions";

interface NewMarcherFormProps {
    disabledProp?: boolean;
    hideInfoNote?: boolean;
    skipSidebarContent?: boolean;
    onMarchersCreate?: (newMarchers: NewMarcherArgs[]) => void;
    existingMarchers?: Marcher[];
    wizardMode?: boolean;
}

const defaultSection = (t: (key: string) => string) =>
    getTranslatedSectionName("Other", t) || "Other";

const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

// eslint-disable-next-line react/prop-types, max-lines-per-function
const NewMarcherForm: React.FC<NewMarcherFormProps> = ({
    disabledProp = false,
    hideInfoNote = false,
    skipSidebarContent = false,
    onMarchersCreate,
    existingMarchers,
    wizardMode = false,
}: NewMarcherFormProps) => {
    const [section, setSection] = useState<string>();
    const [drillPrefix, setDrillPrefix] = useState<string>(defaultDrillPrefix);
    const [drillOrder, setDrillOrder] = useState<number>(defaultDrillOrder);
    const [quantity, setQuantity] = useState<number>(1);
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
    const [submitIsDisabled, setSubmitIsDisabled] = useState<boolean>(true);
    const formRef = useRef<HTMLFormElement>(null);
    const { setContent } = useSidebarModalStore();

    const { t } = useTolgee();

    useEffect(() => {
        setSection(defaultSection(t));
    }, [t]);

    const resetForm = (preserveSection = false) => {
        // Only reset section and prefix if not preserving
        if (!preserveSection) {
            setSection(defaultSection(t));
            setDrillPrefix(defaultDrillPrefix);
        }
        // Always reset quantity and errors
        setQuantity(1);
        setSectionError("");
        setDrillPrefixError("");
        setDrillPrefixTouched(false);
        setDrillOrderError("");
        // Reset drill order - this will be recalculated by useEffect when quantity changes
        // or when marchers data updates

        if (formRef.current) formRef.current.reset();
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        if (!skipSidebarContent) {
            setContent(<MarcherListContents />, "marchers");
        }
        event.preventDefault();

        if (submitIsDisabled) return;

        let newDrillOrderOffset = 0;
        const existingDrillOrders = new Set<number>(
            (marchers || [])
                .filter(
                    (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
                )
                .map((marcher: Marcher) => marcher.drill_order),
        );

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

        try {
            if (onMarchersCreate) {
                // Use callback if provided (Wizard mode)
                onMarchersCreate(newMarchers);
            } else if (!wizardMode) {
                // Otherwise use mutation (DB mode), but ONLY if not in wizard mode
                await createMarchersMutation.mutateAsync(newMarchers);
            } else {
                console.warn(
                    "NewMarcherForm: wizardMode is true but onMarchersCreate is not provided. Skipping DB mutation.",
                );
            }
            // Preserve section and prefix so user can create more marchers in same section
            resetForm(true);
        } catch (error) {
            // Error is already handled by the mutation's onError callback
            console.error("Error creating marchers:", error);
        }
    };

    const handleSectionChange = (value: string) => {
        const selectedSectionObject = getSectionObjectByName(value);
        if (selectedSectionObject) {
            setSection(selectedSectionObject.name);
            setDrillPrefix(selectedSectionObject.prefix);
            setSectionError("");
            // Reset drill prefix touched state when section changes
            setDrillPrefixTouched(false);
        } else {
            console.error("Section not found");
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
                    (marcher: Marcher) => marcher.drill_order === drillOrder,
                )
            ) {
                setDrillOrderError(t("marchers.drillOrderError.exists"));
            } else {
                setDrillOrderError("");
            }
        },
        [marchers, drillPrefix, t],
    );

    const handleQuantityChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        if (event.target.value === "") setQuantity(1);
        else setQuantity(parseInt(event.target.value));
    };

    const resetDrillOrder = useCallback(() => {
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
    }, [marchers, drillPrefix]);

    function makeButtonString(quantity: number, section: string | undefined) {
        if (section === t("section.other") || section === undefined) {
            return t("marchers.createButton", { quantity });
        }
        return t("marchers.createButtonWithSection", {
            quantity,
            section,
        });
    }

    // Check if prefix differs from section default
    const isPrefixChanged = useMemo(() => {
        if (!section || section === defaultSection(t)) return false;
        const sectionObject = getSectionObjectByName(section);
        if (!sectionObject) return false;
        return drillPrefix !== sectionObject.prefix && drillPrefixTouched;
    }, [section, drillPrefix, drillPrefixTouched, t]);

    // Ensure prefix is set when section changes
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

    // Reset drill order when marchers data updates (e.g., after creating new marchers)
    useEffect(() => {
        if (marchers && section && section !== defaultSection(t)) {
            resetDrillOrder();
        }
    }, [marchers, section, resetDrillOrder, t]);

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
            className="flex flex-col gap-16"
        >
            <div className="flex flex-col gap-16">
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
                {!hideInfoNote && (
                    <InfoNote>
                        <T keyName="marchers.createInfo" />
                    </InfoNote>
                )}
            </div>
        </Form.Root>
    );
};

export default NewMarcherForm;
