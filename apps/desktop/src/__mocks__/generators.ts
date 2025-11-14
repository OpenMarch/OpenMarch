import Marcher from "@/global/classes/Marcher";
import { SECTIONS } from "@/global/classes/Sections";
import { DatabaseBeat } from "@/db-functions/beat";
import { DatabaseMeasure } from "@/db-functions/measures";
import { DatabasePage } from "@/db-functions/page";
import { DatabaseMarcherPage } from "@/db-functions/marcherPage";
import { faker } from "@faker-js/faker";
import { TimingObjects } from "@/hooks";
import { FieldProperties } from "@openmarch/core";
import { calculateTimestamps, fromDatabaseBeat } from "@/global/classes/Beat";
import { fromDatabaseMeasures } from "@/global/classes/Measure";
import { fromDatabasePages } from "@/global/classes/Page";

export const generateMarchers = ({
    numberOfMarchers,
    seed,
}: {
    numberOfMarchers: number;
    seed?: number;
}): Marcher[] => {
    faker.seed(seed);

    const marchers: Marcher[] = [];

    const drillOrderMap = new Map<string, number>();
    for (const section of Object.values(SECTIONS)) {
        drillOrderMap.set(section.name, section.scoreOrder);
    }

    for (let i = 0; i < numberOfMarchers; i++) {
        const section = faker.helpers.objectValue(SECTIONS);
        const drillOrder = drillOrderMap.get(section.name)!;
        const drillNumber = section.prefix + drillOrder;
        drillOrderMap.set(section.name, drillOrder + 1);
        marchers.push({
            id: i + 1,
            name: faker.person.fullName(),
            section: section.name,
            year: faker.helpers.arrayElement([
                "Freshman",
                "Sophomore",
                "Junior",
                "Senior",
                null,
            ]) as string | null,
            notes: faker.helpers.arrayElement([
                faker.lorem.sentence(),
                null,
            ]) as string | null,
            drill_prefix: section.prefix,
            drill_order: drillOrder,
            drill_number: drillNumber,
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });
    }

    // Reset the seed
    faker.seed();

    return marchers;
};

// Helper function to generate beats
const generateBeats = (numberOfBeats: number): DatabaseBeat[] => {
    const beats: DatabaseBeat[] = [];
    const commonDurations = [0.5, 0.75, 1.0, 1.25, 1.5];

    // Always create beat 0 with duration 0
    beats.push({
        id: 0,
        duration: 0,
        position: 0,
        include_in_measure: true,
        notes: null,
        created_at: faker.date.recent().toISOString(),
        updated_at: faker.date.recent().toISOString(),
    });

    // Always create beat 1 with a random duration
    const beat1Duration = faker.helpers.arrayElement(commonDurations);
    beats.push({
        id: 1,
        duration: beat1Duration,
        position: 1,
        include_in_measure: true,
        notes: faker.helpers.arrayElement([faker.lorem.word(), null]) as
            | string
            | null,
        created_at: faker.date.recent().toISOString(),
        updated_at: faker.date.recent().toISOString(),
    });

    // Generate remaining beats starting from ID 2
    for (let i = 2; i < numberOfBeats; i++) {
        const duration = faker.helpers.arrayElement(commonDurations);
        const notes = faker.helpers.arrayElement([faker.lorem.word(), null]) as
            | string
            | null;

        beats.push({
            id: i,
            duration: duration,
            position: i,
            include_in_measure: true,
            notes: notes,
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });
    }

    return beats;
};

// Helper function to generate measures randomly placed among beats
const generateMeasures = (beats: DatabaseBeat[]): DatabaseMeasure[] => {
    const measures: DatabaseMeasure[] = [];
    const rehearsalMarks = [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "Intro",
        "Verse",
        "Chorus",
        "Bridge",
        "Outro",
        null,
    ];

    // Randomly decide how many measures to create (0 to about 1/4 of beats)
    const maxMeasures = Math.max(1, Math.floor(beats.length / 4));
    const numberOfMeasures = faker.number.int({ min: 0, max: maxMeasures });

    let currentMeasureId = 1;
    const usedBeatIds = new Set<number>();

    for (let i = 0; i < numberOfMeasures; i++) {
        // Find an available beat that hasn't been used as a measure start
        const availableBeats = beats.filter(
            (beat) => !usedBeatIds.has(beat.id),
        );

        if (availableBeats.length === 0) break;

        const startBeat = faker.helpers.arrayElement(availableBeats);
        usedBeatIds.add(startBeat.id);

        const rehearsalMark = faker.helpers.arrayElement(rehearsalMarks);
        const measureNotes = faker.helpers.arrayElement([
            faker.lorem.sentence(),
            null,
        ]) as string | null;

        measures.push({
            id: currentMeasureId,
            start_beat: startBeat.id,
            rehearsal_mark: rehearsalMark,
            notes: measureNotes,
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });

        currentMeasureId++;
    }

    return measures;
};

