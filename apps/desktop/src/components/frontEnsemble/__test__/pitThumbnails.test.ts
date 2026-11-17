// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PIT_FAMILIES, pitVariantsOf } from "@/view3d/core/pit/catalog";
import { pitThumbnailUrl } from "../pitThumbnails";

describe("pitThumbnailUrl", () => {
    it("has a picture for every model the catalog offers (rerun pit-thumbnails.py after changing them)", () => {
        for (const family of PIT_FAMILIES)
            for (const variant of pitVariantsOf(family.id))
                expect(
                    pitThumbnailUrl(variant.fileId),
                    variant.fileId,
                ).not.toBeNull();
    });

    it("has none for a model it doesn't know", () => {
        expect(pitThumbnailUrl("no-such-model")).toBeNull();
    });
});
