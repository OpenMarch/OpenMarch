/**
 * `worker_threads` for the web build. @mediabunny/aac-encoder imports it only
 * when it runs under Node; in the browser it uses a Web Worker instead.
 */
export const Worker = undefined;
export default {};
