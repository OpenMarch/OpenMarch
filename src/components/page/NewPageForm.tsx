import { Alert, Button, Col, Dropdown, Form, Row } from "react-bootstrap";
import { useEffect, useRef, useState } from "react";
import { usePageStore } from "@/stores/page/usePageStore";
import { NewPageArgs, Page } from "@/global/classes/Page";
import { TimeSignature } from "@/global/classes/TimeSignature";

interface NewPageFormProps {
    hasHeader?: boolean;
    disabledProp?: boolean;
}

/**
 * A form to create new pages.
 *
 * @param {boolean} hasHeader - Whether to display a header. False by default.
 * @param {boolean} disabledProp - Whether the form is disabled. False by default.
 * @returns NewPageForm component.
 */
// eslint-disable-next-line react/prop-types
const NewPageForm: React.FC<NewPageFormProps> = ({ hasHeader = false, disabledProp = false }) => {
    const [previousPage, setPreviousPage] = useState<Page | undefined>(undefined);
    const [counts, setCounts] = useState<number>(8);
    const [formCounts, setFormCounts] = useState<string>(counts.toString() || "8"); // used to reset the form when counts changes
    const [tempo, setTempo] = useState<number>(120);
    const [formTempo, setFormTempo] = useState<string>(tempo.toString() || "120"); // used to reset the form when tempo changes
    const [quantity, setQuantity] = useState<number>(1);
    const [alertMessages, setAlertMessages] = useState<string[]>([]);
    const [isSubset, setIsSubset] = useState<boolean>(false);
    const [typing, setTyping] = useState<boolean>(false);
    const { pages } = usePageStore!();
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!typing) {
            const handleKeyDown = (event: KeyboardEvent) => {
                const activeElement = document.activeElement as HTMLInputElement;

                if (event.key === 'ArrowRight') {
                    setCounts(counts => counts + 4);
                } else if (event.key === 'ArrowLeft') {
                    setCounts(counts => Math.max(0, counts - 4));
                } else if (event.key === 'ArrowUp' && activeElement.id !== 'quantityForm') {
                    setCounts(counts => counts + 1);
                } else if (event.key === 'ArrowDown' && activeElement.id !== 'quantityForm') {
                    setCounts(counts => Math.max(0, counts - 1));
                } else if (event.key === 'Enter') {
                    formRef.current?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                } else if (event.key === 's' || event.key === 'S') {
                    event.preventDefault();
                    setIsSubset(isSubset => !isSubset);
                }
            };

            window.addEventListener('keydown', handleKeyDown);

            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
        // eslint-disable-next-line
    }, [typing, counts, isSubset]);

    const resetForm = () => {
        setQuantity(1);
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (counts && quantity) {
            const newAlertMessages = [...alertMessages];
            const newPageArgs: NewPageArgs[] = [];
            for (let i = 0; i < quantity; i++) {
                const newPageArg: NewPageArgs = {
                    previousPage: previousPage,
                    isSubset: isSubset,
                    counts: counts,
                    tempo: tempo,
                    time_signature: TimeSignature.fromString("4/4")
                }
                newPageArgs.push(newPageArg);
            }

            const response = await Page.createPages(newPageArgs, pages);

            if (response.success && response.newPages) {
                const newPageNames = response.newPages.map(page => page.name);
                newAlertMessages.unshift(`Page ${newPageNames.toString()} created successfully`);
            }
            else {
                console.error(`Error creating pages:`, response.error?.message || "");
                newAlertMessages.unshift(`Error creating pages`);
            }

            setAlertMessages(newAlertMessages);
            resetForm();
        }
    };

    const handlePreviousPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedPageId = parseInt(event.target.value);
        if (selectedPageId === -1)
            setPreviousPage(undefined);
        else
            setPreviousPage(pages.find(page => page.id === selectedPageId) || undefined);
    };

    const handleCountsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === "") {
            setFormCounts("");
            setCounts(0);
        }
        else {
            setFormCounts(event.target.value);
            setCounts(parseInt(event.target.value));
        }
    };

    const handleTempoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === "") {
            setFormTempo("");
            setTempo(0);
        }
        else {
            setFormTempo(event.target.value);
            setTempo(parseInt(event.target.value));
        }
    };

    const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === "")
            setQuantity(1);
        else
            setQuantity(parseInt(event.target.value));
    };

    const handleIsSubsetChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setIsSubset(event.target.checked);
    }

    function makeButtonString(quantity: number) {
        let suffix = "Page"
        if (quantity > 1) {
            suffix = quantity + " " + suffix + "s";
        }

        return "Create " + suffix;
    }

    // Update the form counts when counts changes
    useEffect(() => {
        if (formCounts !== "" && counts !== 1) {
            setFormCounts(counts.toString());
        }
    }, [counts, formCounts]);

    return (
        <Form onSubmit={handleSubmit} id="newPageForm" ref={formRef} aria-label="New Page Form">
            {hasHeader && <h4>Create new pages</h4>}
            <Row className="mb-3">
                <Form.Group as={Col} md={4} controlId="previous page" aria-label="new page previous page">
                    <Form.Label>Prev. Pg.</Form.Label>
                    <Form.Select aria-label="Select the previous page" onChange={handlePreviousPageChange}>
                        <option value={-1}>Last</option>
                        {pages.map((page, index) => (
                            <option key={index} value={page.id}>{page.name}</option>
                        ))}
                    </Form.Select>
                </Form.Group>

                <Form.Group as={Col} md={4} controlId="counts" aria-label="new page counts">
                    <Form.Label>Counts</Form.Label>
                    <Form.Control type="number" placeholder="-"
                        onFocus={() => setTyping(true)}
                        onBlur={() => {
                            setTyping(false);
                            if (counts === 0) {
                                setCounts(1);
                                setFormCounts("1");
                            } else
                                setFormCounts(counts.toString())
                        }}
                        value={formCounts} onChange={handleCountsChange}
                        required min={1} step={1} disabled={quantity > 1}
                    />
                </Form.Group>

                <Form.Group as={Col} md={4} controlId="tempo" aria-label="new page tempo">
                    <Form.Label>Tempo</Form.Label>
                    <Form.Control type="number" placeholder="-"
                        onFocus={() => setTyping(true)}
                        onBlur={() => {
                            setTyping(false);
                            if (tempo === 0) {
                                setTempo(1);
                                setFormTempo("1");
                            } else
                                setFormTempo(tempo.toString())
                        }}
                        value={formTempo} onChange={handleTempoChange}
                        required min={1} step={1} disabled={quantity > 1}
                    />
                </Form.Group>
            </Row>
            <Row className="mb-3">

                <Form.Group as={Col} md={4} controlId="quantityForm" aria-label="new page quantity">
                    <Form.Label>Quantity</Form.Label>
                    <Form.Control type="number" defaultValue={1}
                        onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
                        onChange={handleQuantityChange} step={1} min={1} />
                </Form.Group>
                <Form.Group as={Col} md={4} controlId="subsetCheck" aria-label="new page is subset checkbox">
                    <Form.Check type="checkbox" label="Subset" checked={isSubset} onChange={handleIsSubsetChange} />
                </Form.Group>
                <Dropdown as={Col} md={4}>
                    <Dropdown.Toggle variant="info" id="dropdown-basic">
                        Shortcuts
                    </Dropdown.Toggle>

                    <Dropdown.Menu>
                        <Dropdown.Item href="#/action-1">Use left/right to increment counts by 4.</Dropdown.Item>
                        <Dropdown.Item href="#/action-2">Use up/down to increment count by 1.</Dropdown.Item>
                        <Dropdown.Item href="#/action-3">Press [S] to toggle subset.</Dropdown.Item>
                        <Dropdown.Item href="#/action-4">Press [Enter] to submit.</Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown>
            </Row>
            <Row className="py-2">
                <Button variant="primary" type="submit" aria-label="create page button"
                    disabled={disabledProp}
                >
                    {makeButtonString(quantity)}
                </Button>
            </Row>
            {alertMessages.map((message, index) => (
                <Alert key={index} variant={message.startsWith('Error') ? 'danger' : 'success'} className="mt-3"
                    onClose={() => setAlertMessages(alertMessages.filter((_, i) => i !== index))} dismissible
                    aria-label='create page response'
                >
                    {message}
                </Alert>
            ))}
        </Form>
    );
}

export default NewPageForm;
