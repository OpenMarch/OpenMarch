/**
 * The 3D View settings panel (ui.md UI-2): every choice about the 3D View, in
 * the 3D View, kept out of the way of the scene. Three tabs, the first two
 * split from the third by a rule:
 *
 * - Venue and Performers, saved with the show: the venue, its lighting, the
 *   crowd and the end zones; the uniforms, brass, tubas and flag silks. Every
 *   change goes to the editor, which saves it with undo.
 * - Preferences, saved on this computer only (ADR 0010 D-5): opening the 3D
 *   View with a show (also in Settings › General), quality, resolution, the
 *   control scheme, and the keys, so they can be found.
 *
 * Each tab says where its choices are saved in its first line. The panel
 * floats at the right and doesn't block the scene, so the viewer can orbit
 * while trying a look. The last tab used is remembered on this computer.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { T, useTranslate } from "@tolgee/react";
import { FileIcon, MonitorIcon, XIcon, type Icon } from "@phosphor-icons/react";
import {
    Input,
    Switch,
    TabContent,
    TabItem,
    Tabs,
    TabsList,
} from "@openmarch/ui";
import clsx from "clsx";
import Shortcut from "@/components/ui/Shortcut";
import { useView3dSceneStore } from "../sceneStore";
import { setAutoOpen, useAutoOpenSetting } from "./autoOpenSetting";
import { QUALITY_MODES } from "../qualityPreference";
import { RESOLUTIONS } from "../renderPrefs";
import { type ControlScheme } from "../camera/controlScheme";
import ControlSchemePicker from "../camera/ControlSchemePicker";
import { Segmented } from "./Panel";
import { SilkArtworkControls } from "./SilkArtworkControls";
import {
    BrassFinishPicker,
    LightingControl,
    GuardUniformPicker,
    SilkShapePicker,
    TubaPicker,
    UniformPicker,
    VenuePicker,
    useVenueRequest,
} from "./VenueControls";

/** End-zone lettering longer than this doesn't fit at a readable size. */
export const END_ZONE_TEXT_MAX = 24;

export const SETTINGS_TABS = ["venue", "performers", "preferences"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The last tab the viewer opened, a per-computer convenience. */
export const SETTINGS_TAB_STORAGE_KEY = "view3d.settingsTab";

export function loadSettingsTab(storage?: Storage): SettingsTab {
    try {
        const saved = (storage ?? window.localStorage).getItem(
            SETTINGS_TAB_STORAGE_KEY,
        );
        return SETTINGS_TABS.includes(saved as SettingsTab)
            ? (saved as SettingsTab)
            : "venue";
    } catch {
        return "venue";
    }
}

function saveSettingsTab(tab: SettingsTab) {
    try {
        window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tab);
    } catch {
        // Blocked storage: the panel opens on Venue next time
    }
}

