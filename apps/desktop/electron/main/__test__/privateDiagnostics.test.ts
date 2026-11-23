/** The app's own Sentry diagnostics go without breadcrumbs (`privateDiagnostics.ts`). */
import { describe, expect, it } from "vitest";
import {
    DIAGNOSTIC_TAG,
    diagnosticTags,
    stripDiagnosticBreadcrumbs,
} from "../privateDiagnostics";

const consoleBreadcrumb = {
    category: "console",
    message: "Saved /Users/sam/OneDrive/Halftime.dots (idle)",
};

describe("stripDiagnosticBreadcrumbs", () => {
    it("drops the breadcrumbs of a diagnostic event, which can name files", () => {
        const event = {
            message: "Leftover journal stopped an open",
            tags: diagnosticTags({ syncService: "OneDrive" }),
            breadcrumbs: [consoleBreadcrumb],
            extra: { journalBytes: 512 },
        };

        const sent = stripDiagnosticBreadcrumbs(event);

        expect(sent.breadcrumbs).toBeUndefined();
        expect(JSON.stringify(sent)).not.toContain("Halftime");
        expect(sent.tags).toEqual({
            syncService: "OneDrive",
            [DIAGNOSTIC_TAG]: "true",
        });
        expect(sent.extra).toEqual({ journalBytes: 512 });
    });

    it("leaves other events as they are", () => {
        const event = {
            message: "Something failed",
            tags: { syncService: "none" },
            breadcrumbs: [consoleBreadcrumb],
        };

        expect(stripDiagnosticBreadcrumbs(event)).toBe(event);
    });
});
