export type LightDesignerAfterMarchersFn = (timeMs: number) => void;

let handler: LightDesignerAfterMarchersFn | null = null;

/** Registered by Light Designer canvas appearance; invoked from the playback rAF after coordinates update. */
export const lightDesignerFrameRegistry = {
    set(fn: LightDesignerAfterMarchersFn | null): void {
        handler = fn;
    },
    run(timeMs: number): void {
        handler?.(timeMs);
    },
};
