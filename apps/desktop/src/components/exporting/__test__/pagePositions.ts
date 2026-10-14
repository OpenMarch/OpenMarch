import { faker } from "@faker-js/faker";
import type { FieldProperties } from "@openmarch/core";
import type { PagePosition } from "../utils/exportPagePositions";

/**
 * A random position on the field for every marcher on every page, as the resolver would give the
 * exports. Seeded, so the same seed gives the same positions.
 */
export function generatePagePositions({
    marchers,
    pages,
    fieldProperties,
    seed,
}: {
    marchers: readonly { id: number }[];
    pages: readonly { id: number }[];
    fieldProperties: FieldProperties;
    seed?: number;
}): PagePosition[] {
    faker.seed(seed);
    const centerFront = fieldProperties.centerFrontPoint;
    const halfWidth = fieldProperties.width / 2;
    const positions: PagePosition[] = [];
    for (const marcher of marchers)
        for (const page of pages)
            positions.push({
                marcher_id: marcher.id,
                page_id: page.id,
                x: faker.number.float({
                    min: centerFront.xPixels - halfWidth,
                    max: centerFront.xPixels + halfWidth,
                    fractionDigits: 2,
                }),
                y: faker.number.float({
                    min: 0,
                    max: centerFront.yPixels,
                    fractionDigits: 2,
                }),
            });
    faker.seed();
    return positions;
}
