import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An undo or redo that didn't apply tells the user why (P9.5): a step the page-era freeze refused
 * (and dropped from its stack) gets a warning that it was skipped; any other failure an error.
 */

const toasts = vi.hoisted(() => ({
    warning: vi.fn(),
    error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/global/singletons/Tolgee", () => ({
    default: { t: (_key: string, defaultMessage: string) => defaultMessage },
}));
vi.mock("@/App", () => ({ queryClient: undefined }));

const { HISTORY_FAILURE_MESSAGES, toastHistoryActionFailure } =
    await import("../useHistory");

describe("toastHistoryActionFailure", () => {
    beforeEach(() => {
        toasts.warning.mockReset();
        toasts.error.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it.each(["undo", "redo"] as const)(
        "a %s the freeze refused says it was skipped",
        (type) => {
            toastHistoryActionFailure(type, { kind: "page-era-frozen" });
            expect(toasts.warning).toHaveBeenCalledWith(
                HISTORY_FAILURE_MESSAGES["page-era-frozen"][type]
                    .defaultMessage,
            );
            expect(toasts.error).not.toHaveBeenCalled();
        },
    );

    it.each(["undo", "redo"] as const)(
        "any other failed %s shows an error",
        (type) => {
            toastHistoryActionFailure(type, {
                kind: "error",
                message: "no such column",
            });
            expect(toasts.error).toHaveBeenCalledWith(
                HISTORY_FAILURE_MESSAGES.error[type].defaultMessage,
            );
            expect(toasts.warning).not.toHaveBeenCalled();
        },
    );
});