export function SettingsPanel({
    onClose,
    className,
}: {
    onClose: () => void;
    className?: string;
}) {
    const { t } = useTranslate();
    const kit = useView3dSceneStore((s) => s.kit);
    const kitId = useView3dSceneStore((s) => s.kitId);
    const hasStands = !!kit && kit.seatRows.length > 0;
    const [tab, setTab] = useState<SettingsTab>(() => loadSettingsTab());

    return (
        <section
            role="dialog"
            aria-label={t("view3d.settings.panelTitle")}
            data-testid="view3d-settings"
            className={clsx(
                "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-auto flex w-[22rem] max-w-full flex-col overflow-hidden border",
                className,
            )}
        >
            <header className="border-stroke flex items-center justify-between border-b py-6 pr-6 pl-12">
                <h2 className="text-body font-medium">
                    {t("view3d.settings.panelTitle")}
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("view3d.settings.close")}
                    className="rounded-4 hover:bg-text/10 focus-visible:outline-accent flex size-28 items-center justify-center outline-hidden focus-visible:outline-2"
                >
                    <XIcon size={16} />
                </button>
            </header>
            <Tabs
                value={tab}
                onValueChange={(next) => {
                    setTab(next as SettingsTab);
                    saveSettingsTab(next as SettingsTab);
                }}
                className="min-h-0 gap-0"
            >
                <TabsList className="gap-4 px-6">
                    <TabItem
                        value="venue"
                        data-testid="view3d-settings-tab-venue"
                    >
                        {t("view3d.settings.tabs.venue")}
                    </TabItem>
                    <TabItem
                        value="performers"
                        data-testid="view3d-settings-tab-performers"
                    >
                        {t("view3d.settings.tabs.performers")}
                    </TabItem>
                    {/* A rule splits the show's tabs from this computer's. Hidden
                        from screen readers, and arrow keys skip it. */}
                    <span className="bg-stroke mx-4 my-8 w-px" aria-hidden />
                    <TabItem
                        value="preferences"
                        data-testid="view3d-settings-tab-preferences"
                    >
                        {t("view3d.settings.tabs.preferences")}
                    </TabItem>
                </TabsList>
                <TabContent
                    value="venue"
                    className="flex min-h-0 flex-col gap-16 overflow-y-auto p-12"
                >
                    <SavedNote
                        icon={FileIcon}
                        text={t("view3d.settings.showNote")}
                    />
                    <Row label={t("view3d.overlay.venue")} stacked>
                        <VenuePicker />
                    </Row>
                    <Row label={t("view3d.overlay.lighting")} stacked>
                        <LightingControl />
                    </Row>
                    {hasStands && <CrowdRows />}
                    {/* Indoor floors have no end zones */}
                    {kitId !== "gym" && kitId !== "arena" && <EndZoneRow />}
                </TabContent>
                <TabContent
                    value="performers"
                    className="flex min-h-0 flex-col gap-16 overflow-y-auto p-12"
                >
                    <SavedNote
                        icon={FileIcon}
                        text={t("view3d.settings.showNote")}
                    />
                    <Row label={t("view3d.settings.uniforms")} stacked>
                        <UniformPicker />
                    </Row>
                    <Row label={t("view3d.settings.brassFinish")}>
                        <BrassFinishPicker />
                    </Row>
                    <Row label={t("view3d.settings.tuba")}>
                        <TubaPicker />
                    </Row>
                    <Row label={t("view3d.settings.guardUniforms")} stacked>
                        <GuardUniformPicker />
                    </Row>
                    <Row label={t("view3d.settings.silkShape")} stacked>
                        <SilkShapePicker />
                    </Row>
                    <Row label={t("view3d.settings.silkArtwork")} stacked>
                        <SilkArtworkControls />
                    </Row>
                </TabContent>
                <TabContent
                    value="preferences"
                    className="flex min-h-0 flex-col gap-16 overflow-y-auto p-12"
                >
                    <SavedNote
                        icon={MonitorIcon}
                        text={t("view3d.settings.computerNote")}
                    />
                    <AutoOpenRow />
                    <QualityRow />
                    <ResolutionRow />
                    <ControlsRow />
                    <Row label={t("view3d.settings.shortcuts")} stacked>
                        <ShortcutList />
                    </Row>
                </TabContent>
            </Tabs>
        </section>
    );
}

/** A tab's first line: where its choices are saved. */
function SavedNote({ icon: NoteIcon, text }: { icon: Icon; text: string }) {
    return (
        <p
            className="text-sub text-text/60 flex items-start gap-6"
            data-testid="view3d-settings-saved-note"
        >
            <NoteIcon size={14} className="mt-2 shrink-0" aria-hidden />
            {text}
        </p>
    );
}

/**
 * "Open 3D View when a show opens", the same setting as in Settings ›
 * General. Hidden where the 3D View never opens by itself (the web builds,
 * Playwright sessions), where the window gets null for it.
 */
function AutoOpenRow() {
    const { t } = useTranslate();
    const setting = useAutoOpenSetting();
    if (setting === null || setting === "loading") return null;
    return (
        <Row label={t("settings.general.openView3dWithShow")}>
            <Switch
                // Never answered reads as on, since the 3D View opens with a show then
                checked={setting ?? true}
                onCheckedChange={setAutoOpen}
                aria-label={t("settings.general.openView3dWithShow")}
                data-testid="view3d-auto-open-toggle"
            />
        </Row>
    );
}

function Row({
    label,
    stacked = false,
    children,
}: {
    label: string;
    /** Puts the control under the label instead of beside it. */
    stacked?: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={clsx(
                "flex gap-6",
                stacked
                    ? "flex-col"
                    : "min-h-28 items-center justify-between gap-12",
            )}
        >
            <span className="text-body">{label}</span>
            {children}
        </div>
    );
}

