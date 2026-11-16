import { useEffect, useId, useMemo, useState } from "react";
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
    const url = useMemo(
        () =>
            bytes
                ? URL.createObjectURL(
                      new Blob([bytes as Uint8Array<ArrayBuffer>], { type }),
                  )
                : undefined,
        [bytes, type],
    );
    useEffect(
        () => () => {
            if (url) URL.revokeObjectURL(url);
        },
        [url],
    );
    return url;
}

const choiceOf = <C extends Choice["code"]>(
    choices: readonly Choice[],
    code: C,
) => choices.find((c): c is Extract<Choice, { code: C }> => c.code === code);

/**
 * The model import's one screen (fork #999, props-spec "The review"), in the Props panel: the
 * model's picture with a one-click turn, its size to confirm with one-click unit fixes, then the
 * report grouped as Can't import, Needs your choice and Fixed for you, the name and the license
 * fields, and Add. Each choice runs the import again, so what shows is what Add stores. A refusal
 * shows here, never in an alert; Cancel leaves the show as it was.
 */
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
    const rotate = choiceOf(needs, "rotateToYUp");
    const turn = choiceOf(needs, "turn");
    const simplify = choiceOf(needs, "simplify");
    const simplified = simplify?.applied ? simplify : undefined;
    const [showBefore, setShowBefore] = useState(false);
    const before = session.before;
    const pictureBytes =
        showBefore && before?.status === "ready"
            ? before.thumbnail
            : model?.parts.thumbnail;
    const picture = useBytesUrl(pictureBytes, "image/png");

    const cancel = () => {
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
                onBack={cancel}
            />
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto pr-4">
                {/* The picture, from the audience side, with the turn beside it */}
                <section className="flex flex-col gap-8">
                    {simplified && (
                        <SegmentedTextSwitch
                            ariaLabel={t("props.import.simplify.compare")}
                            selected={showBefore ? "before" : "after"}
                            setSelected={(value) => {
                                const wantsBefore = value === "before";
                                if (wantsBefore) session.loadBefore();
                                setShowBefore(wantsBefore);
                            }}
                            options={[
                                {
                                    value: "before",
                                    label: t("props.import.simplify.before", {
                                        triangles:
                                            simplified.triangles.toLocaleString(),
                                    }),
                                    testId: "model-import-before",
                                },
                                {
                                    value: "after",
                                    label: t("props.import.simplify.after", {
                                        triangles: (
                                            simplified.simplifiedTriangles ??
                                            simplified.triangles
                                        ).toLocaleString(),
                                    }),
                                    testId: "model-import-after",
                                },
                            ]}
                        />
                    )}
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
                            {(running ||
                                (showBefore &&
                                    before?.status === "loading")) && (
                                <SpinnerGapIcon
                                    size={32}
                                    className="text-text-subtitle absolute animate-spin"
                                    role="img"
                                    aria-label={t("props.import.working")}
                                />
                            )}
                            {showBefore && before?.status === "failed" && (
                                <span className="text-sub text-text-subtitle absolute bottom-8 px-16 text-center">
                                    <T keyName="props.import.simplify.beforeFailed" />
                                </span>
                            )}
                        </div>
                    )}
                    {turn && model && (
                        <div className="flex items-center justify-between gap-8">
                            <span className="text-sub text-text-subtitle">
                                <T keyName="props.import.turn.detail" />
                            </span>
                            <Button
                                size="compact"
                                variant="secondary"
                                disabled={running}
                                data-testid="model-import-turn"
                                onClick={() =>
                                    session.choose({
                                        turn: (((choices.turn ?? turn.applied) +
                                            90) %
                                            360) as Turn,
                                    })
                                }
                            >
                                <ArrowClockwiseIcon size={16} />
                                <T keyName="props.import.turn.button" />
                            </Button>
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

                {model && (rotate || simplify) && (
                    <ReportGroup
                        tone="accent"
                        icon={<WarningIcon size={16} />}
                        title={t("props.import.groups.needsChoice")}
                        testId="model-import-choices"
                    >
                        {rotate && (
                            <ChoiceCheck
                                id="model-import-rotate"
                                checked={choices.rotateToYUp ?? rotate.applied}
                                disabled={running}
                                onChange={(on) =>
                                    session.choose({ rotateToYUp: on })
                                }
                                title={t("props.import.rotate.title")}
                                detail={t("props.import.rotate.detail")}
                            />
                        )}
                        {simplify && (
                            <ChoiceCheck
                                id="model-import-simplify"
                                checked={choices.simplify ?? simplify.applied}
                                disabled={running}
                                onChange={(on) => {
                                    if (!on) setShowBefore(false);
                                    session.choose({ simplify: on });
                                }}
                                title={t("props.import.simplify.title", {
                                    cap: simplify.cap.toLocaleString(),
                                })}
                                detail={t("props.import.simplify.detail", {
                                    triangles:
                                        simplify.triangles.toLocaleString(),
                                })}
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
function CreditFields({
    credits,
    onChange,
}: {
    credits: ModelCredits;
    onChange: (credits: ModelCredits) => void;
}) {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
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
                data-testid={`model-import-${key}`}
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
                data-testid="model-import-credits-toggle"
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
