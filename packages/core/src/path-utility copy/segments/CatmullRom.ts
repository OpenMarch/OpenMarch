export type IPoint = {
    x: number;
    y: number;
};

export type Curve = [p0: IPoint, p1: IPoint, p2: IPoint, p3: IPoint];

/**
 * Interpolates a Catmull-Rom Spline through a series of x/y points
 * Converts the CR Spline to Cubic Beziers for use with SVG items
 *
 * If 'alpha' is 0.0 then the 'Uniform' varian is used
 * If 'alpha' is 0.5 then the 'Centripetal' variant is used
 * If 'alpha' is 1 then the 'Chordal' variant is used
 *
 *
 * Based on http://www.cemyuksel.com/research/catmullrom_param/catmullrom.pdf
 *
 */
/**
 * When alpha is 0, use uniform parameterization (d = 1 for all segments).
 */
export const catmullrom = (data: IPoint[], alpha: number): Curve[] => {
    const result: Curve[] = [];
    if (data.length < 2) return result;

    let lastStartPoint: IPoint = { ...data[0]! };

    const length = data.length;
    const alpha2 = alpha * 2;

    for (let i = 0; i < length - 1; i++) {
        const p0: IPoint = i === 0 ? data[0]! : data[i - 1]!;
        const p1: IPoint = data[i]!;
        const p2: IPoint = data[i + 1]!;
        const p3: IPoint = i + 2 < length ? data[i + 2]! : p2;

        // C-R knots are defined as
        // t_{i+1} = | P_{i+1} - P_{i} | ^ alpha + t_{i} where alpha ∈ [0,1], t_{0} = 0
        // alpha -> 𝛂

        // now lest use parameter values as
        // d_{i+1} = | P_{i+1} - P_{i} |  where d_{0} = 0
        // When alpha is 0 (uniform), use d = 1 for all segments.

        const d1 =
            alpha === 0
                ? 1
                : Math.sqrt((p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2);
        const d2 =
            alpha === 0
                ? 1
                : Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
        const d3 =
            alpha === 0
                ? 1
                : Math.sqrt((p2.x - p3.x) ** 2 + (p2.y - p3.y) ** 2);

        // Bezier control point can be calculated as follows
        // B_0 = P_1
        // B_1 = [ -d_2^2𝛂⋅P_0 + (2⋅d_1^2𝛂 + 3⋅d_1^𝛂⋅d_2^𝛂 + d_2^2^𝛂)⋅P_1  + d_1^2𝛂⋅P_2 ] / [ 3⋅d_1^𝛂⋅(d_1^𝛂 + d_2^𝛂) ]
        // B_2 = [ -d_2^2𝛂⋅P_3 + (2⋅d_3^2𝛂 + 3⋅d_3^𝛂⋅d_2^𝛂 + d_2^2^𝛂)⋅P_1  + d_3^2𝛂⋅P_1 ] / [ 3⋅d_3^𝛂⋅(d_3^𝛂 + d_2^𝛂) ]
        // B_3 = P_2
        //
        //
        // Which can be written as conversion matrix
        // A = 2⋅d1^2𝛂 + 3⋅d1^𝛂⋅d2^𝛂 + d3^2𝛂
        // B = 2⋅d3^2𝛂 + 3⋅d3^𝛂⋅d2^𝛂 + d2^2𝛂

        //                          [   0             1            0          0          ]   [ P_0 ]
        // [ B_0, B_1, B_2, B_3 ] = [   -d2^2𝛂 /N     A/N          d1^2𝛂 /N   0          ] ⋅ [ P_1 ]
        //                          [   0             d3^2𝛂 /M     B/M        -d2^2𝛂 /M  ]   [ P_2 ]
        //                          [   0             0            1          0          ]   [ P_3 ]

        // Apply parametrization
        const d3powA = Math.pow(d3, alpha);
        const d3pow2A = Math.pow(d3, alpha2);
        const d2powA = Math.pow(d2, alpha);
        const d2pow2A = Math.pow(d2, alpha2);
        const d1powA = Math.pow(d1, alpha);
        const d1pow2A = Math.pow(d1, alpha2);

        const A = 2 * d1pow2A + 3 * d1powA * d2powA + d2pow2A;
        const B = 2 * d3pow2A + 3 * d3powA * d2powA + d2pow2A;

        let N = 3 * d1powA * (d1powA + d2powA);
        if (N > 0) {
            N = 1 / N;
        }

        let M = 3 * d3powA * (d3powA + d2powA);
        if (M > 0) {
            M = 1 / M;
        }

        let bp1: IPoint = {
            x: (-d2pow2A * p0.x + A * p1.x + d1pow2A * p2.x) * N,
            y: (-d2pow2A * p0.y + A * p1.y + d1pow2A * p2.y) * N,
        };

        let bp2: IPoint = {
            x: (d3pow2A * p1.x + B * p2.x - d2pow2A * p3.x) * M,
            y: (d3pow2A * p1.y + B * p2.y - d2pow2A * p3.y) * M,
        };

        if (bp1.x === 0 && bp1.y === 0) {
            bp1 = { ...p1 };
        }

        if (bp2.x === 0 && bp2.y === 0) {
            bp2 = { ...p2 };
        }

        result.push([{ ...lastStartPoint }, bp1, bp2, { ...p2 }]);

        lastStartPoint = { ...p2 };
    }

    return result;
};
