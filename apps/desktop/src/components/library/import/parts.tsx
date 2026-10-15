/**
 * Small pieces of the import panel (package C1.10): report groups and rows,
 * chips, the inline IPC error and the progress block.
 */
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Button } from "@openmarch/ui";
import {
    ArrowClockwiseIcon,
    CaretDownIcon,
    CaretRightIcon,
    CubeIcon,
    FileImageIcon,
    FilePdfIcon,
    FileXIcon,
    FolderOpenIcon,
    SealWarningIcon,
} from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import type {
    ImportFileRef,
    ImportProgress,
    LibraryIpcErrorCode,
} from "@/view3d/library/protocol";
import { formatLength, fromMeters, type Length } from "@/view3d/core/sizes";
import type { ReviewError } from "./importReview";
import type { RowText } from "./reportText";

export function Label({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <p
            className={clsx(
                "text-sub text-text-subtitle font-mono tracking-wide uppercase",
                className,
            )}
        >
            {children}
        </p>
    );
}

export function FileTypeIcon({
    file,
    size = 18,
}: {
    file: Pick<ImportFileRef, "type" | "filename">;
    size?: number;
}) {
    if (file.type === "model") return <CubeIcon size={size} />;
    if (file.type === "unsupported") return <FileXIcon size={size} />;
    return /\.pdf$/i.test(file.filename) ? (
        <FilePdfIcon size={size} />
    ) : (
        <FileImageIcon size={size} />
    );
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function Row({ title, detail, muted }: RowText & { muted?: boolean }) {
    return (
        <div className="flex min-w-0 flex-col">
            <p
                className={clsx(
                    "text-body break-words",
                    muted ? "text-text-subtitle" : "text-text",
                )}
            >
                {title}
            </p>
            {detail && (
                <p className="text-sub text-text-subtitle break-words">
                    {detail}
                </p>
            )}
        </div>
    );
}

export type GroupTone = "red" | "accent" | "green" | "sub";

/** One report group: Can't import, Needs your choice, Fixed for you, Notes. */
export function ReportGroup({
    icon,
    tone,
    title,
    count,
    defaultOpen = true,
    testId,
    children,
}: {
    icon: ReactNode;
    tone: GroupTone;
    title: string;
    count: number;
    defaultOpen?: boolean;
    testId?: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    if (count === 0) return null;
    return (
        <section className="flex flex-col gap-6" data-testid={testId}>
            <button
                type="button"
                aria-expanded={open}
                className="flex items-center gap-6 text-left outline-hidden focus-visible:underline"
                onClick={() => setOpen((o) => !o)}
            >
                <span
                    className={clsx({
                        "text-red": tone === "red",
                        "text-accent": tone === "accent",
                        "text-green": tone === "green",
                        "text-text-subtitle": tone === "sub",
                    })}
                >
                    {icon}
                </span>
                <span className="text-body text-text font-medium">{title}</span>
                <span className="text-sub text-text-subtitle font-mono">
                    {count}
                </span>
                <span className="text-text-subtitle ml-auto">
                    {open ? (
                        <CaretDownIcon size={14} />
                    ) : (
                        <CaretRightIcon size={14} />
                    )}
                </span>
            </button>
            {open && (
                <div className="flex flex-col gap-8 pl-22">{children}</div>
            )}
        </section>
    );
}

export function Chip({
    on,
    onClick,
    disabled,
    children,
    testId,
}: {
    on: boolean;
    onClick: () => void;
    disabled?: boolean;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            disabled={disabled}
            data-testid={testId}
            onClick={onClick}
            className={clsx(
                "text-body focus-visible:border-accent rounded-full border px-10 py-2 outline-hidden duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
                on
                    ? "border-accent bg-accent/15 text-text"
                    : "border-stroke bg-fg-2 text-text-subtitle enabled:hover:text-text",
            )}
        >
            {children}
        </button>
    );
}

const PICK_AGAIN: readonly LibraryIpcErrorCode[] = [
    "mixed-selection",
    "session-expired",
    "unknown-file",
];

const KNOWN_ERRORS: readonly LibraryIpcErrorCode[] = [
    "mixed-selection",
    "session-expired",
    "unknown-file",
    "too-large",
    "unreadable",
    "busy",
    "timeout",
    "worker-crashed",
    "pdf-unavailable",
    "write-failed",
    "read-only",
    "corrupt",
    "cancelled",
];

/** An IPC error, inline with Try again or Choose files again (D-22, Q54). */
export function ErrorBlock({
    error,
    files,
    onRetry,
}: {
    error: ReviewError;
    files: readonly ImportFileRef[];
    onRetry: () => void;
}) {
    const pickAgain =
        error.during === "pick" || PICK_AGAIN.includes(error.code);
    const key = KNOWN_ERRORS.includes(error.code) ? error.code : "other";
    return (
        <div
            role="alert"
            data-testid="import-error"
            data-code={error.code}
            className="rounded-6 border-red/40 bg-red/5 flex flex-col gap-10 border p-12"
        >
            <div className="flex items-start gap-8">
                <SealWarningIcon size={20} className="text-red shrink-0" />
                <div className="flex min-w-0 flex-col gap-4">
                    <p className="text-body text-text font-medium">
                        <T keyName={`library.import.errors.${key}.title`} />
                    </p>
                    <p className="text-body text-text-subtitle">
                        <T keyName={`library.import.errors.${key}.body`} />
                    </p>
                    {files.length > 0 && error.code === "mixed-selection" && (
                        <ul className="text-sub text-text-subtitle mt-4 flex flex-col gap-2 font-mono">
                            {files.map((f) => (
                                <li
                                    key={f.fileId}
                                    className="flex items-center gap-6"
                                >
                                    <FileTypeIcon file={f} size={12} />
                                    {f.filename}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <Button
                size="compact"
                onClick={onRetry}
                data-testid="import-retry"
                className="self-start"
            >
                {pickAgain ? (
                    <FolderOpenIcon size={14} />
                ) : (
                    <ArrowClockwiseIcon size={14} />
                )}
                <T
                    keyName={
                        pickAgain
                            ? "library.import.chooseAgain"
                            : "library.import.tryAgain"
                    }
                />
            </Button>
            <p className="text-sub text-text-subtitle font-mono">
                {error.code}
            </p>
        </div>
    );
}

/** Progress with Cancel. `fraction` null shows an indeterminate bar. */
export function ProgressBlock({
    progress,
    committing,
    onCancel,
}: {
    progress: ImportProgress | null;
    committing: boolean;
    onCancel: () => void;
}) {
    const { t } = useTranslate();
    const stage = progress?.stage ?? "reading";
    return (
        <div className="flex flex-col gap-8" data-testid="import-progress">
            <div className="flex items-center justify-between gap-8">
                <p className="text-body text-text" aria-live="polite">
                    {t(`library.import.stages.${stage}`)}
                    {progress?.page &&
                        ` · ${t("library.import.pageOf", {
                            index: Math.min(
                                progress.page.index + 1,
                                progress.page.count,
                            ),
                            count: progress.page.count,
                        })}`}
                </p>
                <Button
                    size="compact"
                    variant="secondary"
                    onClick={onCancel}
                    data-testid="import-progress-cancel"
                >
                    <T keyName="library.import.cancel" />
                </Button>
            </div>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                    progress?.fraction != null
                        ? Math.round(progress.fraction * 100)
                        : undefined
                }
                className="bg-fg-2 border-stroke h-6 w-full overflow-hidden rounded-full border"
            >
                <div
                    className={clsx(
                        "bg-accent h-full",
                        progress?.fraction == null && "w-1/3 animate-pulse",
                    )}
                    style={
                        progress?.fraction != null
                            ? { width: `${progress.fraction * 100}%` }
                            : undefined
                    }
                />
            </div>
            {committing && (
                <p className="text-sub text-text-subtitle">
                    <T keyName="library.import.cancelKeeps" />
                </p>
            )}
        </div>
    );
}

/**
 * A physical size as people say it: "36 × 54 in" or "4 × 8 ft" when both
 * sides are whole (to ⅛ in, or whole feet from 10 ft up), else ft-in.
 */
export function sizeText(width: Length, height: Length): string {
    const eighths = [width.m, height.m].map((m) =>
        Math.round(fromMeters(m, "in") * 8),
    );
    const inches = eighths.map((e) => e / 8);
    if (inches.every((i) => i % 12 === 0 && i >= 48)) {
        return `${inches[0] / 12} × ${inches[1] / 12} ft`;
    }
    if (inches.every((i) => i < 120)) {
        return `${inches[0]} × ${inches[1]} in`;
    }
    return `${formatLength(width, "imperial")} × ${formatLength(height, "imperial")}`;
}
