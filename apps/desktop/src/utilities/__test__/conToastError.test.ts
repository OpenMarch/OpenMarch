import { describe, expect, it, vi } from "vitest";

import { conToastError } from "../utils";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("conToastError", () => {
    it("shows only the message and logs the details", () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const error = new Error("SQLITE_BUSY: database is locked");

        conToastError("Couldn't change the tag", error);

        expect(toastError).toHaveBeenCalledWith("Couldn't change the tag", {
            id: "error:Couldn't change the tag",
        });
        expect(consoleError).toHaveBeenCalledWith(
            "Couldn't change the tag",
            error,
        );
        consoleError.mockRestore();
    });

    it("gives the same message the same toast id, so repeats replace it", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        toastError.mockClear();

        conToastError("Couldn't add the beats");
        conToastError("Couldn't add the beats");

        const ids = toastError.mock.calls.map(([, options]) => options.id);
        expect(new Set(ids).size).toBe(1);
    });
});
