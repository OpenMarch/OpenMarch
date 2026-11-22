/**
 * Ensemble expiry as the desktop shows it. om-online decides when an ensemble
 * has expired (its `expired` flag); this module only reads that flag and words
 * the date. It never recomputes expiry from `expires_on`.
 */

import { formatLocale } from "@/utilities/formatLocale";

/** The fields of an ensemble that say when its seats stop being valid. */
export type EnsembleExpiry = {
    /**
     * Last day the ensemble's seats are valid, as an ISO date ("2027-07-31").
     * Null only for an ensemble the server hasn't given a season yet; such an
     * ensemble never counts as expired.
     */
    expires_on: string | null;
    /** Set by the server once `expires_on` has ended (Anywhere on Earth). */
    expired: boolean;
};

/** How many days before expiry the "Expires in N days" notice starts. */
export const EXPIRY_NOTICE_DAYS = 30;

/** Reads an ISO date ("2027-06-30") as that calendar day in local time. */
function parseIsoDate(isoDate: string | null): Date | null {
    if (!isoDate) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * The expiry date as people read it ("June 30, 2027" in English). The date is
 * a calendar day, so it is never shifted by the viewer's time zone.
 */
export function formatExpiryDate(isoDate: string | null): string {
    const date = parseIsoDate(isoDate);
    if (!date) return isoDate ?? "";
    return date.toLocaleDateString(formatLocale(), {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

/** Anywhere on Earth (UTC-12): the last time zone where a day ends. */
const ANYWHERE_ON_EARTH_OFFSET_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** An ISO date ("2027-06-30") as UTC midnight of that day, in milliseconds. */
function isoDateToUtcDay(isoDate: string | null): number | null {
    if (!isoDate) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    if (!match) return null;
    const [, year, month, day] = match;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * Whole days left before an active ensemble expires: 0 on its last day.
 * "Today" is the date Anywhere on Earth (UTC-12), the same day om-online
 * counts from, so the desktop and the web show the same number wherever the
 * viewer is. Undefined when the ensemble has expired, the date can't be read,
 * or more than {@link EXPIRY_NOTICE_DAYS} days are left, so callers show the
 * notice only when this returns a number.
 */
export function expiryNoticeDays(
    ensemble: EnsembleExpiry,
    now: Date = new Date(),
): number | undefined {
    if (ensemble.expired) return undefined;
    const expiresOn = isoDateToUtcDay(ensemble.expires_on);
    if (expiresOn === null) return undefined;
    const aoe = new Date(now.getTime() - ANYWHERE_ON_EARTH_OFFSET_MS);
    const today = Date.UTC(
        aoe.getUTCFullYear(),
        aoe.getUTCMonth(),
        aoe.getUTCDate(),
    );
    const days = Math.round((expiresOn - today) / DAY_MS);
    if (days > EXPIRY_NOTICE_DAYS) return undefined;
    // Below 0 only when the ensembles list is stale; the server decides expiry
    return Math.max(0, days);
}

/** Splits ensembles into active and expired, keeping their order. */
export function partitionByExpiry<T extends EnsembleExpiry>(
    ensembles: readonly T[],
): { active: T[]; expired: T[] } {
    const active: T[] = [];
    const expired: T[] = [];
    for (const ensemble of ensembles) {
        (ensemble.expired ? expired : active).push(ensemble);
    }
    return { active, expired };
}
