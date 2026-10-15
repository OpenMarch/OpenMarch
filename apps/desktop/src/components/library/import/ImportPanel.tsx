/**
 * The import panel (package C1.10; props-spec.md §2 "The review", owner
 * decisions Q60–Q64): in Visuals mode the Library side panel becomes this
 * panel while an import is open, and the stage shows `ImportPreviewStage`.
 *
 * One screen, no stepper (Q61): the files, "New version of …" or Add as
 * new, the kind, the report (Can't import, Needs your choice pre-selected,
 * Fixed for you collapsed, Notes), the artwork size steps with their pages
 * (Q62), name and tags, then the collapsed author, license and source with
 * the rights line. Cancel and Add stay pinned at the bottom; Add reads "Add
 * new version" for a re-import and "Add N to Library" for batches (Q64).
 */
import { useState } from "react";
import { useStore } from "zustand";
import { Button, Input } from "@openmarch/ui";
import {
    ArrowLeftIcon,
    BooksIcon,
    CaretDownIcon,
    CaretRightIcon,
    CheckCircleIcon,
    FolderOpenIcon,
    PlusIcon,
    ProhibitIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import {
    addBlocker,
    addsNewVersion,
    primaryMatch,
    refusedFiles,
    selectedPageCount,
    type ImportReviewState,
    type ImportReviewStore,
} from "./importReview";
import { ArtworkReportView } from "./ArtworkReview";
import { KindPicker, ModelReportView } from "./ModelReview";
import {
    ErrorBlock,
    FileTypeIcon,
    formatBytes,
    Label,
    ProgressBlock,
    ReportGroup,
    Row,
} from "./parts";
import { kindName, type Translate } from "./reportText";

function FilesHeader({ state }: { state: ImportReviewState }) {
    const { t } = useTranslate();
    const files = state.session?.files ?? [];
    const context = state.session?.context ?? state.context;
    const contextLine = context?.kind
        ? t("library.import.fromPicker", { kind: kindName(context.kind, t) })
        : context?.surface
          ? t("library.import.fromSlot", {
                surface: t(`library.import.surfaces.${context.surface}`),
            })
          : null;
    if (files.length === 0) return null;
    if (files.length === 1) {
        const file = files[0];
        return (
            <div className="flex items-center gap-8" data-testid="import-file">
                <FileTypeIcon file={file} />
                <div className="min-w-0">
                    <p className="text-body truncate">{file.filename}</p>
                    <p className="text-sub text-text-subtitle">
                        {formatBytes(file.sizeBytes)}
                        {contextLine ? ` · ${contextLine}` : ""}
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-4" data-testid="import-file">
            <p className="text-body">
                {t("library.import.fileCount", { count: files.length })}
                {contextLine ? (
                    <span className="text-sub text-text-subtitle">
                        {" "}
                        · {contextLine}
                    </span>
                ) : null}
            </p>
            <ul className="text-sub text-text-subtitle flex flex-col gap-2">
                {files.map((f) => (
                    <li key={f.fileId} className="flex items-center gap-6">
                        <FileTypeIcon file={f} size={12} />
                        <span className="truncate">{f.filename}</span>
                        <span className="ml-auto font-mono">
                            {formatBytes(f.sizeBytes)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function MatchBlock({
    state,
    onChange,
}: {
    state: ImportReviewState;
    onChange: (mode: "update" | "new") => void;
}) {
    const { t } = useTranslate();
    const match = primaryMatch(state);
    if (!match) return null;
    const kit = match.reason === "kit-item-id";
    const update = match.builtIn
        ? t("library.import.match.copyOf", { name: match.name })
        : kit
          ? t("library.import.match.newVersionOf", { name: match.name })
          : t("library.import.match.update", { name: match.name });
    return (
        <div
            className="rounded-6 border-accent/40 bg-accent/5 flex flex-col gap-8 border p-10"
            data-testid="import-match"
        >
            <Row
                title={
                    kit
                        ? t("library.import.match.kitTitle", {
                              name: match.name,
                          })
                        : t("library.import.match.filenameTitle", {
                              name: match.name,
                          })
                }
                detail={
                    match.builtIn
                        ? t("library.import.match.builtInDetail")
                        : t("library.import.match.detail")
                }
            />
            <div className="flex flex-col gap-4" role="radiogroup">
                {(["update", "new"] as const).map((mode) => (
                    <label
                        key={mode}
                        className="text-body flex cursor-pointer items-center gap-8"
                    >
                        <input
                            type="radio"
                            name="import-match"
                            value={mode}
                            data-testid={`import-match-${mode}`}
                            checked={state.matchMode === mode}
                            onChange={() => onChange(mode)}
                            className="accent-[var(--color-accent)]"
                        />
                        {mode === "update"
                            ? update
                            : t("library.import.match.addNew")}
                    </label>
                ))}
            </div>
        </div>
    );
}

function DetailsFields({ store }: { store: ImportReviewStore }) {
    const { t } = useTranslate();
    const state = useStore(store);
    const [open, setOpen] = useState(false);
    const { meta } = state;
    const single =
        state.model !== null ||
        (state.artwork?.inspection.files.length ?? 0) === 1;
    const summary =
        [meta.author, meta.license].filter((s) => s.trim()).join(" · ") ||
        t("library.import.details.unknown");
    return (
        <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-4">
                {single ? (
                    <>
                        <Label>
                            <T keyName="library.import.details.name" />
                        </Label>
                        <Input
                            compact
                            value={meta.name}
                            maxLength={200}
                            data-testid="import-name"
                            aria-label={t("library.import.details.name")}
                            onChange={(e) =>
                                state.setMeta({ name: e.target.value })
                            }
                        />
                    </>
                ) : (
                    <p className="text-sub text-text-subtitle">
                        <T keyName="library.import.details.namesFromFiles" />
                    </p>
                )}
                <Input
                    compact
                    value={meta.tags}
                    data-testid="import-tags"
                    aria-label={t("library.import.details.tags")}
                    placeholder={t("library.import.details.tags")}
                    onChange={(e) => state.setMeta({ tags: e.target.value })}
                />
            </div>
            <div className="flex flex-col gap-8">
                <button
                    type="button"
                    aria-expanded={open}
                    data-testid="import-details-toggle"
                    className="flex items-center gap-6 text-left outline-hidden focus-visible:underline"
                    onClick={() => setOpen((o) => !o)}
                >
                    {open ? (
                        <CaretDownIcon size={14} />
                    ) : (
                        <CaretRightIcon size={14} />
                    )}
                    <span className="text-body text-text">
                        <T keyName="library.import.details.toggle" />
                    </span>
                    <span className="text-sub text-text-subtitle ml-auto truncate">
                        {summary}
                    </span>
                </button>
                {open && (
                    <div className="flex flex-col gap-8 pl-20">
                        <div className="flex flex-col gap-4">
                            <Label>
                                <T keyName="library.import.details.author" />
                            </Label>
                            <Input
                                compact
                                value={meta.author}
                                maxLength={200}
                                aria-label={t("library.import.details.author")}
                                placeholder={t("library.import.details.author")}
                                onChange={(e) =>
                                    state.setMeta({ author: e.target.value })
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-4">
                            <Label>
                                <T keyName="library.import.details.license" />
                            </Label>
                            <Input
                                compact
                                value={meta.license}
                                aria-label={t("library.import.details.license")}
                                placeholder={t(
                                    "library.import.details.licensePlaceholder",
                                )}
                                onChange={(e) =>
                                    state.setMeta({ license: e.target.value })
                                }
                            />
                        </div>
                        <div className="flex flex-col gap-4">
                            <Label>
                                <T keyName="library.import.details.source" />
                            </Label>
                            <Input
                                compact
                                value={meta.sourceUrl}
                                maxLength={2048}
                                aria-label={t("library.import.details.source")}
                                placeholder={t("library.import.details.source")}
                                onChange={(e) =>
                                    state.setMeta({ sourceUrl: e.target.value })
                                }
                            />
                        </div>
                        <p className="text-sub text-text-subtitle">
                            <T keyName="library.import.details.emptyIsUnknown" />
                        </p>
                    </div>
                )}
                <p className="text-sub text-text-subtitle">
                    <T keyName="library.import.details.rights" />
                </p>
            </div>
        </div>
    );
}

function addLabel(state: ImportReviewState, t: Translate) {
    if (state.model?.inspection?.report.status === "rejected") {
        return t("library.import.add.cantImport");
    }
    if (addsNewVersion(state)) return t("library.import.add.newVersion");
    const count = state.artwork ? selectedPageCount(state.artwork) : 1;
    return count > 1
        ? t("library.import.add.many", { count })
        : t("library.import.add.one");
}

function DoneView({ state }: { state: ImportReviewState }) {
    const { t } = useTranslate();
    const done = state.done!;
    return (
        <div className="flex flex-col gap-10" data-testid="import-done">
            <p className="text-body text-green flex items-center gap-6">
                <CheckCircleIcon size={18} />
                {done.newVersion
                    ? t("library.import.done.newVersion", {
                          name: done.names[0] ?? "",
                      })
                    : t("library.import.done.added", {
                          count: done.names.length,
                      })}
            </p>
            <ul className="text-body text-text-subtitle flex flex-col gap-2 pl-24">
                {done.names.map((name, i) => (
                    <li key={i} className="truncate">
                        {name}
                    </li>
                ))}
            </ul>
            <ReportGroup
                icon={<ProhibitIcon size={16} />}
                tone="red"
                title={t("library.import.done.notImported")}
                count={done.notImported.length}
            >
                {done.notImported.map((n, i) => (
                    <Row
                        key={i}
                        title={n.message}
                        detail={
                            n.page === null
                                ? n.filename
                                : `${n.filename} · ${t("library.import.pageN", { n: n.page + 1 })}`
                        }
                    />
                ))}
            </ReportGroup>
        </div>
    );
}

export default function ImportPanel({ store }: { store: ImportReviewStore }) {
    const { t } = useTranslate();
    const state = useStore(store);
    const { phase, model, artwork } = state;
    const blocker = addBlocker(state);
    const refused = refusedFiles(state);
    const working = phase === "committing" || phase === "inspecting";

    let body: React.ReactNode;
    if (phase === "picking") {
        body = (
            <p className="text-body text-text-subtitle flex items-center gap-8">
                <FolderOpenIcon size={16} />
                <T keyName="library.import.picking" />
            </p>
        );
    } else if (phase === "error" && state.error) {
        body = (
            <>
                <FilesHeader state={state} />
                <ErrorBlock
                    error={state.error}
                    files={state.session?.files ?? []}
                    onRetry={() => void state.retry()}
                />
            </>
        );
    } else if (phase === "done" && state.done) {
        body = <DoneView state={state} />;
    } else {
        body = (
            <>
                <FilesHeader state={state} />
                {(working || model?.inspecting) && (
                    <ProgressBlock
                        progress={state.progress}
                        committing={phase === "committing"}
                        onCancel={() => void state.cancelRunning()}
                    />
                )}
                {state.cancelledCommit && (
                    <p className="text-sub text-text-subtitle">
                        <T keyName="library.import.cancelled" />
                    </p>
                )}
                {refused.length > 0 && (
                    <ReportGroup
                        icon={<ProhibitIcon size={16} />}
                        tone="red"
                        title={t("library.import.groups.cantImport")}
                        count={refused.length}
                        testId="import-refused"
                    >
                        {refused.map((f) => (
                            <Row
                                key={f.fileId}
                                title={f.filename}
                                detail={t(
                                    f.tooLarge
                                        ? `library.import.refused.tooLarge.${f.type === "model" ? "model" : "artwork"}`
                                        : "library.import.refused.unsupported",
                                )}
                            />
                        ))}
                    </ReportGroup>
                )}
                {phase !== "inspecting" && (
                    <MatchBlock
                        state={state}
                        onChange={(mode) => state.setMatchMode(mode)}
                    />
                )}
                {model && (model.inspection || !model.inspecting) && (
                    <>
                        <KindPicker
                            model={model}
                            contextKind={
                                state.session?.context?.kind ??
                                state.context?.kind
                            }
                            actions={state}
                            disabled={phase !== "review"}
                        />
                        <ModelReportView
                            model={model}
                            actions={state}
                            disabled={phase !== "review"}
                        />
                    </>
                )}
                {artwork && (
                    <ArtworkReportView
                        artwork={artwork}
                        actions={state}
                        disabled={phase !== "review"}
                    />
                )}
                {(model?.inspection || artwork) && (
                    <div className="border-stroke border-t pt-12">
                        <DetailsFields store={store} />
                    </div>
                )}
            </>
        );
    }

    return (
        <div
            className="flex h-full min-h-0 flex-col"
            data-testid="import-panel"
            data-phase={phase}
        >
            <div className="border-stroke flex items-center gap-8 border-b px-12 py-10">
                <button
                    type="button"
                    aria-label={t("library.import.back")}
                    className="text-text-subtitle hover:text-text outline-hidden"
                    onClick={() => state.close()}
                >
                    <ArrowLeftIcon size={16} />
                </button>
                <BooksIcon size={16} />
                <span className="text-body">
                    <T keyName="library.import.library" />
                </span>
                <span className="text-text-subtitle">/</span>
                <span className="text-body truncate">
                    <T keyName="library.import.title" />
                </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-14 overflow-y-auto p-12">
                {body}
            </div>
            <div className="border-stroke flex items-center gap-8 border-t p-12">
                {phase === "done" ? (
                    <>
                        <Button
                            variant="secondary"
                            size="compact"
                            data-testid="import-more"
                            onClick={() => void state.pick()}
                        >
                            <FolderOpenIcon size={14} />
                            <T keyName="library.import.importMore" />
                        </Button>
                        <Button
                            size="compact"
                            className="ml-auto"
                            data-testid="import-close"
                            onClick={() => state.close()}
                        >
                            <T keyName="library.import.close" />
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="secondary"
                            size="compact"
                            data-testid="import-cancel"
                            onClick={() => state.close()}
                        >
                            <T keyName="library.import.cancel" />
                        </Button>
                        <Button
                            size="compact"
                            className="ml-auto"
                            data-testid="import-add"
                            data-blocker={blocker ?? ""}
                            disabled={blocker !== null}
                            onClick={() => void state.commit()}
                        >
                            <PlusIcon size={14} />
                            {addLabel(state, t)}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
