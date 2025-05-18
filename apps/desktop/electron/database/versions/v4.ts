import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import FieldProperties, {
    Checkpoint,
} from "../../../src/global/classes/FieldProperties";
import { ShapePage } from "../tables/ShapePageTable";
import * as History from "../database.history";
import v3, { scaleSvgNumbers } from "./v3";

export default class v4 extends v3 {
    get version() {
        return 4;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        this.migrationWrapper(() => {
            // check if pixelsPerStep is in FieldProperties json object
            const result = dbToUse
                .prepare(`SELECT * FROM ${Constants.FieldPropertiesTableName}`)
                .get({}) as { json_data: string };
            const jsonData = result.json_data;
            const fieldProperties = JSON.parse(jsonData) as FieldProperties;

            // Update the field properties to have the correct pixelsPerStep
            if (fieldProperties.pixelsPerStep !== undefined) {
                console.log(
                    `Updating stepsPerPixel in FieldProperties to ${fieldProperties.pixelsPerStep / 0.5}`,
                );
                let newStepSizeInches = fieldProperties.pixelsPerStep / 0.5; // 0.5 is PIXELS_PER_INCH as defined during this migration
                if (fieldProperties.pixelsPerStep === 12) {
                    // Old 8-to-5
                    newStepSizeInches = 22.5;
                } else if (fieldProperties.pixelsPerStep === 16) {
                    // Old 6-to-5
                    newStepSizeInches = 30;
                }

                // Add IDs to all of the X and Y checkpoints
                const newXCheckpoints: Checkpoint[] =
                    fieldProperties.xCheckpoints.map((checkpoint, index) => {
                        return {
                            ...checkpoint,
                            id: index,
                            visible: checkpoint.visible ?? true,
                        };
                    });
                const newYCheckpoints: Checkpoint[] =
                    fieldProperties.yCheckpoints.map((checkpoint, index) => {
                        return {
                            ...checkpoint,
                            id: index,
                            visible: checkpoint.visible ?? true,
                        };
                    });
                const newFieldProperties = new FieldProperties({
                    name: fieldProperties.name,
                    stepSizeInches: newStepSizeInches,
                    xCheckpoints: newXCheckpoints,
                    yCheckpoints: newYCheckpoints,
                    yardNumberCoordinates:
                        fieldProperties.yardNumberCoordinates,
                    useHashes: true,
                    halfLineXInterval: 4,
                    halfLineYInterval: 4,
                    isCustom: false,
                });
                const stmt = dbToUse.prepare(`
                            UPDATE ${Constants.FieldPropertiesTableName}
                            SET json_data = @json_data
                            WHERE id = 1
                        `);
                stmt.run({ json_data: JSON.stringify(newFieldProperties) });

                const multiplier =
                    newFieldProperties.pixelsPerStep /
                    fieldProperties.pixelsPerStep;
                console.log(`Scaling all coordinates by ${multiplier}x`);
                // Scale every marcherPage to to go from 10 pixels per step to 12
                dbToUse
                    .prepare(
                        `
                            UPDATE ${Constants.MarcherPageTableName}
                            SET x = x * ${multiplier},
                                y = y * ${multiplier}
                        `,
                    )
                    .run();

                // Scale every shapePage to to go from 10 pixels per step to 12
                console.log(`Scaling all shape pages by ${multiplier}x`);
                const shapePages = dbToUse
                    .prepare(
                        `SELECT id, svg_path FROM ${Constants.ShapePageTableName}`,
                    )
                    .all() as ShapePage[];

                const updateStmt = dbToUse.prepare(`
                        UPDATE ${Constants.ShapePageTableName}
                        SET svg_path = @newPath
                        WHERE id = @id
                    `);

                for (const shapePage of shapePages) {
                    const newPath = scaleSvgNumbers(
                        shapePage.svg_path,
                        multiplier,
                    );
                    updateStmt.run({
                        id: shapePage.id,
                        newPath: newPath,
                    });
                }
                History.incrementUndoGroup(dbToUse);
            }
        });
    }
}
