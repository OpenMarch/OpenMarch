export interface SvgCommand {
    readonly readableDescription: string;
    readonly command: SvgCommandEnum;
    readonly numberOfCoordinates: number;
}

export type Coordinate = {
    x: number;
    y: number;
};

export enum SvgCommandEnum {
    MOVE = "M",
    LINE = "L",
    QUADRATIC = "Q",
    CUBIC = "C",
    CLOSE = "Z",
}

export const SvgCommands: {
    [key in SvgCommandEnum]: SvgCommand;
} = {
    [SvgCommandEnum.MOVE]: {
        readableDescription: "Move",
        command: SvgCommandEnum.MOVE,
        numberOfCoordinates: 1,
    },
    [SvgCommandEnum.LINE]: {
        readableDescription: "Line",
        command: SvgCommandEnum.LINE,
        numberOfCoordinates: 1,
    },
    [SvgCommandEnum.QUADRATIC]: {
        readableDescription: "Single Curve",
        command: SvgCommandEnum.QUADRATIC,
        numberOfCoordinates: 2,
    },
    [SvgCommandEnum.CUBIC]: {
        readableDescription: "Double Curve",
        command: SvgCommandEnum.CUBIC,
        numberOfCoordinates: 6,
    },
    [SvgCommandEnum.CLOSE]: {
        readableDescription: "Close",
        command: SvgCommandEnum.CLOSE,
        numberOfCoordinates: 0,
    },
};

export const secondSegmentSvgCommands: SvgCommand[] = [
    SvgCommands[SvgCommandEnum.LINE],
    SvgCommands[SvgCommandEnum.QUADRATIC],
    SvgCommands[SvgCommandEnum.CUBIC],
];
