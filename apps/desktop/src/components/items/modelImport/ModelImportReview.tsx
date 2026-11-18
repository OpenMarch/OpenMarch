import { useEffect, useId, useState } from "react";
import {
    ArrowClockwiseIcon,
    CaretRightIcon,
    InfoIcon,
    ProhibitIcon,
    SpinnerGapIcon,
    WarningIcon,
    WrenchIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import {
    Button,
    Checkbox,
    Input,
    SegmentedTextSwitch,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
} from "@openmarch/ui";
import ItemPanelHeader from "@/components/items/ItemPanelHeader";
import AxisPreview, { AXIS_COLORS, type Axis } from "./AxisPreview";
import DetailChoice from "./DetailChoice";
import {
    sameTilt,
    tipped,
    UPRIGHT,
} from "@/showAssets/modelImport/orientation";
import { useModelImportSession } from "@/showAssets/modelImport/review/modelImportSession";
import {
    canRetry,
    fixText,
    noteText,
    refusalText,
    type ReportLine,
} from "@/showAssets/modelImport/review/reportText";
import type {
    Choice,
    ModelCredits,
    Turn,
    UnitFix,
} from "@/showAssets/modelImport/types";

const meters = (value: number) => String(Number(value.toFixed(2)));

/** The licenses offered (SPDX), most permissive first; empty means Unknown (props-spec §10) */
export const LICENSE_OPTIONS = [
    "CC0-1.0",
    "CC-BY-4.0",
    "CC-BY-SA-4.0",
    "CC-BY-NC-4.0",
    "CC-BY-ND-4.0",
    "CC-BY-NC-SA-4.0",
    "CC-BY-NC-ND-4.0",
    "LicenseRef-Proprietary",
] as const;
const UNKNOWN_LICENSE = "unknown";

const UNITS: UnitFix[] = ["none", "cm", "in", "ft"];

/** An object URL for bytes, revoked when they change or the screen closes */
export function useBytesUrl(
    bytes: Uint8Array | undefined,
    type: string,
): string | undefined {
    // Made in the effect, so React's mount, cleanup, mount in development makes a new one
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        if (!bytes) {
            setUrl(undefined);
            return;
        }
        const made = URL.createObjectURL(
            new Blob([bytes as Uint8Array<ArrayBuffer>], { type }),
        );
        setUrl(made);
        return () => URL.revokeObjectURL(made);
    }, [bytes, type]);
    return url;
}

const choiceOf = <C extends Choice["code"]>(
    choices: readonly Choice[],
    code: C,
) => choices.find((c): c is Extract<Choice, { code: C }> => c.code === code);

/**
 * The model import's one screen (fork #999, props-spec "The review"), in the Props panel: the
 * model's picture with Rotate X, Y and Z and an axis preview, its size to confirm with one-click unit fixes, then the
 * report grouped as Can't import, Needs your choice and Fixed for you, the name and the license
 * fields, and Add. Each choice runs the import again, so what shows is what Add stores. A refusal
 * shows here, never in an alert; Cancel leaves the show as it was.
 */
const focusVisible = (element: Element): boolean => {
    try {
        return element.matches(":focus-visible");
    } catch {
        return true;
    }
};

