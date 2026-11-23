import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import type { Ensemble } from "@/api/generated/model";
import EnsembleList from "../EnsembleList";

const ensemblesState = vi.hoisted(() => ({
    ensembles: [] as Ensemble[],
}));

vi.mock("@/api/generated/ensembles/ensembles", () => ({
    getGetApiEditorV1EnsemblesQueryKey: () => ["/api/editor/v1/ensembles"],
    useGetApiEditorV1Ensembles: () => ({
        data: { ensembles: ensemblesState.ensembles },
        isLoading: false,
        error: null,
    }),
}));

vi.mock("@/api/generated/productions/productions", () => ({
    usePostApiEditorV1Productions: () => ({
        mutate: vi.fn(),
        isPending: false,
    }),
}));

vi.mock("@/hooks/queries/useWorkspaceSettings", () => ({
    workspaceSettingsQueryOptions: () => ({
        queryKey: ["workspaceSettings"],
        queryFn: async () => ({}),
    }),
    updateWorkspaceSettingsMutationOptions: () => ({
        mutationFn: async () => undefined,
    }),
}));

function ensemble(overrides: Partial<Ensemble> & { id: number }): Ensemble {
    return {
        name: `Ensemble ${overrides.id}`,
        productions_count: 1,
        productions: [
            {
                id: overrides.id * 10,
                name: `Show ${overrides.id}`,
            } as Ensemble["productions"][number],
        ],
        created_at: "2026-09-01T12:00:00Z",
        updated_at: "2026-09-01T12:00:00Z",
        expires_on: "2099-06-30",
        expired: false,
        ...overrides,
    };
}

function renderList() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <TolgeeProvider tolgee={tolgee} fallback="">
                <EnsembleList />
            </TolgeeProvider>
        </QueryClientProvider>,
    );
}

beforeAll(async () => {
    await tolgee.run();
});

afterEach(() => {
    cleanup();
    ensemblesState.ensembles = [];
});

describe("EnsembleList expiry", () => {
    it("lists active ensembles and hides expired ones behind a toggle", () => {
        ensemblesState.ensembles = [
            ensemble({ id: 1, name: "Varsity" }),
            ensemble({
                id: 2,
                name: "Fall Winds",
                expires_on: "2026-12-31",
                expired: true,
            }),
        ];
        renderList();

        expect(screen.getByText("Varsity")).toBeInTheDocument();
        expect(screen.queryByText("Fall Winds")).not.toBeInTheDocument();

        const toggle = screen.getByTestId("toggle-expired-ensembles");
        expect(toggle).toHaveTextContent("View expired ensembles (1)");
        expect(toggle).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(toggle);

        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(toggle).toHaveTextContent("Hide expired ensembles");
        const expiredList = screen.getByTestId("expired-ensembles");
        expect(within(expiredList).getByText("Fall Winds")).toBeInTheDocument();
        expect(
            within(expiredList).getByTestId("ensemble-expired-badge"),
        ).toHaveTextContent(/Expired .*2026/);
        expect(expiredList).toHaveTextContent("sales@openmarch.com");
    });

    it("offers Create production only on active ensembles", () => {
        ensemblesState.ensembles = [
            ensemble({ id: 1 }),
            ensemble({ id: 2, expires_on: "2026-12-31", expired: true }),
        ];
        renderList();
        fireEvent.click(screen.getByTestId("toggle-expired-ensembles"));

        const items = screen.getAllByTestId("ensemble-item");
        const activeItem = items.find((i) => !i.dataset.expired)!;
        const expiredItem = items.find((i) => i.dataset.expired)!;
        expect(
            within(activeItem).getByRole("button", {
                name: /Create production/,
            }),
        ).toBeInTheDocument();
        expect(
            within(expiredItem).queryByRole("button", {
                name: /Create production/,
            }),
        ).not.toBeInTheDocument();
        // Its productions can still be attached
        expect(
            within(expiredItem).getByText("Attach to production"),
        ).toBeInTheDocument();
    });

    it("shows no toggle when nothing has expired", () => {
        ensemblesState.ensembles = [ensemble({ id: 1 })];
        renderList();
        expect(
            screen.queryByTestId("toggle-expired-ensembles"),
        ).not.toBeInTheDocument();
    });

    it("says there are no active ensembles when all have expired", () => {
        ensemblesState.ensembles = [
            ensemble({ id: 1, expires_on: "2026-12-31", expired: true }),
        ];
        renderList();
        expect(screen.getByText("No active ensembles.")).toBeInTheDocument();
        expect(
            screen.getByTestId("toggle-expired-ensembles"),
        ).toBeInTheDocument();
    });

    it("shows the countdown notice in the final 30 days only", () => {
        // Ten days after today's date Anywhere on Earth (UTC-12)
        const hour = 60 * 60 * 1000;
        const inTen = new Date(Date.now() - 12 * hour + 10 * 24 * hour);
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        ensemblesState.ensembles = [
            ensemble({ id: 1, name: "Soon", expires_on: iso(inTen) }),
            ensemble({ id: 2, name: "Later", expires_on: "2099-06-30" }),
        ];
        renderList();

        const notices = screen.getAllByTestId("ensemble-expiry-notice");
        expect(notices).toHaveLength(1);
        expect(notices[0]).toHaveTextContent("Expires in 10 days");
    });
});
