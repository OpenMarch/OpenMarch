import { FieldProperties } from '../FieldProperties';

describe('FieldProperties', () => {
    it('should throw an error for unsupported template', () => {
        expect(() => {
            new FieldProperties('Hockey' as FieldProperties.Template);
        }).toThrow('FieldProperties Hockey template not supported');
    });

    describe('NCAA', () => {
        let NCAAFieldProperties: FieldProperties;
        beforeEach(() => {
            NCAAFieldProperties = new FieldProperties(FieldProperties.Template.NCAA);
        });
        it('should create a valid FieldProperties object for NCAA template', () => {
            // expect(NCAAFieldProperties).toBeInstanceOf(NCAAFieldProperties);
            expect(NCAAFieldProperties.centerFrontPoint).toEqual({ xPixels: 800, yPixels: 853.3 });
            expect(NCAAFieldProperties.xCheckpoints).toHaveLength(21);
            expect(NCAAFieldProperties.yCheckpoints).toHaveLength(6);
            expect(NCAAFieldProperties.width).toBe(1600);
            expect(NCAAFieldProperties.height).toBe(853.3);
        });

        it('should create the x checkpoints for an NCAA football field', () => {
            const xCheckpoints = NCAAFieldProperties.xCheckpoints;
            expect(xCheckpoints).toHaveLength(21);
            const test50YardLine = xCheckpoints.find((checkpoint) => checkpoint.name === '50 yard line');
            expect(test50YardLine).toEqual({
                name: '50 yard line',
                terseName: '50',
                axis: 'x',
                stepsFromCenterFront: 0,
                useAsReference: true,
                fieldLabel: '50'
            });
            const test40YardLineS1 = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === -16);
            expect(test40YardLineS1).toEqual({
                name: '40 yard line',
                terseName: '40',
                axis: 'x',
                stepsFromCenterFront: -16,
                useAsReference: true,
                fieldLabel: '40'
            });
            const test40YardLineS2 = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === 16);
            expect(test40YardLineS2).toEqual({
                name: '40 yard line',
                terseName: '40',
                axis: 'x',
                stepsFromCenterFront: 16,
                useAsReference: true,
                fieldLabel: '40'
            });
            const test5YardLineS1 = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === -72);
            expect(test5YardLineS1).toEqual({
                name: '5 yard line',
                terseName: '5',
                axis: 'x',
                stepsFromCenterFront: -72,
                useAsReference: true,
                fieldLabel: undefined
            });
            const test5YardLineS2 = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === 72);
            expect(test5YardLineS2).toEqual({
                name: '5 yard line',
                terseName: '5',
                axis: 'x',
                stepsFromCenterFront: 72,
                useAsReference: true,
                fieldLabel: undefined
            });
            const test0YardLineS1 = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === -80);
            expect(test0YardLineS1).toEqual({
                name: '0 yard line',
                terseName: '0',
                axis: 'x',
                stepsFromCenterFront: -80,
                useAsReference: true,
                fieldLabel: undefined
            });
            const test0YardLineS2 = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === 80);
            expect(test0YardLineS2).toEqual({
                name: '0 yard line',
                terseName: '0',
                axis: 'x',
                stepsFromCenterFront: 80,
                useAsReference: true,
                fieldLabel: undefined
            });
            // Test all yard lines
            for (let yards = 0; yards <= 100; yards = yards += 5) {
                const curYardLine = (yards < 50) ? yards : (100 - yards);
                const stepsFromCenterFront = ((yards - 50) / 5) * 8;
                // If the yard line is a multiple of 10 and not 0, label it
                const label = (curYardLine !== 0 && curYardLine % 10 === 0) ? curYardLine.toString() : undefined;

                const testYardLine = xCheckpoints.find((checkpoint) => checkpoint.stepsFromCenterFront === stepsFromCenterFront);
                expect(testYardLine).toEqual({
                    name: `${curYardLine} yard line`,
                    axis: "x",
                    fieldStandard: undefined,
                    terseName: curYardLine.toString(),
                    stepsFromCenterFront: stepsFromCenterFront,
                    useAsReference: true,
                    fieldLabel: label
                });
            }
        });

        it('should create the y checkpoints for an NCAA football field', () => {
            const yCheckpoints = NCAAFieldProperties.yCheckpoints;
            expect(yCheckpoints).toHaveLength(6);
            const testFrontSideline = yCheckpoints.find((checkpoint) => checkpoint.name === 'front sideline');
            expect(testFrontSideline).toEqual({
                name: 'front sideline',
                terseName: 'FSL',
                axis: 'y',
                stepsFromCenterFront: 0,
                useAsReference: true
            });
            const testFrontHash = yCheckpoints.find((checkpoint) => checkpoint.name === 'front hash');
            expect(testFrontHash).toEqual({
                name: 'front hash',
                fieldStandard: 'NCAA',
                terseName: 'FH',
                axis: 'y',
                stepsFromCenterFront: -32,
                useAsReference: true
            });
            const testGridBackHash = yCheckpoints.find((checkpoint) => checkpoint.name === 'grid back hash');
            expect(testGridBackHash).toEqual({
                name: 'grid back hash',
                fieldStandard: 'NCAA',
                terseName: 'grid:BH',
                axis: 'y',
                stepsFromCenterFront: -52,
                useAsReference: true
            });
            const testRealBackHash = yCheckpoints.find((checkpoint) => checkpoint.name === 'real back hash');
            expect(testRealBackHash).toEqual({
                name: 'real back hash',
                fieldStandard: 'NCAA',
                terseName: 'real:BH',
                axis: 'y',
                stepsFromCenterFront: -53.33,
                useAsReference: false
            });
            const testGridBackSideline = yCheckpoints.find((checkpoint) => checkpoint.name === 'grid back sideline');
            expect(testGridBackSideline).toEqual({
                name: 'grid back sideline',
                fieldStandard: 'NCAA',
                terseName: 'grid:BSL',
                axis: 'y',
                stepsFromCenterFront: -84,
                useAsReference: true
            });
            const testRealBackSideline = yCheckpoints.find((checkpoint) => checkpoint.name === 'real back sideline');
            expect(testRealBackSideline).toEqual({
                name: 'real back sideline',
                fieldStandard: 'NCAA',
                terseName: 'real:BSL',
                axis: 'y',
                stepsFromCenterFront: -85.33,
                useAsReference: false
            });
        });
    });
});
