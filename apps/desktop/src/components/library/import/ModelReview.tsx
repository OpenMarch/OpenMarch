/**
 * The model half of the import panel (package C1.10): the kind picker and
 * the report, grouped as Can't import, Needs your choice (pre-selected),
 * Fixed for you (collapsed) and Notes (props-spec.md §2 "The review").
 */
import { Button, Checkbox } from "@openmarch/ui";
import {
    BookOpenIcon,
    CheckCircleIcon,
    CrosshairIcon,
    InfoIcon,
    ProhibitIcon,
    WarningIcon,
    WrenchIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { formatLength } from "@/view3d/core/sizes/units";
import {
    MODEL_KIND_VALUES,
    type ModelImportReport,
} from "@/view3d/library/protocol";
import {
    asksArtworkSurface,
    pickedSurface,
    slotSizeFor,
    type ImportReviewActions,
    type ModelReview as ModelState,
} from "./importReview";
import { Chip, ReportGroup, Row } from "./parts";
import {
    fixText,
    kindName,
    noteText,
    rejectionText,
    UNIT_FACTORS,
    type Translate,
} from "./reportText";

type ChoiceRow = ModelImportReport["needsChoice"][number];
type Actions = Pick<
    ImportReviewActions,
    | "setKind"
    | "setChoices"
    | "startGripPick"
    | "cancelGripPick"
    | "setShowBefore"
    | "setArtworkSurface"
    | "hoverMaterial"
>;

export function KindPicker({
    model,
    contextKind,
    actions,
    disabled = false,
}: {
    model: ModelState;
    contextKind: string | undefined;
    /** Outside review (a commit running), nothing can change. */
    disabled?: boolean;
    actions: Actions;
}) {
    const { t } = useTranslate();
    const report = model.inspection?.report;
    const kindRow = report?.needsChoice.find((r) => r.code === "kind");
    const current = model.kind ?? report?.kind ?? null;
    const source = model.kind
        ? null
        : contextKind
          ? "picker"
          : report?.kindSource === "stamp"
            ? "stamp"
            : null;
    return (
        <div className="flex flex-col gap-6" data-testid="import-kind">
            <Row
                title={t("library.import.kind.title")}
                detail={
                    source
                        ? t(`library.import.kind.from.${source}`)
                        : t("library.import.kind.hint")
                }
            />
            <div className="flex flex-wrap gap-4" role="group">
                {MODEL_KIND_VALUES.map((kind) => (
                    <Chip
                        key={kind}
                        on={current === kind}
                        disabled={model.inspecting || disabled}
                        testId={`import-kind-${kind}`}
                        onClick={() => {
                            if (current !== kind || kindRow)
                                actions.setKind(kind);
                        }}
                    >
                        {kindName(kind, t)}
                    </Chip>
                ))}
            </div>
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
            <div className="size-[21px] shrink-0 origin-top-left scale-75">
                <Checkbox
                    id={id}
                    data-testid={id}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => onChange(v === true)}
                />
            </div>
            <label htmlFor={id} className="min-w-0 cursor-pointer">
                <Row title={title} detail={detail} />
            </label>
        </div>
    );
}

