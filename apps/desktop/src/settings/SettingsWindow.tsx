import { useRef, useState, type KeyboardEvent } from "react";
import { T, useTranslate } from "@tolgee/react";
import { clsx } from "clsx";
import Toaster from "@/components/ui/Toaster";
import TitleBar from "@/components/titlebar/TitleBar";
import {
    readSavedSection,
    saveSection,
    SETTINGS_SECTIONS,
    type SettingsSectionId,
} from "./sections";

/** Root of the #settings window: sidebar of sections, selected section on the right. */
export default function SettingsWindow() {
    const { t } = useTranslate();
    const [selected, setSelected] =
        useState<SettingsSectionId>(readSavedSection);
    const buttons = useRef(new Map<SettingsSectionId, HTMLButtonElement>());
    const section = SETTINGS_SECTIONS.find((s) => s.id === selected)!;

    const select = (id: SettingsSectionId, focus = false) => {
        setSelected(id);
        saveSection(id);
        if (focus) buttons.current.get(id)?.focus();
    };

    const onNavKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const i = SETTINGS_SECTIONS.findIndex((s) => s.id === selected);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next =
            SETTINGS_SECTIONS[
                (i + step + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length
            ];
        select(next.id, true);
    };

    return (
        <main className="bg-bg-1 text-text @container flex h-screen w-screen min-w-0 flex-col overflow-hidden font-sans">
            <TitleBar showFilePath={false} />
            <div className="flex min-h-0 flex-1">
                <nav
                    aria-label={t("settings.title")}
                    onKeyDown={onNavKeyDown}
                    className="flex w-48 shrink-0 flex-col gap-2 px-8 pt-4 pb-12 @[720px]:w-[180px]"
                >
                    {SETTINGS_SECTIONS.map(({ id, labelKey, Icon }) => {
                        const label = t(labelKey);
                        return (
                            <button
                                key={id}
                                ref={(el) => {
                                    if (el) buttons.current.set(id, el);
                                    else buttons.current.delete(id);
                                }}
                                type="button"
                                aria-label={label}
                                aria-current={
                                    id === selected ? "page" : undefined
                                }
                                title={label}
                                onClick={() => select(id)}
                                className={clsx(
                                    "rounded-6 text-body flex items-center justify-center gap-10 px-8 py-6 text-left outline-hidden duration-150 ease-out @[720px]:justify-start",
                                    "focus-visible:ring-accent focus-visible:ring-1",
                                    id === selected
                                        ? "bg-fg-2 text-text"
                                        : "text-text-subtitle hover:text-text",
                                )}
                            >
                                <Icon
                                    size={16}
                                    aria-hidden
                                    className="shrink-0"
                                />
                                <span className="hidden truncate @[720px]:inline">
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </nav>
                <section className="@container min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-24 pt-4 pb-24">
                    <div className="flex max-w-[560px] flex-col gap-16">
                        <h1 className="text-h5 leading-none">
                            <T keyName={section.labelKey} />
                        </h1>
                        <section.Component />
                    </div>
                </section>
            </div>
            <Toaster />
        </main>
    );
}
