import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

global.jest = vi;

// Mock Electron modules globally
vi.mock("electron", () => import("./src/__mocks__/electron"));