function CrowdRows() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    if (!settings) return null;
    return (
        <>
            <Row label={t("view3d.overlay.crowd")}>
                <Switch
                    checked={settings.crowd}
                    onCheckedChange={(crowd) =>
                        request({ kind: "crowd", crowd })
                    }
                    aria-label={t("view3d.overlay.crowd")}
                    data-testid="view3d-crowd-toggle"
                />
            </Row>
            {settings.crowd && (
                <Row label={t("view3d.settings.crowdColors")}>
                    <div className="flex items-center gap-8">
                        <ColorField
                            label={t("view3d.settings.homeColor")}
                            value={settings.params.homeColor}
                            onCommit={(homeColor) =>
                                request({
                                    kind: "params",
                                    params: { homeColor },
                                })
                            }
                            testId="view3d-home-color"
                        />
                        <ColorField
                            label={t("view3d.settings.awayColor")}
                            value={settings.params.awayColor}
                            onCommit={(awayColor) =>
                                request({
                                    kind: "params",
                                    params: { awayColor },
                                })
                            }
                            testId="view3d-away-color"
                        />
                    </div>
                </Row>
            )}
        </>
    );
}

function EndZoneRow() {
    const { t } = useTranslate();
    const { settings, request } = useVenueRequest();
    if (!settings) return null;
    return (
        <Row label={t("view3d.settings.endZones")} stacked>
            <div className="flex items-center gap-8">
                <EndZoneTextField
                    value={settings.params.endZoneText}
                    onCommit={(endZoneText) =>
                        request({ kind: "params", params: { endZoneText } })
                    }
                />
                <ColorField
                    label={t("view3d.settings.endZoneColor")}
                    value={settings.params.endZoneColor}
                    onCommit={(endZoneColor) =>
                        request({ kind: "params", params: { endZoneColor } })
                    }
                    testId="view3d-end-zone-color"
                />
            </div>
        </Row>
    );
}

/**
 * The end-zone lettering. Saved on Enter or when focus leaves, not on every
 * key, so one edit is one undo step. Esc puts the saved text back.
 */
function EndZoneTextField({
    value,
    onCommit,
}: {
    value: string;
    onCommit: (text: string) => void;
}) {
    const { t } = useTranslate();
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => {
        const text = draft.trim();
        if (text !== value) onCommit(text);
        else setDraft(value);
    };
    return (
        <Input
            compact
            value={draft}
            maxLength={END_ZONE_TEXT_MAX}
            placeholder={t("view3d.settings.endZoneTextPlaceholder")}
            aria-label={t("view3d.settings.endZoneText")}
            data-testid="view3d-end-zone-text"
            className="min-w-0 flex-1"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.currentTarget.blur();
                } else if (event.key === "Escape") {
                    setDraft(value);
                }
            }}
        />
    );
}

/**
 * A color swatch. The native picker updates the swatch while it is open and
 * saves once when it closes, so one pick is one undo step.
 */
function ColorField({
    label,
    value,
    onCommit,
    testId,
}: {
    label: string;
    value: string;
    onCommit: (color: string) => void;
    testId?: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const commitRef = useRef(onCommit);
    commitRef.current = onCommit;

    // React's onChange fires on every `input`; saving waits for `change`.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onChange = () => commitRef.current(el.value.toLowerCase());
        el.addEventListener("change", onChange);
        return () => el.removeEventListener("change", onChange);
    }, []);
    useEffect(() => {
        if (ref.current && ref.current.value !== value) {
            ref.current.value = value;
        }
    }, [value]);

    return (
        <label className="flex items-center gap-6" title={label}>
            <span className="text-sub text-text/60">{label}</span>
            <input
                ref={ref}
                type="color"
                defaultValue={value}
                aria-label={label}
                data-testid={testId}
                className="border-stroke rounded-4 size-28 shrink-0 cursor-pointer border bg-transparent p-2"
            />
        </label>
    );
}

/**
 * Quality. Says why when the view went to Low on its own or WebGL draws in
 * software.
 */
function QualityRow() {
    const { t } = useTranslate();
    const mode = useView3dSceneStore((s) => s.qualityMode);
    const setMode = useView3dSceneStore((s) => s.setQualityMode);
    const autoLowered = useView3dSceneStore((s) => s.autoLowered);
    const softwareGl = useView3dSceneStore((s) => s.softwareGl);
    const hint = softwareGl
        ? t("view3d.quality.softwareHint")
        : mode === "auto" && autoLowered
          ? t("view3d.quality.autoLoweredHint")
          : t(`settings.view3d.quality.${mode}.description`);
    return (
        <Row label={t("settings.view3d.quality")} stacked>
            <Segmented
                value={mode}
                options={QUALITY_MODES.map((value) => ({
                    value,
                    label: t(`settings.view3d.quality.${value}`),
                }))}
                onChange={setMode}
                label={t("settings.view3d.quality")}
                testId="view3d-quality-picker"
            />
            <p
                className="text-sub text-text/60"
                data-testid="view3d-quality-hint"
            >
                {hint}
            </p>
        </Row>
    );
}

