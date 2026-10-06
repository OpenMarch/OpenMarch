import { useEffect, useState } from "react";
import { T } from "@tolgee/react";
import Toaster from "@/components/ui/Toaster";
import TitleBar from "@/components/titlebar/TitleBar";
import {
    readSavedSection,
    saveSection,
    SETTINGS_SECTIONS,
    type SettingsSectionId,
} from "./sections";
import SettingsSidebar from "./SettingsSidebar";

/** Root of the #settings window: sidebar of sections, selected section on the right. */
export default function SettingsWindow() {
    const [selected, setSelected] =
        useState<SettingsSectionId>(readSavedSection);
    const section = SETTINGS_SECTIONS.find((s) => s.id === selected)!;

    // The settings window has no app menu close role, so handle Cmd/Ctrl+W here.
    // Bubble phase and defaultPrevented check leave the shortcut recorder alone.
    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.defaultPrevented || event.key.toLowerCase() !== "w")
                return;
            const mod = window.electron.isMacOS ? event.metaKey : event.ctrlKey;
            if (!mod) return;
            event.preventDefault();
            window.electron.closeWindow();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const select = (id: SettingsSectionId) => {
        setSelected(id);
        saveSection(id);
    };

    return (
        <main className="bg-bg-1 text-text @container flex h-screen w-screen min-w-0 flex-col overflow-hidden font-sans">
            <TitleBar showFilePath={false} />
            <div className="flex min-h-0 flex-1">
                <SettingsSidebar selected={selected} onSelect={select} />
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
