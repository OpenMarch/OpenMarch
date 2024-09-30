import FieldProperties, {
    Checkpoint,
    YardNumberCoordinates,
} from "./FieldProperties";

const FieldPropertiesTemplates = {
    HIGH_SCHOOL_FOOTBALL_FIELD: new FieldProperties({
        name: "High school football field",
        centerFrontPoint: { xPixels: 800, yPixels: 853.3 },
        xCheckpoints: createFootballFieldXCheckpoints(),
        yCheckpoints: createHighSchoolYCheckpoints(),
        yardNumberCoordinates: getYardNumberCoordinates("non-pro"),
    }),
    COLLEGE_FOOTBALL_FIELD: new FieldProperties({
        name: "College football field",
        centerFrontPoint: { xPixels: 800, yPixels: 853.3 },
        xCheckpoints: createFootballFieldXCheckpoints(),
        yCheckpoints: createCollegeYCheckpoints(),
        yardNumberCoordinates: getYardNumberCoordinates("non-pro"),
    }),
} as const;

export default FieldPropertiesTemplates;

/******************* Football Fields  *******************/
// General
/**
 * @returns The x checkpoints for a football field (the yard lines).
 * 0 is the center of the field. To negative is side 1, to positive is side 2.
 */
function createFootballFieldXCheckpoints(): Checkpoint[] {
    const xCheckpoints: Checkpoint[] = [];

    for (let yards = 0; yards <= 100; yards = yards += 5) {
        const curYardLine = yards < 50 ? yards : 100 - yards;
        const stepsFromCenterFront = ((yards - 50) / 5) * 8;
        // If the yard line is a multiple of 10 and not 0, label it
        const label =
            curYardLine !== 0 && curYardLine % 10 === 0
                ? curYardLine.toString()
                : undefined;

        xCheckpoints.push({
            name: `${curYardLine} yard line`,
            axis: "x",
            terseName: curYardLine.toString(),
            stepsFromCenterFront: stepsFromCenterFront,
            useAsReference: true,
            fieldLabel: label,
        });
    }
    return xCheckpoints;
}

/**
 * Get the coordinates for the yard numbers on a field.
 *
 * @param footballFieldType The type of football field. High school and college have the same yard number coordinates
 *                          while pro does not. So, the only distinction is between pro and non-pro.
 * @returns The coordinates for the yard numbers
 */
function getYardNumberCoordinates(
    footballFieldType: "pro" | "non-pro"
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
        default:
            throw new Error(
                `football field ${footballFieldType} template not supported`
            );
    }
}

// High School
/**
 * @returns The y checkpoints for a high school football field.
 * 0 is the front sideline. To negative is the back sideline.
 */
function createHighSchoolYCheckpoints(): Checkpoint[] {
    const frontSideline: Checkpoint = {
        name: "front sideline",
        axis: "y",
        stepsFromCenterFront: 0,
        useAsReference: true,
        terseName: "FSL",
        visible: false,
    };
    const frontHash: Checkpoint = {
        name: "HS front hash",
        axis: "y",
        // NOTE - the actual amount of steps from the front sideline to the front hash is 28.44
        // It's fairly standard to just call it 28 steps
        stepsFromCenterFront: -28,
        useAsReference: true,
        terseName: "FH",
    };
    const backHash: Checkpoint = {
        name: "HS back hash",
        axis: "y",
        // NOTE - the actual amount of steps from the front sideline to the back hash is 56.88
        stepsFromCenterFront: -56,
        useAsReference: true,
        terseName: "BH",
    };
    const gridBackSideline: Checkpoint = {
        name: "grid back sideline",
        axis: "y",
        stepsFromCenterFront: -85,
        useAsReference: true,
        terseName: "grid:BSL",
        visible: false,
    };
    const realBackSideline: Checkpoint = {
        name: "real back sideline",
        axis: "y",
        stepsFromCenterFront: -85.33,
        useAsReference: false,
        terseName: "real:BSL",
        visible: false,
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
function createCollegeYCheckpoints(): Checkpoint[] {
    const frontSideline: Checkpoint = {
        name: "front sideline",
        axis: "y",
        stepsFromCenterFront: 0,
        useAsReference: true,
        terseName: "FSL",
        visible: false,
    };
    const frontHash: Checkpoint = {
        name: "NCAA front hash",
        axis: "y",
        stepsFromCenterFront: -32,
        useAsReference: true,
        terseName: "FH",
    };
    const gridBackHash: Checkpoint = {
        name: "grid NCAA back hash",
        axis: "y",
        stepsFromCenterFront: -52,
        useAsReference: true,
        terseName: "grid:BH",
    };
    const realBackHash: Checkpoint = {
        name: "real NCAA back hash",
        axis: "y",
        stepsFromCenterFront: -53.33,
        useAsReference: false,
        terseName: "real:BH",
    };
    const gridBackSideline: Checkpoint = {
        name: "grid back sideline",
        axis: "y",
        stepsFromCenterFront: -85,
        useAsReference: true,
        terseName: "grid:BSL",
        visible: false,
    };
    const realBackSideline: Checkpoint = {
        name: "real back sideline",
        axis: "y",
        stepsFromCenterFront: -85.33,
        useAsReference: false,
        terseName: "real:BSL",
        visible: false,
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
