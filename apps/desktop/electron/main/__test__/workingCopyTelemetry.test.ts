import { describe, expect, it, vi } from "vitest";
import { DIAGNOSTIC_TAG } from "../privateDiagnostics";

vi.mock("@sentry/electron/main", () => ({
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
}));

const { createWorkingCopyTelemetry } = await import("../workingCopyTelemetry");

const metrics = (over: Record<string, unknown> = {}) => ({
    reason: "idle",
    durationMs: 120.4,
    bytes: 16_000_000,
    renameAttempts: 1,
    hashedShow: false,
    deferralsBefore: 0,
    vacuumMs: 80.2,
    ...over,
});

function setup(enabled = true) {
    const breadcrumbs: Record<string, unknown>[] = [];
    const summaries: [Record<string, string>, Record<string, unknown>][] = [];
    const telemetry = createWorkingCopyTelemetry({
        enabled: () => enabled,
        platform: "win32",
        appVersion: "0.2.0",
        sink: {
            breadcrumb: (data) => breadcrumbs.push(data),
            summary: (tags, extra) => summaries.push([tags, extra]),
        },
    });
    return { telemetry, breadcrumbs, summaries };
}

describe("working-copy telemetry", () => {
    it("adds a breadcrumb per publish and sends one summary per session, with no paths", () => {
        const { telemetry, breadcrumbs, summaries } = setup();
        telemetry.recoveryOffered();
        telemetry.recoveryTaken();
        telemetry.sessionStarted("OneDrive");
        telemetry.tempFilesFound(2);
        telemetry.publish({ ok: true, metrics: metrics() });
        telemetry.publish({
            ok: false,
            state: "deferred",
            errorCode: "EBUSY",
            reason: "idle",
        });
        telemetry.publish({
            ok: true,
            metrics: metrics({
                durationMs: 300,
                renameAttempts: 4,
                deferralsBefore: 1,
                hashedShow: true,
            }),
        });
        telemetry.sessionEnded();

        expect(breadcrumbs).toHaveLength(3);
        expect(summaries).toHaveLength(1);
        const [tags, extra] = summaries[0];
        expect(tags).toMatchObject({
            syncService: "OneDrive",
            platform: "win32",
            hadDeferral: "true",
            hadConflict: "false",
            // Sent without breadcrumbs: the console's name files (privateDiagnostics.ts).
            [DIAGNOSTIC_TAG]: "true",
        });
        expect(extra).toMatchObject({
            publishes: 2,
            publishAvgMs: 210,
            publishMaxMs: 300,
            renameRetries: 3,
            hashedShow: 1,
            deferrals: 1,
            maxDeferralsInARow: 1,
            errorCodes: "EBUSY",
            tempFilesFound: 2,
            recoveriesOffered: 1,
            recoveriesTaken: 1,
        });
        // Nothing that could name a person's show.
        const text = JSON.stringify([breadcrumbs, summaries]);
        expect(text).not.toMatch(/[/\\]|\.dots/);
    });

    it("sends nothing when analytics are opted out", () => {
        const { telemetry, breadcrumbs, summaries } = setup(false);
        telemetry.sessionStarted(null);
        telemetry.publish({ ok: true, metrics: metrics() });
        telemetry.sessionEnded();
        expect(breadcrumbs).toEqual([]);
        expect(summaries).toEqual([]);
    });

    it("skips a session that never published", () => {
        const { telemetry, summaries } = setup();
        telemetry.sessionStarted(null);
        telemetry.sessionEnded();
        expect(summaries).toEqual([]);
    });
});
