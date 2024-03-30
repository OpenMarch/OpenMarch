/**
 * Functions to automate editing of coordinates.
 * I.e. "Snap to grid", "Evenly distribute horizontally", "Align vertically", etc.
 */

import { FieldProperties } from "@/global/classes/FieldProperties";
import { MarcherPage, ModifiedMarcherPageArgs } from "@/global/classes/MarcherPage";

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
export function getRoundCoordinates({ marcherPages, denominator, fieldProperites, xAxis = true, yAxis = true }:
    { marcherPages: MarcherPage[]; denominator: number; fieldProperites: FieldProperties, xAxis: boolean; yAxis: boolean; }): ModifiedMarcherPageArgs[] {

    const changes: ModifiedMarcherPageArgs[] = [];
    const stepsPerPixel = 1 / FieldProperties.getPixelsPerStep();
    const absoluteDenom = 10e2; // round to 3 decimal places to prevent floating point errors
    for (const marcherPage of marcherPages) {
        let newX = marcherPage.x;
        let newY = marcherPage.y;

        if (xAxis) {
            const xStepsFromOrigin = stepsPerPixel * (fieldProperites.centerFrontPoint.xPixels - marcherPage.x);
            const roundedXSteps = Math.round(xStepsFromOrigin * denominator) / denominator;
            newX = fieldProperites.centerFrontPoint.xPixels - (roundedXSteps / stepsPerPixel);
            newX = Math.round(newX * absoluteDenom) / absoluteDenom;
        }
        if (yAxis) {
            const yStepsFromOrigin = stepsPerPixel * (fieldProperites.centerFrontPoint.yPixels - marcherPage.y);
            const roundedYSteps = Math.round(yStepsFromOrigin * denominator) / denominator;
            newY = fieldProperites.centerFrontPoint.yPixels - (roundedYSteps / stepsPerPixel);
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
