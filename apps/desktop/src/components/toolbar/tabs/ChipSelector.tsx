import { Input, ListItem } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import React, {
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    DEFAULT_MAX_VISIBLE_CHIPS,
    pushRecentId,
    readRecentIds,
    resolveRecentItems,
    writeRecentIds,
} from "./chipSelectorRecents";

export const Separator = () => {
    return <span className="text-text-subtitle opacity-50">|</span>;
};

export type ChipSelectorProps<T> = {
    /** Full underlying data set, already sorted by the caller in display order */
    items: T[];
    /** Stable identity for keys / aria-activedescendant ids */
    getId: (item: T) => string | number;
    /** Rendered chip / option label - may be JSX (e.g. <T keyName=.../>) */
    getLabel: (item: T) => React.ReactNode;
    /** Plain-string label used for case-insensitive substring filtering */
    getSearchText: (item: T) => string;
    /** Fired from a chip click, a dropdown Enter, or a dropdown option click. Return false to skip persisting recents. */
    onSelect: (item: T, options: { shiftKey: boolean }) => boolean | void;
    /** Rendered instead of the chip row when items.length === 0 */
    emptyMessage?: React.ReactNode;
    /** Accessible name applied to the search input and its listbox */
    ariaLabel: string;
    /** Max chips shown before the search box appears. Default 6 */
    maxVisible?: number;
    /** Override for the "no results" row; defaults to toolbar.select.noResultsFound */
    noResultsMessage?: React.ReactNode;
    /** When set, the chip row shows a LIFO recent list persisted under this category */
    recentCategory?: string;
};

