import { beforeAll, describe, expect, it } from "vitest";
import tolgee from "../../../src/global/singletons/Tolgee";
import { WORKER_ERRORS } from "../../protocol";
import { workerErrorText } from "../workerErrors";

beforeAll(async () => {
    await tolgee.run();
});

describe("workerErrorText", () => {
    it("words the worker's keyed errors in the app's language", () => {
        expect(workerErrorText(WORKER_ERRORS.midChange.messageKey)).toBe(
            "The show is in the middle of a change. Try again in a moment.",
        );
        for (const { messageKey } of Object.values(WORKER_ERRORS))
            expect(workerErrorText(messageKey)).not.toBe(messageKey);
    });

    it("leaves any other message as the worker wrote it", () => {
        expect(workerErrorText("QuotaExceededError: full")).toBe(
            "QuotaExceededError: full",
        );
        expect(workerErrorText("web.close")).toBe("web.close");
    });
});