function Choice({
    row,
    model,
    actions,
    t,
    disabled,
}: {
    row: ChoiceRow;
    model: ModelState;
    actions: Actions;
    t: Translate;
    disabled: boolean;
}) {
    const k = (key: string, params?: Record<string, string | number>) =>
        t(`library.import.choices.${key}`, params);
    const busy = model.inspecting || disabled;
    const kind = model.inspection?.report.kind ?? null;
    switch (row.code) {
        case "kind":
            return null; // the kind picker above asks it
        case "unitConversion": {
            const applied = model.choices.unitConversion ?? row.applied;
            const unit =
                row.preselected === "none" ? row.options[0] : row.preselected;
            const largest = row.largestM;
            return (
                <div className="flex flex-col gap-6">
                    <Row
                        title={k("units.title")}
                        detail={k("units.detail", {
                            largest: largest.toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                            }),
                        })}
                    />
                    <div className="flex flex-wrap gap-4" role="group">
                        {(
                            [
                                "none",
                                ...row.options.filter((o) => o !== "none"),
                            ] as const
                        ).map((option) => (
                            <Chip
                                key={option}
                                on={applied === option}
                                disabled={busy}
                                testId={`import-units-${option}`}
                                onClick={() =>
                                    actions.setChoices({
                                        unitConversion: option,
                                    })
                                }
                            >
                                {option === "none"
                                    ? k("units.none")
                                    : k(`units.${option}`, {
                                          factor: UNIT_FACTORS[option],
                                      })}
                                {option === unit && option !== "none"
                                    ? ` · ${k("suggested")}`
                                    : ""}
                            </Chip>
                        ))}
                    </div>
                </div>
            );
        }
        case "rotateToYUp":
            return (
                <ChoiceCheck
                    id="import-choice-rotate"
                    checked={model.choices.rotateToYUp ?? row.applied}
                    disabled={busy}
                    onChange={(v) => actions.setChoices({ rotateToYUp: v })}
                    title={k("rotate.title")}
                    detail={k("rotate.detail")}
                />
            );
        case "simplify": {
            const on = model.choices.simplify ?? row.applied;
            return (
                <div className="flex flex-col gap-6">
                    <ChoiceCheck
                        id="import-choice-simplify"
                        checked={on}
                        disabled={busy}
                        onChange={(v) => actions.setChoices({ simplify: v })}
                        title={k("simplify.title", {
                            cap: row.cap.toLocaleString("en-US"),
                        })}
                        detail={k("simplify.detail", {
                            triangles: row.triangles.toLocaleString("en-US"),
                            cap: row.cap.toLocaleString("en-US"),
                            kind: kind ? kindName(kind, t) : "",
                        })}
                    />
                    {on && row.simplifiedTriangles !== null && (
                        <div className="ml-28 flex flex-wrap items-center gap-4">
                            <Chip
                                on={model.showBefore}
                                disabled={busy || model.loadingBefore}
                                testId="import-before"
                                onClick={() => actions.setShowBefore(true)}
                            >
                                {k("before", {
                                    triangles:
                                        row.triangles.toLocaleString("en-US"),
                                })}
                            </Chip>
                            <Chip
                                on={!model.showBefore}
                                disabled={busy}
                                testId="import-after"
                                onClick={() => actions.setShowBefore(false)}
                            >
                                {k("after", {
                                    triangles:
                                        row.simplifiedTriangles.toLocaleString(
                                            "en-US",
                                        ),
                                })}
                            </Chip>
                        </div>
                    )}
                </div>
            );
        }
        case "missingGrip": {
            const on =
                model.choices.grip === undefined
                    ? row.applied !== null
                    : model.choices.grip !== null;
            const manual = model.choices.grip != null;
            return (
                <div className="flex flex-col gap-6">
                    <ChoiceCheck
                        id="import-choice-grip"
                        checked={on}
                        disabled={busy}
                        onChange={(v) =>
                            actions.setChoices({
                                grip: v ? row.preselected : null,
                            })
                        }
                        title={k("grip.title")}
                        detail={
                            manual
                                ? k("grip.manual")
                                : row.misnamed.length
                                  ? k("grip.misnamed", {
                                        names: row.misnamed.join(", "),
                                    })
                                  : k("grip.detail")
                        }
                    />
                    {on && (
                        <div className="ml-28 flex items-center gap-8">
                            <Button
                                size="compact"
                                variant="secondary"
                                disabled={busy || !model.glbUrl}
                                data-testid="import-grip-pick"
                                aria-pressed={model.pickingGrip}
                                onClick={() =>
                                    model.pickingGrip
                                        ? actions.cancelGripPick()
                                        : actions.startGripPick()
                                }
                            >
                                <CrosshairIcon size={14} />
                                {model.pickingGrip
                                    ? k("grip.picking")
                                    : k("grip.pick")}
                            </Button>
                        </div>
                    )}
                </div>
            );
        }
    }
}

