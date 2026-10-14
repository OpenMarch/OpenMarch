import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An undo or redo that didn't apply tells the user with an error.
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

    it.each(["undo", "redo"] as const)("a failed %s shows an error", (type) => {
        toastHistoryActionFailure(type, {
            kind: "error",
            message: "no such column",
        });
        expect(toasts.error).toHaveBeenCalledWith(
            HISTORY_FAILURE_MESSAGES.error[type].defaultMessage,
        );
        expect(toasts.warning).not.toHaveBeenCalled();
    });
});
