import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RevisionsList } from "../MobileExportView";
import type { RevisionPreview } from "../queries/useProductions";
import * as fc from "fast-check";

function revision(
    overrides: Partial<RevisionPreview> & {
        id: number;
        title: string;
        pushed_at: string | Date;
    },
): RevisionPreview {
    const { pushed_at: pa, ...rest } = overrides;
    const pushed_at = typeof pa === "string" ? pa : (pa as Date).toISOString();
    return {
        show_data_url: null,
        active: false,
        ...rest,
        pushed_at,
    };
}

describe("RevisionsList", () => {
    afterEach(() => {
        cleanup();
    });

    describe("empty state", () => {
        it("displays empty state message when revisions array is empty", () => {
            render(<RevisionsList revisions={[]} activeRevisionId={1} />);

            expect(
                screen.getByLabelText("No revisions message"),
            ).toBeInTheDocument();
        });

        it("does not display 'All revisions' heading when empty", () => {
            render(<RevisionsList revisions={[]} activeRevisionId={1} />);

            expect(screen.queryByText("All revisions")).not.toBeInTheDocument();
        });
    });

    describe("non-empty state", () => {
        it("displays 'All revisions' heading when revisions exist", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Test Revision",
                    pushed_at: "2026-01-02T02:13:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            expect(screen.getByText("All revisions")).toBeInTheDocument();
        });

        it("renders all revision titles", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "First Revision",
                    pushed_at: "2026-01-02T02:13:00Z",
                }),
                revision({
                    id: 2,
                    title: "Second Revision",
                    pushed_at: "2026-01-01T01:00:00Z",
                }),
                revision({
                    id: 3,
                    title: "Third Revision",
                    pushed_at: "2025-12-31T12:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            expect(screen.getByText("First Revision")).toBeInTheDocument();
            expect(screen.getByText("Second Revision")).toBeInTheDocument();
            expect(screen.getByText("Third Revision")).toBeInTheDocument();
        });

        it("sorts revisions by pushed_at date in descending order (newest first)", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Oldest",
                    pushed_at: "2025-01-01T00:00:00Z",
                }),
                revision({
                    id: 2,
                    title: "Newest",
                    pushed_at: "2026-01-01T00:00:00Z",
                }),
                revision({
                    id: 3,
                    title: "Middle",
                    pushed_at: "2025-06-01T00:00:00Z",
                }),
            ];

            const { container } = render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            const revisionElements = container.querySelectorAll(
                '[class*="rounded-6"]',
            );
            const titles = Array.from(revisionElements).map((el) =>
                el.textContent?.trim(),
            );

            // Should be sorted newest first: Newest, Middle, Oldest
            expect(titles[0]).toContain("Newest");
            expect(titles[1]).toContain("Middle");
            expect(titles[2]).toContain("Oldest");
        });

        it("displays formatted date for each revision", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Test Revision",
                    pushed_at: "2020-01-15T14:30:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            // The date should be formatted and displayed (7+ days ago uses long format)
            // Format: "January 15th, 2020 2:30PM" (timezone dependent)
            const dateText = screen.getByText(/January.*2020/i);
            expect(dateText).toBeInTheDocument();
        });
    });

    describe("active revision highlighting", () => {
        it("displays 'Currently active' text for the active revision", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Active Revision",
                    pushed_at: "2026-01-02T02:13:00Z",
                }),
                revision({
                    id: 2,
                    title: "Inactive Revision",
                    pushed_at: "2026-01-01T01:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            expect(screen.getByText("Currently active")).toBeInTheDocument();
        });

        it("does not display 'Currently active' for inactive revisions", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Inactive Revision 1",
                    pushed_at: "2026-01-02T02:13:00Z",
                }),
                revision({
                    id: 2,
                    title: "Inactive Revision 2",
                    pushed_at: "2026-01-01T01:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={999} />,
            );

            expect(
                screen.queryByText("Currently active"),
            ).not.toBeInTheDocument();
        });

        it("applies correct border class for active revision", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Active Revision",
                    pushed_at: "2026-01-02T02:13:00Z",
                }),
                revision({
                    id: 2,
                    title: "Inactive Revision",
                    pushed_at: "2026-01-01T01:00:00Z",
                }),
            ];

            const { container } = render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            const revisionElements = container.querySelectorAll(
                '[class*="rounded-6"]',
            );

            // Active revision should have border-accent class
            const activeElement = Array.from(revisionElements).find((el) =>
                el.textContent?.includes("Active Revision"),
            );
            expect(activeElement).toHaveClass("border-accent");

            // Inactive revision should have border-stroke class
            const inactiveElement = Array.from(revisionElements).find((el) =>
                el.textContent?.includes("Inactive Revision"),
            );
            expect(inactiveElement).toHaveClass("border-stroke");
        });

        it("handles multiple revisions with only one active", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Revision 1",
                    pushed_at: "2026-01-03T00:00:00Z",
                }),
                revision({
                    id: 2,
                    title: "Revision 2 (Active)",
                    pushed_at: "2026-01-02T00:00:00Z",
                }),
                revision({
                    id: 3,
                    title: "Revision 3",
                    pushed_at: "2026-01-01T00:00:00Z",
                }),
            ];

            const { container } = render(
                <RevisionsList revisions={revisions} activeRevisionId={2} />,
            );

            // Only one "Currently active" should be displayed
            const activeTexts = screen.getAllByText("Currently active");
            expect(activeTexts).toHaveLength(1);

            // It should be associated with Revision 2
            expect(screen.getByText("Revision 2 (Active)")).toBeInTheDocument();

            // Find the revision container that contains both the title and "Currently active"
            const revision2Container = Array.from(
                container.querySelectorAll('[class*="rounded-6"]'),
            ).find((el) => el.textContent?.includes("Revision 2 (Active)"));

            expect(revision2Container).toBeDefined();
            expect(revision2Container?.textContent).toContain(
                "Currently active",
            );
        });
    });

    describe("edge cases", () => {
        it("handles single revision correctly", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Only Revision",
                    pushed_at: "2026-01-01T00:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            expect(screen.getByText("All revisions")).toBeInTheDocument();
            expect(screen.getByText("Only Revision")).toBeInTheDocument();
            expect(screen.getByText("Currently active")).toBeInTheDocument();
        });

        it("handles revisions with same timestamp correctly", () => {
            const sameDate = "2026-01-01T00:00:00Z";
            const revisions: RevisionPreview[] = [
                revision({ id: 1, title: "Revision A", pushed_at: sameDate }),
                revision({ id: 2, title: "Revision B", pushed_at: sameDate }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            // Both should be rendered
            expect(screen.getByText("Revision A")).toBeInTheDocument();
            expect(screen.getByText("Revision B")).toBeInTheDocument();
        });

        it("handles activeRevisionId that doesn't exist in revisions", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "Revision 1",
                    pushed_at: "2026-01-01T00:00:00Z",
                }),
                revision({
                    id: 2,
                    title: "Revision 2",
                    pushed_at: "2026-01-02T00:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={999} />,
            );

            // Revisions should still render
            expect(screen.getByText("Revision 1")).toBeInTheDocument();
            expect(screen.getByText("Revision 2")).toBeInTheDocument();

            // No "Currently active" should be shown
            expect(
                screen.queryByText("Currently active"),
            ).not.toBeInTheDocument();
        });

        it("handles very long revision titles", () => {
            const longTitle = "A".repeat(200);
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: longTitle,
                    pushed_at: "2026-01-01T00:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            expect(screen.getByText(longTitle)).toBeInTheDocument();
        });

        it("handles empty string revision titles", () => {
            const revisions: RevisionPreview[] = [
                revision({
                    id: 1,
                    title: "",
                    pushed_at: "2026-01-01T00:00:00Z",
                }),
            ];

            render(
                <RevisionsList revisions={revisions} activeRevisionId={1} />,
            );

            // Component should still render without error
            expect(screen.getByText("All revisions")).toBeInTheDocument();
        });
    });

    describe("property-based tests with fast-check", () => {
        describe("invariants that should always hold", () => {
            it("always displays 'All revisions' heading when revisions array is non-empty", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), {
                            minLength: 1,
                            maxLength: 50,
                        }),
                        fc.integer({ min: 1 }),
                        (ids, activeRevisionId) => {
                            const revisions: RevisionPreview[] = ids.map(
                                (id, index) =>
                                    revision({
                                        id,
                                        title: `Revision ${index + 1}`,
                                        pushed_at: `2000-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
                                    }),
                            );

                            const { unmount } = render(
                                <RevisionsList
                                    revisions={revisions}
                                    activeRevisionId={activeRevisionId}
                                />,
                            );

                            expect(
                                screen.getByText("All revisions"),
                            ).toBeInTheDocument();

                            unmount();
                            cleanup();
                        },
                    ),
                );
            });

            it("always renders all revision titles from input", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), {
                            minLength: 1,
                            maxLength: 20,
                        }),
                        fc.integer({ min: 1 }),
                        (ids, activeRevisionId) => {
                            const revisions: RevisionPreview[] = ids.map(
                                (id, index) =>
                                    revision({
                                        id,
                                        title: `Revision ${index + 1}`,
                                        pushed_at: `2000-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
                                    }),
                            );

                            const { unmount } = render(
                                <RevisionsList
                                    revisions={revisions}
                                    activeRevisionId={activeRevisionId}
                                />,
                            );

                            // All titles should be present
                            revisions.forEach((revision) => {
                                expect(
                                    screen.getByText(revision.title),
                                ).toBeInTheDocument();
                            });

                            unmount();
                            cleanup();
                        },
                    ),
                );
            });

            it("always sorts revisions by pushed_at in descending order", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), {
                            minLength: 2,
                            maxLength: 20,
                        }),
                        fc.integer({ min: 1 }),
                        (ids, activeRevisionId) => {
                            const revisions: RevisionPreview[] = ids.map(
                                (id, index) =>
                                    revision({
                                        id,
                                        title: `Revision ${index + 1}`,
                                        pushed_at: `2000-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
                                    }),
                            );

                            const { container, unmount } = render(
                                <RevisionsList
                                    revisions={revisions}
                                    activeRevisionId={activeRevisionId}
                                />,
                            );

                            const revisionElements = Array.from(
                                container.querySelectorAll(
                                    '[class*="rounded-6"]',
                                ),
                            );

                            // Verify sorting: check that dates are in descending order
                            // by comparing the original sorted array
                            const sortedRevisions = [...revisions].sort(
                                (a, b) =>
                                    new Date(b.pushed_at).getTime() -
                                    new Date(a.pushed_at).getTime(),
                            );

                            // All titles should appear in sorted order
                            sortedRevisions.forEach((revision, index) => {
                                const element = revisionElements[index];
                                expect(element).toBeDefined();
                                expect(element?.textContent).toContain(
                                    revision.title,
                                );
                            });

                            unmount();
                            cleanup();
                        },
                    ),
                );
            });

            it("displays 'Currently active' only when activeRevisionId matches a revision id", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 1, max: 100 }), {
                            minLength: 1,
                            maxLength: 20,
                        }),
                        (ids) => {
                            const revisions: RevisionPreview[] = ids.map(
                                (id, index) =>
                                    revision({
                                        id,
                                        title: `Revision ${index + 1}`,
                                        pushed_at: `2000-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
                                    }),
                            );

                            // Test with a valid activeRevisionId
                            const validActiveId = revisions[0]?.id || 1;
                            const { unmount: unmount1 } = render(
                                <RevisionsList
                                    revisions={revisions}
                                    activeRevisionId={validActiveId}
                                />,
                            );

                            // Should show "Currently active" for the matching revision
                            const activeTexts =
                                screen.getAllByText("Currently active");
                            expect(activeTexts.length).toBeGreaterThan(0);
                            // Should be exactly one if there's only one matching revision
                            const matchingRevisions = revisions.filter(
                                (r) => r.id === validActiveId,
                            );
                            expect(activeTexts).toHaveLength(
                                matchingRevisions.length,
                            );

                            unmount1();
                            cleanup();

                            // Test with an invalid activeRevisionId
                            const invalidActiveId = 99999;
                            const { unmount: unmount2 } = render(
                                <RevisionsList
                                    revisions={revisions}
                                    activeRevisionId={invalidActiveId}
                                />,
                            );

                            // Should not show "Currently active"
                            expect(
                                screen.queryByText("Currently active"),
                            ).not.toBeInTheDocument();

                            unmount2();
                            cleanup();
                        },
                    ),
                );
            });

            it("always displays empty state message when revisions array is empty", () => {
                fc.assert(
                    fc.property(fc.integer({ min: 1 }), (activeRevisionId) => {
                        const { unmount } = render(
                            <RevisionsList
                                revisions={[]}
                                activeRevisionId={activeRevisionId}
                            />,
                        );

                        expect(
                            screen.getByLabelText("No revisions message"),
                        ).toBeInTheDocument();

                        unmount();
                        cleanup();
                    }),
                );
            });

            it("renders correct number of revision items", () => {
                fc.assert(
                    fc.property(
                        fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), {
                            minLength: 1,
                            maxLength: 30,
                        }),
                        fc.integer({ min: 1 }),
                        (ids, activeRevisionId) => {
                            const revisions: RevisionPreview[] = ids.map(
                                (id, index) =>
                                    revision({
                                        id,
                                        title: `Revision ${index + 1}`,
                                        pushed_at: `2000-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
                                    }),
                            );

                            const { container, unmount } = render(
                                <RevisionsList
                                    revisions={revisions}
                                    activeRevisionId={activeRevisionId}
                                />,
                            );

                            const revisionElements = container.querySelectorAll(
                                '[class*="rounded-6"]',
                            );

                            // Should render exactly the number of revisions
                            expect(revisionElements).toHaveLength(
                                revisions.length,
                            );

                            unmount();
                            cleanup();
                        },
                    ),
                );
            });
        });
    });
});
