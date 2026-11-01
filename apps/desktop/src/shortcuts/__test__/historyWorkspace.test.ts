// @vitest-environment node
import { describe, expect, it } from "vitest";
import { historyEditWorkspace } from "../handlers/historyWorkspace";

describe("historyEditWorkspace", () => {
    it("is Visuals for an edit of cues only", () => {
        expect(historyEditWorkspace(["cues", "cue_marchers"])).toBe("visuals");
        expect(historyEditWorkspace(["page_performer_settings"])).toBe(
            "visuals",
        );
    });

    it("is the Editor for a drill edit, with or without cues", () => {
        expect(historyEditWorkspace(["timeline_assignments"])).toBe("editor");
        expect(historyEditWorkspace(["beats", "cues"])).toBe("editor");
        expect(historyEditWorkspace(new Set(["marchers"]))).toBe("editor");
    });

    it("is neither for nothing or the 3D View's venue", () => {
        expect(historyEditWorkspace([])).toBeNull();
        expect(historyEditWorkspace(["view3d_venue"])).toBeNull();
    });
});
