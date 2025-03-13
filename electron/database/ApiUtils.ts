import Beat from "../../src/global/classes/Beat";
import Measure from "../../src/global/classes/Measure";
import { fromDatabaseBeat, getBeats } from "./tables/BeatTable";
import Database from "better-sqlite3";
import { fromDatabaseMeasures, getMeasures } from "./tables/MeasureTable";
import { fromDatabasePages, getPages } from "./tables/PageTable";
import { TimingObjects } from "../../src/stores/TimingObjectsStore";
import { DatabaseResponse } from "./DatabaseActions";

export const generateTimingObjects = ({
    db,
}: {
    db: Database.Database;
}): DatabaseResponse<TimingObjects> => {
    const failureObject: TimingObjects = {
        beats: [],
        measures: [],
        pages: [],
    };

    // Generate the beats
    const databaseBeatsResponse = getBeats({ db });
    if (!databaseBeatsResponse.success) {
        console.error(databaseBeatsResponse.error);
        return { ...databaseBeatsResponse, data: failureObject };
    }
    const beats: Beat[] = databaseBeatsResponse.data.map(fromDatabaseBeat);

    // Generate the measures
    const databaseMeasuresResponse = getMeasures({ db });
    if (!databaseMeasuresResponse.success) {
        console.error(databaseMeasuresResponse.error);
        return { ...databaseBeatsResponse, data: failureObject };
    }
    const measures: Measure[] = fromDatabaseMeasures({
        databaseMeasures: databaseMeasuresResponse.data,
        allBeats: beats,
    });

    // Generate the pages
    const databasePagesResponse = getPages({ db });
    if (!databasePagesResponse.success) {
        console.error(databasePagesResponse.error);
        return { ...databaseBeatsResponse, data: failureObject };
    }
    const pages = fromDatabasePages({
        databasePages: databasePagesResponse.data,
        allMeasures: measures,
        allBeats: beats,
    });

    return {
        success: true,
        data: {
            beats,
            measures,
            pages,
        },
    };
};
