/** Feet to meters. The reference demo works in feet; the product works in meters (ADR 0002 D-2). */
export const FT = 0.3048;

/** Converts feet to meters. */
export const ft = (feet: number): number => feet * FT;
