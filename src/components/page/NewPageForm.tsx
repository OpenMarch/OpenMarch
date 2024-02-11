import { Alert, Button, Col, Dropdown, Form, Row } from "react-bootstrap";
import { useCallback, useEffect, useState } from "react";
import { usePageStore } from "../../global/Store";
import { NewPage, Page } from "../../global/Interfaces";
import { createPage } from "../../api/api";

interface NewPageFormProps {
    hasHeader?: boolean;
    disabledProp?: boolean;
}

// eslint-disable-next-line react/prop-types
const NewPageForm: React.FC<NewPageFormProps> = ({ hasHeader = false, disabledProp = false }) => {
    const [pageName, setPageName] = useState<string>("");
    const [counts, setCounts] = useState<number>(8);
    const [formCounts, setFormCounts] = useState<string>(counts.toString() || "8"); // used to reset the form when counts changes
    const [quantity, setQuantity] = useState<number>(1);
    const [pageNameError, setPageNameError] = useState<string>("");
    const [alertMessages, setAlertMessages] = useState<string[]>([]);
    const [isSubset, setIsSubset] = useState<boolean>(false);
    const [typing, setTyping] = useState<boolean>(false);
    const { pages, fetchPages } = usePageStore!();

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
                    const form = document.getElementById("newPageForm") as HTMLFormElement;
                    if (form) {
                        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    }
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
        setPageName("");
        setQuantity(1);
        setPageNameError("");

        const form = document.getElementById("newPageForm") as HTMLFormElement;
        if (form) form.reset();
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!pageNameError && pageName && counts && quantity) {
            const newAlertMessages = [...alertMessages];
            let newPageName = pageName;
            for (let i = 0; i < quantity; i++) {
                const newPage: NewPage = {
                    name: newPageName,
                    counts: counts,
                    tempo: 120,
                    time_signature: "4/4"
                }

                try {
                    await createPage(newPage);
                    newAlertMessages.unshift(`Page ${newPageName} (${counts} count${counts > 1 ? "s" : ""}) created successfully`);
                } catch (error) {
                    newAlertMessages.unshift(`Error creating page ${newPageName} (${counts} counts)`);
                    console.error(`Error creating page ${newPageName} (${counts} counts):`, error);
                }
                newPageName = getNextPageName(newPageName, isSubset) || "Error";
            }
            setAlertMessages(newAlertMessages);
            resetForm();
            fetchPages();
        }
    };

    const handlePageNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const name = event.target.value;
        setPageName(name);
        if (name === "")
            setPageNameError("Page name cannot be empty");
        else if (pages.some((page: Page) => page.name === name))
            setPageNameError("Page name already exists");
        else if (!/^\d+[A-Za-z]*$/.test(name))
            setPageNameError("Page must be one or more digits followed by zero or more letters. (e.g. 23, 1A)");
        else
            setPageNameError("");
    }

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

    const getNewPageName = useCallback(() => {
        if (pages.length === 0) return "1";
        const lastPage = pages[pages.length - 1];
        return getNextPageName(lastPage.name, isSubset);
    }, [pages, isSubset]);

    function getNextPageName(pageName: string, isSubsetArg = false) {
        if (pageName.length < 1) {
            console.error("Invalid page name: length < 1");
            return;
        }
        let pageNumber = 0;
        let subsetLetter = '';
        // extract the page number from the name
        const match = pageName.match(/^(\d+)([A-Za-z]*)$/);
        if (match) {
            pageNumber = parseInt(match[1], 10);

            // If subsetLetter is not present, set it to an empty string
            if (isSubsetArg) {
                subsetLetter = match[2];
                if (!subsetLetter) {
                    subsetLetter = 'A';
                } else {
                    // Increment the subset letter
                    subsetLetter = String.fromCharCode(subsetLetter.charCodeAt(0) + 1);
                }
            }
            return pageNumber + ((isSubsetArg && pageNumber > 0) ? 0 : 1) + subsetLetter;
        } else {
            console.error("Invalid page name: " + pageName);
            return;
        }
    }

    useEffect(() => {
        const newPageNumber = getNewPageName()?.toString() || "invalid";
        setPageName(newPageNumber);
    }, [getNewPageName, pages, isSubset]);

    // Update the form counts when counts changes
    useEffect(() => {
        if (formCounts !== "" && counts !== 1) {
            setFormCounts(counts.toString());
        }
    }, [counts, formCounts]);

    return (
        <Form onSubmit={handleSubmit} id="newPageForm">
            {hasHeader && <h4>Create new pages</h4>}
            <Row className="mb-3">
                <Form.Group as={Col} md={4} controlId="drillPrefixForm">
                    <Form.Label>Page #</Form.Label>
                    <Form.Control type="text" placeholder="-"
                        onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
                        onChange={handlePageNameChange}
                        value={pageName} required readOnly={isSubset}
                        isInvalid={!!pageNameError} />
                    <Form.Control.Feedback type="invalid">{pageNameError}</Form.Control.Feedback>
                </Form.Group>

                <Form.Group as={Col} md={4} controlId="drillOrderForm">
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

                <Form.Group as={Col} md={4} controlId="quantityForm">
                    <Form.Label>Quantity</Form.Label>
                    <Form.Control type="number" defaultValue={1}
                        onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
                        onChange={handleQuantityChange} step={1} min={1} />
                </Form.Group>
            </Row>
            <Row className="mb-3">
                <Form.Group as={Col} md={8} controlId="subsetCheck">
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
                        <Dropdown.Item href="#/action-5">Page numbers will automatically increment.</Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown>
            </Row>
            <Row className="py-2">
                <Button variant="primary" type="submit"
                    disabled={!pageName || disabledProp}
                >
                    {makeButtonString(quantity)}
                </Button>
            </Row>
            {alertMessages.map((message, index) => (
                <Alert key={index} variant={message.startsWith('Error') ? 'danger' : 'success'} className="mt-3"
                    onClose={() => setAlertMessages(alertMessages.filter((_, i) => i !== index))} dismissible>
                    {message}
                </Alert>
            ))}
        </Form>
    );
}

export default NewPageForm;
