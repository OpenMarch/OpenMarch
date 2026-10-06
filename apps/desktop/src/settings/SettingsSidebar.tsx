import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslate } from "@tolgee/react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Input } from "@openmarch/ui";
import { clsx } from "clsx";
import { searchItems } from "@/shortcuts/search";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";

interface SettingsSidebarProps {
    selected: SettingsSectionId;
    onSelect: (id: SettingsSectionId, focus?: boolean) => void;
}

/** Search box plus the list of sections. Labels wrap rather than truncate. */
export default function SettingsSidebar({
    selected,
    onSelect,
}: SettingsSidebarProps) {
    const { t } = useTranslate();
    const [query, setQuery] = useState("");
    const buttons = useRef(new Map<SettingsSectionId, HTMLButtonElement>());

    const visible = useMemo(
        () =>
            searchItems(SETTINGS_SECTIONS, query, (s) => [
                t(s.labelKey),
                ...s.searchKeys.map((key) => t(key)),
            ]),
        [query, t],
    );

    const select = (id: SettingsSectionId, focus = false) => {
        onSelect(id, focus);
        if (focus) buttons.current.get(id)?.focus();
    };

    const onNavKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        if (visible.length === 0) return;
        event.preventDefault();
        const focusedId = [...buttons.current].find(
            ([, el]) => el === document.activeElement,
        )?.[0];
        const i = visible.findIndex((s) => s.id === (focusedId ?? selected));
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next =
            visible[(Math.max(i, 0) + step + visible.length) % visible.length];
        select(next.id, true);
    };

    return (
        <div className="flex w-[200px] shrink-0 flex-col gap-8 px-8 pt-4 pb-12">
            <div className="relative">
                <MagnifyingGlassIcon
                    size={16}
                    aria-hidden
                    className="text-text-subtitle pointer-events-none absolute top-1/2 left-12 -translate-y-1/2"
                />
                <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape" && query !== "") {
                            e.preventDefault();
                            setQuery("");
                        }
                    }}
                    placeholder={t("settings.search")}
                    aria-label={t("settings.search")}
                    className="w-full pr-36 pl-36 [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query !== "" && (
                    <button
                        type="button"
                        className="text-text-subtitle hover:text-text absolute top-1/2 right-8 -translate-y-1/2 rounded-full p-4"
                        aria-label={t("settings.shortcuts.clearSearch")}
                        onClick={() => setQuery("")}
                    >
                        <XIcon size={14} />
                    </button>
                )}
            </div>
            <nav
                aria-label={t("settings.title")}
                onKeyDown={onNavKeyDown}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            >
                {visible.map(({ id, labelKey, Icon }) => {
                    const label = t(labelKey);
                    const isSelected = id === selected;
                    return (
                        <button
                            key={id}
                            ref={(el) => {
                                if (el) buttons.current.set(id, el);
                                else buttons.current.delete(id);
                            }}
                            type="button"
                            aria-current={isSelected ? "page" : undefined}
                            onClick={() => select(id)}
                            className={clsx(
                                "rounded-6 text-sub flex items-start gap-10 px-8 py-6 text-left outline-hidden duration-150 ease-out",
                                "focus-visible:ring-accent focus-visible:ring-1",
                                isSelected
                                    ? "bg-accent/15 text-text"
                                    : "text-text-subtitle hover:text-text hover:bg-fg-1",
                            )}
                        >
                            <Icon
                                size={16}
                                aria-hidden
                                className={clsx(
                                    "mt-1 shrink-0",
                                    isSelected && "text-accent",
                                )}
                            />
                            <span className="min-w-0 break-words whitespace-normal">
                                {label}
                            </span>
                        </button>
                    );
                })}
            </nav>
            {visible.length === 0 && (
                <p className="text-sub text-text-subtitle px-8">
                    {t("settings.noResults")}
                </p>
            )}
        </div>
    );
}
