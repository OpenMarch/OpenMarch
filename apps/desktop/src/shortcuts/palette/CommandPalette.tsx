import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslate } from "@tolgee/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import {
    CaretRightIcon,
    MagnifyingGlassIcon,
    XIcon,
} from "@phosphor-icons/react";
import { useIsTouchMode } from "@/stores/InputModeStore";
import { useShowShortcutHints } from "@/stores/KeyboardSeenStore";
import { useShortcutOverridesStore } from "@/stores/ShortcutOverridesStore";
import { bindingFromEvent, platformBinding } from "../bindings";
import { getEffectiveBindings } from "../keymap";
import type { Translate } from "../labels";
import { isMacPlatform } from "../platform";
import { searchItems } from "../search";
import { useActionHandler } from "../useActionHandler";
import { getActionPaletteItems } from "./actionSource";
import {
    closePalette,
    dockCommand,
    flattenTree,
    itemsAt,
    oneLinerAnswers,
    openPalette,
    closeDockedCommand,
    useCommandBarStore,
} from "./commandBar";
import {
    getPaletteItems,
    subscribeToPaletteSources,
    usePaletteSource,
    type PaletteItem,
} from "./sources";
import { getPaletteUsageScores, recordPaletteUsage } from "./usage";
import Shortcut from "@/components/ui/Shortcut";
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

/** How a listed item is chosen, beyond the item itself */
interface Choice {
    /** The branch ids above it, when search found it below the branch shown */
    path?: readonly string[];
    /** A one-liner's answers, filled ahead into its command's steps */
    prefill?: readonly string[];
}

/**
 * Browsing: "Suggested" (at the top level), then every other item under its group heading.
 * Searching: one ranked list of the whole tree below the branch shown, runnable items first, a
 * one-liner ("box 4x3 2") ahead of everything. Indexes are positions in the returned `items`.
 */
function arrange(
    all: readonly PaletteItem[],
    query: string,
    usage: ReadonlyMap<string, number>,
    suggestedHeading: string,
    browsingBranch: boolean,
): {
    items: PaletteItem[];
    sections: Section[];
    choices: Map<PaletteItem, Choice>;
} {
    const choices = new Map<PaletteItem, Choice>();
    if (query.trim() !== "") {
        const tree = flattenTree(all);
        tree.forEach(({ item, path }) => choices.set(item, { path }));
        const oneLiners = tree.flatMap(({ item, path, name }) => {
            if (!item.command) return [];
            const prefill = oneLinerAnswers(query, [
                name,
                ...(item.keywords ?? []),
            ]);
            if (!prefill) return [];
            const filled = {
                ...item,
                id: `${item.id}:filled`,
                label: `${item.label} ${prefill.join(" · ")}`,
            };
            choices.set(filled, { path, prefill });
            return [filled];
        });
        const matches = searchItems(
            tree.map((f) => f.item),
            query,
            (item) => [item.label, item.group, ...(item.keywords ?? [])],
            (item) => Math.min(3, Math.log10(1 + (usage.get(item.id) ?? 0))),
        );
        const items = [
            ...oneLiners.filter((item) => !item.disabled),
            ...matches.filter((item) => !item.disabled),
            ...matches.filter((item) => item.disabled),
            ...oneLiners.filter((item) => item.disabled),
        ];
        return {
            items,
            sections: [
                { items: items.map((item, index) => ({ item, index })) },
            ],
            choices,
        };
    }
    const suggested = browsingBranch ? [] : pickSuggested(all, usage);
    // Each group once, where it first appears: a source's branch joins its actions' group
    const groups = [...new Set(all.map((item) => item.group))];
    const rest = all
        .filter((item) => !suggested.includes(item))
        .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group));
    const items = [...suggested, ...rest];
    const sections: Section[] = [];
    items.forEach((item, index) => {
        const heading =
            index < suggested.length ? suggestedHeading : item.group;
        const last = sections[sections.length - 1];
        if (last?.heading === heading) last.items.push({ item, index });
        else sections.push({ heading, items: [{ item, index }] });
    });
    return { items, sections, choices };
}