// Helper function to generate pages
const generatePages = (beats: DatabaseBeat[]): DatabasePage[] => {
    const pages: DatabasePage[] = [];
    const pageNotes = [
        "Intro",
        "Verse 1",
        "Chorus",
        "Bridge",
        "Verse 2",
        "Solo",
        "Break",
        "Outro",
        "Transition",
        null,
    ];

    let currentPageId = 1;
    const usedBeatIds = new Set<number>();

    // Always create a page starting on beat 0
    pages.push({
        id: currentPageId,
        is_subset: false,
        notes: "First Page",
        start_beat: 0,
    });
    usedBeatIds.add(0);
    currentPageId++;

    // Always create a page starting on beat 1
    pages.push({
        id: currentPageId,
        is_subset: faker.datatype.boolean({ probability: 0.15 }),
        notes: faker.helpers.arrayElement(pageNotes),
        start_beat: 1,
    });
    usedBeatIds.add(1);
    currentPageId++;

    // Randomly decide how many additional pages to create (0 to about 1/8 of beats)
    const maxAdditionalPages = Math.max(0, Math.floor(beats.length / 8));
    const numberOfAdditionalPages = faker.number.int({
        min: 0,
        max: maxAdditionalPages,
    });

    for (let i = 0; i < numberOfAdditionalPages; i++) {
        // Find an available beat that hasn't been used as a page start
        const availableBeats = beats.filter(
            (beat) => !usedBeatIds.has(beat.id),
        );

        if (availableBeats.length === 0) break;

        const startBeat = faker.helpers.arrayElement(availableBeats);
        usedBeatIds.add(startBeat.id);

        const isSubset = faker.datatype.boolean({ probability: 0.15 });
        const notes = faker.helpers.arrayElement(pageNotes);

        pages.push({
            id: currentPageId,
            is_subset: isSubset,
            notes: notes,
            start_beat: startBeat.id,
        });

        currentPageId++;
    }

    return pages;
};

export const generateTimingObjects = ({
    numberOfBeats = 64,
    seed,
}: {
    numberOfBeats?: number;
    seed?: number;
}): TimingObjects => {
    faker.seed(seed);

    const databaseBeats = generateBeats(numberOfBeats);
    const databaseMeasures = generateMeasures(databaseBeats);
    const databasePages = generatePages(databaseBeats);

    // Transform database objects to processed classes
    const rawBeats = databaseBeats
        .sort((a, b) => a.position - b.position)
        .map((beat, index) => fromDatabaseBeat(beat, index));
    const processedBeats = calculateTimestamps(rawBeats);
    const processedMeasures = fromDatabaseMeasures({
        databaseMeasures: databaseMeasures,
        allBeats: processedBeats,
    });
    const processedPages = fromDatabasePages({
        databasePages: databasePages,
        allMeasures: processedMeasures,
        allBeats: processedBeats,
        lastPageCounts: 0, // Default value for testing
    });

    // Reset the seed
    faker.seed();

    return {
        beats: processedBeats,
        measures: processedMeasures,
        pages: processedPages,
        utility: {
            last_page_counts: 0,
            default_beat_duration: 0.5,
            id: 1,
            updated_at: faker.date.recent().toISOString(),
        },
        fetchTimingObjects: () => {},
        isLoading: false,
        hasError: false,
    };
};

