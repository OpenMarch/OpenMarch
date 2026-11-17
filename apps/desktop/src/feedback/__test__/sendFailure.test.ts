import { describe, expect, it } from "vitest";
import { sendFailure } from "../sendFailure";
import { NOT_SIGNED_IN, ReportSubmitError } from "../reportUpload";

describe("sendFailure", () => {
    it("names the known cases without technical detail", () => {
        expect(sendFailure(409, new Error("conflict"))).toEqual({
            key: "feedback.error.showChanged",
        });
        expect(sendFailure(429, new Error("slow down"))).toEqual({
            key: "feedback.error.tooMany",
        });
    });

    it("leaves out the app's own 'Not signed in'", () => {
        expect(
            sendFailure(401, new ReportSubmitError(NOT_SIGNED_IN, 401)),
        ).toEqual({ key: "feedback.error.signedOut" });
    });

    it("passes on the server's reason for a refused sign-in", () => {
        expect(
            sendFailure(401, new Error("Signed in to a different OpenMarch")),
        ).toEqual({
            key: "feedback.error.signedOut",
            detail: "Signed in to a different OpenMarch",
        });
    });

    it("blames the connection only when nothing answered", () => {
        expect(
            sendFailure(403, new Error("Uploading the recording failed (403)")),
        ).toEqual({
            key: "feedback.error.refused",
            detail: "Uploading the recording failed (403)",
        });
        expect(
            sendFailure(undefined, new TypeError("Failed to fetch")),
        ).toEqual({ key: "feedback.error.failed", detail: "Failed to fetch" });
    });
});
