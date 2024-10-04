import * as Form from "@/components/templates/Form";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { Marcher } from "@/global/classes/Marcher";
import { getSectionObjectByName, SECTIONS } from "@/global/classes/Sections";

interface MarcherNewFormProps {
    disabledProp?: boolean;
}

const defaultSection = "default";
const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

// eslint-disable-next-line react/prop-types
const MarcherNewForm: React.FC<MarcherNewFormProps> = ({
    disabledProp = false,
}: MarcherNewFormProps) => {
    const [section, setSection] = useState<string>(defaultSection);
    const [drillPrefix, setDrillPrefix] = useState<string>(defaultDrillPrefix);
    const [drillOrder, setDrillOrder] = useState<number>(defaultDrillOrder);
    const [quantity, setQuantity] = useState<number>(1);
    const [sectionError, setSectionError] = useState<string>("");
    const [drillPrefixError, setDrillPrefixError] = useState<string>("");
    const [drillPrefixTouched, setDrillPrefixTouched] =
        useState<boolean>(false);
    const [drillOrderError, setDrillOrderError] = useState<string>("");
    const [alertMessages, setAlertMessages] = useState<string[]>([]);
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
        const existingMarchers = marchers.filter(
            (marcher: Marcher) => marcher.drill_prefix === drillPrefix,
        );
        // if (!drillOrderError && section && drillPrefix && drillOrder && quantity) {
        if (!submitIsDisabled) {
            const newAlertMessages = [...alertMessages];
            for (let i = 0; i < quantity; i++) {
                // Check to see if the drill order already exists
                let newDrillOrder = drillOrder + i + newDrillOrderOffset;
                // eslint-disable-next-line
                while (
                    existingMarchers.some(
                        (marcher: Marcher) =>
                            marcher.drill_order === newDrillOrder,
                    )
                ) {
                    newDrillOrderOffset++;
                    newDrillOrder++;
                }

                const response = await Marcher.createMarcher({
                    section,
                    drill_prefix: drillPrefix,
                    drill_order: newDrillOrder,
                });

                if (response.success)
                    newAlertMessages.unshift(
                        `Marcher ${drillPrefix + newDrillOrder} created successfully`,
                    );
                else {
                    newAlertMessages.unshift(
                        `Error creating marcher ${drillPrefix + newDrillOrder}`,
                    );
                    console.error(
                        `Error creating marcher ${drillPrefix + newDrillOrder}:`,
                        response.error,
                    );
                }
            }
            setAlertMessages(newAlertMessages);
            resetForm();
        }
    };

    const handleSectionChange = (
        event: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        setSection(defaultSection);
        const selectedSectionObject = getSectionObjectByName(
            event.target.value,
        );
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
        <form onSubmit={handleSubmit} id="newMarcherForm" ref={formRef}>
            <h4>Create new marchers</h4>
            <div className="mb-3">
                <Form.Group>
                    <Form.Label>Section</Form.Label>
                    <Form.Select
                        onChange={handleSectionChange}
                        required
                        isInvalid={!!sectionError}
                        value={section}
                        invalidMessage={sectionError}
                    >
                        <option value="default">Choose Section...</option>
                        {Object.values(SECTIONS).map((section) => {
                            return (
                                <option key={section.name}>
                                    {section.name}
                                </option>
                            );
                        })}
                    </Form.Select>
                </Form.Group>
            </div>

            <div className="grid grid-cols-3">
                <Form.Group>
                    <Form.Label>Drill Prefix</Form.Label>
                    <Form.Input
                        type="text"
                        placeholder="-"
                        onChange={handlePrefixChange}
                        value={drillPrefix}
                        required
                        maxLength={3}
                        isInvalid={!!drillPrefixError}
                        invalidMessage={drillPrefixError}
                    />
                </Form.Group>

                <Form.Group>
                    <Form.Label>Drill #</Form.Label>
                    <Form.Input
                        type="number"
                        placeholder="-"
                        onChange={handleOrderChange}
                        value={drillOrder}
                        isInvalid={!!drillOrderError}
                        required
                        min={1}
                        step={1}
                        disabled={quantity > 1}
                        invalidMessage={drillOrderError}
                    />
                    {/* <Form.Feedback type="invalid">{drillOrderError}</Form.Feedback> */}
                </Form.Group>

                <Form.Group>
                    <Form.Label>Quantity</Form.Label>
                    <Form.Input
                        type="number"
                        defaultValue={1}
                        onChange={handleQuantityChange}
                        step={1}
                        min={1}
                    />
                </Form.Group>
            </div>
            <div className="py-2">
                <button
                    className="btn-primary"
                    type="submit"
                    disabled={submitIsDisabled || disabledProp}
                >
                    {makeButtonString(quantity, section)}
                </button>
            </div>
            <span>Dev Note: new marchers may not show up until a refresh</span>
            {alertMessages.map((message, index) => (
                <Form.Alert
                    key={index}
                    type={message.startsWith("Error") ? "error" : "success"}
                    className="mt-3"
                    onClose={() =>
                        setAlertMessages(
                            alertMessages.filter((_, i) => i !== index),
                        )
                    }
                    dismissible
                >
                    {message}
                </Form.Alert>
            ))}
        </form>
    );
};

export default MarcherNewForm;