// Helper function to generate pathway data for a marcher page
const generatePathwayData = () => {
    const hasPathway = faker.datatype.boolean({ probability: 0.3 });
    if (!hasPathway) {
        return {
            pathDataId: null,
            pathStartPosition: null,
            pathEndPosition: null,
        };
    }

    const pathDataId = faker.number.int({ min: 1, max: 10 });
    const pathStartPosition = faker.number.float({
        min: 0,
        max: 1,
        fractionDigits: 3,
    });
    let pathEndPosition = faker.number.float({
        min: 0,
        max: 1,
        fractionDigits: 3,
    });

    // Ensure path_end_position is greater than path_start_position
    if (pathEndPosition <= pathStartPosition) {
        pathEndPosition = faker.number.float({
            min: Math.min(1, pathStartPosition + 0.001),
            max: 1,
            fractionDigits: 3,
        });
    }

    return {
        pathDataId,
        pathStartPosition,
        pathEndPosition,
    };
};

// Helper function to generate coordinates within bounds
const generateCoordinates = (bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}) => ({
    x: faker.number.float({
        min: bounds.minX,
        max: bounds.maxX,
        fractionDigits: 2,
    }),
    y: faker.number.float({
        min: bounds.minY,
        max: bounds.maxY,
        fractionDigits: 2,
    }),
});

// Helper function to create a single marcher page
const createMarcherPage = (
    marcher: Marcher,
    page: DatabasePage,
    bounds: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    },
    id: number,
): DatabaseMarcherPage => {
    const { x, y } = generateCoordinates(bounds);
    const { pathDataId, pathStartPosition, pathEndPosition } =
        generatePathwayData();

    const rotationDegrees = faker.number.float({
        min: 0,
        max: 360,
        fractionDigits: 1,
    });

    const notes = faker.helpers.arrayElement([faker.lorem.sentence(), null]) as
        | string
        | null;

    return {
        id,
        marcher_id: marcher.id,
        page_id: page.id,
        x,
        y,
        path_data_id: pathDataId,
        path_start_position: pathStartPosition,
        path_end_position: pathEndPosition,
        notes,
        rotation_degrees: rotationDegrees,
        created_at: faker.date.recent().toISOString(),
        updated_at: faker.date.recent().toISOString(),
    };
};

// Helper function to convert field properties to bounds
const fieldPropertiesToBounds = (fieldProperties: FieldProperties) => {
    const centerFront = fieldProperties.centerFrontPoint;
    const halfWidth = fieldProperties.width / 2;

    return {
        minX: centerFront.xPixels - halfWidth,
        maxX: centerFront.xPixels + halfWidth,
        minY: 0,
        maxY: centerFront.yPixels,
    };
};

export const generateMarcherPages = ({
    marchers,
    pages,
    fieldProperties,
    seed,
}: {
    marchers: Marcher[];
    pages: DatabasePage[];
    fieldProperties: FieldProperties;
    seed?: number;
}): DatabaseMarcherPage[] => {
    faker.seed(seed);

    const bounds = fieldPropertiesToBounds(fieldProperties);
    const marcherPages: DatabaseMarcherPage[] = [];
    let currentId = 1;

    // Create a MarcherPage for every Marcher and Page combination
    for (const marcher of marchers) {
        for (const page of pages) {
            marcherPages.push(
                createMarcherPage(marcher, page, bounds, currentId),
            );
            currentId++;
        }
    }

    // Reset the seed
    faker.seed();

    return marcherPages;
};