/** Resolution: the most device pixels drawn per screen pixel. */
function ResolutionRow() {
    const { t } = useTranslate();
    const resolution = useView3dSceneStore((s) => s.resolution);
    const setResolution = useView3dSceneStore((s) => s.setResolution);
    return (
        <Row label={t("settings.view3d.resolution")} stacked>
            <Segmented
                value={resolution}
                options={RESOLUTIONS.map((value) => ({
                    value,
                    label: t(`settings.view3d.resolution.${value}`),
                }))}
                onChange={setResolution}
                label={t("settings.view3d.resolution")}
                testId="view3d-resolution-picker"
            />
            <p className="text-sub text-text/60">
                {t(`settings.view3d.resolution.${resolution}.description`)}
            </p>
        </Row>
    );
}

/** What dragging and scrolling do. Above the key list, which follows it. */
function ControlsRow() {
    const { t } = useTranslate();
    const scheme = useView3dSceneStore((s) => s.controlScheme);
    const setScheme = useView3dSceneStore((s) => s.setControlScheme);
    return (
        <Row label={t("settings.view3d.controls")} stacked>
            <ControlSchemePicker
                value={scheme}
                onChange={setScheme}
                testId="view3d-controls-picker"
            />
            <p className="text-sub text-text/60">
                {t(`settings.view3d.controls.${scheme}.description`)}
            </p>
        </Row>
    );
}

/**
 * The window's keyboard and mouse controls (ui.md UI-3, UI-4), in display
 * order. Each has `view3d.keys.<name>` for what it does; its keys are a
 * binding or display keys shown as a `Shortcut` (mouse gestures are words in
 * the cap), or two of them as a pair (`view3d.keyNames.pair`).
 */
type ShortcutKeys =
    | { readonly binding: string }
    | { readonly keys: readonly string[] }
    | { readonly pair: readonly [first: string, second: string] };

type ShortcutRows = readonly (readonly [string, ShortcutKeys])[];

/** The rows that follow the viewer's control scheme. */
const MOVE_SHORTCUTS: Record<ControlScheme, ShortcutRows> = {
    orbit: [
        ["orbit", { binding: "drag" }],
        ["pan", { binding: "Shift+drag" }],
        ["zoom", { binding: "scroll" }],
    ],
    map: [
        ["panPlain", { binding: "drag" }],
        ["orbitOrRight", { binding: "Alt+drag" }],
        ["zoom", { binding: "scroll" }],
    ],
    trackpad: [
        ["orbit", { binding: "scroll" }],
        ["pan", { binding: "Shift+drag" }],
        ["zoomOrPinch", { binding: "Ctrl+scroll" }],
    ],
};

const SHORTCUTS: ShortcutRows = [
    ["playPause", { binding: "Space" }],
    ["previousNext", { pair: ["Q", "E"] }],
    ["firstLast", { pair: ["Alt+Q", "Alt+E"] }],
    ["cameras", { keys: ["1–9"] }],
    ["fullscreen", { binding: "F" }],
    ["crowd", { binding: "C" }],
    ["pausedPose", { binding: "S" }],
    ["escape", { binding: "Escape" }],
];

function ShortcutKeysCell({ keys }: { keys: ShortcutKeys }) {
    if (!("pair" in keys)) return <Shortcut {...keys} />;
    const [first, second] = keys.pair;
    return (
        <T
            keyName="view3d.keyNames.pair"
            params={{
                first: () => <Shortcut binding={first} />,
                second: () => <Shortcut binding={second} />,
            }}
        />
    );
}

function ShortcutList() {
    const { t } = useTranslate();
    const scheme = useView3dSceneStore((s) => s.controlScheme);
    return (
        <dl className="text-sub grid grid-cols-[auto_1fr] items-baseline gap-x-12 gap-y-4">
            {[...SHORTCUTS, ...MOVE_SHORTCUTS[scheme]].map(([name, keys]) => (
                <div key={name} className="contents">
                    <dt className="flex items-center gap-4 whitespace-nowrap">
                        <ShortcutKeysCell keys={keys} />
                    </dt>
                    <dd className="text-text/80">{t(`view3d.keys.${name}`)}</dd>
                </div>
            ))}
        </dl>
    );
}
