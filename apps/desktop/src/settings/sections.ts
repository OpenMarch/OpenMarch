import type { ComponentType } from "react";
import {
    CubeIcon,
    CursorClickIcon,
    DatabaseIcon,
    GearSixIcon,
    GridFourIcon,
    HandPointingIcon,
    KeyboardIcon,
    PaletteIcon,
    ShieldCheckIcon,
    WaveformIcon,
    WrenchIcon,
    type Icon,
} from "@phosphor-icons/react";
import { ACTION_IDS, getActionDefinition } from "@/shortcuts/definitions";
import { getActionLabel, type Translate } from "@/shortcuts/labels";
import GeneralSettings from "@/components/launchpage/settings/GeneralSettings";
import AppearanceSettings from "@/components/launchpage/settings/AppearanceSettings";
import MouseSettings from "@/components/launchpage/settings/MouseSettings";
import FieldSettings from "@/components/launchpage/settings/FieldSettings";
import TimelineSettings from "@/components/launchpage/settings/TimelineSettings";
import View3dSettings from "@/components/launchpage/settings/View3dSettings";
import InputSettings from "@/components/launchpage/settings/InputSettings";
import ShortcutSettings from "@/components/launchpage/settings/ShortcutSettings";
import PrivacySettings from "@/components/launchpage/settings/PrivacySettings";
import DeveloperSettings from "@/components/launchpage/settings/DeveloperSettings";
import DatabaseRepairSettings from "@/components/launchpage/settings/DatabaseRepairSettings";
import { isWebBuild } from "@/utilities/webBuild";

export type SettingsSectionId =
    | "general"
    | "appearance"
    | "input"
    | "mouse"
    | "timeline"
    | "field"
    | "view3d"
    | "shortcuts"
    | "privacy"
    | "developer"
    | "database";

export interface SettingsSection {
    id: SettingsSectionId;
    labelKey: string;
    Icon: Icon;
    Component: ComponentType;
    /** i18n key of the one-line subtitle shown under the section title. */
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
/**
 * Every section, as in the desktop app. The user guide's settings data is generated from this
 * list (`scripts/docs-reference/generate.mts`), and its check fails on a setting in `searchKeys`
 * that no guide page describes, so list each setting's label key here.
 */
export const ALL_SETTINGS_SECTIONS: readonly SettingsSection[] = [
    {
        id: "general",
        labelKey: "settings.general",
        Icon: GearSixIcon,
        Component: GeneralSettings,
        descriptionKey: "settings.general.description",
        searchKeys: [
            "settings.general.language",
            // Not in the web build, where there's nothing to update
            ...(isWebBuild
                ? []
                : [
                      "settings.general.updates",
                      "settings.general.checkForUpdates",
                      "settings.general.automaticDownload",
                      "settings.general.openView3dWithShow",
                  ]),
        ],
    },
    {
        id: "appearance",
        labelKey: "settings.appearance",
        Icon: PaletteIcon,
        Component: AppearanceSettings,
        descriptionKey: "settings.appearance.description",
        searchKeys: [
            "settings.general.appearance",
            "settings.general.appearance.light",
            "settings.general.appearance.dark",
            "settings.general.showFullDatabasePath",
            "settings.general.performanceMode",
        ],
    },
    {
        id: "input",
        labelKey: "settings.input",
        Icon: HandPointingIcon,
        Component: InputSettings,
        descriptionKey: "settings.input.description",
        searchKeys: [
            "settings.input.interface",
            "settings.input.interface.touch",
            "settings.input.interface.mouse",
        ],
    },
    {
        id: "mouse",
        labelKey: "settings.mouse",
        Icon: CursorClickIcon,
        Component: MouseSettings,
        descriptionKey: "settings.mouse.description",
        searchKeys: [
            "settings.mouse.zoomSensitivity",
            "settings.mouse.trackpadMode",
            "settings.mouse.trackpadPanSensitivity",
        ],
    },
    {
        id: "timeline",
        labelKey: "settings.timeline",
        Icon: WaveformIcon,
        Component: TimelineSettings,
        descriptionKey: "settings.timeline.description",
        searchKeys: [
            "settings.general.editorMode",
            "settings.general.editorMode.basic",
            "settings.general.editorMode.expert",
            "settings.timeline.waveformStyle",
            "settings.timeline.waveformStyle.simplified",
            "settings.timeline.waveformStyle.precise",
            "settings.timeline.waveformStyle.hidden",
        ],
    },
    {
        id: "field",
        labelKey: "settings.field",
        Icon: GridFourIcon,
        Component: FieldSettings,
        descriptionKey: "settings.field.description",
        searchKeys: [
            "settings.field.gridLines",
            "settings.field.halfLines",
            "settings.field.labelSize",
            "settings.field.labelPosition",
            "settings.field.stepSizeWarnings",
        ],
    },
    {
        id: "view3d",
        labelKey: "settings.view3d",
        Icon: CubeIcon,
        Component: View3dSettings,
        descriptionKey: "settings.view3d.summary",
        searchKeys: [
            "settings.view3d.controls",
            "settings.view3d.quality",
            "settings.view3d.resolution",
        ],
    },
    {
        id: "shortcuts",
        labelKey: "settings.shortcuts",
        Icon: KeyboardIcon,
        Component: ShortcutSettings,
        descriptionKey: "settings.shortcuts.description",
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
        id: "privacy",
        labelKey: "settings.privacy",
        Icon: ShieldCheckIcon,
        Component: PrivacySettings,
        descriptionKey: "settings.privacy.description",
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
        descriptionKey: "settings.developer.description",
        searchKeys: ["settings.tolgeeDevToolsToggle"],
    },
    {
        id: "database",
        labelKey: "settings.database",
        Icon: DatabaseIcon,
        Component: DatabaseRepairSettings,
        descriptionKey: "settings.database.description",
        searchKeys: ["settings.repairDotsFile.title"],
    },
];

/** Sections for things the web build doesn't have: analytics, Tolgee tools, file repair. */
const WEB_HIDDEN_SECTIONS: ReadonlySet<string> = new Set([
    "privacy",
    "developer",
    "database",
]);

export const SETTINGS_SECTIONS: readonly SettingsSection[] = isWebBuild
    ? ALL_SETTINGS_SECTIONS.filter((s) => !WEB_HIDDEN_SECTIONS.has(s.id))
    : ALL_SETTINGS_SECTIONS;

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
