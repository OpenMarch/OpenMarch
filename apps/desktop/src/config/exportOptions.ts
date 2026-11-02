import tolgee from "@/global/singletons/Tolgee";

export interface CoordinateRoundingOption {
    /** i18n key of the option's name */
    readonly labelKey: string;
    /** The option's name in the app's language, read when shown (never at import) */
    readonly label: string;
    readonly value: number;
}

const option = (labelKey: string, value: number): CoordinateRoundingOption => ({
    labelKey,
    get label() {
        return tolgee.t(labelKey);
    },
    value,
});

export const coordinateRoundingOptions: readonly CoordinateRoundingOption[] = [
    option("exportCoordinates.rounding.whole", 1),
    option("exportCoordinates.rounding.half", 2),
    option("exportCoordinates.rounding.quarter", 4),
    option("exportCoordinates.rounding.eighth", 8),
    option("exportCoordinates.rounding.tenth", 10),
];
