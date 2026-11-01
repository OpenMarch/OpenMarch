import { describe, expect, it } from "vitest";
import { pageDeletedToastOptions } from "../usePages";
import { ACTION_TOAST_DURATION_MS } from "@/components/ui/toastDurations";

describe("the page-deleted toast", () => {
    it("stays long enough to reach its Undo button", () => {
        const options = pageDeletedToastOptions("token");
        expect(options.duration).toBe(ACTION_TOAST_DURATION_MS);
        expect(options.duration).toBeGreaterThanOrEqual(4000);
        expect(options.action.onClick).toBeTypeOf("function");
    });
});