function SurfaceOption({
    on,
    disabled,
    title,
    detail,
    testId,
    onPick,
    onHover,
}: {
    on: boolean;
    disabled: boolean;
    title: string;
    detail?: string;
    testId: string;
    onPick: () => void;
    onHover: (hovered: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            data-testid={testId}
            onClick={onPick}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            onFocus={() => onHover(true)}
            onBlur={() => onHover(false)}
            className={clsx(
                "rounded-6 focus-visible:border-accent flex items-center gap-8 border px-8 py-4 text-left outline-hidden duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
                on
                    ? "border-accent bg-accent/15"
                    : "border-stroke bg-fg-2 enabled:hover:border-text-subtitle",
            )}
        >
            <span
                aria-hidden
                className={clsx(
                    "size-10 shrink-0 rounded-full border",
                    on ? "border-accent bg-accent" : "border-text-subtitle",
                )}
            />
            <Row title={title} detail={detail} muted={!on} />
        </button>
    );
}

/**
 * Which surface takes artwork, when the file marks none (Q67): the source
 * materials, each with the size of what it's drawn on. Hovering one lights
 * it in the preview; picking one writes `choices.slots`.
 */
function ArtworkSurfaceChoice({
    model,
    actions,
    t,
    disabled,
}: {
    model: ModelState;
    actions: Actions;
    t: Translate;
    disabled: boolean;
}) {
    const k = (key: string, params?: Record<string, string | number>) =>
        t(`library.import.choices.surface.${key}`, params);
    const report = model.inspection!.report;
    const picked = pickedSurface(model);
    const busy = model.inspecting || disabled;
    const hover = (index: number | null) => (hovered: boolean) =>
        actions.hoverMaterial(hovered ? index : null);
    return (
        <div className="flex flex-col gap-6" data-testid="import-surface">
            <Row title={k("title")} detail={k("detail")} />
            <div
                className="flex flex-col gap-4"
                role="radiogroup"
                aria-label={k("title")}
            >
                <SurfaceOption
                    on={picked === null}
                    disabled={busy}
                    title={k("none")}
                    testId="import-surface-none"
                    onPick={() => actions.setArtworkSurface(null)}
                    onHover={hover(null)}
                />
                {report.materials.map((m) => {
                    const size = slotSizeFor(m);
                    if (!size) return null;
                    const dims = k("size", {
                        width: formatLength(size.widthM, "metric"),
                        height: formatLength(size.heightM, "metric"),
                    });
                    return (
                        <SurfaceOption
                            key={m.index}
                            on={picked === m.index}
                            disabled={busy}
                            title={
                                m.name ?? k("unnamed", { index: m.index + 1 })
                            }
                            detail={m.hasUVs ? dims : `${dims} · ${k("noUVs")}`}
                            testId={`import-surface-${m.index}`}
                            onPick={() => actions.setArtworkSurface(m.index)}
                            onHover={hover(m.index)}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export function ModelReportView({
    model,
    actions,
    disabled = false,
}: {
    model: ModelState;
    actions: Actions;
    /** Outside review (a commit running), nothing can change. */
    disabled?: boolean;
}) {
    const { t } = useTranslate();
    const report = model.inspection?.report;
    if (!report) return null;
    const choices = report.needsChoice.filter((r) => r.code !== "kind");
    const asksSurface = asksArtworkSurface(report);
    const clean =
        report.status === "ready" &&
        report.cantImport.length === 0 &&
        choices.length === 0 &&
        !asksSurface &&
        report.notes.length === 0;
    return (
        <div className="flex flex-col gap-12" data-testid="import-report">
            <ReportGroup
                icon={<ProhibitIcon size={16} />}
                tone="red"
                title={t("library.import.groups.cantImport")}
                count={report.cantImport.length}
                testId="import-group-cant"
            >
                {report.cantImport.map((row, i) => (
                    <Row key={i} {...rejectionText(row, t, report.kind)} />
                ))}
                <p className="text-sub text-text-subtitle flex items-start gap-4">
                    <BookOpenIcon size={14} className="mt-2 shrink-0" />
                    <T keyName="library.import.starterKit" />
                </p>
            </ReportGroup>
            <ReportGroup
                icon={<WarningIcon size={16} />}
                tone="accent"
                title={t("library.import.groups.needsChoice")}
                count={choices.length + (asksSurface ? 1 : 0)}
                testId="import-group-choices"
            >
                {choices.map((row) => (
                    <Choice
                        key={row.code}
                        row={row}
                        model={model}
                        actions={actions}
                        t={t}
                        disabled={disabled}
                    />
                ))}
                {asksSurface && (
                    <ArtworkSurfaceChoice
                        model={model}
                        actions={actions}
                        t={t}
                        disabled={disabled}
                    />
                )}
            </ReportGroup>
            <ReportGroup
                icon={<WrenchIcon size={16} />}
                tone="green"
                title={t("library.import.groups.fixed")}
                count={report.fixedForYou.length}
                defaultOpen={false}
                testId="import-group-fixed"
            >
                {report.fixedForYou.map((row, i) => (
                    <Row key={i} {...fixText(row, t)} muted />
                ))}
            </ReportGroup>
            <ReportGroup
                icon={<InfoIcon size={16} />}
                tone="sub"
                title={t("library.import.groups.notes")}
                count={report.notes.length}
                testId="import-group-notes"
            >
                {report.notes.map((row, i) => (
                    <Row key={i} {...noteText(row, t)} muted />
                ))}
            </ReportGroup>
            {clean && (
                <p className="text-body text-green flex items-center gap-6">
                    <CheckCircleIcon size={16} />
                    <T keyName="library.import.clean" />
                </p>
            )}
        </div>
    );
}
