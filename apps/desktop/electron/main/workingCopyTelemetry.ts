/**
 * Non-identifying numbers about working-copy saves (ADR 0018), for Sentry: how long publishes
 * take, how big they are, how often they're retried, deferred or meet a conflict, and how often
 * recovery is offered and taken. Never a path, a show name or show contents.
 *
 * Each publish adds a breadcrumb (it travels with any error report); each session sends one
 * summary event when it ends, rather than one event per publish. Nothing is sent when analytics
 * are opted out. The summary is a diagnostic event (`privateDiagnostics.ts`): it goes without
 * the console breadcrumbs, which name files.
 */
import { addBreadcrumb, captureMessage } from "@sentry/electron/main";
import { diagnosticTags } from "./privateDiagnostics";
import type { PublishMetrics } from "../database/workingCopy/WorkingCopySession";

export type PublishEvent =
    | { ok: true; metrics: PublishMetrics }
    | { ok: false; state: string; errorCode?: string; reason: string };

export interface TelemetrySink {
    breadcrumb: (data: Record<string, unknown>) => void;
    summary: (
        tags: Record<string, string>,
        extra: Record<string, unknown>,
    ) => void;
}

const sentrySink: TelemetrySink = {
    breadcrumb: (data) =>
        addBreadcrumb({
            category: "working-copy",
            message: "publish",
            level: "info",
            data,
        }),
    summary: (tags, extra) =>
        captureMessage("Working-copy session", { level: "info", tags, extra }),
};

const round = (n: number) => Math.round(n);

// eslint-disable-next-line max-lines-per-function -- one closure holding the session counters
export function createWorkingCopyTelemetry({
    enabled,
    platform,
    appVersion,
    sink = sentrySink,
}: {
    enabled: () => boolean;
    platform: string;
    appVersion: string;
    sink?: TelemetrySink;
}) {
    let session: {
        syncService: string;
        publishes: number;
        totalMs: number;
        maxMs: number;
        maxBytes: number;
        renameRetries: number;
        hashedShow: number;
        maxDeferralsInARow: number;
        deferrals: number;
        conflicts: number;
        readOnly: number;
        errorCodes: Set<string>;
        tempFilesFound: number;
    } | null = null;
    let recoveriesOffered = 0;
    let recoveriesTaken = 0;
    let pendingTempFiles = 0;

    return {
        recoveryOffered() {
            recoveriesOffered++;
        },
        recoveryTaken() {
            recoveriesTaken++;
        },
        tempFilesFound(count: number) {
            if (session) session.tempFilesFound += count;
            else pendingTempFiles += count;
        },
        sessionStarted(syncService: string | null) {
            session = {
                syncService: syncService ?? "none",
                publishes: 0,
                totalMs: 0,
                maxMs: 0,
                maxBytes: 0,
                renameRetries: 0,
                hashedShow: 0,
                maxDeferralsInARow: 0,
                deferrals: 0,
                conflicts: 0,
                readOnly: 0,
                errorCodes: new Set(),
                tempFilesFound: pendingTempFiles,
            };
            pendingTempFiles = 0;
        },
        publish(event: PublishEvent) {
            if (!session) return;
            if (event.ok) {
                const m = event.metrics;
                session.publishes++;
                session.totalMs += m.durationMs;
                session.maxMs = Math.max(session.maxMs, m.durationMs);
                session.maxBytes = Math.max(session.maxBytes, m.bytes);
                session.renameRetries += Math.max(0, m.renameAttempts - 1);
                if (m.hashedShow) session.hashedShow++;
                session.maxDeferralsInARow = Math.max(
                    session.maxDeferralsInARow,
                    m.deferralsBefore,
                );
                if (enabled())
                    sink.breadcrumb({
                        reason: m.reason,
                        durationMs: round(m.durationMs),
                        vacuumMs: round(m.vacuumMs),
                        bytes: m.bytes,
                        renameAttempts: m.renameAttempts,
                        hashedShow: m.hashedShow,
                        deferralsBefore: m.deferralsBefore,
                    });
                return;
            }
            if (event.state === "conflict") session.conflicts++;
            else if (event.state === "readOnly") session.readOnly++;
            else session.deferrals++;
            if (event.errorCode) session.errorCodes.add(event.errorCode);
            if (enabled())
                sink.breadcrumb({
                    reason: event.reason,
                    failed: event.state,
                    errorCode: event.errorCode ?? "",
                });
        },
        /** Sends the session's summary, if it published or tried to. */
        sessionEnded() {
            const s = session;
            session = null;
            if (!s || !enabled()) return;
            const tried = s.publishes + s.deferrals + s.conflicts + s.readOnly;
            if (
                tried === 0 &&
                recoveriesOffered === 0 &&
                s.tempFilesFound === 0
            )
                return;
            sink.summary(
                diagnosticTags({
                    platform,
                    appVersion,
                    syncService: s.syncService,
                    hadConflict: String(s.conflicts > 0),
                    hadDeferral: String(s.deferrals > 0),
                }),
                {
                    publishes: s.publishes,
                    publishAvgMs: s.publishes
                        ? round(s.totalMs / s.publishes)
                        : 0,
                    publishMaxMs: round(s.maxMs),
                    maxBytes: s.maxBytes,
                    renameRetries: s.renameRetries,
                    hashedShow: s.hashedShow,
                    deferrals: s.deferrals,
                    maxDeferralsInARow: s.maxDeferralsInARow,
                    conflicts: s.conflicts,
                    readOnly: s.readOnly,
                    errorCodes: [...s.errorCodes].sort().join(","),
                    tempFilesFound: s.tempFilesFound,
                    recoveriesOffered,
                    recoveriesTaken,
                },
            );
            recoveriesOffered = 0;
            recoveriesTaken = 0;
        },
    };
}
