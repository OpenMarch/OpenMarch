import Constants from "../../../src/global/Constants";
import Database from "better-sqlite3";
import v2 from "./v2";
import FieldProperties from "../../../src/global/classes/FieldProperties";
import { ShapePage } from "../tables/ShapePageTable";
import * as History from "../database.history";

export function scaleSvgNumbers(svgString: string, multiplier: number): string {
    return svgString.replace(/[-+]?[0-9]*\.?[0-9]+/g, (match) => {
        const num = parseFloat(match);
        return (num * multiplier).toString();
    });
}

export default class v3 extends v2 {
    get version() {
        return 3;
    }

    migrateToThisVersion(db?: Database.Database): void {
        const dbToUse = db ? db : this.databaseConnector();
        if (!dbToUse) throw new Error("Failed to connect to database.");

        if (!this.isThisVersion(dbToUse)) {
            this.migrationWrapper(super.version, () => {
                console.log("Migrating database to newer version...");
                // check if pixelsPerStep is in FieldProperties json object
                const result = dbToUse
                    .prepare(
                        `SELECT * FROM ${Constants.FieldPropertiesTableName}`,
                    )
                    .get({}) as { json_data: string };
                const jsonData = result.json_data;
                const fieldProperties = JSON.parse(jsonData) as FieldProperties;

                // Update the field properties to have the correct pixelsPerStep
                if (fieldProperties.pixelsPerStep === undefined) {
                    console.log(
                        "Updating pixelsPerStep in FieldProperties to 12 from 10",
                    );
                    const newFieldProperties = new FieldProperties({
                        name: fieldProperties.name,
                        pixelsPerStep: 12,
                        xCheckpoints: fieldProperties.xCheckpoints,
                        yCheckpoints: fieldProperties.yCheckpoints,
                        yardNumberCoordinates:
                            fieldProperties.yardNumberCoordinates,
                    });
                    const stmt = dbToUse.prepare(`
                            UPDATE ${Constants.FieldPropertiesTableName}
                            SET json_data = @json_data
                            WHERE id = 1
                        `);
                    stmt.run({ json_data: JSON.stringify(newFieldProperties) });

                    console.log("Scaling all coordinates by 1.2x");
                    // Scale every marcherPage to to go from 10 pixels per step to 12
                    dbToUse
                        .prepare(
                            `
                            UPDATE ${Constants.MarcherPageTableName}
                            SET x = x * 1.2,
                                y = y * 1.2
                        `,
                        )
                        .run();

                    // Scale every shapePage to to go from 10 pixels per step to 12
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
                            1.2,
                        );
                        updateStmt.run({
                            id: shapePage.id,
                            newPath: newPath,
                        });
                    }
                    History.incrementUndoGroup(dbToUse);
                }
            });
        } else {
            console.log("Database version is up-to-date. Not migrating");
        }
    }

    createTables() {
        super.createTables();
    }
}
