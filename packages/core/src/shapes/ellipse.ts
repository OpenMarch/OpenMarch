export type MarcherCoordinateShapeArgs = {
    previousPositionsByMarcherId: Map<number, { x: number; y: number }>;
    currentPositionsByMarcherId: Map<number, { x: number; y: number }>;
};

type CircleArgs = {
    centerX: number;
    centerY: number;
    radius: number;
};

export const createCircle = (args: { radius: number }) => {
    //
};
