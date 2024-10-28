import { ElectronApi } from "electron/preload";
import { Marcher, NewMarcherArgs, ModifiedMarcherArgs } from "../Marcher";
import { mockMarchers } from "@/__mocks__/globalMocks";
import { describe, expect, it, vi } from "vitest";

describe("Marcher", () => {
    it("should create a marcher object", () => {
        const marcher = new Marcher({
            id: 1,
            name: "John Doe",
            section: "Color Guard",
            drill_prefix: "B",
            drill_order: 1,
            notes: "Some notes",
            year: "Freshman",
        });

        expect(marcher).toBeInstanceOf(Marcher);
        expect(marcher.id).toBe(1);
        expect(marcher.id_for_html).toBe("marcher_1");
        expect(marcher.name).toBe("John Doe");
        expect(marcher.section).toBe("Color Guard");
        expect(marcher.drill_number).toBe("B1");
        expect(marcher.drill_prefix).toBe("B");
        expect(marcher.drill_order).toBe(1);
        expect(marcher.notes).toBe("Some notes");
        expect(marcher.year).toBe("Freshman");
    });

    it("should fetch marchers from the database", async () => {
        vi.spyOn(Marcher, "getMarchers").mockResolvedValue(mockMarchers);

        const getMarchersResult = await Marcher.getMarchers();

        expect(getMarchersResult).toEqual(mockMarchers);
    });

    it("should create a new marcher in the database", async () => {
        const newMarcher: NewMarcherArgs = {
            name: "Jane Smith",
            section: "Brass",
            drill_prefix: "T",
            drill_order: 2,
            year: "Sophomore",
            notes: "No notes",
        };

        const mockResponse = {
            success: true,
        };

        // Mock the electron api
        window.electron = {
            createMarchers: vi.fn().mockResolvedValue(mockResponse),
        } as Partial<ElectronApi> as ElectronApi;

        Marcher.checkForFetchMarchers = vi.fn();
        Marcher.fetchMarchers = vi.fn();

        const response = await Marcher.createMarchers([newMarcher]);

        expect(response).toEqual(mockResponse);
        expect(window.electron.createMarchers).toHaveBeenCalledWith([
            newMarcher,
        ]);
        expect(Marcher.checkForFetchMarchers).toHaveBeenCalled();
        expect(Marcher.fetchMarchers).toHaveBeenCalled();
    });

    it("should update one or many marchers in the database", async () => {
        const modifiedMarchers: ModifiedMarcherArgs[] = [
            { ...mockMarchers[0], name: "Changed Name" },
            {
                ...mockMarchers[1],
                notes: "Changed Notes",
                year: "Changed Year",
            },
            {
                ...mockMarchers[2],
                section: "Other",
                drill_order: 3,
                drill_prefix: "O",
            },
            mockMarchers[3],
        ];

        const mockResponse = {
            success: true,
        };

        // Mock the electron api
        window.electron = {
            updateMarchers: vi.fn().mockResolvedValue(mockResponse),
        } as Partial<ElectronApi> as ElectronApi;

        Marcher.checkForFetchMarchers = vi.fn();
        Marcher.fetchMarchers = vi.fn();

        const response = await Marcher.updateMarchers(modifiedMarchers);

        expect(response).toEqual(mockResponse);
        expect(window.electron.updateMarchers).toHaveBeenCalledWith(
            modifiedMarchers,
        );
        expect(Marcher.checkForFetchMarchers).toHaveBeenCalled();
        expect(Marcher.fetchMarchers).toHaveBeenCalled();
    });

    it("should delete a marcher from the database", async () => {
        const marcherIds = new Set([1]);

        const mockResponse = {
            success: true,
        };

        // Mock the electron api
        window.electron = {
            deleteMarchers: vi.fn().mockResolvedValue(mockResponse),
        } as Partial<ElectronApi> as ElectronApi;

        Marcher.checkForFetchMarchers = vi.fn();
        Marcher.fetchMarchers = vi.fn();

        const response = await Marcher.deleteMarchers(marcherIds);

        expect(response).toEqual(mockResponse);
        expect(window.electron.deleteMarchers).toHaveBeenCalledWith(marcherIds);
        expect(Marcher.checkForFetchMarchers).toHaveBeenCalled();
        expect(Marcher.fetchMarchers).toHaveBeenCalled();
    });

    it("should delete multiple marchers from the database", async () => {
        const marcherIds = new Set([1, 2, 3, 4, 6]);

        const mockResponse = {
            success: true,
        };

        // Mock the electron api
        window.electron = {
            deleteMarchers: vi.fn().mockResolvedValue(mockResponse),
        } as Partial<ElectronApi> as ElectronApi;

        Marcher.checkForFetchMarchers = vi.fn();
        Marcher.fetchMarchers = vi.fn();

        const response = await Marcher.deleteMarchers(marcherIds);

        expect(response).toEqual(mockResponse);
        expect(window.electron.deleteMarchers).toHaveBeenCalledWith(marcherIds);
        expect(Marcher.checkForFetchMarchers).toHaveBeenCalled();
        expect(Marcher.fetchMarchers).toHaveBeenCalled();
    });

    describe("compareTo", () => {
        it("should return a positive number if the section is greater than the other section", () => {
            let marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Trumpet",
                drill_order: 1,
            });
            let marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "Flute",
                drill_order: 12,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeGreaterThan(0);

            marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Trumpet",
                drill_order: 12,
            });
            marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "Flute",
                drill_order: 1,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeGreaterThan(0);
        });

        it("should return a negative number if the section is less than the other section", () => {
            let marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Tuba",
                drill_order: 1,
            });
            let marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "AltoSax",
                drill_order: 12,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeLessThan(0);

            marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Tuba",
                drill_order: 12,
            });
            marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "AltoSax",
                drill_order: 1,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeLessThan(0);
        });

        it("should return a positive number if the drill order is greater than the other marcher", () => {
            let marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Tuba",
                drill_order: 14,
            });
            let marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "Tuba",
                drill_order: 3,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeGreaterThan(0);

            marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Flute",
                drill_order: 12,
            });
            marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "Flute",
                drill_order: 1,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeGreaterThan(0);
        });

        it("should return a negative number if the drill order is less than the other marcher", () => {
            let marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "Trumpet",
                drill_order: 4,
            });
            let marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "Trumpet",
                drill_order: 5,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeLessThan(0);

            marcher1 = new Marcher({
                ...mockMarchers[0],
                section: "asdf",
                drill_order: 9,
            });
            marcher2 = new Marcher({
                ...mockMarchers[0],
                section: "asdf",
                drill_order: 19,
            });
            expect(Marcher.compare(marcher1, marcher2)).toBeLessThan(0);
        });
    });
});
