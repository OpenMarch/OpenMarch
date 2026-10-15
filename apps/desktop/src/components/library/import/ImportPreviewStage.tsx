/**
 * The import preview stage (package C1.10; owner decisions Q60 and Q63):
 * in Visuals mode the stage shows this while an import is open, beside the
 * import panel. A model shows in the code-split three.js canvas with front,
 * side and top views, before/after for simplify and grip picking; artwork
 * shows the focused page's 1024 px preview from `renderArtworkPreview`.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { useStore } from "zustand";
import { Button } from "@openmarch/ui";
import {
    ArrowClockwiseIcon,
    CrosshairIcon,
    CubeIcon,
    FileImageIcon,
    ProhibitIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import { formatLength } from "@/view3d/core/sizes/units";
import {
    litMaterial,
    type ArtworkReview,
    type ImportReviewStore,
} from "./importReview";
import { sizeText } from "./parts";
import {
    boundsSize,
    PREVIEW_VIEWS,
    type Bounds,
    type PreviewView,
} from "./previewMath";

const ImportPreviewCanvas = lazy(() => import("./ImportPreviewCanvas"));

function Placeholder({
    icon,
    children,
}: {
    icon: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div
            className="text-body text-text-subtitle m-auto flex flex-col items-center gap-8 text-center"
            data-testid="import-stage-placeholder"
        >
            {icon}
            {children}
        </div>
    );
}

const tag =
    "text-sub text-text-subtitle bg-modal border-stroke rounded-6 border px-6 py-2 font-mono";

function ModelStage({ store }: { store: ImportReviewStore }) {
    const { t } = useTranslate();
    const model = useStore(store, (s) => s.model)!;
    const setGrip = useStore(store, (s) => s.setGrip);
    const cancelGripPick = useStore(store, (s) => s.cancelGripPick);
    const setCapture = useStore(store, (s) => s.setThumbnailCapture);
    const retryPreview = useStore(store, (s) => s.retryPreview);
    const beforeFailed = useStore(store, (s) => s.beforeFailed);
    const [view, setView] = useState<PreviewView>("front");
    const [nonce, setNonce] = useState(0);
    const [bounds, setBounds] = useState<Bounds | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const onCaptureReady = useCallback(
        (fn: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null) =>
            setCapture(fn),
        [setCapture],
    );
    useEffect(() => setLoadFailed(false), [model.glbUrl]);
    useEffect(() => {
        if (!model.pickingGrip) return;
        const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancelGripPick();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [model.pickingGrip, cancelGripPick]);

    const report = model.inspection?.report;
    if (!model.glbUrl || loadFailed || model.previewFailed) {
        if (report?.status === "rejected") {
            return (
                <Placeholder icon={<ProhibitIcon size={40} />}>
                    <T keyName="library.import.stage.rejected" />
                </Placeholder>
            );
        }
        if (report?.status === "needs-kind") {
            return (
                <Placeholder icon={<CubeIcon size={40} />}>
                    <T keyName="library.import.stage.needsKind" />
                </Placeholder>
            );
        }
        if (model.previewFailed || loadFailed) {
            return (
                <Placeholder icon={<CubeIcon size={40} />}>
                    <T keyName="library.import.stage.previewFailed" />
                    <Button
                        size="compact"
                        variant="secondary"
                        onClick={() => {
                            setLoadFailed(false);
                            retryPreview();
                        }}
                    >
                        <ArrowClockwiseIcon size={14} />
                        <T keyName="library.import.tryAgain" />
                    </Button>
                </Placeholder>
            );
        }
        return (
            <Placeholder icon={<CubeIcon size={40} />}>
                <T keyName="library.import.stage.loading" />
            </Placeholder>
        );
    }

    const grip = model.inspection?.sidecar?.grips.right?.position ?? null;
    const lit = litMaterial(model);
    const simplify = report?.needsChoice.find((r) => r.code === "simplify");
    const triangles =
        model.showBefore && simplify
            ? simplify.triangles
            : (report?.output?.triangles ?? null);
    const cap = simplify?.cap;
    const height = bounds ? boundsSize(bounds)[1] : null;
    const simplifyOn = simplify && (model.choices.simplify ?? simplify.applied);

    return (
        <div
            className="relative h-full w-full"
            data-testid="import-stage-model"
        >
            <Suspense
                fallback={
                    <Placeholder icon={<CubeIcon size={40} />}>
                        <T keyName="library.import.stage.loading" />
                    </Placeholder>
                }
            >
                <ImportPreviewCanvas
                    url={model.glbUrl}
                    beforeUrl={model.beforeUrl}
                    showBefore={model.showBefore}
                    grip={grip}
                    highlightMaterial={lit?.outputIndex ?? null}
                    picking={model.pickingGrip}
                    view={view}
                    viewNonce={nonce}
                    onPick={setGrip}
                    onBounds={setBounds}
                    onCaptureReady={onCaptureReady}
                    onError={() => setLoadFailed(true)}
                    onBeforeError={beforeFailed}
                />
            </Suspense>
            <div className="pointer-events-none absolute top-8 left-10 flex flex-col gap-4">
                {triangles !== null && (
                    <span className={tag} data-testid="import-stage-triangles">
                        {cap
                            ? t("library.import.stage.trianglesCap", {
                                  triangles: triangles.toLocaleString("en-US"),
                                  cap: cap.toLocaleString("en-US"),
                              })
                            : t("library.import.stage.triangles", {
                                  triangles: triangles.toLocaleString("en-US"),
                              })}
                    </span>
                )}
                {lit && (
                    <span className={tag} data-testid="import-stage-surface">
                        {t("library.import.stage.surface", {
                            name:
                                lit.name ??
                                t("library.import.choices.surface.unnamed", {
                                    index: lit.index + 1,
                                }),
                        })}
                    </span>
                )}
            </div>
            {simplifyOn && (
                <span
                    className={clsx(tag, "absolute top-8 right-10")}
                    data-testid="import-stage-before-after"
                >
                    {model.showBefore
                        ? t("library.import.stage.before")
                        : t("library.import.stage.after")}
                </span>
            )}
            {height !== null && (
                <span className={clsx(tag, "absolute bottom-8 left-10")}>
                    {t("library.import.stage.tall", {
                        height: formatLength(height, "metric"),
                    })}
                </span>
            )}
            {model.pickingGrip && (
                <span
                    className={clsx(
                        tag,
                        "text-text absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-6",
                    )}
                    data-testid="import-stage-picking"
                >
                    <CrosshairIcon size={14} />
                    <T keyName="library.import.stage.pickGrip" />
                </span>
            )}
            <div
                className="absolute right-10 bottom-8 flex gap-4"
                role="group"
                aria-label={t("library.import.stage.views")}
            >
                {PREVIEW_VIEWS.map((v) => (
                    <button
                        key={v}
                        type="button"
                        data-testid={`import-view-${v}`}
                        aria-pressed={view === v}
                        onClick={() => {
                            setView(v);
                            setNonce((n) => n + 1);
                        }}
                        className={clsx(
                            "text-sub rounded-6 border px-8 py-2 font-mono uppercase outline-hidden",
                            view === v
                                ? "border-accent bg-accent/15 text-text"
                                : "border-stroke bg-modal text-text-subtitle hover:text-text",
                        )}
                    >
                        {t(`library.import.stage.view.${v}`)}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ArtworkStage({
    store,
    artwork,
}: {
    store: ImportReviewStore;
    artwork: ArtworkReview;
}) {
    const { t } = useTranslate();
    const load = useStore(store, (s) => s.loadArtworkPreview);
    const focus = artwork.focus;
    useEffect(() => {
        if (focus) load(focus.fileId, focus.page, 1024);
    }, [focus, load]);
    if (!focus) {
        return (
            <Placeholder icon={<FileImageIcon size={40} />}>
                <T keyName="library.import.stage.noArtwork" />
            </Placeholder>
        );
    }
    const key = `${focus.fileId}:${focus.page}@1024`;
    const url = artwork.previews[key];
    const file = artwork.inspection.files.find(
        (f) => f.fileId === focus.fileId,
    );
    const inspection = file?.inspection;
    const page = inspection?.ok ? inspection.pages[focus.page] : undefined;
    const groupIndex = artwork.inspection.aspectGroups.findIndex((g) =>
        g.members.some(
            (m) =>
                artwork.inspection.files[m.file]?.fileId === focus.fileId &&
                m.page === focus.page,
        ),
    );
    const size = artwork.groups[groupIndex]?.size;
    const pages = inspection?.ok ? inspection.pages.length : 1;
    return (
        <div
            className="relative flex h-full w-full items-center justify-center p-24"
            data-testid="import-stage-artwork"
        >
            {url ? (
                <img
                    src={url}
                    alt={file?.inspection.filename ?? ""}
                    data-testid="import-stage-image"
                    className="border-stroke shadow-modal max-h-full max-w-full border object-contain"
                />
            ) : artwork.previewFailed[key] ? (
                <Placeholder icon={<FileImageIcon size={40} />}>
                    <T keyName="library.import.stage.previewFailed" />
                </Placeholder>
            ) : (
                <Placeholder icon={<FileImageIcon size={40} />}>
                    <T keyName="library.import.stage.loading" />
                </Placeholder>
            )}
            <span className={clsx(tag, "absolute top-8 left-10")}>
                {file?.inspection.filename}
                {pages > 1
                    ? ` · ${t("library.import.pageN", { n: focus.page + 1 })}`
                    : ""}
            </span>
            <span className={clsx(tag, "absolute bottom-8 left-10")}>
                {[
                    size ? sizeText(size.width, size.height) : null,
                    page?.vector
                        ? t("library.import.stage.vector")
                        : page?.pixels
                          ? `${page.pixels.width} × ${page.pixels.height} px`
                          : null,
                ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
        </div>
    );
}

export default function ImportPreviewStage({
    store,
}: {
    store: ImportReviewStore;
}) {
    const phase = useStore(store, (s) => s.phase);
    const hasModel = useStore(store, (s) => s.model !== null);
    const artwork = useStore(store, (s) => s.artwork);
    let content: React.ReactNode;
    if (hasModel && phase !== "error" && phase !== "done") {
        content = <ModelStage store={store} />;
    } else if (artwork && phase !== "error" && phase !== "done") {
        content = <ArtworkStage store={store} artwork={artwork} />;
    } else {
        content = (
            <Placeholder icon={<FileImageIcon size={40} />}>
                {phase === "inspecting" ? (
                    <T keyName="library.import.stage.loading" />
                ) : (
                    <T keyName="library.import.stage.empty" />
                )}
            </Placeholder>
        );
    }
    return (
        <div
            className="relative flex h-full min-h-0 w-full flex-col"
            data-testid="import-stage"
        >
            <div className="flex min-h-0 flex-1">{content}</div>
        </div>
    );
}
