/**
 * The view settings panel (ui.md UI-2): the choices a designer makes once
 * per show or per computer, kept out of the way of the scene.
 *
 * - Venue, saved with the show: the venue, its lighting, the crowd and its
 *   colors, and the end-zone lettering. Every change goes to the editor,
 *   which saves it with undo.
 * - Graphics: quality and resolution live in the app's Settings window (3D View section). Where
 *   there is no Settings window (the web preview), they are here too.
 * - Preview only, never saved: horns, guard equipment and the step-off foot,
 *   overriding the cues in this window alone.
 * - The keyboard and mouse controls, so they can be found.
 *
 * It floats at the right and doesn't block the scene, so the viewer can
 * orbit while trying a look.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { T, useTranslate } from "@tolgee/react";
import { XIcon } from "@phosphor-icons/react";
import { Input, Switch } from "@openmarch/ui";
import clsx from "clsx";
import Shortcut from "@/components/ui/Shortcut";
import { useView3dSceneStore } from "../sceneStore";
import { QUALITY_MODES } from "../qualityPreference";
import { HAS_SETTINGS_WINDOW, RESOLUTIONS } from "../renderPrefs";
import { HOLD_STATES } from "../hornState";
import { GUARD_EQUIPMENT } from "@/view3d/core/instruments/catalog";
import { Segmented } from "./Panel";
import {
    LightingControl,
    GuardUniformPicker,
    UniformPicker,
    VenuePicker,
    useVenueRequest,
} from "./VenueControls";
import { useShowPerformerDefaults } from "../performers/useStoredCues";

/** End-zone lettering longer than this doesn't fit at a readable size. */
export const END_ZONE_TEXT_MAX = 24;

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

    return (
        <section
            role="dialog"
            aria-label={t("view3d.settings.title")}
            data-testid="view3d-settings"
            className={clsx(
                "border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-auto flex w-[22rem] max-w-full flex-col overflow-hidden border",
                className,
            )}
        >
            <header className="border-stroke flex items-center justify-between border-b py-6 pr-6 pl-12">
                <h2 className="text-body font-medium">
                    {t("view3d.settings.title")}
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
            <div className="flex min-h-0 flex-col gap-16 overflow-y-auto p-12">
                <Section
                    title={t("view3d.settings.venueSection")}
                    hint={t("view3d.settings.venueHint")}
                >
                    <Row label={t("view3d.overlay.venue")} stacked>
                        <VenuePicker />
                    </Row>
                    <Row label={t("view3d.overlay.lighting")} stacked>
                        <LightingControl />
                    </Row>
                    <Row label={t("view3d.settings.uniforms")} stacked>
                        <UniformPicker />
                    </Row>
                    <Row label={t("view3d.settings.guardUniforms")} stacked>
                        <GuardUniformPicker />
                    </Row>
                    {hasStands && <CrowdRows />}
                    {kitId !== "gym" && <EndZoneRow />}
                </Section>
                {/* Graphics live in the Settings window; the web preview has none */}
                {!HAS_SETTINGS_WINDOW && (
                    <Section
                        title={t("view3d.settings.graphicsSection")}
                        hint={t("view3d.settings.graphicsHint")}
                    >
                        <QualityRow />
                        <ResolutionRow />
                    </Section>
                )}
                {/* Its own section: window state only, never saved (performer-behavior.md 7.5) */}
                <Section
                    title={t("view3d.settings.previewSection")}
                    hint={t("view3d.settings.previewHint")}
                    testId="view3d-preview-section"
                >
                    <HornStateRow />
                    <GuardEquipmentRow />
                    <StepOffFootRow />
                </Section>
                <Section title={t("view3d.settings.keysSection")}>
                    <ShortcutList />
                </Section>
            </div>
        </section>
    );
}

