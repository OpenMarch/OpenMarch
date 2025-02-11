import { fabric } from "fabric";

/** Represents a marcher’s colors. */
export interface MarcherColor {
    fill: string;
    outline: string;
    label: string;
}

/** Represents a field theme with various colors. */
export interface FieldTheme {
    readonly primaryStroke: string;
    readonly secondaryStroke: string;
    readonly tertiaryStroke: string;
    readonly background: string;
    readonly fieldLabel: string;
    readonly externalLabel: string;
    readonly previousPath: string;
    readonly nextPath: string;
    readonly shape: string;
    readonly tempPath: string;
    readonly defaultMarcher: MarcherColor;
}

/** Factory function to create a FieldTheme */
export const createFieldTheme = (
    overrides: Partial<FieldTheme> = {},
): FieldTheme => ({
    primaryStroke: "#000000",
    secondaryStroke: "#AAAAAA",
    tertiaryStroke: "#DDDDDD",
    background: "#FFFFFF",
    fieldLabel: "#888888",
    externalLabel: "#888888",
    previousPath: "#000000",
    nextPath: "rgba(0, 175, 13, 1)",
    shape: "rgba(126, 34, 206, 1)",
    tempPath: "rgba(192,132,252, 1)",
    defaultMarcher: {
        fill: "#FF0000",
        outline: "#00000000",
        label: "#000000",
    },
    ...overrides,
});

export const setAlpha = (color: string, alpha: number): string => {
    const colorObj = new fabric.Color(color);
    colorObj.setAlpha(alpha);
    return colorObj.toRgba();
};

/** Default field theme */
export const DEFAULT_FIELD_THEME = createFieldTheme();
