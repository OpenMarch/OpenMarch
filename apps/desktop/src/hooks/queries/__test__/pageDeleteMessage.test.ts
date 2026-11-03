import { beforeAll, describe, expect, test } from "vitest";
import tolgee from "@/global/singletons/Tolgee";
import { pageDeleteWithMovesMessage } from "../pageDeleteMessage";

describe("the delete-with-moves toast text", () => {
    beforeAll(async () => {
        await tolgee.run();
    });

    const page = (name: string, order: number, renamed = false) => ({
        id: order,
        name,
        order,
        renamed,
    });

    test("says where the counts went and which pages changed, by their old numbers", () => {
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["2"],
                grownPages: [{ ...page("1", 1), counts: 32 }],
                changedPages: [page("3", 3, true), page("4", 4, true)],
            }),
        ).toBe(
            "Deleted Page 2 · Page 1 is now 32 counts · old Pages 3–4 changed",
        );
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["3"],
                grownPages: [],
                changedPages: [page("2", 2), page("4", 4, true)],
            }),
        ).toBe("Deleted Page 3 · Page 2 and old Page 4 changed");
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["3"],
                grownPages: [{ ...page("2", 2), counts: 16 }],
                changedPages: [],
            }),
        ).toBe(
            "Deleted Page 3 · Page 2 is now 16 counts · No other page changed",
        );
        // After home, the next page takes the box and is renumbered
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["1"],
                grownPages: [{ ...page("2", 2, true), counts: 16 }],
                changedPages: [],
            }),
        ).toBe(
            "Deleted Page 1 · old Page 2 is now 16 counts · No other page changed",
        );
        expect(
            pageDeleteWithMovesMessage({
                deletedNames: ["2", "4"],
                grownPages: [],
                changedPages: [],
            }),
        ).toBe("Deleted Pages 2, 4 · No other page changed");
    });
});
