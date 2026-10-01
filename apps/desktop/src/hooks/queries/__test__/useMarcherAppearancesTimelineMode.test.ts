import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import type Marcher from "@/global/classes/Marcher";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";

/**
 * The canvas appearance query drops `marcher_pages` per-page appearance overrides in timeline
 * mode, as the exports do (docs/timeline/phases/07-page-parity.md P7.14, P7.16). Page mode keeps
 * the override at the top of the stack.
 */

const mocks = vi.hoisted(() => ({
    getSettings: vi.fn(),
}));

vi.mock("@/App", () => ({ queryClient: undefined }));
vi.mock("@/global/database/db", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    db: {},
}));
vi.mock("@/db-functions/workspaceSettings", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getWorkspaceSettingsParsed: mocks.getSettings,
}));

const {
    allMarchersQueryOptions,
    allSectionAppearancesQueryOptions,
    fieldPropertiesQueryOptions,
    marcherIdsForAllTagIdsQueryOptions,
    marcherPagesByPageQueryOptions,
    resolvedTagAppearancesByPageIdQueryOptions,
} = await import("..");
const { marcherAppearancesQueryOptions } =
    await import("../useMarcherAppearances");
const {
    updateWorkspaceSettingsMutationOptions,
    updateWorkspaceSettingsJSONMutationOptions,
} = await import("../useWorkspaceSettings");

const PAGE_ID = 7;
const MARCHER_ID = 1;
const OVERRIDE = { marcher_id: MARCHER_ID, fill_color: "#ff0000" };
const THEME_FILL = "#000000";
const TAG_ID = 5;
const TAG_APPEARANCE = {
    id: 1,
    tag_id: TAG_ID,
    priority: 1,
    fill_color: "#00ff00",
};

/**
 * Seeds every query the appearance query reads (all with an infinite stale time), including a
 * per-page override for marcher 1. Nothing reads the database: `db` is mocked to an empty object.
 */
const seededClient = ({ tagged = false } = {}) => {
    const qc = new QueryClient();
    qc.setQueryData(allMarchersQueryOptions().queryKey, [
        { id: MARCHER_ID, section: "Trumpet" } as Marcher,
    ]);
    qc.setQueryData(allSectionAppearancesQueryOptions().queryKey, []);
    qc.setQueryData(
        marcherIdsForAllTagIdsQueryOptions().queryKey,
        new Map(tagged ? [[TAG_ID, new Set([MARCHER_ID])]] : []),
    );
    qc.setQueryData(
        resolvedTagAppearancesByPageIdQueryOptions({
            pageId: PAGE_ID,
            queryClient: qc,
        }).queryKey,
        (tagged ? [TAG_APPEARANCE] : []) as never,
    );
    qc.setQueryData(marcherPagesByPageQueryOptions(PAGE_ID).queryKey, {
        [MARCHER_ID]: OVERRIDE,
    } as unknown as MarcherPagesByMarcher);
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

describe("canvas marcher appearances and the timeline flag", () => {
    beforeEach(() => {
        mocks.getSettings.mockReset();
    });

    it("page mode puts the marcher page override first, as before", async () => {
        mocks.getSettings.mockResolvedValue({});
        const stack = await appearanceStack(seededClient());

        expect(stack).toHaveLength(2);
        expect(stack[0]).toMatchObject(OVERRIDE);
        expect(stack[1]).toMatchObject({ fill_color: THEME_FILL });
    });

    it("timeline mode ignores the marcher page override", async () => {
        mocks.getSettings.mockResolvedValue({ timelineMode: true });
        const stack = await appearanceStack(seededClient());

        expect(stack).toHaveLength(1);
        expect(stack[0]).toMatchObject({ fill_color: THEME_FILL });
        expect(stack).not.toContainEqual(expect.objectContaining(OVERRIDE));
    });

    it("recomputes when the flag changes through the settings mutation", async () => {
        mocks.getSettings.mockResolvedValue({});
        const qc = seededClient();
        expect(await appearanceStack(qc)).toHaveLength(2);

        mocks.getSettings.mockResolvedValue({ timelineMode: true });
        const options = updateWorkspaceSettingsMutationOptions(qc);
        await options.onSuccess!(
            { timelineMode: true } as never,
            undefined as never,
            undefined as never,
            undefined as never,
        );

        expect(await appearanceStack(qc)).toHaveLength(1);
    });

    it("timeline mode still applies tag appearances", async () => {
        mocks.getSettings.mockResolvedValue({ timelineMode: true });
        const stack = await appearanceStack(seededClient({ tagged: true }));

        expect(stack).toHaveLength(2);
        expect(stack[0]).toMatchObject({ fill_color: "#00ff00" });
        expect(stack[1]).toMatchObject({ fill_color: THEME_FILL });
    });

    it("a failed settings read keeps page mode's appearances", async () => {
        mocks.getSettings.mockRejectedValue(new Error("settings read failed"));
        const stack = await appearanceStack(seededClient());

        expect(stack).toHaveLength(2);
        expect(stack[0]).toMatchObject(OVERRIDE);
    });

    it("recomputes when the flag changes through the JSON settings mutation", async () => {
        mocks.getSettings.mockResolvedValue({});
        const qc = seededClient();
        expect(await appearanceStack(qc)).toHaveLength(2);

        mocks.getSettings.mockResolvedValue({ timelineMode: true });
        const options = updateWorkspaceSettingsJSONMutationOptions(qc);
        await options.onSuccess!(
            '{"timelineMode":true}' as never,
            undefined as never,
            undefined as never,
            undefined as never,
        );

        expect(await appearanceStack(qc)).toHaveLength(1);
    });
});
