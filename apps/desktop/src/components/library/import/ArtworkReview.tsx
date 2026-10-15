/**
 * The artwork half of the import panel (package C1.10): one size question
 * per distinct aspect, with its pages beside it (Q62), template chips,
 * "From file", locked-aspect ft/in fields and the surface it prints on
 * (props-spec.md §2 "Artwork images", §3 "Fit"). There is no DPI or
 * print-readiness line (owner decision Q75, 2026-10-12).
 */
import { useEffect, useState } from "react";
import clsx from "clsx";
import { UnitInput } from "@openmarch/ui";
import { InfoIcon, LockSimpleIcon, ProhibitIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import {
    ARTWORK_SURFACES,
    fromMeters,
    toMeters,
    type Length,
} from "@/view3d/core/sizes";
import {
    selectedMembers,
    type ArtworkReview as ArtworkState,
    type GroupSize,
    type ImportReviewActions,
} from "./importReview";
import { Chip, Label, ReportGroup, Row, sizeText } from "./parts";

type Actions = Pick<
    ImportReviewActions,
    | "togglePage"
    | "focusPage"
    | "loadArtworkPreview"
    | "setGroupSize"
    | "setGroupSurface"
>;

/** Splits meters into whole feet and inches (to ⅛ in). */
export function feetAndInches(m: number): { ft: number; in: number } {
    const eighths = Math.round(fromMeters(m, "in") * 8);
    const ft = Math.floor(eighths / 96);
    return { ft, in: (eighths - ft * 96) / 8 };
}

function LengthField({
    label,
    value,
    disabled,
    testId,
    onCommit,
}: {
    label: string;
    value: Length | null;
    disabled: boolean;
    testId: string;
    onCommit: (m: number) => void;
}) {
    const parts = value ? feetAndInches(value.m) : null;
    const [ft, setFt] = useState(parts ? String(parts.ft) : "");
    const [inch, setInch] = useState(parts ? String(parts.in) : "");
    useEffect(() => {
        setFt(parts ? String(parts.ft) : "");
        setInch(parts ? String(parts.in) : "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value?.m]);
    const commit = () => {
        const f = Number(ft || 0);
        const i = Number(inch || 0);
        if (!Number.isFinite(f) || !Number.isFinite(i) || f < 0 || i < 0)
            return;
        const m = toMeters(f * 12 + i, "in");
        if (m > 0 && Math.abs(m - (value?.m ?? 0)) > 1e-9) onCommit(m);
    };
    const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") commit();
    };
    return (
        <div className="flex flex-col gap-2">
            <Label>{label}</Label>
            <div className="flex gap-4">
                <UnitInput
                    compact
                    unit="ft"
                    min={0}
                    value={ft}
                    disabled={disabled}
                    aria-label={`${label} (ft)`}
                    data-testid={`${testId}-ft`}
                    containerClassName="w-[72px]"
                    onChange={(e) => setFt(e.target.value)}
                    onBlur={commit}
                    onKeyDown={keys}
                />
                <UnitInput
                    compact
                    unit="in"
                    min={0}
                    step={0.125}
                    value={inch}
                    disabled={disabled}
                    aria-label={`${label} (in)`}
                    data-testid={`${testId}-in`}
                    containerClassName="w-[72px]"
                    onChange={(e) => setInch(e.target.value)}
                    onBlur={commit}
                    onKeyDown={keys}
                />
            </div>
        </div>
    );
}

function PageThumb({
    artwork,
    fileId,
    page,
    label,
    actions,
}: {
    artwork: ArtworkState;
    fileId: string;
    page: number;
    label: string;
    actions: Actions;
}) {
    const { t } = useTranslate();
    const key = `${fileId}:${page}@256`;
    const url = artwork.previews[key];
    useEffect(() => {
        actions.loadArtworkPreview(fileId, page, 256);
    }, [actions, fileId, page]);
    const on = artwork.selected[fileId]?.includes(page) ?? false;
    const focused =
        artwork.focus?.fileId === fileId && artwork.focus.page === page;
    return (
        <div
            className={clsx(
                "rounded-6 relative flex w-[76px] flex-col items-center gap-4 border p-4",
                focused ? "border-accent" : "border-stroke",
                !on && "opacity-50",
            )}
        >
            <button
                type="button"
                onClick={() => actions.focusPage(fileId, page)}
                data-testid={`import-page-${page}`}
                aria-label={t("library.import.showPage", { label })}
                className="flex h-[64px] w-full items-center justify-center outline-hidden"
            >
                {url ? (
                    <img
                        src={url}
                        alt=""
                        className="rounded-4 max-h-[64px] max-w-full object-contain"
                    />
                ) : (
                    <span className="bg-fg-2 rounded-4 size-[48px]" />
                )}
            </button>
            <label className="text-sub text-text-subtitle flex w-full items-center justify-center gap-4 font-mono">
                <input
                    type="checkbox"
                    checked={on}
                    data-testid={`import-page-toggle-${page}`}
                    onChange={() => actions.togglePage(fileId, page)}
                    className="accent-[var(--color-accent)]"
                />
                <span className="truncate">{label}</span>
            </label>
        </div>
    );
}

function SizeStep({
    artwork,
    group,
    actions,
    disabled,
}: {
    artwork: ArtworkState;
    group: number;
    actions: Actions;
    disabled: boolean;
}) {
    const { t } = useTranslate();
    const g = artwork.inspection.aspectGroups[group];
    const state = artwork.groups[group];
    if (!g || !state) return null;
    const size = state.size;
    const set = (next: GroupSize) => actions.setGroupSize(group, next);
    const members = g.members.map((m) => {
        const file = artwork.inspection.files[m.file];
        const multiFile = artwork.inspection.files.length > 1;
        const pages =
            file.inspection.ok && file.inspection.pages.length > 1
                ? t("library.import.pageN", { n: m.page + 1 })
                : "";
        return {
            fileId: file.fileId,
            page: m.page,
            label:
                [multiFile ? file.inspection.filename : "", pages]
                    .filter(Boolean)
                    .join(" · ") || file.inspection.filename,
        };
    });
    const selected = selectedMembers(artwork, group).length;
    // Pages sit beside their size question whenever there is a choice of
    // pages to make (Q62): several files, or a file with several pages.
    const showPages =
        artwork.inspection.files.length > 1 ||
        artwork.inspection.files.some(
            (f) => f.inspection.ok && f.inspection.pages.length > 1,
        );
    const ratio =
        g.aspect >= 1
            ? `${g.aspect.toFixed(2)} : 1`
            : `1 : ${(1 / g.aspect).toFixed(2)}`;
    return (
        <section
            className="flex flex-col gap-8"
            data-testid={`import-size-${group}`}
        >
            <p className="text-body text-text">
                <T keyName="library.import.size.title" />{" "}
                <span className="text-text-subtitle">
                    ·{" "}
                    {t("library.import.size.members", {
                        selected,
                        count: members.length,
                    })}{" "}
                    · {ratio}
                </span>
            </p>
            {showPages ? (
                <div className="flex flex-wrap gap-6">
                    {members.map((m) => (
                        <PageThumb
                            key={`${m.fileId}:${m.page}`}
                            artwork={artwork}
                            fileId={m.fileId}
                            page={m.page}
                            label={m.label}
                            actions={actions}
                        />
                    ))}
                </div>
            ) : null}
            <div className="flex flex-wrap gap-4" role="group">
                {g.fileSize && (
                    <Chip
                        on={size?.source === "file"}
                        disabled={disabled}
                        testId={`import-size-${group}-file`}
                        onClick={() =>
                            set({
                                width: g.fileSize!.width,
                                height: g.fileSize!.height,
                                source: "file",
                                templateId: null,
                            })
                        }
                    >
                        {t("library.import.size.fromFile", {
                            size: sizeText(g.fileSize.width, g.fileSize.height),
                        })}
                    </Chip>
                )}
                {g.chips.map((chip) => (
                    <Chip
                        key={chip.catalogId}
                        on={
                            size?.source !== "file" &&
                            size?.templateId === chip.catalogId
                        }
                        disabled={disabled}
                        testId={`import-size-${group}-chip-${chip.catalogId}`}
                        onClick={() =>
                            set({
                                width: chip.width,
                                height: chip.height,
                                source: "template",
                                templateId: chip.catalogId,
                            })
                        }
                    >
                        {chip.label}
                    </Chip>
                ))}
            </div>
            <div className="flex items-end gap-8">
                <LengthField
                    label={t("library.import.size.width")}
                    value={size?.width ?? null}
                    disabled={disabled}
                    testId={`import-size-${group}-width`}
                    onCommit={(m) =>
                        set({
                            width: { m },
                            height: { m: m / g.aspect },
                            source: "user",
                            templateId: null,
                        })
                    }
                />
                <span
                    className="text-text-subtitle pb-6"
                    title={t("library.import.size.locked")}
                >
                    <LockSimpleIcon size={16} />
                </span>
                <LengthField
                    label={t("library.import.size.height")}
                    value={size?.height ?? null}
                    disabled={disabled}
                    testId={`import-size-${group}-height`}
                    onCommit={(m) =>
                        set({
                            width: { m: m * g.aspect },
                            height: { m },
                            source: "user",
                            templateId: null,
                        })
                    }
                />
            </div>
            {!size && (
                <p className="text-sub text-accent">
                    <T keyName="library.import.size.needed" />
                </p>
            )}
            {size && state.standard && (
                <p
                    className="text-sub text-text-subtitle"
                    data-testid={`import-size-${group}-fitted`}
                >
                    {t("library.import.size.fitted", {
                        surface: t(`library.import.surfaces.${state.surface}`),
                        size: sizeText(
                            state.standard.width,
                            state.standard.height,
                        ),
                    })}
                </p>
            )}
            <div className="flex flex-col gap-4">
                <Label>
                    <T keyName="library.import.size.printsOn" />
                </Label>
                <div className="flex flex-wrap gap-4" role="group">
                    {ARTWORK_SURFACES.map((surface) => (
                        <Chip
                            key={surface}
                            on={state.surface === surface}
                            disabled={disabled}
                            testId={`import-size-${group}-surface-${surface}`}
                            onClick={() =>
                                actions.setGroupSurface(group, surface)
                            }
                        >
                            {t(`library.import.surfaces.${surface}`)}
                        </Chip>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function ArtworkReportView({
    artwork,
    actions,
    disabled,
}: {
    artwork: ArtworkState;
    actions: Actions;
    disabled: boolean;
}) {
    const { t } = useTranslate();
    const refused = artwork.inspection.files.filter((f) => !f.inspection.ok);
    // Size questions are answered by the size step; the rest are notes.
    const notes = artwork.inspection.files.flatMap((f) =>
        f.inspection.ok
            ? f.inspection.notes
                  .filter((n) => !n.code.startsWith("size"))
                  .map((n) => ({ filename: f.inspection.filename, note: n }))
            : [],
    );
    return (
        <div className="flex flex-col gap-12" data-testid="import-artwork">
            <ReportGroup
                icon={<ProhibitIcon size={16} />}
                tone="red"
                title={t("library.import.groups.cantImport")}
                count={refused.length}
                testId="import-group-cant"
            >
                {refused.map((f) => (
                    <Row
                        key={f.fileId}
                        title={f.inspection.filename}
                        detail={f.inspection.notes
                            .map((n) => n.message)
                            .join(" ")}
                    />
                ))}
            </ReportGroup>
            {artwork.inspection.aspectGroups.map((_, i) => (
                <div key={i} className="border-stroke border-t pt-12">
                    <SizeStep
                        artwork={artwork}
                        group={i}
                        actions={actions}
                        disabled={disabled}
                    />
                </div>
            ))}
            <ReportGroup
                icon={<InfoIcon size={16} />}
                tone="sub"
                title={t("library.import.groups.notes")}
                count={notes.length}
                testId="import-group-notes"
            >
                {notes.map(({ filename, note }, i) => (
                    <Row
                        key={i}
                        title={note.message}
                        detail={
                            artwork.inspection.files.length > 1
                                ? filename
                                : undefined
                        }
                        muted
                    />
                ))}
            </ReportGroup>
        </div>
    );
}
