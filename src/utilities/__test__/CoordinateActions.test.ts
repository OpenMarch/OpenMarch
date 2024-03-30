import { MarcherPage } from '@/global/classes/MarcherPage';
import { getRoundCoordinates } from '../CoordinateActions';
import { FieldProperties } from '@/global/classes/FieldProperties';

describe('getRoundCoordinates', () => {

    const fieldProperties = {
        centerFrontPoint: { xPixels: 500, yPixels: 500 },
    } as FieldProperties;

    // ensure pixels per step is 10
    jest.spyOn(FieldProperties, 'getPixelsPerStep').mockReturnValue(10);

    describe('nearest whole step', () => {
        const marcherPages = [
            { marcher_id: 1, page_id: 1, x: 100, y: 200 },
            { marcher_id: 2, page_id: 2, x: 153, y: 246 },
            { marcher_id: 3, page_id: 3, x: 195, y: 2 },
            { marcher_id: 4, page_id: 4, x: -4, y: -9584 },
            { marcher_id: 5, page_id: 5, x: 686, y: 783 },
            { marcher_id: 5, page_id: 5, x: 485.1, y: 884.9 },
        ] as MarcherPage[];
        const denominator = 1;

        it('should round coordinates on both axes', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: true,
                yAxis: true,
            });

            expect(result).toEqual([
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 150, y: 250 },
                { marcher_id: 3, page_id: 3, x: 190, y: 0 },
                { marcher_id: 4, page_id: 4, x: 0, y: -9580 },
                { marcher_id: 5, page_id: 5, x: 690, y: 780 },
                { marcher_id: 5, page_id: 5, x: 490, y: 880 },
            ]);
        });

        it('should round coordinates on the x-axis only', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: true,
                yAxis: false,
            });

            expect(result).toEqual([
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 150, y: 246 },
                { marcher_id: 3, page_id: 3, x: 190, y: 2 },
                { marcher_id: 4, page_id: 4, x: 0, y: -9584 },
                { marcher_id: 5, page_id: 5, x: 690, y: 783 },
                { marcher_id: 5, page_id: 5, x: 490, y: 884.9 },
            ]);
        });

        it('should round coordinates on the y-axis only', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: false,
                yAxis: true,
            });

            expect(result).toEqual([
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 153, y: 250 },
                { marcher_id: 3, page_id: 3, x: 195, y: 0 },
                { marcher_id: 4, page_id: 4, x: -4, y: -9580 },
                { marcher_id: 5, page_id: 5, x: 686, y: 780 },
                { marcher_id: 5, page_id: 5, x: 485.1, y: 880 },
            ]);
        });

        it('should not round coordinates on any axis', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: false,
                yAxis: false,
            });

            expect(result).toEqual(marcherPages);
        });
    });

    describe('nearest quarter step', () => {
        const marcherPages = [
            { marcher_id: 1, page_id: 1, x: 100, y: 200 },
            { marcher_id: 2, page_id: 2, x: 152.5, y: 247.5 },
            { marcher_id: 3, page_id: 3, x: 195.43, y: 0.15 },
            { marcher_id: 4, page_id: 4, x: -4.666, y: -9582.09 },
            { marcher_id: 5, page_id: 5, x: 685.0001, y: 782.9999 },
            { marcher_id: 5, page_id: 5, x: 488.625, y: 881.125 },
        ] as MarcherPage[];
        const denominator = 4;
        it('should round coordinates to the nearest .25 on both axes', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: true,
                yAxis: true,
            });

            expect(result).toEqual([
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 152.5, y: 247.5 },
                { marcher_id: 3, page_id: 3, x: 195, y: 0 },
                { marcher_id: 4, page_id: 4, x: -5, y: -9582.5 },
                { marcher_id: 5, page_id: 5, x: 685, y: 782.5 },
                { marcher_id: 5, page_id: 5, x: 487.5, y: 880 },
            ]);
        });
    });

    describe('nearest half step', () => {
        const marcherPages = [
            { marcher_id: 1, page_id: 1, x: 100, y: 200 },
            { marcher_id: 2, page_id: 2, x: 152.5, y: 247.5 },
            { marcher_id: 3, page_id: 3, x: 195.43, y: 0.15 },
            { marcher_id: 4, page_id: 4, x: -4.666, y: -9582.09 },
            { marcher_id: 5, page_id: 5, x: 685.0001, y: 782.9999 },
            { marcher_id: 5, page_id: 5, x: 488.625, y: 881.125 },
        ] as MarcherPage[];
        const denominator = 2;
        it('should round coordinates to the nearest .5 on both axes', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: true,
                yAxis: true,
            });

            expect(result).toEqual([
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 150, y: 245 },
                { marcher_id: 3, page_id: 3, x: 195, y: 0 },
                { marcher_id: 4, page_id: 4, x: -5, y: -9580 },
                { marcher_id: 5, page_id: 5, x: 685, y: 785 },
                { marcher_id: 5, page_id: 5, x: 490, y: 880 },
            ]);
        });
    });

    describe('nearest tenth step', () => {
        const marcherPages = [
            { marcher_id: 1, page_id: 1, x: 100, y: 200 },
            { marcher_id: 2, page_id: 2, x: 152.5, y: 247.5 },
            { marcher_id: 3, page_id: 3, x: 195.43, y: 0.15 },
            { marcher_id: 4, page_id: 4, x: -4.666, y: -9582.09 },
            { marcher_id: 5, page_id: 5, x: 685.0001, y: 782.9999 },
            { marcher_id: 5, page_id: 5, x: 488.625, y: 881.125 },
        ] as MarcherPage[];
        const denominator = 10;
        it('should round coordinates to the nearest .1 on both axes', () => {
            const result = getRoundCoordinates({
                marcherPages,
                denominator,
                fieldProperites: fieldProperties,
                xAxis: true,
                yAxis: true,
            });

            expect(result).toEqual([
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 152, y: 247 },
                { marcher_id: 3, page_id: 3, x: 195, y: 0 },
                { marcher_id: 4, page_id: 4, x: -5, y: -9582 },
                { marcher_id: 5, page_id: 5, x: 685, y: 783 },
                { marcher_id: 5, page_id: 5, x: 489, y: 881 },
            ]);
        });
    });
});