/** Opens with the openCommandPalette action (⌘K / Ctrl+K). Mount once, app-wide. */
// eslint-disable-next-line max-lines-per-function
export default function CommandPalette() {
    const { t: tolgeeT } = useTranslate();
    const t: Translate = (key, params) => tolgeeT(key, params as never);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const palette = useCommandBarStore((s) => s.palette);
    const open = palette !== null;
    const path = useMemo(() => palette?.path ?? [], [palette]);
    const [query, setQuery] = useState("");
    const isTouch = useIsTouchMode();
    // Shortcut keycaps only once a keyboard has been used (or with a mouse layout)
    const showHints = useShowShortcutHints();
    const [activeIndex, setActiveIndex] = useState(0);
    const [sourcesVersion, setSourcesVersion] = useState(0);
    const pendingRun = useRef<(() => void) | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    // State, not a ref: Radix mounts the portal content a commit after `open` flips,
    // so effects must re-run once the list element actually exists.
    const [inner, setInner] = useState<HTMLDivElement | null>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const lastArrangement = useRef<
        ReturnType<typeof arrange> & { trail: readonly PaletteItem[] }
    >({
        items: [],
        sections: [],
        choices: new Map(),
        trail: [],
    });
    const [usage, setUsage] = useState<ReadonlyMap<string, number>>(
        () => new Map(),
    );

    // `/` and ⌘K open the same bar (#354); a command docked at the field is cancelled first
    const openBar = () => {
        const { docked } = useCommandBarStore.getState();
        if (docked) {
            docked.run.cancel();
            closeDockedCommand(docked.run);
        }
        setQuery("");
        setUsage(getPaletteUsageScores());
        openPalette();
    };
    useActionHandler("openCommandPalette", openBar);
    useActionHandler("openCommandBar", openBar);
    usePaletteSource("actions", (context) =>
        getActionPaletteItems(context, overrides),
    );
    // Re-read items if a source mounts or unmounts while the palette is open.
    useEffect(
        () => subscribeToPaletteSources(() => setSourcesVersion((v) => v + 1)),
        [],
    );

    const { items, sections, choices, trail } = useMemo(
        () => {
            // While closing, keep the last results so the exit animation doesn't show an empty list.
            if (!open) return lastArrangement.current;
            const branch = itemsAt(getPaletteItems({ t }), path);
            lastArrangement.current = {
                ...arrange(
                    branch.items,
                    query,
                    usage,
                    t("commandPalette.suggested"),
                    branch.trail.length > 0,
                ),
                trail: branch.trail,
            };
            return lastArrangement.current;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open, path, query, usage, overrides, sourcesVersion, tolgeeT],
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
        // Opening (or new results) starts at the top, group heading included
        if (activeIndex === selectable[0]) {
            if (listRef.current) listRef.current.scrollTop = 0;
        } else row.scrollIntoView?.({ block: "nearest" });
    }, [activeIndex, items, selectable, inner]);

    // The highlighted row shows what it would change (`PaletteItem.preview`) until another row
    // is highlighted or the palette closes
    const previewed = open ? items[activeIndex] : undefined;
    useEffect(() => {
        if (!previewed?.preview || previewed.disabled) return;
        previewed.preview(true);
        return () => previewed.preview?.(false);
    }, [previewed]);

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

    const pendingDock = useRef(false);
    const choose = (item: PaletteItem | undefined) => {
        if (!item || item.disabled) return;
        const choice = choices.get(item) ?? {};
        const above = choice.path ?? path;
        if (item.children) {
            // Into the branch: Shape › lists the shape kinds
            setQuery("");
            openPalette([...above, item.id]);
            return;
        }
        if (item.command) {
            const run = item.command.begin();
            if (!run) return;
            recordPaletteUsage(item.id.replace(/:filled$/, ""));
            pendingRun.current = () =>
                dockCommand(run, choice.prefill ?? [], above);
            pendingDock.current = true;
            closePalette();
            return;
        }
        recordPaletteUsage(item.id);
        // Run once the palette has closed so focus restoration can't steal focus from what the action opens.
        pendingRun.current = item.run ?? null;
        closePalette();
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
        } else if (
            event.key === "Backspace" &&
            query === "" &&
            path.length > 0
        ) {
            // Out of the branch, back up the tree
            event.preventDefault();
            openPalette(path.slice(0, -1));
        } else if (isToggleShortcut(event)) {
            event.preventDefault();
            closePalette();
        }
    };

    const activeId = items[activeIndex]
        ? `command-palette-item-${activeIndex}`
        : undefined;

    return (
        <RadixDialog.Root
            open={open}
            onOpenChange={(next) => (next ? openPalette(path) : closePalette())}
        >
            {/* Overlay and Content must be direct Portal children so Radix waits for their exit animations. */}
            <RadixDialog.Portal>
                <RadixDialog.Overlay className="command-palette palette-overlay" />
                <RadixDialog.Content
                    className="command-palette palette-shell"
                    aria-describedby={undefined}
                    onCloseAutoFocus={(event) => {
                        const run = pendingRun.current;
                        pendingRun.current = null;
                        // The docked bar takes the focus, not what had it before
                        if (pendingDock.current) event.preventDefault();
                        pendingDock.current = false;
                        run?.();
                    }}
                >
                    <RadixDialog.Title className="sr-only">
                        {t("commandPalette.title")}
                    </RadixDialog.Title>
                    <div className="palette-panel rounded-6 border-stroke bg-modal shadow-fg-1 backdrop-blur-32 border">
                        <div className="palette-input-row">
                            <MagnifyingGlassIcon size={20} aria-hidden />
                            {trail.map((branch) => (
                                <span
                                    key={branch.id}
                                    className="palette-crumb"
                                    data-testid="palette-crumb"
                                >
                                    {branch.label}
                                    <CaretRightIcon size={12} aria-hidden />
                                </span>
                            ))}
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
                            {isTouch && (
                                <RadixDialog.Close
                                    aria-label={t("commandPalette.close")}
                                    className="hover:text-text flex size-44 shrink-0 items-center justify-center rounded-full"
                                >
                                    <XIcon size={22} />
                                </RadixDialog.Close>
                            )}
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
                                        key={`${sectionIndex}:${section.heading ?? ""}`}
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
                                                            ? (item.disabledReason ??
                                                              t(
                                                                  "commandPalette.unavailable",
                                                              ))
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
                                                    {item.disabled &&
                                                        item.disabledReason && (
                                                            <span
                                                                className="palette-item-reason"
                                                                data-testid="palette-item-reason"
                                                            >
                                                                {
                                                                    item.disabledReason
                                                                }
                                                            </span>
                                                        )}
                                                    {item.children && (
                                                        <CaretRightIcon
                                                            size={14}
                                                            className="palette-item-branch"
                                                            aria-hidden
                                                        />
                                                    )}
                                                    {!section.heading && (
                                                        <span className="palette-item-group">
                                                            {item.group}
                                                        </span>
                                                    )}
                                                    {showHints &&
                                                        item.shortcut && (
                                                            <Shortcut
                                                                keys={
                                                                    item.shortcut
                                                                }
                                                                size="md"
                                                            />
                                                        )}
                                                </div>
                                            ),
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Keyboard hints mean nothing without a keyboard */}
                        {!isTouch && (
                            <div className="palette-footer" aria-hidden>
                                <span className="palette-footer-hint">
                                    <Shortcut binding="ArrowUp" />
                                    <Shortcut binding="ArrowDown" />
                                    {t("commandPalette.navigate")}
                                </span>
                                <span className="palette-footer-hint">
                                    <Shortcut binding="Enter" />
                                    {t("commandPalette.run")}
                                </span>
                                <span className="palette-footer-hint">
                                    <Shortcut binding="Escape" />
                                    {t("commandPalette.close")}
                                </span>
                            </div>
                        )}
                    </div>
                </RadixDialog.Content>
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}
