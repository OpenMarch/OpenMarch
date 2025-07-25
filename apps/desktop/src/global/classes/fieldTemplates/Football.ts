import {
    FieldProperties,
    Checkpoint,
    YardNumberCoordinates,
} from "@openmarch/core/field";

const FootballTemplates = {
    HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES: new FieldProperties({
        name: "High school football field (no end zones)",
        xCheckpoints: createFootballFieldXCheckpointsWithoutEndZones(),
        yCheckpoints: createHighSchoolFootballYCheckpoints(),
        yardNumberCoordinates: getFootballYardNumberCoordinates("non-pro"),
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    }),
    COLLEGE_FOOTBALL_FIELD_NO_END_ZONES: new FieldProperties({
        name: "College football field (no end zones)",
        xCheckpoints: createFootballFieldXCheckpointsWithoutEndZones(),
        yCheckpoints: createCollegeFootballYCheckpoints(),
        yardNumberCoordinates: getFootballYardNumberCoordinates("non-pro"),
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    }),
    PRO_FOOTBALL_FIELD_NO_END_ZONES: new FieldProperties({
        name: "Pro football field (no end zones)",
        xCheckpoints: createFootballFieldXCheckpointsWithoutEndZones(),
        yCheckpoints: createProFootballYCheckpoints(),
        yardNumberCoordinates: getFootballYardNumberCoordinates("pro"),
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    }),
    HIGH_SCHOOL_FOOTBALL_FIELD_WITH_END_ZONES: new FieldProperties({
        name: "High school football field (with end zones)",
        xCheckpoints: createFootballFieldXCheckpointsWithEndZones(),
        yCheckpoints: createHighSchoolFootballYCheckpoints(),
        yardNumberCoordinates: getFootballYardNumberCoordinates("non-pro"),
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    }),
    COLLEGE_FOOTBALL_FIELD_WITH_END_ZONES: new FieldProperties({
        name: "College football field (with end zones)",
        xCheckpoints: createFootballFieldXCheckpointsWithEndZones(),
        yCheckpoints: createCollegeFootballYCheckpoints(),
        yardNumberCoordinates: getFootballYardNumberCoordinates("non-pro"),
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    }),
    PRO_FOOTBALL_FIELD_WITH_END_ZONES: new FieldProperties({
        name: "Pro football field (with end zones)",
        xCheckpoints: createFootballFieldXCheckpointsWithEndZones(),
        yCheckpoints: createProFootballYCheckpoints(),
        yardNumberCoordinates: getFootballYardNumberCoordinates("pro"),
        stepSizeInches: 22.5,
        halfLineXInterval: 4,
        halfLineYInterval: 4,
        useHashes: true,
        isCustom: false,
    }),
} as const;

export default FootballTemplates;

/******************* Football Fields  *******************/
// General
/**
 * @returns The x checkpoints for a football field (the yard lines).
 * 0 is the center of the field. To negative is side 1, to positive is side 2.
 */
function createFootballFieldXCheckpointsWithoutEndZones(): Checkpoint[] {
    const xCheckpoints: Checkpoint[] = [];

    let curId = 0;
    for (let yards = 0; yards <= 100; yards = yards += 5) {
        const curYardLine = yards < 50 ? yards : 100 - yards;
        const stepsFromCenterFront = ((yards - 50) / 5) * 8;
        // If the yard line is a multiple of 10 and not 0, label it
        const label =
            curYardLine !== 0 && curYardLine % 10 === 0
                ? curYardLine.toString()
                : undefined;

        xCheckpoints.push({
            id: curId++,
            name: `${curYardLine} yard line`,
            axis: "x",
            terseName: `${curYardLine.toString()}`,
            stepsFromCenterFront: stepsFromCenterFront,
            useAsReference: true,
            visible: true,
            fieldLabel: label,
        });
    }
    return xCheckpoints;
}

function createFootballFieldXCheckpointsWithEndZones(): Checkpoint[] {
    const xCheckpoints = createFootballFieldXCheckpointsWithoutEndZones();
    let maxId = Math.max(...xCheckpoints.map((cp) => cp.id)) + 1;
    xCheckpoints.push(
        {
            name: "end zone",
            axis: "x",
            stepsFromCenterFront: -96,
            useAsReference: true,
            terseName: "EZ",
            visible: true,
            id: maxId++,
        },
        {
            name: "end zone",
            axis: "x",
            stepsFromCenterFront: 96,
            useAsReference: true,
            terseName: "EZ",
            visible: true,
            id: maxId++,
        },
    );

    return xCheckpoints;
}

/**
 * Get the coordinates for the yard numbers on a field.
 *
 * @param footballFieldType The type of football field. High school and college have the same yard number coordinates
 *                          while pro does not. So, the only distinction is between pro and non-pro.
 * @returns The coordinates for the yard numbers
 */
function getFootballYardNumberCoordinates(
    footballFieldType: "pro" | "non-pro",
): YardNumberCoordinates {
    switch (footballFieldType) {
        case "non-pro": {
            let coordinates: YardNumberCoordinates = {
                homeStepsFromFrontToOutside: 11.2,
                homeStepsFromFrontToInside: 14.4,
                awayStepsFromFrontToInside: 70.9333,
                awayStepsFromFrontToOutside: 74.1333,
            };
            return coordinates;
        }
        case "pro": {
            let coordinates: YardNumberCoordinates = {
                homeStepsFromFrontToOutside: 19.2,
                homeStepsFromFrontToInside: 22.4,
                awayStepsFromFrontToInside: 62.93,
                awayStepsFromFrontToOutside: 66.13,
            };
            return coordinates;
        }
        default:
            throw new Error(
                `football field ${footballFieldType} template not supported`,
            );
    }
}

