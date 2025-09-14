import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import NewMarcherForm from "../NewMarcherForm";
import Marcher from "@/global/classes/Marcher";
import { toast } from "sonner";

vi.mock("sonner");

describe.todo("NewMarcherForm", () => {
    const mockNewMarchers = [
        new Marcher({
            id: 1,
            section: "Baritone",
            drill_prefix: "B",
            drill_order: 1,
        }),
        new Marcher({
            id: 2,
            section: "Baritone",
            drill_prefix: "B",
            drill_order: 2,
        }),
        new Marcher({
            id: 3,
            section: "Baritone",
            name: "Jeff Jefferson",
            drill_prefix: "B",
            drill_order: 3,
        }),
        new Marcher({
            id: 4,
            section: "Baritone",
            drill_prefix: "B",
            drill_order: 4,
        }),
    ];

    // When this is present, should create trumpets 2, then 4, then 5 + n etc.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const mockExistingMarchers = [
        new Marcher({
            id: 1,
            section: "Trumpet",
            drill_prefix: "T",
            drill_order: 1,
        }),
        new Marcher({
            id: 2,
            section: "Trumpet",
            drill_prefix: "T",
            drill_order: 3,
        }),
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mock("@/stores/MarcherStore", () => {
            return {
                useMarcherStore: () => ({
                    marchers: [],
                    fetchMarchers: vi.fn(),
                }),
            };
        });
    });

    it("renders without crashing", () => {
        render(<NewMarcherForm />);
    });

    it("creates a new marcher correctly", async () => {
        const createMarchersSpy = vi
            .spyOn(Marcher, "createMarchers")
            .mockResolvedValue({
                success: true,
                data: [mockNewMarchers[1]],
            });

        render(<NewMarcherForm />);

        fireEvent.change(screen.getByLabelText("Section"), {
            target: { value: mockNewMarchers[1].section },
        });
        fireEvent.change(screen.getByLabelText("Drill Prefix"), {
            target: { value: mockNewMarchers[1].section },
        });
        fireEvent.change(screen.getByLabelText("Drill Number"), {
            target: { value: "2" },
        });
        fireEvent.change(screen.getByLabelText("Quantity"), {
            target: { value: "1" },
        });

        const submitButtonContainer = screen.getByLabelText(
            "Create Marcher Button",
        );
        const submitButtons =
            submitButtonContainer.getElementsByTagName("button");
        expect(submitButtons[0]).toBeDefined();
        expect(submitButtons[0]).not.toBeDisabled();
        fireEvent.click(submitButtons[0]);

        await waitFor(() => {
            expect(createMarchersSpy).toHaveBeenCalledWith([
                { section: "Brass", drill_prefix: "A", drill_order: 3 },
                { section: "Brass", drill_prefix: "A", drill_order: 4 },
            ]);
            expect(toast.success).toHaveBeenCalledWith(
                "Marchers A3, A4 created successfully",
            );
        });
    });

    it("displays error message when creation fails", async () => {
        const mockCreateMarchers = vi.fn().mockResolvedValue({
            success: false,
            data: [{ drill_number: "A3" }, { drill_number: "A4" }],
            error: "Some error",
        });

        render(<NewMarcherForm />);

        fireEvent.change(screen.getByLabelText("Section"), {
            target: { value: "Brass" },
        });
        fireEvent.change(screen.getByLabelText("Drill Prefix"), {
            target: { value: "A" },
        });
        fireEvent.change(screen.getByLabelText("Drill Number"), {
            target: { value: "3" },
        });
        fireEvent.change(screen.getByLabelText("Quantity"), {
            target: { value: "2" },
        });

        fireEvent.click(screen.getByText("Create 2 Brass Marchers"));

        await waitFor(() => {
            expect(mockCreateMarchers).toHaveBeenCalledWith([
                { section: "Brass", drill_prefix: "A", drill_order: 3 },
                { section: "Brass", drill_prefix: "A", drill_order: 4 },
            ]);
            expect(toast.error).toHaveBeenCalledWith(
                "Error creating marchers A3, A4",
            );
        });
    });

    it("disables submit button when form is invalid", () => {
        render(<NewMarcherForm />);

        fireEvent.change(screen.getByLabelText("Section"), {
            target: { value: "" },
        });
        fireEvent.change(screen.getByLabelText("Drill Prefix"), {
            target: { value: "" },
        });
        fireEvent.change(screen.getByLabelText("Drill Number"), {
            target: { value: "" },
        });

        expect(screen.getByText("Create Marcher")).toBeDisabled();
    });

    describe.todo(
        "uses the correct drill numbers when existing marchers are present",
        () => {},
    );
});
