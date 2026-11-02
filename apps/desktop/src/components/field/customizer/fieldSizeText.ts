import type { FieldProperties } from "@openmarch/core";
import { formatLocale } from "@/utilities/formatLocale";

type Translate = (
    key: string,
    params: Record<string, string | number>,
) => string;

const twoDecimals = (value: number, language: string | undefined) =>
    value.toLocaleString(formatLocale(language), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/**
 * A field length in inches as text in the app's language: meters with a metric field, feet
 * otherwise, to two decimals. `prettyWidth`/`prettyHeight` (core) are the same in English.
 */
export function fieldLengthText(
    inches: number,
    measurementSystem: FieldProperties["measurementSystem"],
    t: Translate,
    language: string | undefined,
): string {
    return measurementSystem === "metric"
        ? t("fieldProperties.measurements.meters", {
              value: twoDecimals(inches * 0.0254, language),
          })
        : t("fieldProperties.measurements.feet", {
              value: twoDecimals(inches / 12, language),
          });
}
