// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
    consentGatedTransport,
    errorReportsAllowedFor,
} from "../errorReportConsent";

describe("errorReportsAllowedFor", () => {
    it.each([
        ["production", false, true],
        ["production", true, false],
        ["production", undefined, false],
        ["production", null, false],
        [undefined, false, true],
        ["development", false, false],
    ])("NODE_ENV %s, optOutAnalytics %s: %s", (env, optOut, allowed) => {
        expect(errorReportsAllowedFor(env, optOut)).toBe(allowed);
    });
});

describe("consentGatedTransport", () => {
    const envelope = [{}, []] as never;

    function setup(allowed: { value: boolean }) {
        const inner = {
            send: vi.fn(() => Promise.resolve({ statusCode: 200 })),
            flush: vi.fn(() => Promise.resolve(true)),
        };
        const make = vi.fn(() => inner);
        const transport = consentGatedTransport(
            make,
            () => allowed.value,
        )({} as never);
        return { inner, transport };
    }

    it("sends nothing until the person opts in, then sends", async () => {
        const allowed = { value: false };
        const { inner, transport } = setup(allowed);
        await transport.send(envelope);
        expect(inner.send).not.toHaveBeenCalled();

        allowed.value = true;
        await transport.send(envelope);
        expect(inner.send).toHaveBeenCalledWith(envelope);
    });

    it("stops sending after an opt-out and still flushes", async () => {
        const allowed = { value: true };
        const { inner, transport } = setup(allowed);
        allowed.value = false;
        await transport.send(envelope);
        expect(inner.send).not.toHaveBeenCalled();
        await transport.flush(100);
        expect(inner.flush).toHaveBeenCalledWith(100);
    });
});
