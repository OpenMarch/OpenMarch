import { useCallback, useEffect, useRef, useState } from "react";
import { useMarcherStore } from "@/stores/MarcherStore";
import { Marcher, NewMarcherArgs } from "@/global/classes/Marcher";
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
} from "@openmarch/ui";
import { toast } from "sonner";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { MarcherListContents } from "./MarchersModal";
import FormField from "../ui/FormField";
import { T, useTolgee } from "@tolgee/react";

interface NewMarcherFormProps {
    disabledProp?: boolean;
}

const defaultSection = (t: (key: string) => string) =>
    getTranslatedSectionName("Other", t) || "Other";

const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

// eslint-disable-next-line react/prop-types
const NewMarcherForm: React.FC<NewMarcherFormProps> = ({
    disabledProp = false,
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
    const { marchers } = useMarcherStore()!;
    const [submitIsDisabled, setSubmitIsDisabled] = useState<boolean>(true);
    const formRef = useRef<HTMLFormElement>(null);
    const { setContent } = useSidebarModalStore();

    const { t } = useTolgee();

    useEffect(() => {
        setSection(defaultSection(t));
    }, [t]);

    const resetForm = () => {
        setSection(defaultSection(t));
        setDrillPrefix(defaultDrillPrefix);
        setDrillOrder(defaultDrillOrder);
        setQuantity(1);
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
            marchers
                .filter(
                    (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
                )
                .map((marcher: Marcher) => marcher.drill_order),
        );
        // if (!drillOrderError && section && drillPrefix && drillOrder && quantity) {
        if (!submitIsDisabled) {
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
            const response = await Marcher.createMarchers(newMarchers);
            const drillNumbers = response.data.map(
                (marcher: Marcher) => marcher.drill_number,
            );

            if (response.success)
                toast.success(
                    t("marchers.created", {
                        count: response.data.length,
                        drillNumbers: drillNumbers.join(", "),
                    }),
                );
            else {
                toast.error(
                    t("marchers.createError", {
                        count: response.data.length,
                        drillNumbers: drillNumbers.join(", "),
                    }),
                );
                console.error(
                    `Error creating marcher${
                        response.data.length === 1 ? "" : "s"
                    } ${drillNumbers.join(", ")}`,
                    response.error,
                );
            }
        }
        resetForm();
    };

    const handleSectionChange = (value: string) => {
        setSection(defaultSection(t));
        const selectedSectionObject = getSectionObjectByName(value);
        if (selectedSectionObject) {
            setSection(selectedSectionObject.name);
            setDrillPrefix(selectedSectionObject.prefix);
            setSectionError("");
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
            const existingMarchers = marchers.filter(
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
        const existingMarchers = marchers.filter(
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
                    <Select onValueChange={handleSectionChange} required>
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

export default NewMarcherForm;
