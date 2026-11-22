import { describe, expect, it } from "vitest";
import {
    EXPIRY_NOTICE_DAYS,
    expiryNoticeDays,
    formatExpiryDate,
    partitionByExpiry,
} from "../ensembleExpiry";

/** An instant in UTC; the count reads the date Anywhere on Earth (UTC-12). */
const utc = (iso: string) => new Date(`${iso}Z`);

describe("expiryNoticeDays", () => {
    const active = (expires_on: string) => ({ expires_on, expired: false });

    it("is undefined more than 30 days out", () => {
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-05-30T23:00")),
        ).toBeUndefined();
    });

    it("counts down in the final 30 days", () => {
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-05-31T23:00")),
        ).toBe(EXPIRY_NOTICE_DAYS);
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-06-20T23:00")),
        ).toBe(10);
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-06-29T23:00")),
        ).toBe(1);
    });

    it("starts the notice when the day starts Anywhere on Earth", () => {
        // 30 days before June 30 is May 31, which starts at 12:00 UTC
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-05-31T11:59")),
        ).toBeUndefined();
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-05-31T12:00")),
        ).toBe(EXPIRY_NOTICE_DAYS);
    });

    it("moves to the next day at 12:00 UTC, as om-online does", () => {
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-06-20T11:59")),
        ).toBe(11);
        expect(
            expiryNoticeDays(active("2027-06-30"), utc("2027-06-20T12:00")),
        ).toBe(10);
    });

    it("is 0 for the whole last day Anywhere on Earth", () => {
        // Dec 31 AoE runs from Dec 31 12:00 UTC to Jan 1 12:00 UTC
        expect(
            expiryNoticeDays(active("2026-12-31"), utc("2026-12-31T12:00")),
        ).toBe(0);
        // Already Jan 1 east of UTC, e.g. 05:00 in Tokyo; still Dec 31 AoE
        expect(
            expiryNoticeDays(active("2026-12-31"), utc("2026-12-31T20:00")),
        ).toBe(0);
        expect(
            expiryNoticeDays(active("2026-12-31"), utc("2027-01-01T11:59")),
        ).toBe(0);
    });

    it("says 1 day, not today, while the last day hasn't started AoE", () => {
        // Dec 31 local time east of UTC, but still Dec 30 Anywhere on Earth
        expect(
            expiryNoticeDays(active("2026-12-31"), utc("2026-12-31T11:59")),
        ).toBe(1);
    });

    it("stays 0 past the boundary if the list is stale and says active", () => {
        expect(
            expiryNoticeDays(active("2026-12-31"), utc("2027-01-01T12:00")),
        ).toBe(0);
    });

    it("is undefined once the server says expired", () => {
        expect(
            expiryNoticeDays(
                { expires_on: "2026-12-31", expired: true },
                utc("2026-12-20T23:00"),
            ),
        ).toBeUndefined();
    });

    it("is undefined for a date it can't read", () => {
        expect(
            expiryNoticeDays(active("not a date"), utc("2026-12-20T23:00")),
        ).toBeUndefined();
    });

    it("counts whole days across a daylight-saving change", () => {
        // March 2027 has a DST change in most zones that observe one
        expect(
            expiryNoticeDays(active("2027-03-20"), utc("2027-03-01T23:00")),
        ).toBe(19);
    });
});

describe("formatExpiryDate", () => {
    it("formats the calendar day without shifting it", () => {
        const formatted = formatExpiryDate("2027-06-30");
        expect(formatted).toContain("2027");
        expect(formatted).toContain("30");
    });

    it("returns text it can't read unchanged", () => {
        expect(formatExpiryDate("someday")).toBe("someday");
    });
});

describe("partitionByExpiry", () => {
    it("splits by the server's flag and keeps order", () => {
        const ensembles = [
            { id: 1, expires_on: "2026-12-31", expired: true },
            { id: 2, expires_on: "2027-06-30", expired: false },
            { id: 3, expires_on: "2026-12-31", expired: true },
            { id: 4, expires_on: "2027-06-30", expired: false },
        ];
        const { active, expired } = partitionByExpiry(ensembles);
        expect(active.map((e) => e.id)).toEqual([2, 4]);
        expect(expired.map((e) => e.id)).toEqual([1, 3]);
    });
});