export default function ModelImportReview({
    onDone,
}: {
    /** Leaves the review: after Add with the stored model's `items.model` value, else null */
    onDone: (modelValue: string | null) => void;
}) {
    const { t } = useTranslate();
    const session = useModelImportSession();
    const { result, running, choices } = session;
    const report = result?.report;
    const model = result?.ok ? result.model : undefined;
    const needs = report?.needsChoice ?? [];
    const unitFix = choiceOf(needs, "unitFix");
    const tilt = choiceOf(needs, "tilt");
    const turn = choiceOf(needs, "turn");
    const appliedTurn = choices.turn ?? turn?.applied ?? 0;
    const appliedTilt = choices.tilt ?? tilt?.applied ?? UPRIGHT;
    const rotate = (axis: Axis) =>
        session.choose(
            axis === "y"
                ? { turn: ((appliedTurn + 90) % 360) as Turn }
                : { tilt: tipped(appliedTilt, appliedTurn, axis) },
        );
    // The axis the preview shows: pointed at or focused, or just tapped (touch has no hover)
    const [pointed, setPointed] = useState<Axis | null>(null);
    // Each tap is its own object, so tapping the same button again restarts the time
    const [tapped, setTapped] = useState<{ axis: Axis } | null>(null);
    useEffect(() => {
        if (!tapped) return;
        const timer = setTimeout(() => setTapped(null), 1200);
        return () => clearTimeout(timer);
    }, [tapped]);
    // A button disabled or removed under the pointer or focus gets no leave or blur
    useEffect(() => {
        if (running) setPointed(null);
    }, [running]);
    // Stood up from Z-up on its own: said in Needs your choice, with a way back
    const zUp = tilt?.zUpSuspected ? tilt : undefined;
    const detail = choiceOf(needs, "detail");
    const picture = useBytesUrl(model?.parts.thumbnail, "image/png");

    const cancel = () => {
        // A save under way can't be taken back
        if (session.saving) return;
        session.cancel();
        onDone(null);
    };
    const add = async () => {
        const value = await session.add();
        if (value) onDone(value);
    };

    return (
        <div
            className="animate-scale-in text-text flex h-full w-fit flex-col gap-16"
            data-testid="model-import-review"
        >
            <ItemPanelHeader
                title={<T keyName="props.import.title" />}
                onBack={session.saving ? undefined : cancel}
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto pr-4">
                {/* The picture, from the audience side, with Rotate X, Y and Z under it */}
                <section className="flex flex-col gap-8">
                    {(picture || running) && (
                        <div className="rounded-6 border-stroke relative flex aspect-[4/3] items-center justify-center overflow-hidden border bg-white">
                            {picture && (
                                <img
                                    src={picture}
                                    alt={t("props.import.pictureAlt")}
                                    draggable={false}
                                    className={clsx(
                                        "h-full w-full object-contain duration-150",
                                        running && "opacity-50",
                                    )}
                                    data-testid="model-import-picture"
                                />
                            )}
                            {running && (
                                <SpinnerGapIcon
                                    size={32}
                                    className="text-text-subtitle absolute animate-spin"
                                    role="img"
                                    aria-label={t("props.import.working")}
                                />
                            )}
                            {picture && turn && (
                                <AxisPreview
                                    active={pointed ?? tapped?.axis ?? null}
                                />
                            )}
                        </div>
                    )}
                    {turn && model && (
                        <div className="flex flex-col gap-8">
                            <span className="text-sub text-text-subtitle">
                                <T keyName="props.import.orient.detail" />
                            </span>
                            <div className="flex flex-wrap gap-8">
                                {(["x", "y", "z"] as Axis[]).map((axis) => (
                                    <Button
                                        key={axis}
                                        size="compact"
                                        variant="secondary"
                                        disabled={running}
                                        data-testid={`model-import-rotate-${axis}`}
                                        onPointerEnter={() => setPointed(axis)}
                                        onPointerLeave={() => setPointed(null)}
                                        onFocus={(event) => {
                                            // Keyboard focus only: a tap's focus comes after its
                                            // pointer left, and the tap shows on its own
                                            if (
                                                focusVisible(
                                                    event.currentTarget,
                                                )
                                            )
                                                setPointed(axis);
                                        }}
                                        onBlur={() => setPointed(null)}
                                        onClick={() => {
                                            setTapped({ axis });
                                            rotate(axis);
                                        }}
                                    >
                                        <ArrowClockwiseIcon
                                            size={16}
                                            color={AXIS_COLORS[axis]}
                                            weight="bold"
                                        />
                                        <T
                                            keyName="props.import.rotateAxis"
                                            params={{
                                                axis: axis.toUpperCase(),
                                            }}
                                        />
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {model && (
                    <SizeConfirm
                        size={model.sidecar.sizeM}
                        unit={choices.unitFix ?? unitFix?.applied ?? "none"}
                        suggested={unitFix?.preselected}
                        disabled={running}
                        onUnit={(unit) => session.choose({ unitFix: unit })}
                    />
                )}

                {report && report.cantImport.length > 0 && (
                    <ReportGroup
                        tone="red"
                        icon={<ProhibitIcon size={16} />}
                        title={t("props.import.groups.cantImport")}
                        testId="model-import-cant"
                    >
                        {report.cantImport.map((refusal, i) => (
                            <Line key={i} {...refusalText(refusal, t)} />
                        ))}
                        {report.cantImport.some(canRetry) && (
                            <Button
                                size="compact"
                                variant="secondary"
                                className="self-start"
                                disabled={running}
                                onClick={session.retry}
                            >
                                <T keyName="props.import.tryAgain" />
                            </Button>
                        )}
                    </ReportGroup>
                )}

                {model && detail && (
                    <DetailChoice
                        row={detail}
                        model={model}
                        running={running}
                    />
                )}

                {model && zUp && (
                    <ReportGroup
                        tone="accent"
                        icon={<WarningIcon size={16} />}
                        title={t("props.import.groups.needsChoice")}
                        testId="model-import-choices"
                    >
                        {zUp && (
                            <ChoiceCheck
                                id="model-import-rotate"
                                checked={sameTilt(appliedTilt, zUp.preselected)}
                                disabled={running}
                                onChange={(on) =>
                                    session.choose({
                                        tilt: on ? zUp.preselected : UPRIGHT,
                                    })
                                }
                                title={t("props.import.rotate.title")}
                                detail={t("props.import.rotate.detail")}
                            />
                        )}
                    </ReportGroup>
                )}

                {report && report.fixedForYou.length > 0 && (
                    <ReportGroup
                        tone="green"
                        icon={<WrenchIcon size={16} />}
                        title={t("props.import.groups.fixed")}
                        count={report.fixedForYou.length}
                        collapsible
                        testId="model-import-fixed"
                    >
                        {report.fixedForYou.map((fix, i) => (
                            <Line key={i} {...fixText(fix, t)} muted />
                        ))}
                    </ReportGroup>
                )}

                {report && report.notes.length > 0 && (
                    <ReportGroup
                        tone="sub"
                        icon={<InfoIcon size={16} />}
                        title={t("props.import.groups.notes")}
                        testId="model-import-notes"
                    >
                        {report.notes.map((note, i) => (
                            <Line key={i} {...noteText(note, t)} muted />
                        ))}
                    </ReportGroup>
                )}

                {model && (
                    <label className="flex flex-col gap-4">
                        <span className="text-sub text-text-subtitle">
                            <T keyName="props.import.name" />
                        </span>
                        <Input
                            compact
                            value={session.name}
                            onChange={(e) => session.setName(e.target.value)}
                            data-testid="model-import-name"
                        />
                    </label>
                )}

                {model && (
                    <CreditFields
                        credits={session.credits}
                        onChange={session.setCredits}
                    />
                )}
            </div>

            <footer className="border-stroke flex flex-col gap-8 border-t pt-12">
                {session.saveError && (
                    <p
                        role="alert"
                        className="text-sub text-red flex items-center gap-8"
                    >
                        <T keyName="props.import.saveFailed" />
                    </p>
                )}
                <div className="flex justify-end gap-8">
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={cancel}
                        disabled={session.saving}
                        data-testid="model-import-cancel"
                    >
                        <T keyName="props.import.cancel" />
                    </Button>
                    <Button
                        size="compact"
                        variant="primary"
                        disabled={!model || running || session.saving}
                        onClick={() => void add()}
                        data-testid="model-import-add"
                    >
                        {session.saveError ? (
                            <T keyName="props.import.tryAgain" />
                        ) : (
                            <T keyName="props.import.add" />
                        )}
                    </Button>
                </div>
            </footer>
        </div>
    );
}

/**
 * The size to confirm: width × depth × height in meters, and the file's unit, one click each.
 * The import suggests a unit when the size is clearly off; it is never applied silently.
 */
function SizeConfirm({
    size,
    unit,
    suggested,
    disabled,
    onUnit,
}: {
    size: { width: number; height: number; depth: number };
    unit: UnitFix;
    suggested: UnitFix | undefined;
    disabled: boolean;
    onUnit: (unit: UnitFix) => void;
}) {
    const { t } = useTranslate();
    return (
        <section
            className="flex flex-col gap-8"
            aria-label={t("props.import.size.title")}
        >
            <div className="flex flex-col gap-2">
                <span
                    className="text-body font-medium tabular-nums"
                    data-testid="model-import-size"
                >
                    {t("props.import.size.value", {
                        width: meters(size.width),
                        depth: meters(size.depth),
                        height: meters(size.height),
                    })}
                </span>
                <span className="text-sub text-text-subtitle">
                    {suggested && suggested !== "none"
                        ? t("props.import.size.suggested", {
                              unit: t(`props.import.units.${suggested}`),
                          })
                        : t("props.import.size.question")}
                </span>
            </div>
            <div className="flex items-center gap-8">
                <span className="text-sub text-text-subtitle shrink-0">
                    <T keyName="props.import.units.label" />
                </span>
                <SegmentedTextSwitch
                    ariaLabel={t("props.import.units.label")}
                    selected={unit}
                    setSelected={(value) => {
                        if (!disabled && value !== unit)
                            onUnit(value as UnitFix);
                    }}
                    options={UNITS.map((option) => ({
                        value: option,
                        label: t(`props.import.units.${option}`),
                        disabled,
                        testId: `model-import-unit-${option}`,
                    }))}
                />
            </div>
        </section>
    );
}

/**
 * The optional license fields, collapsed, prefilled from the file (props-spec §10): license,
 * author, source and attribution. Empty means Unknown.
 */
export function CreditFields({
    credits,
    onChange,
    testIdPrefix = "model-import",
    startOpen = false,
}: {
    credits: ModelCredits;
    onChange: (credits: ModelCredits) => void;
    /** Starts each field's test id (the Assets view uses its own) */
    testIdPrefix?: string;
    /** Shows the fields at once (the Assets view opens a row onto them) */
    startOpen?: boolean;
}) {
    const { t } = useTranslate();
    const [open, setOpen] = useState(startOpen);
    const panelId = useId();
    const license = credits.license || UNKNOWN_LICENSE;
    const licenses: string[] = [...LICENSE_OPTIONS];
    if (credits.license && !licenses.includes(credits.license))
        licenses.push(credits.license);
    const licenseName = (value: string) =>
        value === UNKNOWN_LICENSE
            ? t("props.import.credits.unknown")
            : value === "LicenseRef-Proprietary"
              ? t("props.import.credits.proprietary")
              : value;
    const field = (key: "author" | "sourceUrl" | "attribution") => (
        <label className="flex flex-col gap-4">
            <span className="text-sub text-text-subtitle">
                {t(`props.import.credits.${key}`)}
            </span>
            <Input
                compact
                value={credits[key] ?? ""}
                onChange={(e) =>
                    onChange({ ...credits, [key]: e.target.value })
                }
                data-testid={`${testIdPrefix}-${key}`}
            />
        </label>
    );
    return (
        <section className="border-stroke flex flex-col gap-12 border-t pt-12">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen(!open)}
                className="text-body flex items-center gap-8 text-left font-medium"
                data-testid={`${testIdPrefix}-credits-toggle`}
            >
                <CaretRightIcon
                    size={14}
                    className={clsx("duration-150", open && "rotate-90")}
                />
                <T keyName="props.import.credits.title" />
                <span className="text-sub text-text-subtitle font-normal">
                    {licenseName(license)}
                </span>
            </button>
            {open && (
                <div id={panelId} className="flex flex-col gap-12">
                    <p className="text-sub text-text-subtitle">
                        <T keyName="props.import.credits.rights" />
                    </p>
                    <label className="flex flex-col gap-4">
                        <span className="text-sub text-text-subtitle">
                            <T keyName="props.import.credits.license" />
                        </span>
                        <Select
                            value={license}
                            onValueChange={(value) =>
                                onChange({
                                    ...credits,
                                    license:
                                        value === UNKNOWN_LICENSE
                                            ? undefined
                                            : value,
                                })
                            }
                        >
                            <SelectTriggerCompact
                                label={licenseName(license)}
                            />
                            <SelectContent>
                                {[UNKNOWN_LICENSE, ...licenses].map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {licenseName(value)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    {field("author")}
                    {field("sourceUrl")}
                    {field("attribution")}
                </div>
            )}
        </section>
    );
}

const TONES = {
    red: "text-red",
    accent: "text-accent",
    green: "text-green",
    sub: "text-text-subtitle",
} as const;

/** One of the report's groups: a heading with its icon, and its rows */
function ReportGroup({
    tone,
    icon,
    title,
    count,
    collapsible = false,
    testId,
    children,
}: {
    tone: keyof typeof TONES;
    icon: React.ReactNode;
    title: string;
    count?: number;
    /** Starts closed, with a count; opened by its heading */
    collapsible?: boolean;
    testId: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(!collapsible);
    const bodyId = useId();
    const heading = (
        <>
            <span className={TONES[tone]}>{icon}</span>
            <span className="font-medium">{title}</span>
            {count !== undefined && (
                <span className="text-text-subtitle">{count}</span>
            )}
        </>
    );
    return (
        <section className="flex flex-col gap-8" data-testid={testId}>
            {collapsible ? (
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setOpen(!open)}
                    className="text-body flex items-center gap-8 text-left"
                >
                    <CaretRightIcon
                        size={14}
                        className={clsx("duration-150", open && "rotate-90")}
                    />
                    {heading}
                </button>
            ) : (
                <h5 className="text-body flex items-center gap-8">{heading}</h5>
            )}
            {open && (
                <div id={bodyId} className="flex flex-col gap-8 pl-24">
                    {children}
                </div>
            )}
        </section>
    );
}

function Line({ title, detail, muted }: ReportLine & { muted?: boolean }) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <span
                className={clsx(
                    "text-body break-words",
                    muted && "text-text-subtitle",
                )}
            >
                {title}
            </span>
            {detail && (
                <span className="text-sub text-text-subtitle break-words">
                    {detail}
                </span>
            )}
        </div>
    );
}

function ChoiceCheck({
    id,
    checked,
    disabled,
    onChange,
    title,
    detail,
}: {
    id: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
    title: string;
    detail?: string;
}) {
    return (
        <div className="flex items-start gap-8">
            <Checkbox
                id={id}
                data-testid={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => onChange(value === true)}
            />
            <label htmlFor={id} className="min-w-0 cursor-pointer">
                <Line title={title} detail={detail} />
            </label>
        </div>
    );
}
