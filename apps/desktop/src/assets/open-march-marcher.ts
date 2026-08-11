import marcherIconSvgRaw from "./open-march-marcher.svg?raw";

export const MARCHER_ICON_VIEWBOX = "0 0 8 21";

export { marcherIconSvgRaw };

export function recolorMarcherIconSvg(color: string): string {
    return marcherIconSvgRaw.replace(/currentColor/g, color);
}
