import type { RgbaColor } from "@uiw/react-color";

export type { RgbaColor };

/** Represents a marcher’s colors. */
export interface MarcherColor {
    fill: RgbaColor;
    outline: RgbaColor;
    label: RgbaColor;
}

/** Represents a field theme with various colors. */
export interface FieldTheme {
    readonly primaryStroke: RgbaColor;
    readonly secondaryStroke: RgbaColor;
    readonly tertiaryStroke: RgbaColor;
    readonly background: RgbaColor;
    readonly fieldLabel: RgbaColor;
    readonly externalLabel: RgbaColor;
    readonly previousPath: RgbaColor;
    readonly nextPath: RgbaColor;
    readonly shape: RgbaColor;
    readonly tempPath: RgbaColor;
    readonly defaultMarcher: MarcherColor;
}

/** Factory function to create a FieldTheme */
export const createFieldTheme = (
    overrides: Partial<FieldTheme> = {},
): FieldTheme => ({
    primaryStroke: { r: 0, g: 0, b: 0, a: 1 },
    secondaryStroke: { r: 170, g: 170, b: 170, a: 1 },
    tertiaryStroke: { r: 221, g: 221, b: 221, a: 1 },
    background: { r: 255, g: 255, b: 255, a: 1 },
    fieldLabel: { r: 136, g: 136, b: 136, a: 1 },
    externalLabel: { r: 136, g: 136, b: 136, a: 1 },
    previousPath: { r: 0, g: 0, b: 0, a: 1 },
    nextPath: { r: 0, g: 175, b: 13, a: 1 },
    shape: { r: 126, g: 34, b: 206, a: 1 },
    tempPath: { r: 192, g: 132, b: 252, a: 1 },
    defaultMarcher: {
        fill: { r: 255, g: 0, b: 0, a: 1 },
        outline: { r: 0, g: 0, b: 0, a: 0 },
        label: { r: 0, g: 0, b: 0, a: 1 },
    },
    ...overrides,
});

export const rgbaToString = (color: RgbaColor): string => {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
};

/** Default field theme */
export const DEFAULT_FIELD_THEME = createFieldTheme();
