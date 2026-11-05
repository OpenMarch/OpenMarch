import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
    initAnalyticsQuestionStore,
    useAnalyticsQuestionStore,
} from "../AnalyticsQuestionStore";

// PostHog and Sentry aren't what's tested; record what's applied.
const applied = vi.hoisted(() => ({ optOut: [] as boolean[] }));
vi.mock("@/utilities/analyticsConsent", () => ({
    applyAnalyticsConsent: (optOut: boolean) => applied.optOut.push(optOut),
}));

/** A stand-in for the preload's settings bridge (the IPC boundary). */
function stubElectron(
    stored: unknown,
    env: {
        isCodegen?: boolean;
        isCI?: boolean;
        isPlaywrightSession?: boolean;
    } = {},
) {
    const electron = {
        invoke: vi.fn(async (_channel: string, key: string) =>
            key === "optOutAnalytics" ? stored : undefined,
        ),
        send: vi.fn(),
        getEnv: vi.fn(async () => env),
        isPlaywrightSession: false,
    };
    Object.assign(window, { electron });
    return electron;
}

async function settled() {
    await waitFor(() =>
        expect(useAnalyticsQuestionStore.getState().status).not.toBe("loading"),
    );
    return useAnalyticsQuestionStore.getState().status;
}

beforeEach(() => {
    useAnalyticsQuestionStore.setState({ status: "loading" });
    applied.optOut = [];
});
afterEach(() => vi.restoreAllMocks());

describe("AnalyticsQuestionStore", () => {
    it("is unanswered when nothing is stored, or null", async () => {
        stubElectron(undefined);
        initAnalyticsQuestionStore();
        expect(await settled()).toBe("unanswered");

        useAnalyticsQuestionStore.setState({ status: "loading" });
        stubElectron(null);
        initAnalyticsQuestionStore();
        expect(await settled()).toBe("unanswered");
    });

    it("is answered when either answer is stored", async () => {
        const electron = stubElectron(false);
        initAnalyticsQuestionStore();
        expect(await settled()).toBe("answered");
        expect(electron.send).not.toHaveBeenCalled();
    });

    it("answers no for Playwright and CI sessions without asking", async () => {
        for (const env of [{ isPlaywrightSession: true }, { isCI: true }]) {
            useAnalyticsQuestionStore.setState({ status: "loading" });
            const electron = stubElectron(undefined, env);
            initAnalyticsQuestionStore();
            expect(await settled()).toBe("answered");
            expect(electron.send).toHaveBeenCalledWith("settings:set", {
                optOutAnalytics: true,
            });
        }
        expect(applied.optOut).toEqual([true, true]);
    });

    it("never asks in codegen sessions, and saves nothing", async () => {
        const electron = stubElectron(undefined, { isCodegen: true });
        initAnalyticsQuestionStore();
        expect(await settled()).toBe("answered");
        expect(electron.send).not.toHaveBeenCalled();
    });
});
