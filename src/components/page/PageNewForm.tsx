import * as Form from "@/components/templates/Form";
import { useEffect, useRef, useState } from "react";
import { usePageStore } from "@/stores/page/usePageStore";
import Page, { NewPageArgs } from "@/global/classes/Page";
import {
    FaArrowDown,
    FaArrowLeft,
    FaArrowRight,
    FaArrowUp,
} from "react-icons/fa";

interface PageNewFormProps {
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
const PageNewForm: React.FC<PageNewFormProps> = ({
    hasHeader = false,
    disabledProp = false,
}) => {
    const [previousPage, setPreviousPage] = useState<Page | undefined>(
        undefined,
    );
    const [counts, setCounts] = useState<number>(8);
    const [formCounts, setFormCounts] = useState<string>(
        counts.toString() || "8",
    ); // used to reset the form when counts changes
    const [quantity, setQuantity] = useState<number>(1);
    const [alertMessages, setAlertMessages] = useState<string[]>([]);
    const [isSubset, setIsSubset] = useState<boolean>(false);
    const [typing, setTyping] = useState<boolean>(false);
    const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
    const { pages } = usePageStore!();
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (!typing) {
            const handleKeyDown = (event: KeyboardEvent) => {
                const activeElement =
                    document.activeElement as HTMLInputElement;

                if (event.key === "ArrowRight") {
                    setCounts((counts) => counts + 4);
                } else if (event.key === "ArrowLeft") {
                    setCounts((counts) => Math.max(0, counts - 4));
                } else if (
                    event.key === "ArrowUp" &&
                    activeElement.id !== "quantityForm"
                ) {
                    setCounts((counts) => counts + 1);
                } else if (
                    event.key === "ArrowDown" &&
                    activeElement.id !== "quantityForm"
                ) {
                    setCounts((counts) => Math.max(0, counts - 1));
                } else if (event.key === "Enter") {
                    formRef.current?.dispatchEvent(
                        new Event("submit", {
                            cancelable: true,
                            bubbles: true,
                        }),
                    );
                } else if (event.key === "s" || event.key === "S") {
                    event.preventDefault();
                    setIsSubset((isSubset) => !isSubset);
                }
            };

            window.addEventListener("keydown", handleKeyDown);

            return () => {
                window.removeEventListener("keydown", handleKeyDown);
            };
        }
        // eslint-disable-next-line
    }, [typing, counts, isSubset]);

    const resetForm = () => {
        setQuantity(1);
    };

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
                };
                newPageArgs.push(newPageArg);
            }

            const response = await Page.createPages(newPageArgs);

            if (response.success && response.newPages) {
                const newPageNames = response.newPages.map((page) => page.name);
                newAlertMessages.unshift(
                    `Page ${newPageNames.toString()} created successfully`,
                );
            } else {
                console.error(
                    `Error creating pages:`,
                    response.error?.message || "",
                );
                newAlertMessages.unshift(`Error creating pages`);
            }

            setAlertMessages(newAlertMessages);
            resetForm();
        }
    };

    const handlePreviousPageChange = (
        event: React.ChangeEvent<HTMLSelectElement>,
    ) => {
        const selectedPageId = parseInt(event.target.value);
        if (selectedPageId === -1) setPreviousPage(undefined);
        else
            setPreviousPage(
                pages.find((page) => page.id === selectedPageId) || undefined,
            );
    };

    const handleCountsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.value === "") {
            setFormCounts("");
            setCounts(0);
        } else {
            setFormCounts(event.target.value);
            setCounts(parseInt(event.target.value));
        }
    };

    const handleQuantityChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        if (event.target.value === "") setQuantity(1);
        else setQuantity(parseInt(event.target.value));
    };

    const handleIsSubsetChange = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        setIsSubset(event.target.checked);
    };

    function makeButtonString(quantity: number) {
        let suffix = "Page";
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
        <form
            onSubmit={handleSubmit}
            id="newPageForm"
            ref={formRef}
            aria-label="New Page Form"
        >
            {hasHeader && <h4>Create new pages</h4>}
            <div className="grid grid-cols-2">
                <Form.Group aria-label="new page previous page">
                    <Form.Label>Prev. Pg.</Form.Label>
                    <Form.Select
                        aria-label="Select the previous page"
                        onChange={handlePreviousPageChange}
                    >
                        <option value={-1}>Last</option>
                        {pages.map((page, index) => (
                            <option key={index} value={page.id}>
                                {page.name}
                            </option>
                        ))}
                    </Form.Select>
                </Form.Group>

                <Form.Group>
                    <Form.Label htmlFor="countsForm">Counts</Form.Label>
                    <Form.Input
                        type="number"
                        placeholder="-"
                        aria-label="new page counts"
                        id="countsForm"
                        onFocus={() => setTyping(true)}
                        onBlur={() => {
                            setTyping(false);
                            if (counts === 0) {
                                setCounts(1);
                                setFormCounts("1");
                            } else setFormCounts(counts.toString());
                        }}
                        value={formCounts}
                        onChange={handleCountsChange}
                        required
                        min={1}
                        step={1}
                    />
                </Form.Group>
            </div>
            <div className="grid grid-cols-2">
                <Form.Group aria-label="new page quantity">
                    <Form.Label htmlFor="quantityForm">Quantity</Form.Label>
                    <Form.Input
                        type="number"
                        defaultValue={1}
                        id="quantityForm"
                        onFocus={() => setTyping(true)}
                        onBlur={() => setTyping(false)}
                        onChange={handleQuantityChange}
                        step={1}
                        min={1}
                    />
                </Form.Group>
                <Form.Group aria-label="new page is subset checkbox">
                    <Form.Label htmlFor="subsetForm">Subset</Form.Label>
                    <Form.Input
                        type="checkbox"
                        id="subsetForm"
                        className="w-fit"
                        checked={isSubset}
                        onChange={handleIsSubsetChange}
                    />
                </Form.Group>
            </div>

            <div
                className="bg-gray-500 py-1 rounded text-gray-100 hover:bg-gray-600 text-sm float-right w-fit px-2 transition-all duration-150 hover:cursor-pointer"
                onClick={() => setShowShortcuts(!showShortcuts)}
                aria-label="new page form tips"
            >
                {showShortcuts ? "Hide Shortcuts" : "Shortcuts"}
            </div>
            {showShortcuts && (
                <div className="" id="new page form tooltips">
                    <ul className="text-gray-500 bg-gray-200 rounded border-1 border-gray-400 list-inside border-solid p-2">
                        <li>
                            <FaArrowLeft /> <FaArrowRight /> to increment counts
                            by 4.
                        </li>
                        <li>
                            <FaArrowUp /> <FaArrowDown /> to increment count by
                            1.
                        </li>
                        <li className="">
                            <span className="key bg-gray-500 text-gray-50 border-gray-600">
                                S
                            </span>{" "}
                            to toggle subset.
                        </li>
                        <li>
                            <span className="key bg-gray-500 text-gray-50 border-gray-600">
                                Enter
                            </span>{" "}
                            to submit.
                        </li>
                    </ul>
                </div>
            )}
            <div className="py-2">
                <button
                    className="btn-primary"
                    type="submit"
                    aria-label="create page button"
                    disabled={disabledProp}
                >
                    {makeButtonString(quantity)}
                </button>
            </div>
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
                    aria-label="create page response"
                >
                    {message}
                </Form.Alert>
            ))}
        </form>
    );
};

export default PageNewForm;
