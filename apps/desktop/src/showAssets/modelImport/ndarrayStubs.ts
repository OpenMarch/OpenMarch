// cspell:words ndarray
/**
 * Stand in for `ndarray` and `ndarray-pixels` in every build (`vite.modelImport.mjs`).
 * `@gltf-transform/functions` imports them only for helpers the model import never calls (its own
 * texture resize, palettes, `prune`'s solid-texture check). Both compile code with `Function()`,
 * which the import worker's CSP refuses and which must stay out of the worker's bundle.
 */
const missing = (name: string) => (): never => {
    throw new Error(`${name} isn't in this build (model import worker)`);
};

/** `ndarray` */
export default missing("ndarray");

/** `ndarray-pixels` */
export const getPixels = missing("ndarray-pixels");
export const savePixels = missing("ndarray-pixels");
