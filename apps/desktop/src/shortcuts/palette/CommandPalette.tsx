import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTolgee } from "@tolgee/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { bindingFromEvent, platformBinding } from "../bindings";
import { getEffectiveBindings } from "../keymap";
import type { Translate } from "../labels";
import { isMacPlatform } from "../platform";
import { searchItems } from "../search";
import { useActionHandler } from "../useActionHandler";
import { getActionPaletteItems } from "./actionSource";
import {
    getPaletteItems,
    subscribeToPaletteSources,
    usePaletteSource,
    type PaletteItem,
} from "./sources";
import { getPaletteUsageScores, recordPaletteUsage } from "./usage";
import "./CommandPalette.css";

interface Section {
    heading?: string;
    items: { item: PaletteItem; index: number }[];
}

const SUGGESTED_COUNT = 6;

/** Runnable first; within that, most used, then the sources' curated suggestions. */
function pickSuggested(
    all: readonly PaletteItem[],
    usage: ReadonlyMap<string, number>,
): PaletteItem[] {
    return all
        .filter(
            (item) =>
                (usage.get(item.id) ?? 0) > 0 ||
                item.suggestedRank !== undefined,
        )
        .sort(
            (a, b) =>
                // Runnable suggestions first, so the palette opens on something that works now.
                Number(!!a.disabled) - Number(!!b.disabled) ||
                (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) ||
                (a.suggestedRank ?? Infinity) - (b.suggestedRank ?? Infinity),
        )
        .slice(0, SUGGESTED_COUNT);
}

/**
 * Browsing: "Suggested", then every other item under its group heading.
 * Searching: one ranked list, runnable items first. Indexes are positions in the returned `items`.
 */
function arrange(
    all: readonly PaletteItem[],
    query: string,
    usage: ReadonlyMap<string, number>,
    suggestedHeading: string,
): { items: PaletteItem[]; sections: Section[] } {
    if (query.trim() !== "") {
        const matches = searchItems(
            all,
            query,
            (item) => [item.label, item.group, ...(item.keywords ?? [])],
            (item) => Math.min(3, Math.log10(1 + (usage.get(item.id) ?? 0))),
        );
        const items = [
            ...matches.filter((item) => !item.disabled),
            ...matches.filter((item) => item.disabled),
        ];
        return {
            items,
            sections: [
                { items: items.map((item, index) => ({ item, index })) },
            ],
        };
    }
    const suggested = pickSuggested(all, usage);
    const rest = all.filter((item) => !suggested.includes(item));
    const items = [...suggested, ...rest];
    const sections: Section[] = [];
    items.forEach((item, index) => {
        const heading =
            index < suggested.length ? suggestedHeading : item.group;
        const last = sections[sections.length - 1];
        if (last?.heading === heading) last.items.push({ item, index });
        else sections.push({ heading, items: [{ item, index }] });
    });
    return { items, sections };
}

