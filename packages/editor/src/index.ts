/**
 * @openmarch/editor
 *
 * A platform-agnostic drill writing editor that can run in both
 * Electron (desktop) and browser (web) environments.
 *
 * @example
 * ```tsx
 * import { Editor, PlatformProvider } from "@openmarch/editor";
 * import { createElectronAdapter } from "./platform/ElectronAdapter";
 *
 * const adapter = createElectronAdapter();
 *
 * function App() {
 *   return (
 *     <PlatformProvider adapter={adapter}>
 *       <Editor />
 *     </PlatformProvider>
 *   );
 * }
 * ```
 */

// Platform adapter types and context
export * from "./platform";

// Database layer
export * from "./database";

// Future exports will include:
// - Components
// - Stores
// - Hooks
// - Classes (business logic)
// - Utilities
