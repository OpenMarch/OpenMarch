/**
 * Functions to automate editing of coordinates.
 * I.e. "Snap to grid", "Evenly distribute horizontally", "Align vertically", etc.
 */

import { FieldProperties } from "@/global/classes/FieldProperties";
import { MarcherPage, ModifiedMarcherPageArgs } from "@/global/classes/MarcherPage";

/**
 * A safety check to ensure that all the marcherPages are on the same page.
 *
 * Prints a console.error if the marcherPages are not all on the same page.
 *
 * @param marcherPages The marcherPages to check if they are all on the same page.
 * @returns True if all the marcherPages are on the same page, false otherwise.
 */
export function checkMarcherPagesAreSamePage(marcherPages: MarcherPage[], printError = true): boolean {
    if (marcherPages.length === 0) return false;
    const page_id = marcherPages[0].page_id;
    const areSamePage = marcherPages.every(marcherPage => marcherPage.page_id === page_id);
    if (!areSamePage && printError) {
        console.error("MarcherPages are not all on the same page.");
    }
    return areSamePage;

}

/**
 * Creates an array of rounded coordinates of the marcherPages with the given marcher_id and page_id
 * to the nearest multiple of the denominator.
 *
 * After you call this, you will need to call MarcherPage.updateMarcherPages(changes) to apply the changes.
 *
 * Example: if the denominator is 10, the coordinates will be rounded to the nearest .1.
 * If the denominator is 4, the coordinates will be rounded to the nearest .25.
 *
 * @param marcherPages
 * @param denominator Nearest 1/n step. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step.
 * @returns
 */
export function getRoundCoordinates({ marcherPages, denominator, fieldProperties, xAxis = true, yAxis = true }:
    { marcherPages: MarcherPage[]; denominator: number; fieldProperties: FieldProperties, xAxis: boolean; yAxis: boolean; }): ModifiedMarcherPageArgs[] {

    const changes: ModifiedMarcherPageArgs[] = [];
    const stepsPerPixel = 1 / FieldProperties.getPixelsPerStep();
    const absoluteDenom = 10e2; // round to 3 decimal places to prevent floating point errors
    for (const marcherPage of marcherPages) {
        let newX = marcherPage.x;
        let newY = marcherPage.y;

        if (xAxis) {
            const xStepsFromOrigin = stepsPerPixel * (fieldProperties.centerFrontPoint.xPixels - marcherPage.x);
            const roundedXSteps = Math.round(xStepsFromOrigin * denominator) / denominator;
            newX = fieldProperties.centerFrontPoint.xPixels - (roundedXSteps / stepsPerPixel);
            newX = Math.round(newX * absoluteDenom) / absoluteDenom;
        }
        if (yAxis) {
            const yStepsFromOrigin = stepsPerPixel * (fieldProperties.centerFrontPoint.yPixels - marcherPage.y);
            const roundedYSteps = Math.round(yStepsFromOrigin * denominator) / denominator;
            newY = fieldProperties.centerFrontPoint.yPixels - (roundedYSteps / stepsPerPixel);
            newY = Math.round(newY * absoluteDenom) / absoluteDenom;
        }
        changes.push({
            marcher_id: marcherPage.marcher_id,
            page_id: marcherPage.page_id,
            // 860 pixels, 86 steps, .1 steps per pixel
            x: newX,
            y: newY
        });
    }

    return changes;
}

/**
 * Aligns the given marcherPages vertically. The new Y coordinate is the average of all the Y coordinates.
 *
 * @param marcherPages The marcherPages to align vertically.
 * @returns The changes to be made to the marcherPages to align them vertically.
 */
export function alignVertically({ marcherPages }: { marcherPages: MarcherPage[]; }): ModifiedMarcherPageArgs[] {
    const changes: ModifiedMarcherPageArgs[] = [];
    checkMarcherPagesAreSamePage(marcherPages);

    const sumY = marcherPages.reduce((sum, marcherPage) => sum + marcherPage.y, 0);
    const averageY = sumY / marcherPages.length;

    changes.push(...marcherPages.map(marcherPage => ({
        ...marcherPage,
        y: averageY
    })));

    return changes;
}

/**
 * Aligns the given marcherPages horizontally. The new X coordinate is the average of all the X coordinates.
 *
 * @param marcherPages The marcherPages to align horizontally.
 * @returns The changes to be made to the marcherPages to align them horizontally.
 */
export function alignHorizontally({ marcherPages }: { marcherPages: MarcherPage[]; }): ModifiedMarcherPageArgs[] {
    const changes: ModifiedMarcherPageArgs[] = [];
    checkMarcherPagesAreSamePage(marcherPages);

    const sumX = marcherPages.reduce((sum, marcherPage) => sum + marcherPage.x, 0);
    const averageX = sumX / marcherPages.length;

    changes.push(...marcherPages.map(marcherPage => ({
        ...marcherPage,
        x: averageX
    })));

    return changes;
}
