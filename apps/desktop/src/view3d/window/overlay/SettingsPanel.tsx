/**
 * The view settings panel (ui.md UI-2): the choices a designer makes once
 * per show or per computer, kept out of the way of the scene.
 *
 * - Venue, saved with the show: the venue, its lighting, the crowd and its
 *   colors, and the end-zone lettering. Every change goes to the editor,
 *   which saves it with undo.
 * - Graphics, saved on this computer: render quality.
 * - The keyboard and mouse controls, so they can be found.
 *
 * It floats at the right and doesn't block the scene, so the viewer can
 * orbit while trying a look.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslate } from "@tolgee/react";
import { XIcon } from "@phosphor-icons/react";
import { Input, Switch } from "@openmarch/ui";
import clsx from "clsx";
import { useView3dSceneStore } from "../sceneStore";
import { QUALITY_MODES } from "../qualityPreference";
import { HOLD_STATES } from "../hornState";
import { GUARD_EQUIPMENT } from "@/view3d/core/instruments/catalog";
import type { GuardEquipment } from "../sceneStore";
import { Segmented } from "./Panel";
import { LightingControl, VenuePicker, useVenueRequest } from "./VenueControls";

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
                    {hasStands && <CrowdRows />}
                    {kitId !== "gym" && <EndZoneRow />}
                </Section>
                <Section
                    title={t("view3d.settings.graphicsSection")}
                    hint={t("view3d.settings.graphicsHint")}
                >
                    <QualityRow />
                    <PowerRows />
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
    children,
}: {
    title: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-8">
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

function QualityRow() {
    const { t } = useTranslate();
    const mode = useView3dSceneStore((s) => s.qualityMode);
    const setMode = useView3dSceneStore((s) => s.setQualityMode);
    const autoLowered = useView3dSceneStore((s) => s.autoLowered);
    const hint =
        mode === "auto" && autoLowered
            ? t("view3d.settings.qualityAutoLowered")
            : t(`view3d.settings.qualityHint.${mode}`);
    return (
        <Row label={t("view3d.settings.quality")} stacked>
            <Segmented
                value={mode}
                options={QUALITY_MODES.map((value) => ({
                    value,
                    label: t(`view3d.settings.qualityMode.${value}`),
                }))}
                onChange={setMode}
                label={t("view3d.settings.quality")}
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

/** Battery savers: stop drawing when nothing moves, and cap the frame rate on battery. */
function PowerRows() {
    const { t } = useTranslate();
    const prefs = useView3dSceneStore((s) => s.powerPrefs);
    const setPrefs = useView3dSceneStore((s) => s.setPowerPrefs);
    return (
        <>
            <Row label={t("view3d.settings.pauseWhenIdle")}>
                <Switch
                    checked={prefs.pauseWhenIdle}
                    onCheckedChange={(pauseWhenIdle) =>
                        setPrefs({ ...prefs, pauseWhenIdle })
                    }
                    aria-label={t("view3d.settings.pauseWhenIdle")}
                    data-testid="view3d-pause-when-idle"
                />
            </Row>
            <Row label={t("view3d.settings.saveOnBattery")}>
                <Switch
                    checked={prefs.saveOnBattery}
                    onCheckedChange={(saveOnBattery) =>
                        setPrefs({ ...prefs, saveOnBattery })
                    }
                    aria-label={t("view3d.settings.saveOnBattery")}
                    data-testid="view3d-save-on-battery"
                />
            </Row>
        </>
    );
}

/** Which hold the brass plays: a test control until per-page horn states exist. */
function HornStateRow() {
    const { t } = useTranslate();
    const state = useView3dSceneStore((s) => s.hornState);
    const setState = useView3dSceneStore((s) => s.setHornState);
    return (
        <Row label={t("view3d.settings.hornState")} stacked>
            <Segmented
                value={state}
                options={HOLD_STATES.map((value) => ({
                    value,
                    label: t(`view3d.settings.hornStateMode.${value}`),
                }))}
                onChange={setState}
                label={t("view3d.settings.hornState")}
                testId="view3d-horn-state-picker"
            />
            <p className="text-sub text-text/60">
                {t("view3d.settings.hornStateHint")}
            </p>
        </Row>
    );
}

const GUARD_CHOICES: readonly GuardEquipment[] = [
    "section",
    ...GUARD_EQUIPMENT,
];

/** What the guard carries: each section's own, or one piece for all, to see the others. */
function GuardEquipmentRow() {
    const { t } = useTranslate();
    const equipment = useView3dSceneStore((s) => s.guardEquipment);
    const setEquipment = useView3dSceneStore((s) => s.setGuardEquipment);
    return (
        <Row label={t("view3d.settings.guardEquipment")} stacked>
            <Segmented
                value={equipment}
                options={GUARD_CHOICES.map((value) => ({
                    value,
                    label: t(`view3d.settings.guardEquipmentMode.${value}`),
                }))}
                onChange={setEquipment}
                label={t("view3d.settings.guardEquipment")}
                testId="view3d-guard-equipment-picker"
                className="grid! grid-cols-3 [&>*]:justify-start"
            />
            <p className="text-sub text-text/60">
                {t("view3d.settings.guardEquipmentHint")}
            </p>
        </Row>
    );
}

/**
 * Which foot the band steps off on, always the performer's own: a window
 * setting until the show stores it.
 */
function StepOffFootRow() {
    const { t } = useTranslate();
    const foot = useView3dSceneStore((s) => s.stepOffFoot);
    const setFoot = useView3dSceneStore((s) => s.setStepOffFoot);
    return (
        <Row label={t("view3d.settings.stepOffFoot")} stacked>
            <Segmented
                value={foot}
                options={(["left", "right"] as const).map((value) => ({
                    value,
                    label: t(`view3d.settings.stepOffFootMode.${value}`),
                }))}
                onChange={setFoot}
                label={t("view3d.settings.stepOffFoot")}
                testId="view3d-step-off-foot-picker"
            />
            <p className="text-sub text-text/60">
                {t("view3d.settings.stepOffFootHint")}
            </p>
        </Row>
    );
}

/**
 * The window's keyboard and mouse controls (ui.md UI-3, UI-4), in display
 * order. Each has `view3d.keys.<name>` for what it does and
 * `view3d.keyNames.<name>` for the key or gesture.
 */
const SHORTCUTS = [
    "playPause",
    "previousNext",
    "firstLast",
    "cameras",
    "fullscreen",
    "crowd",
    "escape",
    "orbit",
    "pan",
    "zoom",
] as const;

function ShortcutList() {
    const { t } = useTranslate();
    return (
        <dl className="text-sub grid grid-cols-[auto_1fr] items-baseline gap-x-12 gap-y-4">
            {SHORTCUTS.map((name) => (
                <div key={name} className="contents">
                    <dt>
                        <kbd className="border-stroke rounded-4 text-text/80 border px-4 font-mono whitespace-nowrap">
                            {t(`view3d.keyNames.${name}`)}
                        </kbd>
                    </dt>
                    <dd className="text-text/80">{t(`view3d.keys.${name}`)}</dd>
                </div>
            ))}
        </dl>
    );
}
