import { Checkpoint, FieldProperties } from "@openmarch/core/field";

const IndoorTemplates = {
    INDOOR_40x60_8to5: new FieldProperties({
        name: "Indoor 40x60 - 24-inch steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 30 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 20 }),
        stepSizeInches: 24,
        isCustom: false,
    }),
    INDOOR_50x70_8to5: new FieldProperties({
        name: "Indoor 50x70 - 24-inch steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 35 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 25 }),
        stepSizeInches: 24,
        isCustom: false,
    }),
    INDOOR_50x80_8to5: new FieldProperties({
        name: "Indoor 50x80 - 24-inch steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 40 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 25 }),
        stepSizeInches: 24,
        isCustom: false,
    }),
    INDOOR_50x90_8to5: new FieldProperties({
        name: "Indoor 50x90 - 24-inch steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 45 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 25 }),
        stepSizeInches: 24,
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
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 36 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 20 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
} as const;

export default IndoorTemplates;

/**
 * Creates an array of checkpoint objects for the x-axis of an indoor field.
 *
 * @param {number} params.xSteps - The number of steps along the x-axis.
 * @returns {Checkpoint[]} - An array of checkpoint objects for the x-axis.
 */
export function createIndoorXCheckpoints({
    xSteps,
}: {
    xSteps: number;
}): Checkpoint[] {
    if (xSteps < 4) throw new Error("xSteps must be at least 4");
    const xCheckpoints: Checkpoint[] = [];

    let curId = 0;
    // Center
    xCheckpoints.push({
        id: curId++,
        name: `5 line`,
        axis: "x",
        terseName: `5`,
        stepsFromCenterFront: 0,
        useAsReference: true,
        visible: true,
    });
    // Left edge
    xCheckpoints.push({
        id: curId++,
        name: `Left Edge`,
        axis: "x",
        terseName: `LE`,
        stepsFromCenterFront: -xSteps / 2,
        useAsReference: true,
        visible: false,
    });
    // Right edge
    xCheckpoints.push({
        id: curId++,
        name: `Right Edge`,
        axis: "x",
        terseName: `RE`,
        stepsFromCenterFront: xSteps / 2,
        useAsReference: true,
        visible: false,
    });

    let curCheckpoint = 4;
    for (let steps = -4; steps > -xSteps / 2; steps -= 4) {
        xCheckpoints.push({
            id: curId++,
            name: `${curCheckpoint} line`,
            axis: "x",
            terseName: `${curCheckpoint}`,
            stepsFromCenterFront: steps,
            useAsReference: true,
            visible: true,
        });
        curCheckpoint -= 1;
    }
    curCheckpoint = 4;
    for (let steps = 4; steps < xSteps / 2; steps += 4) {
        xCheckpoints.push({
            id: curId++,
            name: `${curCheckpoint} line`,
            axis: "x",
            terseName: `${curCheckpoint}`,
            stepsFromCenterFront: steps,
            useAsReference: true,
            visible: true,
        });
        curCheckpoint -= 1;
    }

    return xCheckpoints;
}

/**
 * Creates an array of checkpoint objects for the y-axis of an indoor field.
 *
 * @param {number} params.ySteps - The number of steps along the y-axis.
 * @returns {Checkpoint[]} - An array of checkpoint objects for the y-axis.
 */
export function createIndoorYCheckpoints({
    ySteps,
}: {
    ySteps: number;
}): Checkpoint[] {
    const stepInterval = 4;
    if (ySteps < stepInterval)
        throw new Error(`ySteps must be at least ${stepInterval}`);

    const yCheckpoints: Checkpoint[] = [];

    let curId = 0;
    if (ySteps % stepInterval !== 0) {
        // Front edge
        yCheckpoints.push({
            id: curId++,
            name: `Front edge`,
            axis: "y",
            terseName: `FE`,
            stepsFromCenterFront: 0,
            useAsReference: true,
            visible: false,
        });

        // Back edge
        yCheckpoints.push({
            id: curId++,
            name: `Back edge`,
            axis: "y",
            terseName: `BE`,
            stepsFromCenterFront: -ySteps,
            useAsReference: true,
            visible: false,
        });
    }

    let curCharCode = "A".charCodeAt(0);
    const remainder = ySteps % stepInterval;
    let curSteps = -remainder / 2;
    for (let i = 0; i <= ySteps; i += stepInterval) {
        if (Object.is(curSteps, -0)) curSteps = 0;
        yCheckpoints.push({
            id: curId++,
            name: `${String.fromCharCode(curCharCode)} line`,
            axis: "y",
            terseName: `${String.fromCharCode(curCharCode)}`,
            stepsFromCenterFront: curSteps,
            useAsReference: true,
            visible: true,
        });
        curCharCode++;
        curSteps -= stepInterval;
    }

    return yCheckpoints;
}
