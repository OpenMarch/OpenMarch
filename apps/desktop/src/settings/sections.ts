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
import { ACTION_IDS, getActionDefinition } from "@/shortcuts/definitions";
import { getActionLabel, type Translate } from "@/shortcuts/labels";
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
    /** Subtitle shown under the section title (Task 12 adds real description keys). */
    descriptionKey: string;
    /** i18n keys of the labels of the settings in this section, matched by the sidebar search. */
    searchKeys: readonly string[];
    /** Extra searchable labels that need translating at runtime, e.g. one per keyboard action. */
    searchLabels?: (t: Translate) => readonly string[];
}

export const SETTINGS_SECTION_STORAGE_KEY = "openmarch:settingsSection";

/*
 * Grouping, once there are enough sections to need it: give each section an optional
 * `group` id and add a `SETTINGS_GROUPS` list of `{ id, labelKey }`. The sidebar would
 * render each group as a collapsible heading above its sections. Not implemented yet
 * because there are only a few sections.
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
    {
        id: "general",
        labelKey: "settings.general",
        Icon: GearSixIcon,
        Component: GeneralSettings,
        descriptionKey: "settings.general",
        searchKeys: [
            "settings.general.appearance",
            "settings.general.appearance.light",
            "settings.general.appearance.dark",
            "settings.general.language",
            "settings.general.showFullDatabasePath",
        ],
    },
    {
        id: "mouse",
        labelKey: "settings.mouse",
        Icon: CursorClickIcon,
        Component: MouseSettings,
        descriptionKey: "settings.mouse",
        searchKeys: [
            "settings.mouse.zoomSensitivity",
            "settings.mouse.trackpadMode",
            "settings.mouse.trackpadPanSensitivity",
            "settings.mouse.panSensitivity",
        ],
    },
    {
        id: "shortcuts",
        labelKey: "settings.shortcuts",
        Icon: KeyboardIcon,
        Component: ShortcutSettings,
        descriptionKey: "settings.shortcuts",
        searchKeys: [],
        searchLabels: (t) => [
            ...ACTION_IDS.map((id) => getActionLabel(id, t)),
            ...new Set(
                ACTION_IDS.map((id) =>
                    t(
                        `settings.shortcuts.category.${getActionDefinition(id).category}`,
                    ),
                ),
            ),
        ],
    },
    {
        id: "plugins",
        labelKey: "settings.plugins",
        Icon: PuzzlePieceIcon,
        Component: PluginsContents,
        descriptionKey: "settings.plugins",
        searchKeys: [
            "settings.plugins.installed",
            "settings.plugins.official",
            "settings.plugins.community",
        ],
    },
    {
        id: "privacy",
        labelKey: "settings.privacy",
        Icon: ShieldCheckIcon,
        Component: PrivacySettings,
        descriptionKey: "settings.privacy",
        searchKeys: [
            "settings.privacy.analytics",
            "settings.privacy.analytics.toggle",
        ],
    },
    {
        id: "developer",
        labelKey: "settings.developer",
        Icon: WrenchIcon,
        Component: DeveloperSettings,
        descriptionKey: "settings.developer",
        searchKeys: ["settings.tolgeeDevToolsToggle"],
    },
    {
        id: "database",
        labelKey: "settings.database",
        Icon: DatabaseIcon,
        Component: DatabaseRepairSettings,
        descriptionKey: "settings.database",
        searchKeys: ["settings.repairDotsFile.title"],
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