function Section({
    title,
    hint,
    testId,
    children,
}: {
    title: string;
    hint?: string;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-8" data-testid={testId}>
            <div className="flex flex-col gap-2">
                <h3 className="text-sub text-text/60 font-mono tracking-wide uppercase">
                    {title}
                </h3>
                {hint && <p className="text-sub text-text/60">{hint}</p>}
            </div>
            {children}
        </div>
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
 * Quality, for the web preview, which has no Settings window. Says why when
 * the view went to Low on its own or WebGL draws in software.
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

/** Resolution, for the web preview, which has no Settings window. */
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

/** Which hold the brass plays: a test control until per-page horn states exist. */
function HornStateRow() {
    // Every carrier in one hold, to check the poses; "Follow cues", the Horn cues decide
    const state = useView3dSceneStore((s) => s.hornState);
    const setState = useView3dSceneStore((s) => s.setHornState);
    return (
        <PreviewRow
            name="hornState"
            value={state}
            values={HOLD_STATES}
            onChange={setState}
            testId="view3d-horn-state-picker"
        />
    );
}

/** One piece in every guard member's hands, to see it; off, each section's own. */
function GuardEquipmentRow() {
    const equipment = useView3dSceneStore((s) => s.guardEquipment);
    const setEquipment = useView3dSceneStore((s) => s.setGuardEquipment);
    return (
        <PreviewRow
            name="guardEquipment"
            value={equipment}
            values={GUARD_EQUIPMENT}
            onChange={setEquipment}
            testId="view3d-guard-equipment-picker"
            className="grid! grid-cols-3 [&>*]:justify-start"
        />
    );
}

/**
 * Which foot the band steps off on, always the performer's own; off, the
 * show's saved foot (named in the hint) and the Feet cues decide.
 */
function StepOffFootRow() {
    const { t } = useTranslate();
    const override = useView3dSceneStore((s) => s.stepOffFoot);
    const setOverride = useView3dSceneStore((s) => s.setStepOffFoot);
    const showFoot = useShowPerformerDefaults().stepOffFoot;
    return (
        <PreviewRow
            name="stepOffFoot"
            value={override}
            values={["left", "right"] as const}
            onChange={setOverride}
            testId="view3d-step-off-foot-picker"
            hint={t("view3d.settings.stepOffFootHint", {
                foot: showFoot,
            })}
        />
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

const SHORTCUTS: readonly (readonly [string, ShortcutKeys])[] = [
    ["playPause", { binding: "Space" }],
    ["previousNext", { pair: ["Q", "E"] }],
    ["firstLast", { pair: ["Alt+Q", "Alt+E"] }],
    ["cameras", { keys: ["1–9"] }],
    ["fullscreen", { binding: "F" }],
    ["crowd", { binding: "C" }],
    ["escape", { binding: "Escape" }],
    ["orbit", { binding: "drag" }],
    ["pan", { binding: "Shift+drag" }],
    ["zoom", { binding: "scroll" }],
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
    return (
        <dl className="text-sub grid grid-cols-[auto_1fr] items-baseline gap-x-12 gap-y-4">
            {SHORTCUTS.map(([name, keys]) => (
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

/** "Follow cues", the segmented controls' value for no preview override. */
const FOLLOW = "follow";
type Follow = typeof FOLLOW;

/**
 * A preview override's control: "Follow cues" (null, the start) or one of
 * `values`. Window state only, never saved (performer-behavior.md 7.5).
 */
function PreviewRow<T extends string>({
    name,
    value,
    values,
    onChange,
    testId,
    className,
    hint,
}: {
    /** `view3d.settings.<name>`, `<name>Mode.<value>` and `<name>Hint`. */
    name: "hornState" | "guardEquipment" | "stepOffFoot";
    value: T | null;
    values: readonly T[];
    onChange: (value: T | null) => void;
    testId: string;
    className?: string;
    /** In place of `<name>Hint`. */
    hint?: string;
}) {
    const { t } = useTranslate();
    const label = t(`view3d.settings.${name}`);
    return (
        <Row label={label} stacked>
            <Segmented<T | Follow>
                value={value ?? FOLLOW}
                options={[
                    { value: FOLLOW, label: t("view3d.settings.followCues") },
                    ...values.map((v) => ({
                        value: v,
                        label: t(`view3d.settings.${name}Mode.${v}`),
                    })),
                ]}
                onChange={(next) => onChange(next === FOLLOW ? null : next)}
                label={label}
                testId={testId}
                className={className}
            />
            <p className="text-sub text-text/60">
                {hint ?? t(`view3d.settings.${name}Hint`)}
            </p>
        </Row>
    );
}
