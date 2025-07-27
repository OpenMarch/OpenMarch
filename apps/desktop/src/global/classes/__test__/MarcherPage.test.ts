import { describe, it, expect, beforeEach } from "vitest";
import MarcherPage from "../MarcherPage";
import { initTestDatabase } from "../../../../electron/database/tables/__test__/testUtils";
import { NewMarcherArgs } from "../Marcher";
import * as MarcherTable from "../../../../electron/database/tables/MarcherTable";
import * as PageTable from "../../../../electron/database/tables/PageTable";
import { NewPages } from "../../../../electron/database/__test__/DatabaseMocks";
import Database from "better-sqlite3";

describe("MarcherPage", () => {
    let db: Database.Database;

    beforeEach(async () => {
        db = await initTestDatabase();
    });

    it("inserts marchers and their marcherPages when there are pages in the database", async () => {
        const pages: PageTable.NewPageArgs[] = [NewPages[0]];

        const createPagesResponse = PageTable.createPages({
            newPages: pages,
            db,
        });
        expect(createPagesResponse.success).toBe(true);

        let allMarcherPages = await MarcherPage.getMarcherPages();
        expect(allMarcherPages.length).toBe(0);

        const newMarchers: NewMarcherArgs[] = [
            {
                name: "John Doe",
                section: "Brass",
                notes: null,
                drill_prefix: "B",
                drill_order: 1,
            },
            {
                section: "Woodwind",
                drill_prefix: "W",
                drill_order: 2,
            },
        ];

        const createMarchersResponse = MarcherTable.createMarchers({
            newMarchers,
            db,
        });
        expect(createMarchersResponse.success).toBe(true);
        expect(createMarchersResponse.data.length).toBe(2);

        allMarcherPages = await MarcherPage.getMarcherPages();
        expect(allMarcherPages.length).toBe(4); // 2 marchers * 2 pages

        // Check that there is a marcherPage for every marcher and page combination
        for (const marcher of createMarchersResponse.data) {
            for (const page of createPagesResponse.data) {
                const marcherPage = allMarcherPages.find(
                    (marcherPage) =>
                        marcherPage.page_id === page.id &&
                        marcherPage.marcher_id === marcher.id,
                );
                expect(marcherPage).toBeDefined();
            }
        }
    });
});
