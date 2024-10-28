import { useCallback, useEffect, useRef, useState } from "react";
import { useMarcherStore } from "@/stores/MarcherStore";
import { Marcher, NewMarcherArgs } from "@/global/classes/Marcher";
import { getSectionObjectByName, SECTIONS } from "@/global/classes/Sections";
import * as Form from "@radix-ui/react-form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "../ui/Select";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { toast } from "sonner";
import { InfoNote } from "../ui/Note";

interface NewMarcherFormProps {
    disabledProp?: boolean;
}

const defaultSection = "Section";
const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

// eslint-disable-next-line react/prop-types
const NewMarcherForm: React.FC<NewMarcherFormProps> = ({
    disabledProp = false,
}: NewMarcherFormProps) => {
    const [section, setSection] = useState<string>(defaultSection);
    const [drillPrefix, setDrillPrefix] = useState<string>(defaultDrillPrefix);
    const [drillOrder, setDrillOrder] = useState<number>(defaultDrillOrder);
    const [quantity, setQuantity] = useState<number>(1);
    const [sectionError, setSectionError] = useState<string>("");
    const [drillPrefixError, setDrillPrefixError] = useState<string>("");
    const [drillPrefixTouched, setDrillPrefixTouched] =
        useState<boolean>(false);
    const [drillOrderError, setDrillOrderError] = useState<string>("");
    const { marchers } = useMarcherStore!();
    const [submitIsDisabled, setSubmitIsDisabled] = useState<boolean>(true);
    const formRef = useRef<HTMLFormElement>(null);

    const resetForm = () => {
        setSection(defaultSection);
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
                let newDrillOrder = drillOrder + i + newDrillOrderOffset;
                while (existingDrillOrders.has(newDrillOrder)) {
                    newDrillOrder++;
                }
                newDrillOrderOffset = newDrillOrder - drillOrder;
                existingDrillOrders.add(newDrillOrder);

                newMarchers.push({
                    section,
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
                    `Marcher${
                        response.data.length === 1 ? "" : "s"
                    } ${drillNumbers.join(", ")} created successfully`,
                );
            else {
                toast.error(
                    `Error creating marcher${
                        response.data.length === 1 ? "" : "s"
                    } ${drillNumbers.join(", ")}`,
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
        setSection(defaultSection);
        const selectedSectionObject = getSectionObjectByName(value);
        if (selectedSectionObject) {
            setSection(selectedSectionObject.name);
            setDrillPrefix(selectedSectionObject.prefix);
            setSectionError("");
        } else {
            console.error("Section not found");
            setSectionError("Please choose a section");
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
                setDrillOrderError("This drill number already exists");
            } else {
                setDrillOrderError("");
            }
        },
        [marchers, drillPrefix],
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
        let section_string = "Marcher";
        let quantity_string = " ";
        if (quantity > 1) {
            quantity_string = quantity + " ";
            section_string += "s";
        }

        if (section !== defaultSection) {
            section_string = section + " " + section_string;
        }
        return "Create " + quantity_string + section_string;
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
            section === defaultSection ||
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
    ]);

    return (
        <Form.Root
            onSubmit={handleSubmit}
            id="newMarcherForm"
            ref={formRef}
            className="flex h-full flex-col justify-between"
        >
            <div className="flex flex-col gap-16 px-12">
                <Form.Field
                    name="Quantity"
                    className="flex items-center justify-between"
                >
                    <Form.Label className="w-full text-body text-text/80">
                        Quantity
                    </Form.Label>
                    <Form.Control asChild>
                        <Input
                            type="number"
                            defaultValue={1}
                            onChange={handleQuantityChange}
                            step={1}
                            min={1}
                            max={100}
                        />
                    </Form.Control>
                    <Form.Message
                        match={"valueMissing"}
                        className="text-sub leading-none text-red"
                    >
                        Please enter a value.
                    </Form.Message>
                </Form.Field>
                <Form.Field
                    name="section"
                    className="flex items-center justify-between"
                >
                    <Form.Label className="text-body text-text/80">
                        Section
                    </Form.Label>
                    <Form.Control asChild>
                        <Select onValueChange={handleSectionChange} required>
                            <SelectTriggerButton label={section || "Section"} />
                            <SelectContent>
                                {Object.values(SECTIONS).map((section) => {
                                    return (
                                        <SelectItem
                                            key={section.name}
                                            value={section.name}
                                        >
                                            {section.name}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </Form.Control>
                    <Form.Message
                        match={"valueMissing"}
                        className="text-sub leading-none text-red"
                    >
                        Please enter a value.
                    </Form.Message>
                </Form.Field>
                <Form.Field
                    name="Drill Prefix"
                    className="flex items-center justify-between"
                >
                    <Form.Label className="text-body text-text/80">
                        Drill Prefix
                    </Form.Label>
                    <Form.Control asChild>
                        <Input
                            type="text"
                            placeholder="-"
                            onChange={handlePrefixChange}
                            value={drillPrefix}
                            required
                            maxLength={3}
                        />
                    </Form.Control>
                    <Form.Message
                        match={"valueMissing"}
                        className="text-sub leading-none text-red"
                    >
                        Please enter a value.
                    </Form.Message>
                </Form.Field>

                <Form.Field
                    name="Drill Number"
                    className="flex items-center justify-between gap-32"
                >
                    <Form.Label className="text-body text-text/80">
                        Drill Number
                    </Form.Label>
                    <Form.Control asChild>
                        <Input
                            type="number"
                            placeholder="-"
                            onChange={handleOrderChange}
                            value={drillOrder}
                            required
                            maxLength={3}
                        />
                    </Form.Control>
                    <Form.Message
                        match={"valueMissing"}
                        className="text-sub leading-none text-red"
                    >
                        Please enter a value.
                    </Form.Message>
                </Form.Field>
            </div>

            <div className="flex flex-col gap-8">
                <InfoNote>
                    New marchers may not show up until a refresh
                </InfoNote>
                <Button
                    type="submit"
                    className="w-full"
                    disabled={submitIsDisabled || disabledProp}
                >
                    {makeButtonString(quantity, section)}
                </Button>
            </div>
        </Form.Root>
    );
};

export default NewMarcherForm;
