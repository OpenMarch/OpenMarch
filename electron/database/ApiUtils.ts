import Beat from "../../src/global/classes/Beat";
import Measure from "../../src/global/classes/Measure";
import Page from "../../src/global/classes/Page";
import { fromDatabaseBeat, getBeats } from "./tables/BeatTable";
import Database from "better-sqlite3";
import { fromDatabaseMeasures, getMeasures } from "./tables/MeasureTable";
import { fromDatabasePages, getPages } from "./tables/PageTable";

export const GenerateTimingObjects = ({
    db,
}: {
    db: Database.Database;
}): {
    beats: Beat[];
    measures: Measure[];
    pages: Page[];
} => {
    // Generate the beats
    const databaseBeatsResponse = getBeats({ db });
    if (!databaseBeatsResponse.success) {
        console.error(databaseBeatsResponse.error);
        throw new Error("Failed to get beats from database");
    }
    const beats: Beat[] = databaseBeatsResponse.data.map(fromDatabaseBeat);

    // Generate the measures
    const databaseMeasuresResponse = getMeasures({ db });
    if (!databaseMeasuresResponse.success) {
        console.error(databaseMeasuresResponse.error);
        throw new Error("Failed to get measures from database");
    }
    const measures: Measure[] = fromDatabaseMeasures({
        databaseMeasures: databaseMeasuresResponse.data,
        allBeats: beats,
    });

    // Generate the pages
    const databasePagesResponse = getPages({ db });
    if (!databasePagesResponse.success) {
        console.error(databasePagesResponse.error);
        throw new Error("Failed to get pages from database");
    }
    const pages = fromDatabasePages({
        databasePages: databasePagesResponse.data,
        allMeasures: measures,
        allBeats: beats,
    });

    return {
        beats,
        measures,
        pages,
    };
};
