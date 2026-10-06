import type { ComponentType } from "react";
import {
    CursorClickIcon,
    DatabaseIcon,
    GearSixIcon,
    KeyboardIcon,
    PuzzlePieceIcon,
    ShieldCheckIcon,
    WrenchIcon,
    type Icon,
} from "@phosphor-icons/react";
import GeneralSettings from "@/components/launchpage/settings/GeneralSettings";
import MouseSettings from "@/components/launchpage/settings/MouseSettings";
import ShortcutSettings from "@/components/launchpage/settings/ShortcutSettings";
import PluginsContents from "@/components/launchpage/settings/plugins/Plugins";
import PrivacySettings from "@/components/launchpage/settings/PrivacySettings";
import DeveloperSettings from "@/components/launchpage/settings/DeveloperSettings";
import DatabaseRepairSettings from "@/components/launchpage/settings/DatabaseRepairSettings";

export type SettingsSectionId =
    | "general"
    | "mouse"
    | "shortcuts"
    | "plugins"
    | "privacy"
    | "developer"
    | "database";

export interface SettingsSection {
    id: SettingsSectionId;
    labelKey: string;
    Icon: Icon;
    Component: ComponentType;
}

export const SETTINGS_SECTION_STORAGE_KEY = "openmarch:settingsSection";

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
    {
        id: "general",
        labelKey: "settings.general",
        Icon: GearSixIcon,
        Component: GeneralSettings,
    },
    {
        id: "mouse",
        labelKey: "settings.mouse",
        Icon: CursorClickIcon,
        Component: MouseSettings,
    },
    {
        id: "shortcuts",
        labelKey: "settings.shortcuts",
        Icon: KeyboardIcon,
        Component: ShortcutSettings,
    },
    {
        id: "plugins",
        labelKey: "settings.plugins",
        Icon: PuzzlePieceIcon,
        Component: PluginsContents,
    },
    {
        id: "privacy",
        labelKey: "settings.privacy",
        Icon: ShieldCheckIcon,
        Component: PrivacySettings,
    },
    {
        id: "developer",
        labelKey: "settings.developer",
        Icon: WrenchIcon,
        Component: DeveloperSettings,
    },
    {
        id: "database",
        labelKey: "settings.database",
        Icon: DatabaseIcon,
        Component: DatabaseRepairSettings,
    },
];

export function readSavedSection(): SettingsSectionId {
    try {
        const saved = localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY);
        return SETTINGS_SECTIONS.find((s) => s.id === saved)?.id ?? "general";
    } catch {
        return "general";
    }
}

export function saveSection(id: SettingsSectionId): void {
    try {
        localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, id);
    } catch {
        // Remembering the section is a convenience only.
    }
}
