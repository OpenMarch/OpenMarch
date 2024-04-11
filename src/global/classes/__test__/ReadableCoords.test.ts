import { FieldProperties } from '../FieldProperties';
import { ReadableCoords, X_DESCRIPTION, Y_DESCRIPTION } from '../ReadableCoords';

/**
 * @param xSteps Negative for side 1, positive for side 2
 * @param ySteps Negative for backfield, positive for in frontfield
 */
function createReadableCoords(xStepsFromCenter: number, yStepsFromCenter: number): ReadableCoords {
    // Mock field properties
    const pixelsPerStep = FieldProperties.PIXELS_PER_STEP;
    const centerFrontPoint = ReadableCoords.getFieldProperties().centerFrontPoint;
    const x = centerFrontPoint.xPixels + (xStepsFromCenter * pixelsPerStep);
    const y = centerFrontPoint.yPixels + (yStepsFromCenter * pixelsPerStep);
    return new ReadableCoords({ x, y });
}

describe('ReadableCoords', () => {
    describe('NCAA', () => {
        describe('Macro tests', () => {
            beforeAll(() => {
                ReadableCoords.setFieldProperties(new FieldProperties(FieldProperties.Template.NCAA));
            });
            describe('On the 50 yard line, on the front sideline (center front)', () => {
                let readableCoords: ReadableCoords;
                beforeAll(() => {
                    readableCoords = createReadableCoords(0, 0);
                });
                it('should parse canvas coordinates and create a ReadableCoords object', () => {
                    expect(readableCoords.xCheckpoint.name).toEqual("50 yard line");
                    expect(readableCoords.yCheckpoint.name).toEqual("front sideline");
                    expect(readableCoords.xSteps).toBe(0);
                    expect(readableCoords.ySteps).toBe(0);
                    expect(readableCoords.xDescription).toEqual(X_DESCRIPTION.ON);
                    expect(readableCoords.yDescription).toEqual(Y_DESCRIPTION.ON);
                    expect(readableCoords.roundingDenominator).toBe(100); // Default rounding denom
                });
                it('should format the ReadableCoords object toStrings', () => {
                    expect(readableCoords.toVerboseStringX()).toBe("On 50 yard line");
                    expect(readableCoords.toVerboseStringY()).toBe("On front sideline");
                    expect(readableCoords.toTerseStringX()).toBe("On 50");
                    expect(readableCoords.toTerseStringY()).toBe("On FSL");
                    expect(readableCoords.toString()).toBe(`${readableCoords.toVerboseStringX()} - ${readableCoords.toVerboseStringY()}`);

                });
            });

            describe('Inside the 35 yard line side 1, behind the front sideline', () => {
                let readableCoords: ReadableCoords;
                beforeAll(() => {
                    readableCoords = createReadableCoords(-23, -10);
                });
                it('should parse canvas coordinates and create a ReadableCoords object', () => {
                    expect(readableCoords.xCheckpoint.name).toEqual("35 yard line");
                    expect(readableCoords.xCheckpoint.stepsFromCenterFront).toBe(-24);
                    expect(readableCoords.yCheckpoint.name).toEqual("front sideline");
                    expect(readableCoords.xSteps).toBe(1);
                    expect(readableCoords.ySteps).toBe(10);
                    expect(readableCoords.xDescription).toEqual(X_DESCRIPTION.INSIDE);
                    expect(readableCoords.yDescription).toEqual(Y_DESCRIPTION.BEHIND);
                });
                it('should format the ReadableCoords object toStrings', () => {
                    expect(readableCoords.toVerboseStringX({ includeStepsString: true })).toBe("S1: 1 step inside 35 yard line");
                    expect(readableCoords.toVerboseStringY({ includeStepsString: true, includeFieldStandard: true }))
                        .toBe("10 steps behind front sideline");
                    expect(readableCoords.toTerseStringX()).toBe("S1: 1 IN 35");
                    expect(readableCoords.toTerseStringY()).toBe("10 BE FSL");
                });
            });

            describe('Outside the 10 yard line side 2, in front of the front hash', () => {
                let readableCoords: ReadableCoords;
                beforeAll(() => {
                    readableCoords = createReadableCoords(65.6, -29.23);
                });
                it('should parse canvas coordinates and create a ReadableCoords object', () => {
                    expect(readableCoords.xCheckpoint.name).toEqual("10 yard line");
                    expect(readableCoords.xCheckpoint.stepsFromCenterFront).toBe(64);
                    expect(readableCoords.yCheckpoint.name).toEqual("front hash");
                    expect(readableCoords.yCheckpoint.fieldStandard).toEqual("NCAA");
                    expect(readableCoords.xSteps).toBe(1.6);
                    expect(readableCoords.ySteps).toBe(2.77);
                    expect(readableCoords.xDescription).toEqual(X_DESCRIPTION.OUTSIDE);
                    expect(readableCoords.yDescription).toEqual(Y_DESCRIPTION.IN_FRONT_OF);
                });
                it('should format the ReadableCoords object toStrings', () => {
                    expect(readableCoords.toVerboseStringX()).toBe("S2: 1.6 outside 10 yard line");
                    expect(readableCoords.toVerboseStringY({ includeFieldStandard: true })).toBe("2.77 in front of front hash (NCAA)");
                    expect(readableCoords.toTerseStringX()).toBe("S2: 1.6 OUT 10");
                    expect(readableCoords.toTerseStringY({ includeFieldStandard: true })).toBe("2.77 FR FH (NCAA)");
                });
            });

            describe('Inside the 0 yard line side 1, behind back hash', () => {
                let readableCoords: ReadableCoords;
                beforeAll(() => {
                    readableCoords = createReadableCoords(-79.92, -52.99);
                });
                it('should parse canvas coordinates and create a ReadableCoords object', () => {
                    expect(readableCoords.xCheckpoint.name).toEqual("0 yard line");
                    expect(readableCoords.xCheckpoint.stepsFromCenterFront).toBe(-80);
                    expect(readableCoords.yCheckpoint.name).toEqual("grid back hash");
                    expect(readableCoords.yCheckpoint.fieldStandard).toEqual("NCAA");
                    expect(readableCoords.xSteps).toBe(.08);
                    expect(readableCoords.ySteps).toBe(.99);
                    expect(readableCoords.xDescription).toEqual(X_DESCRIPTION.INSIDE);
                    expect(readableCoords.yDescription).toEqual(Y_DESCRIPTION.BEHIND);
                });
                it('should format the ReadableCoords object toStrings', () => {
                    expect(readableCoords.toVerboseStringX()).toBe("S1: 0.08 inside 0 yard line");
                    expect(readableCoords.toVerboseStringY({ includeFieldStandard: true })).toBe("0.99 behind grid back hash (NCAA)");
                    expect(readableCoords.toTerseStringX()).toBe("S1: 0.08 IN 0");
                    expect(readableCoords.toTerseStringY()).toBe("0.99 BE grid:BH");
                });
            });

            describe('On 45 yard line side 2, in front of back sideline', () => {
                let readableCoords: ReadableCoords;
                beforeAll(() => {
                    readableCoords = createReadableCoords(8, -75);
                });
                it('should parse canvas coordinates and create a ReadableCoords object', () => {
                    expect(readableCoords.xCheckpoint.name).toEqual("45 yard line");
                    expect(readableCoords.xCheckpoint.stepsFromCenterFront).toBe(8);
                    expect(readableCoords.yCheckpoint.name).toEqual("grid back sideline");
                    expect(readableCoords.yCheckpoint.fieldStandard).toEqual("NCAA");
                    expect(readableCoords.xSteps).toBe(0);
                    expect(readableCoords.ySteps).toBe(10);
                    expect(readableCoords.xDescription).toEqual(X_DESCRIPTION.ON);
                    expect(readableCoords.yDescription).toEqual(Y_DESCRIPTION.IN_FRONT_OF);
                });
                it('should format the ReadableCoords object toStrings', () => {
                    expect(readableCoords.toVerboseStringX()).toBe("S2: On 45 yard line");
                    expect(readableCoords.toVerboseStringY()).toBe("10 in front of grid back sideline");
                    expect(readableCoords.toTerseStringX()).toBe("S2: On 45");
                    expect(readableCoords.toTerseStringY({ includeFieldStandard: true })).toBe("10 FR grid:BSL (NCAA)");
                });
            });
        });

        describe('Micro tests and edge cases', () => {
            beforeAll(() => {
                ReadableCoords.setFieldProperties(new FieldProperties(FieldProperties.Template.NCAA));
            });
            it('should format number string with two decimal places', () => {
                const readableCoords = createReadableCoords(.999789, -.001111);
                expect(readableCoords.xSteps).toBe(1);
                expect(readableCoords.ySteps).toBe(0);
            })

            it('should handle coordinates outside of field X-bounds', () => {
                // Side 1
                const readableCoords = createReadableCoords(200, 0);
                expect(readableCoords.xSteps).toBe(120);
                expect(readableCoords.xCheckpoint.name).toBe("0 yard line");
                expect(readableCoords.xCheckpoint.stepsFromCenterFront).toBe(80);
                expect(readableCoords.xDescription).toBe(X_DESCRIPTION.OUTSIDE);

                // Side 2
                const readableCoords2 = createReadableCoords(-152, 0);
                expect(readableCoords2.xSteps).toBe(72);
                expect(readableCoords2.xCheckpoint.name).toBe("0 yard line");
                expect(readableCoords2.xCheckpoint.stepsFromCenterFront).toBe(-80);
                expect(readableCoords2.xDescription).toBe(X_DESCRIPTION.OUTSIDE);
            });

            it('should handle coordinates outside of field Y-bounds', () => {
                // Frontfield
                const readableCoords = createReadableCoords(0, 73);
                expect(readableCoords.ySteps).toBe(73);
                expect(readableCoords.yCheckpoint.name).toBe("front sideline");
                expect(readableCoords.yCheckpoint.stepsFromCenterFront).toBe(0);
                expect(readableCoords.yDescription).toBe(Y_DESCRIPTION.IN_FRONT_OF);

                // Backfield
                const readableCoords2 = createReadableCoords(0, -200);
                expect(readableCoords2.ySteps).toBe(115);
                expect(readableCoords2.yCheckpoint.name).toBe("grid back sideline");
                expect(readableCoords2.yCheckpoint.stepsFromCenterFront).toBe(-85);
                expect(readableCoords2.yDescription).toBe(Y_DESCRIPTION.BEHIND);
            });

            it('should pick the right checkpoint when close to the transition', () => {
                let readableCoords = createReadableCoords(19.99, -16.01);
                expect(readableCoords.xCheckpoint.name).toBe("40 yard line");
                expect(readableCoords.xDescription).toBe(X_DESCRIPTION.OUTSIDE);
                expect(readableCoords.yCheckpoint.name).toBe("front hash");
                expect(readableCoords.yDescription).toBe(Y_DESCRIPTION.IN_FRONT_OF);
            })

            it('should choose the checkpoint closest to centerFront when equidistant', () => {
                let readableCoords = createReadableCoords(12, -16);
                expect(readableCoords.xCheckpoint.name).toBe("45 yard line");
                expect(readableCoords.xDescription).toBe(X_DESCRIPTION.OUTSIDE);
                expect(readableCoords.yCheckpoint.name).toBe("front sideline");
                expect(readableCoords.yDescription).toBe(Y_DESCRIPTION.BEHIND);

                readableCoords = createReadableCoords(-28, -42);
                expect(readableCoords.xCheckpoint.name).toBe("35 yard line");
                expect(readableCoords.xDescription).toBe(X_DESCRIPTION.OUTSIDE);
                expect(readableCoords.yCheckpoint.name).toBe("front hash");
                expect(readableCoords.yDescription).toBe(Y_DESCRIPTION.BEHIND);
            });
        });

    });
});
