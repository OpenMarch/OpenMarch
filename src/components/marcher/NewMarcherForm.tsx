import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { sections } from "../../global/Constants";
import { useCallback, useEffect, useState } from "react";
import { useMarcherStore } from "../../global/Store";
import { Marcher, NewMarcher } from "../../global/Interfaces";
import { createMarcher } from "../../api/api";

interface NewMarcherFormProps {
    hasHeader?: boolean;
    disabledProp?: boolean;
}

const defaultSection = "default";
const defaultDrillPrefix = "-";
const defaultDrillOrder = 1;

const NewMarcherForm: React.FC<NewMarcherFormProps> = ({ hasHeader = false, disabledProp = false }) => {
    const [section, setSection] = useState<string>(defaultSection);
    const [drillPrefix, setDrillPrefix] = useState<string>(defaultDrillPrefix);
    const [drillOrder, setDrillOrder] = useState<number>(defaultDrillOrder);
    const [quantity, setQuantity] = useState<number>(1);
    const [sectionError, setSectionError] = useState<string>("");
    const [drillPrefixError, setDrillPrefixError] = useState<string>("");
    const [drillPrefixTouched, setDrillPrefixTouched] = useState<boolean>(false);
    const [drillOrderError, setDrillOrderError] = useState<string>("");
    const [alertMessages, setAlertMessages] = useState<string[]>([]);
    const { marchers, fetchMarchers } = useMarcherStore!();
    const [submitIsDisabled, setSubmitIsDisabled] = useState<boolean>(true);

    const resetForm = () => {
        setSection(defaultSection);
        setDrillPrefix(defaultDrillPrefix);
        setDrillOrder(defaultDrillOrder);
        setQuantity(1);
        setSectionError("");
        setDrillPrefixError("");
        setDrillPrefixTouched(false);
        setDrillOrderError("");

        const form = document.getElementById("newMarcherForm") as HTMLFormElement;
        if (form) form.reset();
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        let newDrillOrderOffset = 0;
        const existingMarchers = marchers.filter((marcher: Marcher) => marcher.drill_prefix === drillPrefix);
        // if (!drillOrderError && section && drillPrefix && drillOrder && quantity) {
        if (!submitIsDisabled) {
            const newAlertMessages = [...alertMessages];
            for (let i = 0; i < quantity; i++) {
                // Check to see if the drill order already exists
                let newDrillOrder = drillOrder + i + newDrillOrderOffset;
                // eslint-disable-next-line
                while (existingMarchers.some((marcher: Marcher) => marcher.drill_order === newDrillOrder)) {
                    newDrillOrderOffset++;
                    newDrillOrder++;
                }

                const newMarcher: NewMarcher = {
                    name: "",
                    section: section,
                    drill_prefix: drillPrefix,
                    drill_order: newDrillOrder,
                }

                try {
                    await createMarcher(newMarcher);
                    newAlertMessages.unshift(`Marcher ${drillPrefix + newDrillOrder} created successfully`);
                } catch (error) {
                    newAlertMessages.unshift(`Error creating marcher ${drillPrefix + newDrillOrder}`);
                    console.error(`Error creating marcher ${drillPrefix + newDrillOrder}:`, error);
                }
            }
            setAlertMessages(newAlertMessages);
            resetForm();
            fetchMarchers();
        }
    };

    const handleSectionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSection(defaultSection);
        const selectedSection = Object.values(sections).find(
            (section: any) => section.name === event.target.value
        );
        if (selectedSection) {
            setSection(selectedSection.name);
            setDrillPrefix(selectedSection.prefix);
            setSectionError("");
        } else {
            console.error("Section not found");
            setSectionError("Please choose a section");

        }
    };

    const handlePrefixChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDrillPrefix(event.target.value);
        setDrillPrefixTouched(true);
    }

    const handleOrderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const drillOrder = parseInt(event.target.value);
        setDrillOrder(drillOrder);
        validateDrillOrder(drillOrder);
    }

    const validateDrillOrder = useCallback((drillOrder: number) => {
        const existingMarchers = marchers.filter((marcher: Marcher) => marcher.drill_prefix === drillPrefix);
        if (existingMarchers.some((marcher: Marcher) => marcher.drill_order === drillOrder)) {
            setDrillOrderError("This drill number already exists");
        } else {
            setDrillOrderError("");
        }
    }, [marchers, drillPrefix]);

    const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === "")
            setQuantity(1);
        else
            setQuantity(parseInt(event.target.value));
    }

    const resetDrillOrder = useCallback(() => {
        // this is an object to avoid an unsafe reference warning
        const i = { newOrder: 1 };
        const existingMarchers = marchers.filter((marcher: Marcher) => marcher.drill_prefix === drillPrefix);
        while (existingMarchers.some((marcher: Marcher) => marcher.drill_order === i.newOrder)) {
            i.newOrder++;
        }
        const newDrillOrder = i.newOrder;
        setDrillOrder(newDrillOrder);
        return newDrillOrder;
    }, [marchers, drillPrefix]);

    function makeButtonString(quantity: number, section: string | undefined) {
        let section_string = "Marcher"
        let quantity_string = " "
        if (quantity > 1) {
            quantity_string = quantity + " ";
            section_string += 's';
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
            section === defaultSection || section === undefined ||
            drillPrefix === undefined ||
            drillOrder === undefined ||
            sectionError !== "" ||
            drillPrefixError !== "" ||
            drillOrderError !== ""
        );
    }, [section, drillPrefix, drillOrder, sectionError, drillPrefixError, drillOrderError]);

    return (
        <Form onSubmit={handleSubmit} id="newMarcherForm">
            {hasHeader && <h4>Create new marchers</h4>}
            <Row className="mb-3">
                <Form.Group as={Col} md={12} controlId="sectionForm">
                    <Form.Label>Section</Form.Label>
                    <Form.Select onChange={handleSectionChange}
                        required isInvalid={!!sectionError} value={section}
                    >
                        <option value="default">Choose Section...</option>
                        {Object.values(sections).map((section: any) => {
                            return <option key={section.name}>{section.name}</option>
                        })}
                    </Form.Select>
                    <Form.Control.Feedback type="invalid">{sectionError}</Form.Control.Feedback>
                </Form.Group>

            </Row>

            <Row className="mb-3">
                <Form.Group as={Col} md={4} controlId="drillPrefixForm">
                    <Form.Label>Drill Prefix</Form.Label>
                    <Form.Control type="text" placeholder="-"
                        onChange={handlePrefixChange} value={drillPrefix} required
                        maxLength={3} isInvalid={!!drillPrefixError} />
                    <Form.Control.Feedback type="invalid">{drillPrefixError}</Form.Control.Feedback>
                </Form.Group>

                <Form.Group as={Col} md={4} controlId="drillOrderForm">
                    <Form.Label>Drill #</Form.Label>
                    <Form.Control type="number" placeholder="-"
                        onChange={handleOrderChange} value={drillOrder}
                        isInvalid={!!drillOrderError} required
                        min={1} step={1} disabled={quantity > 1}
                    />
                    <Form.Control.Feedback type="invalid">{drillOrderError}</Form.Control.Feedback>
                </Form.Group>

                <Form.Group as={Col} md={4} controlId="quantityForm">
                    <Form.Label>Quantity</Form.Label>
                    <Form.Control type="number" defaultValue={1}
                        onChange={handleQuantityChange} step={1} min={1} />
                </Form.Group>
            </Row>
            <Row className="py-2">
                <Button variant="primary" type="submit"
                    disabled={submitIsDisabled || disabledProp}
                >
                    {makeButtonString(quantity, section)}
                </Button>
            </Row>
            <span>Dev Note: new marchers may not show up until a refresh</span>
            {alertMessages.map((message, index) => (
                <Alert key={index} variant={message.startsWith('Error') ? 'danger' : 'success'} className="mt-3"
                    onClose={() => setAlertMessages(alertMessages.filter((_, i) => i !== index))} dismissible>
                    {message}
                </Alert>
            ))}
        </Form>
    );
}

export default NewMarcherForm;
