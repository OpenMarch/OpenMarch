import { describe, expect, it } from "vitest";
import {
    firstSqlKeyword,
    isReadOnlySql,
    isView3dSqlReadMethod,
} from "../view3dSql";

describe("firstSqlKeyword", () => {
    it("skips whitespace and comments", () => {
        expect(firstSqlKeyword("  \n\tselect 1")).toBe("SELECT");
        expect(firstSqlKeyword("-- note\nSELECT 1")).toBe("SELECT");
        expect(firstSqlKeyword("/* a */ /* b */ with x as (select 1)")).toBe(
            "WITH",
        );
    });

    it("returns an empty string when there is no keyword", () => {
        expect(firstSqlKeyword("")).toBe("");
        expect(firstSqlKeyword("   ")).toBe("");
        expect(firstSqlKeyword("-- only a comment")).toBe("");
        expect(firstSqlKeyword("/* unterminated")).toBe("");
        expect(firstSqlKeyword("(select 1)")).toBe("");
    });
});

describe("isReadOnlySql", () => {
    it.each([
        'select "id", "name" from "marchers"',
        "SELECT 1",
        "WITH t AS (SELECT 1) SELECT * FROM t",
        "  -- drizzle\n  select * from pages",
    ])("accepts %s", (sql) => {
        expect(isReadOnlySql(sql)).toBe(true);
    });

    it.each([
        'insert into "marchers" ("name") values (?)',
        'update "pages" set "notes" = ?',
        "DELETE FROM pages",
        "DROP TABLE pages",
        "PRAGMA query_only = OFF",
        "BEGIN",
        "ATTACH DATABASE 'x' AS y",
        "/* select */ delete from pages",
        "-- select\ndelete from pages",
        "selector",
        "",
    ])("rejects %s", (sql) => {
        expect(isReadOnlySql(sql)).toBe(false);
    });

    it("rejects non-strings", () => {
        expect(isReadOnlySql(undefined)).toBe(false);
        expect(isReadOnlySql(42)).toBe(false);
        expect(isReadOnlySql({ sql: "select 1" })).toBe(false);
    });
});

describe("isView3dSqlReadMethod", () => {
    it("accepts read methods and refuses run", () => {
        expect(isView3dSqlReadMethod("all")).toBe(true);
        expect(isView3dSqlReadMethod("get")).toBe(true);
        expect(isView3dSqlReadMethod("values")).toBe(true);
        expect(isView3dSqlReadMethod("run")).toBe(false);
        expect(isView3dSqlReadMethod(undefined)).toBe(false);
    });
});
