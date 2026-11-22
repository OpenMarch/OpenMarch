/**
 * OpenMarch: On The Move seat terms shown on the marketing site and in the docs.
 *
 * This is the only place the site states seat dates and prices. When a new season
 * opens in om-online (the source of truth for seasons), update the values here.
 * Public copy leads with the date, never with an internal season name.
 */

/** Price of one extra seat, in US dollars. */
export const SEAT_PRICE_USD = 5;

/** Free seats every ensemble receives. */
export const FREE_SEATS_PER_ENSEMBLE = 5;

/** The season open to new ensembles. */
export const CURRENT_SEASON = {
    /** Public year label, e.g. "2026–27 seats". */
    yearLabel: "2026–27",
    /** Last day seats are valid (ISO date). */
    endsOn: "2027-07-31",
} as const;

/** The season before it, which existing ensembles may still be on. */
export const PREVIOUS_SEASON = {
    endsOn: "2026-12-31",
    /** Ensembles created before this date are on the previous season (ISO date). */
    newEnsemblesFrom: "2026-10-30",
} as const;

export const SALES_EMAIL = "sales@openmarch.com";

/** Formats an ISO date ("2027-07-31") as "July 31, 2027", independent of time zone. */
export function formatSeatDate(isoDate: string): string {
    const [year, month, day] = isoDate.split("-").map(Number);
    if (!year || !month || !day) {
        throw new Error(`Invalid ISO date: ${isoDate}`);
    }
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "$5" */
export const SEAT_PRICE_LABEL = `$${SEAT_PRICE_USD}`;
/** "July 31, 2027" */
export const CURRENT_SEASON_ENDS = formatSeatDate(CURRENT_SEASON.endsOn);
/** "December 31, 2026" */
export const PREVIOUS_SEASON_ENDS = formatSeatDate(PREVIOUS_SEASON.endsOn);
/** "October 30, 2026" */
export const NEW_ENSEMBLES_FROM = formatSeatDate(
    PREVIOUS_SEASON.newEnsemblesFrom,
);
