export const linearEasing = function (t: number, b: number, c: number, d: number) {
    return c * t / d + b;
};
