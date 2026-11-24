import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import type { MeasurementSystem } from "@openmarch/core";
import { fieldPropertiesQueryOptions } from "@/hooks/queries/useFieldProperties";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { formatLocale } from "@/utilities/formatLocale";
import {
    formatLength,
    METERS_PER_FOOT,
    parseLength,
} from "@/view3d/core/sizes/units";

/**
 * The show's units, from its field: imperial or metric. Imperial until the field loads, which is
 * also the field's default.
 */
export function useMeasurementSystem(): MeasurementSystem {
    const databaseReady = useDatabaseReady();
    const { data } = useQuery(fieldPropertiesQueryOptions(databaseReady));
    return data?.measurementSystem ?? "imperial";
}

export interface ShowLengths {
    system: MeasurementSystem;
    /** Meters as text in the show's units: `6' 11 7/8"`, or `2.13 m` (props-spec §3) */
    format: (meters: number) => string;
    /** A plain number to two decimals at most, with the app language's decimal mark */
    number: (value: number) => string;
    /**
     * Typed text back in meters, or null when it isn't a length. Takes any unit (`4'6"`,
     * `4.5 ft`, `54 in`, `1.37 m`). A bare number is in the unit the box shows: meters in a
     * metric show; in an imperial one inches when `shownMeters` is under a foot (`11 1/2"`),
     * else feet.
     */
    parse: (text: string, shownMeters: number) => number | null;
}

/**
 * Lengths of 3D things (props, models, front ensemble footprints) in the show's units. They are
 * stored in meters, as the 3D View and model files use them, and shown like the field's own
 * sizes follow its measurement system.
 */
export function useShowLengths(): ShowLengths {
    const system = useMeasurementSystem();
    const { getLanguage } = useTolgee(["language"]);
    const locale = formatLocale(getLanguage());
    const format = useCallback(
        (meters: number) => formatLength(meters, system, locale),
        [system, locale],
    );
    const number = useCallback(
        (value: number) =>
            value.toLocaleString(locale, {
                maximumFractionDigits: 2,
                useGrouping: false,
            }),
        [locale],
    );
    const decimalComma = (1.5).toLocaleString(locale).includes(",");
    const parse = useCallback(
        (text: string, shownMeters: number) =>
            parseLength(
                // In a language that writes 1,5 m, the comma is the decimal mark
                decimalComma ? text.replace(/(\d),(\d)/g, "$1.$2") : text,
                {
                    defaultUnit:
                        system === "metric"
                            ? "m"
                            : shownMeters < METERS_PER_FOOT
                              ? "in"
                              : "ft",
                },
            )?.m ?? null,
        [system, decimalComma],
    );
    return { system, format, number, parse };
}
