import Marcher from "@/global/classes/Marcher";
import { createCountGrid } from "@/timeline/countGrid";
import { SECTIONS } from "@/global/classes/Sections";
import { DatabaseBeat } from "@/db-functions/beat";
import { DatabaseMeasure } from "@/db-functions/measures";
import { DatabasePage } from "@/db-functions/page";
import { faker } from "@faker-js/faker";
import { TimingObjects } from "@/hooks";
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
            home_x: 0,
            home_y: 0,
            type: "marcher",
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
        countGrid: createCountGrid({
            beats: processedBeats,
            measureStarts: processedMeasures.map((m) => m.startBeat.index),
        }),
        utility: {
            last_page_counts: 0,
            default_beat_duration: 0.5,
            id: 1,
            updated_at: faker.date.recent().toISOString(),
        },
        fetchTimingObjects: async () => {},
        isLoading: false,
        hasError: false,
    };
};
