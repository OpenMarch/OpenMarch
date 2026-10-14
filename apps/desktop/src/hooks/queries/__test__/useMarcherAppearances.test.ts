import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";

/**
 * The canvas appearance query stacks the tags, the section and the field theme, as the exports do
 * (docs/timeline/phases/07-page-parity.md P7.14, P7.16).
 */

vi.mock("@/App", () => ({ queryClient: undefined }));
vi.mock("@/global/database/db", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    db: {},
}));

const {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    fieldPropertiesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    resolvedTagAppearancesByPageIdQueryOptions,
} = await import("..");
const { marcherAppearancesQueryOptions } =
    await import("../useMarcherAppearances");

const PAGE_ID = 7;
const MARCHER_ID = 1;
const THEME_FILL = "#000000";
const TAG_ID = 5;
const TAG_APPEARANCE = {
    id: 1,
    tag_id: TAG_ID,
    priority: 1,
    fill_color: "#00ff00",
};

/**
 * Seeds every query the appearance query reads (all with an infinite stale time). Nothing reads
 * the database: `db` is mocked to an empty object.
 */
const seededClient = ({ tagged = false } = {}) => {
    const qc = new QueryClient();
    qc.setQueryData(allMarchersQueryOptions().queryKey, [
        { id: MARCHER_ID, section: "Trumpet" } as Marcher,
    ]);
    qc.setQueryData(allSectionAppearancesQueryOptions().queryKey, []);
    qc.setQueryData(
        marcherIdsForAllTagIdsQueryOptions().queryKey,
        new Map(tagged ? [[TAG_ID, new Set([MARCHER_ID])]] : []) as never,
    );
    qc.setQueryData(
        resolvedTagAppearancesByPageIdQueryOptions({
            pageId: PAGE_ID,
            queryClient: qc,
        }).queryKey,
        (tagged ? [TAG_APPEARANCE] : []) as never,
    );
    qc.setQueryData(fieldPropertiesQueryOptions().queryKey, {
        theme: {
            defaultMarcher: { fill: THEME_FILL, outline: "#ffffff" },
            shapeType: "circle",
        },
    } as unknown as FieldProperties);
    return qc;
};

const appearanceStack = async (qc: QueryClient) =>
    (await qc.fetchQuery(marcherAppearancesQueryOptions(PAGE_ID, qc)))[
        MARCHER_ID
    ]!;

describe("canvas marcher appearances", () => {
    it("fall back to the field theme", async () => {
        const stack = await appearanceStack(seededClient());

        expect(stack).toHaveLength(1);
        expect(stack[0]).toMatchObject({ fill_color: THEME_FILL });
    });

    it("put tag appearances above the theme", async () => {
        const stack = await appearanceStack(seededClient({ tagged: true }));

        expect(stack).toHaveLength(2);
        expect(stack[0]).toMatchObject({ fill_color: "#00ff00" });
        expect(stack[1]).toMatchObject({ fill_color: THEME_FILL });
    });
});
