// Stands in for the `electron` module and the main process's entry when generate.mts imports
// the application menu's template from Node: only `app.name` is read while building it.
export const app = { name: "OpenMarch" };
export const dialog = {};
export const Menu = {};
export const shell = {};
export const openView3dWindow = () => {};
