import { renderHook, act } from "@testing-library/react";
import { ShapePage } from "electron/database/tables/ShapePageTable";
import { describe, expect, it, vi, afterEach } from "vitest";
import { useShapePageStore } from "../MarcherShapeStore";

describe.todo("shapePageStore", () => {
    // afterEach(async () => {
    //     vi.clearAllMocks();
    //     const { result } = renderHook(() => useShapePageStore());
    //     vi.spyOn(ShapePage, "getShapePages").mockResolvedValue([]);
    //     await act(async () => {
    //         result.current.fetchShapePages();
    //     });
    //     vi.clearAllMocks();
    // });
    // it("shapePagesStore - initial state", async () => {
    //     // Expect the initial state to be an empty array
    //     const { result } = renderHook(() => useShapePageStore());
    //     expect(result.current.shapePages).toEqual([]);
    // });
    // it("shapePagesStore - fetch all", async () => {
    //     const mockToUse = mockShapePages;
    //     vi.spyOn(ShapePage, "getShapePages").mockResolvedValue(mockToUse);
    //     // Expect the initial state to be an empty array
    //     const { result } = renderHook(() => useShapePageStore());
    //     expect(result.current.shapePages).toEqual([]);
    //     await act(async () => {
    //         result.current.fetchShapePages();
    //     });
    //     // Copy the mockShapePages array to avoid reference equality issues
    //     const expectedShapePages = [...mockToUse];
    //     expect(result.current.shapePages).toEqual(expectedShapePages);
    // });
    // it("shapePagesStore - fetches single shapePage", async () => {
    //     const mockToUse = [mockShapePages[0]];
    //     vi.spyOn(ShapePage, "getShapePages").mockResolvedValue(mockToUse);
    //     // Expect the initial state to be an empty array
    //     const { result } = renderHook(() => useShapePageStore());
    //     expect(result.current.shapePages).toEqual([]);
    //     await act(async () => {
    //         result.current.fetchShapePages();
    //     });
    //     // Copy the mockShapePages array to avoid reference equality issues
    //     const expectedShapePages = [...mockToUse];
    //     expect(result.current.shapePages).toEqual(expectedShapePages);
    // });
    // it("shapePagesStore - fetch no shapePages", async () => {
    //     const mockToUse: ShapePage[] = [];
    //     vi.spyOn(ShapePage, "getShapePages").mockResolvedValue(mockToUse);
    //     const { result } = renderHook(() => useShapePageStore());
    //     await act(async () => {
    //         result.current.fetchShapePages();
    //     });
    //     // Copy the mockShapePages array to avoid reference equality issues
    //     const expectedShapePages = [...mockToUse];
    //     expect(result.current.shapePages).toEqual(expectedShapePages);
    // });
});
