import { MarcherPage } from '@/global/classes/MarcherPage';
import { alignHorizontally, alignVertically, checkMarcherPagesAreSamePage, evenlyDistributeHorizontally, evenlyDistributeVertically, getRoundCoordinates } from '../CoordinateActions';
import { FieldProperties } from '@/global/classes/FieldProperties';

describe('CoordinateActions', () => {
    describe('checkMarcherPagesAreSamePage', () => {
        it('should return true if all marcherPages are on the same page', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 1, x: 153, y: 246 },
                { marcher_id: 3, page_id: 1, x: 195, y: 2 },
                { marcher_id: 4, page_id: 1, x: -4, y: -9584 },
                { marcher_id: 5, page_id: 1, x: 686, y: 783 },
                { marcher_id: 5, page_id: 1, x: 485.1, y: 884.9 },
            ] as MarcherPage[];
            expect(checkMarcherPagesAreSamePage(marcherPages)).toBeTruthy();
        });
        it('should return false if all marcherPages are not on the same page', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 100, y: 200 },
                { marcher_id: 2, page_id: 2, x: 153, y: 246 },
                { marcher_id: 3, page_id: 1, x: 195, y: 2 },
                { marcher_id: 4, page_id: 3, x: -4, y: -9584 },
                { marcher_id: 5, page_id: 1, x: 686, y: 783 },
                { marcher_id: 5, page_id: 4, x: 485.1, y: 884.9 },
            ] as MarcherPage[];
            expect(checkMarcherPagesAreSamePage(marcherPages, false)).toBeFalsy();
        });
    });
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
                    fieldProperties: fieldProperties,
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
                    fieldProperties: fieldProperties,
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
                    fieldProperties: fieldProperties,
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
                    fieldProperties: fieldProperties,
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
                    fieldProperties: fieldProperties,
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
                    fieldProperties: fieldProperties,
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
                    fieldProperties: fieldProperties,
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

    describe('alignVertically', () => {
        it('should align marcherPages vertically by average', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 100, y: 100 },
                { marcher_id: 2, page_id: 1, x: 153, y: 150 },
                { marcher_id: 3, page_id: 1, x: 195, y: 200 },
                { marcher_id: 4, page_id: 1, x: -4, y: 250 },
                { marcher_id: 5, page_id: 1, x: 686, y: 300 },
                { marcher_id: 5, page_id: 1, x: 485.1, y: 2 },
            ] as MarcherPage[];
            const expectedNewY = 167;
            const result = alignVertically({
                marcherPages,
            });
            result.forEach(marcherPage => {
                expect(marcherPage.y).toBe(expectedNewY);
            });
        });
        it('should not move marcherPages with same coordinate', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 100, y: 525 },
                { marcher_id: 2, page_id: 1, x: 153, y: 525 },
                { marcher_id: 3, page_id: 1, x: 195, y: 525 },
                { marcher_id: 4, page_id: 1, x: -4, y: 525 },
                { marcher_id: 5, page_id: 1, x: 686, y: 525 },
                { marcher_id: 5, page_id: 1, x: 485.1, y: 525 },
            ] as MarcherPage[];
            const expectedNewY = 525;
            const result = alignVertically({
                marcherPages,
            });
            result.forEach(marcherPage => {
                expect(marcherPage.y).toBe(expectedNewY);
            });
        });
    });

    describe('alignHorizontally', () => {
        it('should align marcherPages vertically by average', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 100, y: 100 },
                { marcher_id: 2, page_id: 1, x: 150, y: 153 },
                { marcher_id: 3, page_id: 1, x: 200, y: 195 },
                { marcher_id: 4, page_id: 1, x: 250, y: -4 },
                { marcher_id: 5, page_id: 1, x: 300, y: 686 },
                { marcher_id: 5, page_id: 1, x: 2, y: 485. },
            ] as MarcherPage[];
            const expectedNewX = 167;
            const result = alignHorizontally({
                marcherPages,
            });
            result.forEach(marcherPage => {
                expect(marcherPage.x).toBe(expectedNewX);
            });
        });
        it('should not move marcherPages with same coordinate', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 525, y: 100 },
                { marcher_id: 2, page_id: 1, x: 525, y: 153 },
                { marcher_id: 3, page_id: 1, x: 525, y: 195 },
                { marcher_id: 4, page_id: 1, x: 525, y: -4 },
                { marcher_id: 5, page_id: 1, x: 525, y: 686 },
                { marcher_id: 5, page_id: 1, x: 525, y: 485.1 },
            ] as MarcherPage[];
            const expectedNewX = 525;
            const result = alignHorizontally({
                marcherPages,
            });
            result.forEach(marcherPage => {
                expect(marcherPage.x).toBe(expectedNewX);
            });
        });
    });

    describe('evenlyDistributeHorizontally', () => {
        it('should distribute marcherPages evenly horizontally', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 100, y: 100 },
                { marcher_id: 2, page_id: 1, x: 123, y: 153 },
                { marcher_id: 3, page_id: 1, x: 124, y: 195 },
                { marcher_id: 4, page_id: 1, x: 145, y: -4 },
                { marcher_id: 5, page_id: 1, x: 250, y: 686 },
                { marcher_id: 6, page_id: 1, x: 0, y: 485. },
            ] as MarcherPage[];
            const expectedXs = [0, 50, 100, 150, 200, 250];
            const result = evenlyDistributeHorizontally({
                marcherPages,
            });
            console.log(result)
            result.sort((a, b) => a.x - b.x).forEach((marcherPage, index) => {
                expect(marcherPage.x).toBe(expectedXs[index]);
            });
        });
        it('should distribute marcherPages evenly even when close together', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 0, y: 100 },
                { marcher_id: 2, page_id: 1, x: 0, y: 153 },
                { marcher_id: 3, page_id: 1, x: 0, y: 195 },
                { marcher_id: 4, page_id: 1, x: 0, y: -4 },
                { marcher_id: 5, page_id: 1, x: 0, y: 686 },
                { marcher_id: 6, page_id: 1, x: 0, y: 485. },
                { marcher_id: 7, page_id: 1, x: 300, y: 485. },
            ] as MarcherPage[];
            const expectedXs = [0, 50, 100, 150, 200, 250, 300];
            const result = evenlyDistributeHorizontally({
                marcherPages,
            });
            console.log(result)
            result.sort((a, b) => a.x - b.x).forEach((marcherPage, index) => {
                expect(marcherPage.x).toBe(expectedXs[index]);
            });
        });

        it('should distribute marcherPages evenly horizontally with floating point numbers', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 4.6543, y: 100 },
                { marcher_id: 2, page_id: 1, x: 11.2, y: 153 },
                { marcher_id: 3, page_id: 1, x: 12.5, y: 195 },
                { marcher_id: 4, page_id: 1, x: 5.9, y: -4 },
                { marcher_id: 5, page_id: 1, x: 0.001, y: 686 },
                { marcher_id: 6, page_id: 1, x: 0, y: 485 },
            ] as MarcherPage[];
            const expectedXs = [0, 2.5, 5, 7.5, 10, 12.5];
            const result = evenlyDistributeHorizontally({
                marcherPages,
            });
            result.sort((a, b) => a.x - b.x).forEach((marcherPage, index) => {
                expect(marcherPage.x).toBe(expectedXs[index]);
            });
        });

        it('should distribute marcherPages evenly horizontally with negative numbers', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, x: 50, y: 100 },
                { marcher_id: 2, page_id: 1, x: -3, y: 153 },
                { marcher_id: 3, page_id: 1, x: -1, y: 195 },
                { marcher_id: 4, page_id: 1, x: -75.65, y: -4 },
                { marcher_id: 5, page_id: 1, x: -22.43, y: 686 },
                { marcher_id: 6, page_id: 1, x: -200, y: 485 },
            ] as MarcherPage[];
            const expectedXs = [-200, -150, -100, -50, 0, 50];
            const result = evenlyDistributeHorizontally({
                marcherPages,
            });
            result.sort((a, b) => a.x - b.x).forEach((marcherPage, index) => {
                expect(marcherPage.x).toBe(expectedXs[index]);
            });
        });
    });

    describe('evenlyDistributeVertically', () => {
        it('should distribute marcherPages evenly vertically', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, y: 100, x: 100 },
                { marcher_id: 2, page_id: 1, y: 123, x: 153 },
                { marcher_id: 3, page_id: 1, y: 124, x: 195 },
                { marcher_id: 4, page_id: 1, y: 145, x: -4 },
                { marcher_id: 5, page_id: 1, y: 250, x: 686 },
                { marcher_id: 6, page_id: 1, y: 0, x: 485. },
            ] as MarcherPage[];
            const expectedYs = [0, 50, 100, 150, 200, 250];
            const result = evenlyDistributeVertically({
                marcherPages,
            });
            console.log(result)
            result.sort((a, b) => a.y - b.y).forEach((marcherPage, index) => {
                expect(marcherPage.y).toBe(expectedYs[index]);
            });
        });
        it('should distribute marcherPages evenly even when close together', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, y: 0, x: 100 },
                { marcher_id: 2, page_id: 1, y: 0, x: 153 },
                { marcher_id: 3, page_id: 1, y: 0, x: 195 },
                { marcher_id: 4, page_id: 1, y: 0, x: -4 },
                { marcher_id: 5, page_id: 1, y: 0, x: 686 },
                { marcher_id: 6, page_id: 1, y: 0, x: 485. },
                { marcher_id: 7, page_id: 1, y: 300, x: 485. },
            ] as MarcherPage[];
            const expectedYs = [0, 50, 100, 150, 200, 250, 300];
            const result = evenlyDistributeVertically({
                marcherPages,
            });
            console.log(result)
            result.sort((a, b) => a.y - b.y).forEach((marcherPage, index) => {
                expect(marcherPage.y).toBe(expectedYs[index]);
            });
        });

        it('should distribute marcherPages evenly vertically with floating point numbers', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, y: 4.6543, x: 100 },
                { marcher_id: 2, page_id: 1, y: 11.2, x: 153 },
                { marcher_id: 3, page_id: 1, y: 12.5, x: 195 },
                { marcher_id: 4, page_id: 1, y: 5.9, x: -4 },
                { marcher_id: 5, page_id: 1, y: 0.001, x: 686 },
                { marcher_id: 6, page_id: 1, y: 0, x: 485 },
            ] as MarcherPage[];
            const expectedYs = [0, 2.5, 5, 7.5, 10, 12.5];
            const result = evenlyDistributeVertically({
                marcherPages,
            });
            result.sort((a, b) => a.y - b.y).forEach((marcherPage, index) => {
                expect(marcherPage.y).toBe(expectedYs[index]);
            });
        });

        it('should distribute marcherPages evenly vertically with negative numbers', () => {
            const marcherPages = [
                { marcher_id: 1, page_id: 1, y: 50, x: 100 },
                { marcher_id: 2, page_id: 1, y: -3, x: 153 },
                { marcher_id: 3, page_id: 1, y: -1, x: 195 },
                { marcher_id: 4, page_id: 1, y: -75.65, x: -4 },
                { marcher_id: 5, page_id: 1, y: -22.43, x: 686 },
                { marcher_id: 6, page_id: 1, y: -200, x: 485 },
            ] as MarcherPage[];
            const expectedYs = [-200, -150, -100, -50, 0, 50];
            const result = evenlyDistributeVertically({
                marcherPages,
            });
            result.sort((a, b) => a.y - b.y).forEach((marcherPage, index) => {
                expect(marcherPage.y).toBe(expectedYs[index]);
            });
        });

    })
});
