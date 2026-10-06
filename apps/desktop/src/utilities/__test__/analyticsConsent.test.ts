import { afterEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import * as Sentry from "@sentry/electron/renderer";
import { applyAnalyticsConsent } from "../analyticsConsent";

vi.mock("@sentry/electron/renderer", () => ({ init: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe("applyAnalyticsConsent", () => {
    it("opts out of PostHog and disables Sentry", () => {
        const out = vi
            .spyOn(posthog, "opt_out_capturing")
            .mockImplementation(() => {});
        const into = vi
            .spyOn(posthog, "opt_in_capturing")
            .mockImplementation(() => {});
        const init = vi.mocked(Sentry.init);
        init.mockClear();
        applyAnalyticsConsent(true);
        expect(out).toHaveBeenCalled();
        expect(into).not.toHaveBeenCalled();
        expect(init).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: false }),
        );
    });

    it("opts in to PostHog and enables Sentry", () => {
        const out = vi
            .spyOn(posthog, "opt_out_capturing")
            .mockImplementation(() => {});
        const into = vi
            .spyOn(posthog, "opt_in_capturing")
            .mockImplementation(() => {});
        const init = vi.mocked(Sentry.init);
        init.mockClear();
        applyAnalyticsConsent(false);
        expect(into).toHaveBeenCalled();
        expect(out).not.toHaveBeenCalled();
        expect(init).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: true }),
        );
    });
});