// Database table types for mock data (excluding history tables)
interface MockPathway {
    id: number;
    path_data: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface MockMidset {
    id: number;
    mp_id: number;
    x: number;
    y: number;
    progress_placement: number;
    path_data_id: number | null;
    path_start_position: number | null;
    path_end_position: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface MockShape {
    id: number;
    name: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface MockShapePage {
    id: number;
    shape_id: number;
    page_id: number;
    svg_path: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface MockShapePageMarcher {
    id: number;
    shape_page_id: number;
    marcher_id: number;
    position_order: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface MockSectionAppearance {
    id: number;
    section: string;
    fill_color: string;
    outline_color: string;
    shape_type: string;
    created_at: string;
    updated_at: string;
}

interface MockAudioFile {
    id: number;
    path: string;
    nickname: string | null;
    data: Uint8Array | null;
    selected: number;
    created_at: string;
    updated_at: string;
}

interface MockFieldProperties {
    id: number;
    json_data: string;
    image: Uint8Array | null;
}

interface MockUtility {
    id: number;
    last_page_counts: number;
    default_beat_duration: number;
    updated_at: string;
}

interface MockOpenMarchDatabaseResult {
    // Core timing tables
    beats: DatabaseBeat[];
    measures: DatabaseMeasure[];
    pages: DatabasePage[];

    // Marcher tables
    marchers: Marcher[];
    marcher_pages: DatabaseMarcherPage[];
    midsets: MockMidset[];

    // Pathway tables
    pathways: MockPathway[];

    // Shape tables
    shapes: MockShape[];
    shape_pages: MockShapePage[];
    shape_page_marchers: MockShapePageMarcher[];

    // Utility tables
    field_properties: MockFieldProperties[];
    audio_files: MockAudioFile[];
    section_appearances: MockSectionAppearance[];
    utility: MockUtility[];
}

// Helper functions for generating specific table data
const generateMockPathways = (numberOfPathways: number): MockPathway[] => {
    const pathways: MockPathway[] = [];
    for (let i = 1; i <= numberOfPathways; i++) {
        const hasNotes = faker.datatype.boolean({ probability: 0.3 });
        pathways.push({
            id: i,
            path_data: generateSVGPath(),
            notes: hasNotes ? faker.lorem.sentence() : null,
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });
    }
    return pathways;
};

const generateMockMidsets = (
    marcher_pages: DatabaseMarcherPage[],
    numberOfPathways: number,
    fieldProperties: FieldProperties,
): MockMidset[] => {
    const midsets: MockMidset[] = [];
    let midsetId = 1;

    for (const marcherPage of marcher_pages) {
        if (faker.datatype.boolean({ probability: 0.2 })) {
            const numberOfMidsets = faker.number.int({ min: 1, max: 3 });

            for (let i = 0; i < numberOfMidsets; i++) {
                const progressPlacement = faker.number.float({
                    min: 0.1,
                    max: 0.9,
                    fractionDigits: 3,
                });

                const hasPathway = faker.datatype.boolean({ probability: 0.4 });
                const pathwayId = hasPathway
                    ? faker.number.int({ min: 1, max: numberOfPathways })
                    : null;

                let pathStartPosition: number | null = null;
                let pathEndPosition: number | null = null;

                if (pathwayId) {
                    pathStartPosition = faker.number.float({
                        min: 0,
                        max: 0.8,
                        fractionDigits: 3,
                    });
                    pathEndPosition = faker.number.float({
                        min: pathStartPosition + 0.1,
                        max: 1,
                        fractionDigits: 3,
                    });
                }

                midsets.push({
                    id: midsetId++,
                    mp_id: marcherPage.id,
                    x: faker.number.float({
                        min: 0,
                        max: fieldProperties.width,
                        fractionDigits: 2,
                    }),
                    y: faker.number.float({
                        min: 0,
                        max: fieldProperties.height,
                        fractionDigits: 2,
                    }),
                    progress_placement: progressPlacement,
                    path_data_id: pathwayId,
                    path_start_position: pathStartPosition,
                    path_end_position: pathEndPosition,
                    notes: faker.datatype.boolean({ probability: 0.2 })
                        ? faker.lorem.sentence()
                        : null,
                    created_at: faker.date.recent().toISOString(),
                    updated_at: faker.date.recent().toISOString(),
                });
            }
        }
    }
    return midsets;
};

const generateMockShapes = (numberOfShapes: number): MockShape[] => {
    const shapes: MockShape[] = [];
    const shapeNames = [
        "Circle Formation",
        "Diamond Formation",
        "Line Formation",
        "Block Formation",
        "Arc Formation",
        "Spiral Formation",
        "Cross Formation",
        "Triangle Formation",
    ];

    for (let i = 1; i <= numberOfShapes; i++) {
        const hasName = faker.datatype.boolean({ probability: 0.8 });
        const hasNotes = faker.datatype.boolean({ probability: 0.3 });

        shapes.push({
            id: i,
            name: hasName ? shapeNames[i - 1] || faker.lorem.words(2) : null,
            notes: hasNotes ? faker.lorem.sentence() : null,
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });
    }
    return shapes;
};

const generateMockShapePages = (
    pages: DatabasePage[],
    shapes: MockShape[],
): MockShapePage[] => {
    const shape_pages: MockShapePage[] = [];
    let shapePageId = 1;

    for (const page of pages) {
        if (faker.datatype.boolean({ probability: 0.3 })) {
            const numberOfShapesOnPage = faker.number.int({ min: 1, max: 3 });
            const selectedShapes = faker.helpers.arrayElements(
                shapes,
                numberOfShapesOnPage,
            );

            for (const shape of selectedShapes) {
                const hasNotes = faker.datatype.boolean({ probability: 0.2 });

                shape_pages.push({
                    id: shapePageId++,
                    shape_id: shape.id,
                    page_id: page.id,
                    svg_path: generateSVGPath(),
                    notes: hasNotes ? faker.lorem.sentence() : null,
                    created_at: faker.date.recent().toISOString(),
                    updated_at: faker.date.recent().toISOString(),
                });
            }
        }
    }
    return shape_pages;
};

const generateMockShapePageMarchers = (
    shape_pages: MockShapePage[],
    marchers: Marcher[],
): MockShapePageMarcher[] => {
    const shape_page_marchers: MockShapePageMarcher[] = [];
    let shapePageMarcherId = 1;

    for (const shapePage of shape_pages) {
        if (faker.datatype.boolean({ probability: 0.6 })) {
            const numberOfMarchersInShape = faker.number.int({
                min: 3,
                max: 12,
            });
            const selectedMarchers = faker.helpers.arrayElements(
                marchers,
                numberOfMarchersInShape,
            );

            for (let index = 0; index < selectedMarchers.length; index++) {
                const marcher = selectedMarchers[index];
                const hasNotes = faker.datatype.boolean({ probability: 0.1 });

                shape_page_marchers.push({
                    id: shapePageMarcherId++,
                    shape_page_id: shapePage.id,
                    marcher_id: marcher.id,
                    position_order: index + 1,
                    notes: hasNotes ? faker.lorem.sentence() : null,
                    created_at: faker.date.recent().toISOString(),
                    updated_at: faker.date.recent().toISOString(),
                });
            }
        }
    }
    return shape_page_marchers;
};

const generateMockSectionAppearances = (): MockSectionAppearance[] => {
    const section_appearances: MockSectionAppearance[] = [];
    const colors = [
        "rgba(255, 0, 0, 1)", // Red
        "rgba(0, 255, 0, 1)", // Green
        "rgba(0, 0, 255, 1)", // Blue
        "rgba(255, 255, 0, 1)", // Yellow
        "rgba(255, 0, 255, 1)", // Magenta
        "rgba(0, 255, 255, 1)", // Cyan
        "rgba(255, 128, 0, 1)", // Orange
        "rgba(128, 0, 255, 1)", // Purple
    ];

    const shapeTypes = ["circle", "square", "triangle", "diamond"];

    Object.values(SECTIONS).forEach((section, index) => {
        section_appearances.push({
            id: index + 1,
            section: section.name,
            fill_color: colors[index % colors.length],
            outline_color: "rgba(0, 0, 0, 1)", // Black outline
            shape_type: faker.helpers.arrayElement(shapeTypes),
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });
    });
    return section_appearances;
};

const generateMockAudioFiles = (
    numberOfAudioFiles: number,
): MockAudioFile[] => {
    const audio_files: MockAudioFile[] = [];
    const audioFileNames = [
        "show_music.mp3",
        "drumline_audio.wav",
        "pit_audio.mp3",
        "voice_audio.wav",
        "sound_effects.mp3",
    ];

    for (let i = 1; i <= numberOfAudioFiles; i++) {
        const hasNickname = faker.datatype.boolean({ probability: 0.7 });
        const hasData = faker.datatype.boolean({ probability: 0.5 });
        const isSelected = faker.datatype.boolean({ probability: 0.2 });

        audio_files.push({
            id: i,
            path: `/audio/${audioFileNames[i - 1] || faker.system.fileName()}`,
            nickname: hasNickname ? faker.lorem.words(2) : null,
            data: hasData
                ? new Uint8Array(faker.number.int({ min: 1000, max: 10000 }))
                : null,
            selected: isSelected ? 1 : 0,
            created_at: faker.date.recent().toISOString(),
            updated_at: faker.date.recent().toISOString(),
        });
    }
    return audio_files;
};

const generateMockFieldProperties = (
    fieldProperties: FieldProperties,
): MockFieldProperties[] => {
    return [
        {
            id: 1,
            json_data: JSON.stringify(fieldProperties),
            image: faker.datatype.boolean({ probability: 0.3 })
                ? new Uint8Array(faker.number.int({ min: 5000, max: 50000 }))
                : null,
        },
    ];
};

const generateMockUtility = (): MockUtility[] => {
    return [
        {
            id: 0,
            last_page_counts: faker.number.int({ min: 4, max: 16 }),
            default_beat_duration: faker.number.float({
                min: 0.25,
                max: 1.0,
                fractionDigits: 2,
            }),
            updated_at: faker.date.recent().toISOString(),
        },
    ];
};

/**
 * Creates comprehensive mock data for the entire OpenMarch database
 * @param seed - Optional seed for reproducible random data
 * @param options - Configuration options for data generation
 * @returns Complete mock database with all tables populated
 */
export const MockOpenMarchDatabase = (
    seed?: number,
    options: {
        numberOfMarchers?: number;
        numberOfBeats?: number;
        numberOfPathways?: number;
        numberOfShapes?: number;
        numberOfAudioFiles?: number;
        fieldProperties?: FieldProperties;
    } = {},
): MockOpenMarchDatabaseResult => {
    // Set seed for reproducible results
    if (seed !== undefined) {
        faker.seed(seed);
    }

    const {
        numberOfMarchers = 50,
        numberOfBeats = 64,
        numberOfPathways = 10,
        numberOfShapes = 8,
        numberOfAudioFiles = 5,
        fieldProperties = {
            width: 160,
            height: 90,
            centerFrontPoint: { xPixels: 80, yPixels: 45 },
            hashMarkYardLines: [],
            yardLines: [],
        } as unknown as FieldProperties,
    } = options;

    // Generate core timing data
    const beats = generateBeats(numberOfBeats);
    const measures = generateMeasures(beats);
    const pages = generatePages(beats);

    // Generate marchers
    const marchers = generateMarchers({ numberOfMarchers, seed });

    // Generate pathways
    const pathways = generateMockPathways(numberOfPathways);

    // Generate marcher pages
    const marcher_pages = generateMarcherPages({
        marchers,
        pages,
        fieldProperties,
        seed,
    });

    // Generate midsets
    const midsets = generateMockMidsets(
        marcher_pages,
        numberOfPathways,
        fieldProperties,
    );

    // Generate shapes
    const shapes = generateMockShapes(numberOfShapes);

    // Generate shape pages
    const shape_pages = generateMockShapePages(pages, shapes);

    // Generate shape page marchers
    const shape_page_marchers = generateMockShapePageMarchers(
        shape_pages,
        marchers,
    );

    // Generate section appearances
    const section_appearances = generateMockSectionAppearances();

    // Generate audio files
    const audio_files = generateMockAudioFiles(numberOfAudioFiles);

    // Generate field properties (single record)
    const field_properties = generateMockFieldProperties(fieldProperties);

    // Generate utility (single record)
    const utility = generateMockUtility();

    // Reset seed
    faker.seed();

    return {
        beats,
        measures,
        pages,
        marchers,
        marcher_pages,
        midsets,
        pathways,
        shapes,
        shape_pages,
        shape_page_marchers,
        field_properties,
        audio_files,
        section_appearances,
        utility,
    };
};

// Helper function to generate realistic SVG path data
const generateSVGPath = (): string => {
    const pathTypes = [
        "M 10,10 L 50,10 L 50,50 L 10,50 Z", // Rectangle
        "M 30,10 A 20,20 0 1,1 30,50 A 20,20 0 1,1 30,10", // Circle
        "M 30,10 L 50,30 L 30,50 L 10,30 Z", // Diamond
        "M 10,10 L 50,10 L 30,50 Z", // Triangle
        "M 10,30 Q 30,10 50,30 T 90,30", // Curved line
    ];

    return faker.helpers.arrayElement(pathTypes);
};