export default function ChipSelector<T>({
    items,
    getId,
    getLabel,
    getSearchText,
    onSelect,
    emptyMessage,
    ariaLabel,
    maxVisible = DEFAULT_MAX_VISIBLE_CHIPS,
    noResultsMessage,
    recentCategory,
}: ChipSelectorProps<T>) {
    const { t } = useTranslate();
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
    const [recentIds, setRecentIds] = useState<string[]>(() =>
        recentCategory ? readRecentIds(recentCategory) : [],
    );
    const inputRef = useRef<HTMLInputElement>(null);
    const listboxRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const visibleItems = useMemo(
        () =>
            recentCategory
                ? resolveRecentItems(items, recentIds, getId, maxVisible)
                : items.slice(0, maxVisible),
        [items, recentIds, getId, maxVisible, recentCategory],
    );
    const hasResolvedRecents = useMemo(() => {
        if (!recentCategory || recentIds.length === 0) return false;
        const ids = new Set(items.map((item) => String(getId(item))));
        return recentIds.some((id) => ids.has(id));
    }, [recentCategory, recentIds, items, getId]);
    const showSearch = items.length > visibleItems.length;

    const filteredItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) return items;
        return items.filter((item) =>
            getSearchText(item).toLowerCase().includes(q),
        );
    }, [items, query, getSearchText]);

    const activeIndex =
        filteredItems.length === 0
            ? -1
            : Math.min(highlightedIndex, filteredItems.length - 1);

    // The toolbar sits inside an `overflow-hidden` ancestor (see Toolbar.tsx),
    // so the dropdown is portaled to <body> and positioned from the input's
    // viewport rect rather than relying on normal absolute-positioning flow.
    useLayoutEffect(() => {
        if (!open) return;

        const updatePosition = () => {
            const rect = inputRef.current?.getBoundingClientRect();
            if (!rect) return;
            setPanelStyle({
                position: "fixed",
                top: rect.bottom + 4,
                left: rect.left,
            });
        };

        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [open]);

    // Keep the highlighted option in view when arrowing through a list taller
    // than the dropdown. Adjust the listbox scrollTop directly so the portaled
    // fixed panel does not also scroll the page via scrollIntoView.
    useLayoutEffect(() => {
        if (!open || activeIndex < 0) return;
        const listbox = listboxRef.current;
        const option = listbox?.children[activeIndex] as
            | HTMLElement
            | undefined;
        if (!listbox || !option) return;

        const listboxRect = listbox.getBoundingClientRect();
        const optionRect = option.getBoundingClientRect();
        const styles = getComputedStyle(listbox);
        const visibleTop = listboxRect.top + parseFloat(styles.paddingTop);
        const visibleBottom =
            listboxRect.bottom - parseFloat(styles.paddingBottom);
        if (optionRect.bottom > visibleBottom) {
            listbox.scrollTop += optionRect.bottom - visibleBottom;
        } else if (optionRect.top < visibleTop) {
            listbox.scrollTop -= visibleTop - optionRect.top;
        }
    }, [open, activeIndex]);

    const selectItem = (item: T, shiftKey: boolean) => {
        const result = onSelect(item, { shiftKey });
        if (recentCategory && result !== false) {
            const id = String(getId(item));
            const alreadyVisible = visibleItems.some(
                (visible) => String(getId(visible)) === id,
            );
            if (!alreadyVisible) {
                const next = pushRecentId(recentIds, id, maxVisible);
                setRecentIds(next);
                writeRecentIds(recentCategory, next);
            }
        }
        setQuery("");
        setHighlightedIndex(0);
        setOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "ArrowDown":
            case "ArrowUp": {
                e.preventDefault();
                if (!open) {
                    setOpen(true);
                    return;
                }
                if (filteredItems.length === 0) return;
                setHighlightedIndex((prev) => {
                    const base = prev < 0 ? 0 : prev;
                    const delta = e.key === "ArrowDown" ? 1 : -1;
                    return (
                        (base + delta + filteredItems.length) %
                        filteredItems.length
                    );
                });
                return;
            }
            case "Enter": {
                e.preventDefault();
                if (!open || activeIndex < 0) return;
                selectItem(filteredItems[activeIndex], e.shiftKey);
                inputRef.current?.blur();
                return;
            }
            case "Escape": {
                e.preventDefault();
                setOpen(false);
                setQuery("");
                inputRef.current?.blur();
                return;
            }
            default:
                return;
        }
    };

    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setHighlightedIndex(0);
        if (!open) setOpen(true);
    };

    const handleInputBlur = () => {
        // Option rows are selected via onMouseDown+preventDefault (below), so
        // the input never actually blurs when clicking one - only a genuine
        // click/focus elsewhere reaches here.
        setOpen(false);
    };

    const handleOptionMouseDown = (e: React.MouseEvent, item: T) => {
        e.preventDefault();
        selectItem(item, e.shiftKey);
        inputRef.current?.blur();
    };

    return (
        <div className="flex items-center gap-8">
            {showSearch && (
                <>
                    <Input
                        ref={inputRef}
                        compact
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listboxId}
                        aria-autocomplete="list"
                        aria-activedescendant={
                            activeIndex >= 0
                                ? `${listboxId}-option-${getId(
                                      filteredItems[activeIndex],
                                  )}`
                                : undefined
                        }
                        aria-label={ariaLabel}
                        className="w-[8.5rem]"
                        placeholder={t("toolbar.select.searchPlaceholder")}
                        value={query}
                        onFocus={() => setOpen(true)}
                        onChange={handleQueryChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleInputBlur}
                    />
                    {open &&
                        createPortal(
                            <div
                                ref={listboxRef}
                                id={listboxId}
                                role="listbox"
                                aria-label={ariaLabel}
                                style={panelStyle}
                                className="bg-modal border-stroke rounded-6 shadow-modal backdrop-blur-32 z-[9999] flex max-h-[280px] w-[14rem] flex-col gap-2 overflow-y-auto border p-4"
                            >
                                {filteredItems.length === 0 ? (
                                    <div className="text-text-subtitle text-body px-8 py-4">
                                        {noResultsMessage ?? (
                                            <T keyName="toolbar.select.noResultsFound" />
                                        )}
                                    </div>
                                ) : (
                                    filteredItems.map((item, index) => (
                                        <div
                                            key={getId(item)}
                                            id={`${listboxId}-option-${getId(item)}`}
                                            role="option"
                                            aria-selected={
                                                index === activeIndex
                                            }
                                            onMouseDown={(e) =>
                                                handleOptionMouseDown(e, item)
                                            }
                                            onMouseEnter={() =>
                                                setHighlightedIndex(index)
                                            }
                                        >
                                            <ListItem
                                                selected={index === activeIndex}
                                                className={
                                                    index === activeIndex
                                                        ? undefined
                                                        : "border border-transparent"
                                                }
                                            >
                                                {getLabel(item)}
                                            </ListItem>
                                        </div>
                                    ))
                                )}
                            </div>,
                            document.body,
                        )}
                </>
            )}
            {visibleItems.length === 0 && emptyMessage}
            {visibleItems.length > 0 && hasResolvedRecents && (
                <span className="text-text-subtitle">
                    <T keyName="toolbar.select.recent" />
                    {" -"}
                </span>
            )}
            {visibleItems.map((item, index) => (
                <React.Fragment key={getId(item)}>
                    <button
                        className="hover:text-accent flex items-center gap-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50"
                        onClick={(e) => {
                            e.preventDefault();
                            selectItem(item, e.shiftKey);
                        }}
                    >
                        {getLabel(item)}
                    </button>
                    {index < visibleItems.length - 1 && <Separator />}
                </React.Fragment>
            ))}
        </div>
    );
}
