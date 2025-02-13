import FieldProperties, { Checkpoint } from "../FieldProperties";

const IndoorTemplates = {
    INDOOR_40x60_8to5: new FieldProperties({
        name: "Indoor 40x60 - 8 to 5ish Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 32 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 20 }),
        stepSizeInches: 22.5,
        isCustom: false,
    }),
    INDOOR_50x70_8to5: new FieldProperties({
        name: "Indoor 50x70 - 8 to 5ish Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 36 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 28 }),
        stepSizeInches: 22.5,
        isCustom: false,
    }),
    INDOOR_50x80_8to5: new FieldProperties({
        name: "Indoor 50x80 - 8 to 5ish Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 44 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 28 }),
        stepSizeInches: 22.5,
        isCustom: false,
    }),
    INDOOR_50x90_8to5: new FieldProperties({
        name: "Indoor 50x90 - 8 to 5ish Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 48 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 28 }),
        stepSizeInches: 22.5,
        isCustom: false,
    }),
    // 6 to 5
    INDOOR_40x60_6to5: new FieldProperties({
        name: "Indoor 40x60 - 6 to 5 Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 24 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 16 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
    INDOOR_50x70_6to5: new FieldProperties({
        name: "Indoor 50x70 - 6 to 5 Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 28 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 20 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
    INDOOR_50x80_6to5: new FieldProperties({
        name: "Indoor 50x80 - 6 to 5 Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 32 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 20 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
    INDOOR_50x90_6to5: new FieldProperties({
        name: "Indoor 50x90 - 6 to 5 Steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 32 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 20 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
} as const;

export default IndoorTemplates;

/**
 * Creates an array of checkpoint objects for the x-axis of an indoor field.
 *
 * @param {Object} params - The parameters for creating the x-axis checkpoints.
 * @param {number} params.xSteps - The number of steps along the x-axis.
 * @returns {Checkpoint[]} - An array of checkpoint objects for the x-axis.
 */
export function createIndoorXCheckpoints({
    xSteps,
}: {
    xSteps: number;
}): Checkpoint[] {
    if (xSteps < 4) throw new Error("xSteps must be at least 4");
    if (xSteps % 4 !== 0)
        console.warn(
            "xSteps is not divisible by 4.This may cause weird formatting",
        );

    const xCheckpoints: Checkpoint[] = [];

    const stepInterval = 4;
    let curCharCode = "A".charCodeAt(0);
    const stageRightBoundary = (xSteps / 2) * -1;
    let curId = 0;
    xCheckpoints.push({
        name: `Line ${String.fromCharCode(curCharCode)}`,
        axis: "x",
        terseName: String.fromCharCode(curCharCode),
        stepsFromCenterFront: stageRightBoundary,
        useAsReference: true,
        visible: true,
        id: curId++,
    });
    const totalCheckpoints =
        Math.ceil(xSteps / stepInterval) +
        (xSteps % stepInterval === 0 ? 1 : 0);
    const stageLeftBoundary = xSteps / 2;

    let curSteps = stageRightBoundary + stepInterval;
    curCharCode++;
    if (totalCheckpoints > 2) {
        while (curSteps < stageLeftBoundary) {
            xCheckpoints.push({
                name: `Line ${String.fromCharCode(curCharCode)}`,
                axis: "x",
                terseName: String.fromCharCode(curCharCode),
                stepsFromCenterFront: curSteps,
                useAsReference: true,
                visible: true,
                id: curId++,
            });
            curCharCode++;
            curSteps += stepInterval;
        }
    }
    xCheckpoints.push({
        name: `Line ${String.fromCharCode(curCharCode)}`,
        axis: "x",
        terseName: String.fromCharCode(curCharCode),
        stepsFromCenterFront: stageLeftBoundary,
        useAsReference: true,
        visible: true,
        id: curId++,
    });

    return xCheckpoints;
}

/**
 * Creates an array of checkpoint objects for the y-axis of an indoor field.
 *
 * @param {Object} params - The parameters for creating the y-axis checkpoints.
 * @param {number} params.ySteps - The number of steps along the y-axis.
 * @returns {Checkpoint[]} - An array of checkpoint objects for the y-axis.
 */
export function createIndoorYCheckpoints({
    ySteps,
}: {
    ySteps: number;
}): Checkpoint[] {
    if (ySteps < 4) throw new Error("ySteps must be at least 4");
    if (ySteps % 4 !== 0)
        console.warn(
            "ySteps is not divisible by 4.This may cause weird formatting",
        );

    const yCheckpoints: Checkpoint[] = [];

    const stepInterval = 4;
    let curCheckpointName = 0;
    const frontStageSteps = 0;
    let curId = 0;
    yCheckpoints.push({
        name: `Line ${curCheckpointName.toString()}`,
        axis: "y",
        terseName: curCheckpointName.toString(),
        stepsFromCenterFront: frontStageSteps,
        useAsReference: true,
        visible: true,
        id: curId++,
    });
    const totalCheckpoints =
        Math.ceil(ySteps / stepInterval) +
        (ySteps % stepInterval === 0 ? 1 : 0);
    const backStageSteps = -ySteps;
    let curSteps = frontStageSteps - stepInterval;
    curCheckpointName++;

    if (totalCheckpoints > 2) {
        while (curSteps > backStageSteps) {
            yCheckpoints.push({
                name: `Line ${curCheckpointName.toString()}`,
                axis: "y",
                terseName: curCheckpointName.toString(),
                stepsFromCenterFront: curSteps,
                useAsReference: true,
                visible: true,
                id: curId++,
            });
            curCheckpointName++;
            curSteps -= stepInterval;
        }
    }
    yCheckpoints.push({
        name: `Line ${curCheckpointName.toString()}`,
        axis: "y",
        terseName: curCheckpointName.toString(),
        stepsFromCenterFront: backStageSteps,
        useAsReference: true,
        visible: true,
        id: curId++,
    });

    return yCheckpoints;
}
