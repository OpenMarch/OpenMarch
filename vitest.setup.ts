import { vi } from "vitest";

global.jest = vi;

await import("./jest-canvas-mock");