/** Opens with the openCommandPalette action (⌘K / Ctrl+K). Mount once, app-wide. */
// eslint-disable-next-line max-lines-per-function
export default function CommandPalette() {
    const { t: tolgeeT } = useTolgee();
    const t: Translate = (key, params) => tolgeeT(key, params as never);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [sourcesVersion, setSourcesVersion] = useState(0);
    const pendingRun = useRef<(() => void) | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    // State, not a ref: Radix mounts the portal content a commit after `open` flips,
    // so effects must re-run once the list element actually exists.
    const [inner, setInner] = useState<HTMLDivElement | null>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const lastArrangement = useRef<ReturnType<typeof arrange>>({
        items: [],
        sections: [],
    });
    const [usage, setUsage] = useState<ReadonlyMap<string, number>>(
        () => new Map(),
    );

    useActionHandler("openCommandPalette", () => {
        setQuery("");
        setUsage(getPaletteUsageScores());
        setOpen(true);
    });
    usePaletteSource("actions", (context) =>
        getActionPaletteItems(context, overrides),
    );
    // Re-read items if a source mounts or unmounts while the palette is open.
    useEffect(
        () => subscribeToPaletteSources(() => setSourcesVersion((v) => v + 1)),
        [],
    );

    const { items, sections } = useMemo(
        () => {
            // While closing, keep the last results so the exit animation doesn't show an empty list.
            if (!open) return lastArrangement.current;
            lastArrangement.current = arrange(
                getPaletteItems({ t }),
                query,
                usage,
                t("commandPalette.suggested"),
            );
            return lastArrangement.current;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open, query, usage, overrides, sourcesVersion, tolgeeT],
    );
    const selectable = useMemo(
        () => items.flatMap((item, index) => (item.disabled ? [] : [index])),
        [items],
    );

    useEffect(() => setActiveIndex(selectable[0] ?? 0), [selectable]);

    // Glide the highlight to the active row; place it instantly on open and when results change.
    const animateHighlight = useRef(false);
    useLayoutEffect(() => {
        animateHighlight.current = false;
    }, [inner, items]);
    useLayoutEffect(() => {
        const highlight = highlightRef.current;
        const row = inner?.querySelector<HTMLElement>(
            `[data-index="${activeIndex}"]`,
        );
        if (!highlight) return;
        const visible = !!row && selectable.includes(activeIndex);
        highlight.style.opacity = visible ? "1" : "0";
        if (!row) return;
        highlight.dataset.animate = String(animateHighlight.current);
        highlight.style.transform = `translateY(${row.offsetTop}px)`;
        animateHighlight.current = true;
        row.scrollIntoView?.({ block: "nearest" });
    }, [activeIndex, items, selectable, inner]);

    // Animate the list height as results change (heights can't transition from `auto`).
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!list || !inner || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() =>
            list.style.setProperty(
                "--palette-list-height",
                `${inner.offsetHeight}px`,
            ),
        );
        observer.observe(inner);
        return () => observer.disconnect();
    }, [inner]);

    const choose = (item: PaletteItem | undefined) => {
        if (!item || item.disabled) return;
        recordPaletteUsage(item.id);
        // Run once the palette has closed so focus restoration can't steal focus from what the action opens.
        pendingRun.current = item.run;
        setOpen(false);
    };

    const isToggleShortcut = (event: React.KeyboardEvent) => {
        const isMac = isMacPlatform();
        const pressed = bindingFromEvent(event.nativeEvent, isMac);
        return (
            pressed !== undefined &&
            getEffectiveBindings("openCommandPalette", overrides).some(
                (b) =>
                    platformBinding(b, isMac) ===
                    platformBinding(pressed, isMac),
            )
        );
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const position = selectable.indexOf(activeIndex);
        const moveTo = (next: number) => {
            event.preventDefault();
            if (selectable.length === 0) return;
            const wrapped = (next + selectable.length) % selectable.length;
            setActiveIndex(selectable[wrapped]);
        };
        if (event.key === "ArrowDown") moveTo(position + 1);
        else if (event.key === "ArrowUp") moveTo(position - 1);
        else if (event.key === "Home") moveTo(0);
        else if (event.key === "End") moveTo(selectable.length - 1);
        else if (event.key === "Enter") {
            event.preventDefault();
            choose(items[activeIndex]);
        } else if (isToggleShortcut(event)) {
            event.preventDefault();
            setOpen(false);
        }
    };

    const activeId = items[activeIndex]
        ? `command-palette-item-${activeIndex}`
        : undefined;

    return (
        <RadixDialog.Root open={open} onOpenChange={setOpen}>
            {/* Overlay and Content must be direct Portal children so Radix waits for their exit animations. */}
            <RadixDialog.Portal>
                <RadixDialog.Overlay className="command-palette palette-overlay" />
                <RadixDialog.Content
                    className="command-palette palette-shell"
                    aria-describedby={undefined}
                    onCloseAutoFocus={() => {
                        const run = pendingRun.current;
                        pendingRun.current = null;
                        run?.();
                    }}
                >
                    <RadixDialog.Title className="sr-only">
                        {t("commandPalette.title")}
                    </RadixDialog.Title>
                    <div className="palette-panel">
                        <div className="palette-input-row">
                            <MagnifyingGlassIcon size={20} aria-hidden />
                            <input
                                autoFocus
                                role="combobox"
                                aria-expanded
                                aria-controls="command-palette-list"
                                aria-activedescendant={activeId}
                                aria-autocomplete="list"
                                aria-label={t("commandPalette.placeholder")}
                                placeholder={t("commandPalette.placeholder")}
                                spellCheck={false}
                                autoComplete="off"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onKeyDown}
                                className="palette-input"
                            />
                        </div>
                        <div ref={listRef} className="palette-list">
                            <div
                                ref={setInner}
                                id="command-palette-list"
                                role="listbox"
                                aria-label={t("commandPalette.title")}
                                className="palette-list-inner"
                            >
                                <div
                                    ref={highlightRef}
                                    className="palette-highlight"
                                    aria-hidden
                                />
                                {items.length === 0 && (
                                    <div className="palette-empty">
                                        {t("commandPalette.empty")}
                                    </div>
                                )}
                                {sections.map((section, sectionIndex) => (
                                    <div
                                        key={section.heading ?? sectionIndex}
                                        role="group"
                                        aria-label={section.heading}
                                    >
                                        {section.heading && (
                                            <div
                                                className="palette-group-heading"
                                                aria-hidden
                                            >
                                                {section.heading}
                                            </div>
                                        )}
                                        {section.items.map(
                                            ({ item, index }) => (
                                                <div
                                                    key={item.id}
                                                    id={`command-palette-item-${index}`}
                                                    data-index={index}
                                                    role="option"
                                                    aria-selected={
                                                        index === activeIndex
                                                    }
                                                    aria-disabled={
                                                        item.disabled ||
                                                        undefined
                                                    }
                                                    title={
                                                        item.disabled
                                                            ? t(
                                                                  "commandPalette.unavailable",
                                                              )
                                                            : undefined
                                                    }
                                                    className="palette-item"
                                                    onPointerMove={() => {
                                                        if (!item.disabled)
                                                            setActiveIndex(
                                                                index,
                                                            );
                                                    }}
                                                    onClick={() => choose(item)}
                                                >
                                                    {item.icon && (
                                                        <span className="palette-item-icon">
                                                            {item.icon}
                                                        </span>
                                                    )}
                                                    <span className="palette-item-label">
                                                        {item.label}
                                                    </span>
                                                    {!section.heading && (
                                                        <span className="palette-item-group">
                                                            {item.group}
                                                        </span>
                                                    )}
                                                    {item.shortcut && (
                                                        <kbd className="palette-kbd">
                                                            {item.shortcut}
                                                        </kbd>
                                                    )}
                                                </div>
                                            ),
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="palette-footer" aria-hidden>
                            <span className="palette-footer-hint">
                                <kbd className="palette-kbd">↑</kbd>
                                <kbd className="palette-kbd">↓</kbd>
                                {t("commandPalette.navigate")}
                            </span>
                            <span className="palette-footer-hint">
                                <kbd className="palette-kbd">↵</kbd>
                                {t("commandPalette.run")}
                            </span>
                            <span className="palette-footer-hint">
                                <kbd className="palette-kbd">esc</kbd>
                                {t("commandPalette.close")}
                            </span>
                        </div>
                    </div>
                    <div className="palette-ring" aria-hidden />
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}