// High School
/**
 * @returns The y checkpoints for a high school football field.
 * 0 is the front sideline. To negative is the back sideline.
 */
function createHighSchoolFootballYCheckpoints(): Checkpoint[] {
    let curId = 0;
    const frontSideline: Checkpoint = {
        name: "front sideline",
        axis: "y",
        stepsFromCenterFront: 0,
        useAsReference: true,
        terseName: "FSL",
        visible: false,
        id: curId++,
    };
    const frontHash: Checkpoint = {
        name: "HS front hash",
        axis: "y",
        // NOTE - the actual amount of steps from the front sideline to the front hash is 28.44
        // It's fairly standard to just call it 28 steps
        stepsFromCenterFront: -28,
        useAsReference: true,
        terseName: "FH",
        visible: true,
        id: curId++,
    };
    const backHash: Checkpoint = {
        name: "HS back hash",
        axis: "y",
        // NOTE - the actual amount of steps from the front sideline to the back hash is 56.88
        stepsFromCenterFront: -56,
        useAsReference: true,
        terseName: "BH",
        visible: true,
        id: curId++,
    };
    const gridBackSideline: Checkpoint = {
        name: "grid back sideline",
        axis: "y",
        stepsFromCenterFront: -85,
        useAsReference: true,
        terseName: "grid:BSL",
        visible: false,
        id: curId++,
    };
    const realBackSideline: Checkpoint = {
        name: "real back sideline",
        axis: "y",
        stepsFromCenterFront: -85.33,
        useAsReference: false,
        terseName: "real:BSL",
        visible: false,
        id: curId++,
    };
    return [
        frontSideline,
        frontHash,
        backHash,
        gridBackSideline,
        realBackSideline,
    ];
}

// College
/**
 * @returns The y checkpoints for a college football field.
 * 0 is the front sideline. To negative is the back sideline (that is how it is in Fabric.js).
 */
function createCollegeFootballYCheckpoints(): Checkpoint[] {
    let curId = 0;
    const frontSideline: Checkpoint = {
        name: "front sideline",
        axis: "y",
        stepsFromCenterFront: 0,
        useAsReference: true,
        terseName: "FSL",
        visible: false,
        id: curId++,
    };
    const frontHash: Checkpoint = {
        name: "NCAA front hash",
        axis: "y",
        stepsFromCenterFront: -32,
        useAsReference: true,
        terseName: "FH",
        visible: true,
        id: curId++,
    };
    const gridBackHash: Checkpoint = {
        name: "grid NCAA back hash",
        axis: "y",
        stepsFromCenterFront: -52,
        useAsReference: true,
        terseName: "grid:BH",
        visible: true,
        id: curId++,
    };
    const realBackHash: Checkpoint = {
        name: "real NCAA back hash",
        axis: "y",
        stepsFromCenterFront: -53.33,
        useAsReference: false,
        terseName: "real:BH",
        visible: true,
        id: curId++,
    };
    const gridBackSideline: Checkpoint = {
        name: "grid back sideline",
        axis: "y",
        stepsFromCenterFront: -85,
        useAsReference: true,
        terseName: "grid:BSL",
        visible: false,
        id: curId++,
    };
    const realBackSideline: Checkpoint = {
        name: "real back sideline",
        axis: "y",
        stepsFromCenterFront: -85.33,
        useAsReference: false,
        terseName: "real:BSL",
        visible: false,
        id: curId++,
    };
    return [
        frontSideline,
        frontHash,
        gridBackHash,
        realBackHash,
        gridBackSideline,
        realBackSideline,
    ];
}

// Pro

/**
 * @returns The y checkpoints for a pro football field.
 * 0 is the front sideline. To negative is the back sideline (that is how it is in Fabric.js).
 */
function createProFootballYCheckpoints(): Checkpoint[] {
    let curId = 0;
    const frontSideline: Checkpoint = {
        name: "front sideline",
        axis: "y",
        stepsFromCenterFront: 0,
        useAsReference: true,
        terseName: "FSL",
        visible: false,
        id: curId++,
    };
    const frontHash: Checkpoint = {
        name: "NFL front hash",
        axis: "y",
        stepsFromCenterFront: -38, // note, it's actually 37.733 steps
        useAsReference: true,
        terseName: "FH",
        visible: true,
        id: curId++,
    };
    const gridBackHash: Checkpoint = {
        name: "NFL back hash",
        axis: "y",
        stepsFromCenterFront: -48, // note, it's actually 47.6 steps
        useAsReference: true,
        terseName: "BH",
        visible: true,
        id: curId++,
    };
    const gridBackSideline: Checkpoint = {
        name: "grid back sideline",
        axis: "y",
        stepsFromCenterFront: -85,
        useAsReference: true,
        terseName: "grid:BSL",
        visible: false,
        id: curId++,
    };
    const realBackSideline: Checkpoint = {
        name: "real back sideline",
        axis: "y",
        stepsFromCenterFront: -85.33,
        useAsReference: false,
        terseName: "real:BSL",
        visible: false,
        id: curId++,
    };
    return [
        frontSideline,
        frontHash,
        gridBackHash,
        gridBackSideline,
        realBackSideline,
    ];
}
