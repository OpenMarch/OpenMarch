import { describe, expect, it, vi } from "vitest";
import { handleWindowOpen } from "../window-open-policy";

describe("handleWindowOpen", () => {
    it("opens https links externally and denies the window", () => {
        const open = vi.fn();
        expect(handleWindowOpen("https://openmarch.com", open)).toEqual({
            action: "deny",
        });
        expect(open).toHaveBeenCalledWith("https://openmarch.com");
    });

    it("denies other protocols without opening them", () => {
        const open = vi.fn();
        for (const url of [
            "http://a.com",
            "file:///etc/passwd",
            "javascript:1",
        ])
            expect(handleWindowOpen(url, open)).toEqual({ action: "deny" });
        expect(open).not.toHaveBeenCalled();
    });
});
