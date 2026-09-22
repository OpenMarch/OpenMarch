import { useEffect, useMemo, useRef, useState } from "react";
import { useTolgee } from "@tolgee/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { Dialog, DialogContent } from "@openmarch/ui";
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

/** Opens with the openCommandPalette action (⌘K / Ctrl+K). Mount once, app-wide. */
export default function CommandPalette() {
    const { t: tolgeeT } = useTolgee();
    const t: Translate = (key, params) => tolgeeT(key, params as never);
    const overrides = useShortcutOverridesStore((s) => s.overrides);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [sourcesVersion, setSourcesVersion] = useState(0);
    const pendingRun = useRef<(() => void) | null>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useActionHandler("openCommandPalette", () => setOpen(true));
    usePaletteSource("actions", (context) =>
        getActionPaletteItems(context, overrides),
    );
    // Re-read items if a source mounts or unmounts while the palette is open.
    useEffect(
        () => subscribeToPaletteSources(() => setSourcesVersion((v) => v + 1)),
        [],
    );

    const items = useMemo(
        () => {
            if (!open) return [];
            const all = getPaletteItems({ t });
            const matches = searchItems(all, query, (item) => [
                item.label,
                item.group,
                ...(item.keywords ?? []),
            ]);
            // Stable sort: runnable items first, keeping search rank within each half.
            return [
                ...matches.filter((item) => !item.disabled),
                ...matches.filter((item) => item.disabled),
            ];
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open, query, overrides, sourcesVersion, tolgeeT],
    );

    useEffect(() => setActiveIndex(0), [query, open]);
    useEffect(() => {
        listRef.current
            ?.querySelector(`[data-index="${activeIndex}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    const changeOpen = (next: boolean) => {
        setOpen(next);
        if (!next) setQuery("");
    };

    const choose = (item: PaletteItem | undefined) => {
        if (!item || item.disabled) return;
        // Run once the dialog has closed so the action sees the editor, not the palette's modal state.
        pendingRun.current = item.run;
        changeOpen(false);
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
        const move = (index: number) => {
            event.preventDefault();
            if (items.length > 0)
                setActiveIndex((index + items.length) % items.length);
        };
        if (event.key === "ArrowDown") move(activeIndex + 1);
        else if (event.key === "ArrowUp") move(activeIndex - 1);
        else if (event.key === "Home") move(0);
        else if (event.key === "End") move(items.length - 1);
        else if (event.key === "Enter") {
            event.preventDefault();
            choose(items[activeIndex]);
        } else if (isToggleShortcut(event)) {
            event.preventDefault();
            changeOpen(false);
        }
    };

    const activeId = items[activeIndex]
        ? `command-palette-item-${activeIndex}`
        : undefined;

    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            <DialogContent
                className="w-[36rem] max-w-[90vw] gap-8 self-start p-8"
                overlayClassName="bg-transparent"
                style={{ marginTop: "15vh" }}
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
                <input
                    autoFocus
                    role="combobox"
                    aria-expanded
                    aria-controls="command-palette-list"
                    aria-activedescendant={activeId}
                    aria-label={t("commandPalette.placeholder")}
                    placeholder={t("commandPalette.placeholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="text-body text-text placeholder:text-text-subtitle bg-fg-1 border-stroke rounded-6 w-full border px-12 py-8 outline-hidden"
                />
                <ul
                    id="command-palette-list"
                    ref={listRef}
                    role="listbox"
                    aria-label={t("commandPalette.title")}
                    className="flex max-h-[24rem] flex-col overflow-y-auto"
                >
                    {items.length === 0 && (
                        <li className="text-body text-text-subtitle px-12 py-8">
                            {t("commandPalette.empty")}
                        </li>
                    )}
                    {items.map((item, index) => (
                        <li
                            key={item.id}
                            id={`command-palette-item-${index}`}
                            data-index={index}
                            role="option"
                            aria-selected={index === activeIndex}
                            aria-disabled={item.disabled || undefined}
                            title={
                                item.disabled
                                    ? t("commandPalette.unavailable")
                                    : undefined
                            }
                            onMouseMove={() => setActiveIndex(index)}
                            onClick={() => choose(item)}
                            className={clsx(
                                "rounded-6 flex cursor-pointer items-center justify-between gap-12 px-12 py-6",
                                index === activeIndex && "bg-fg-2",
                                item.disabled && "cursor-default opacity-50",
                            )}
                        >
                            <span className="text-body text-text flex min-w-0 items-baseline gap-8">
                                <span className="truncate">{item.label}</span>
                                <span className="text-sub text-text-subtitle shrink-0">
                                    {item.group}
                                </span>
                            </span>
                            {item.shortcut && (
                                <kbd className="text-sub text-text-subtitle font-mono">
                                    {item.shortcut}
                                </kbd>
                            )}
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    );
}
