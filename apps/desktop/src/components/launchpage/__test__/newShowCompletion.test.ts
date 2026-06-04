import { describe, expect, vi, beforeEach } from "vitest";
import { describeDbTests } from "@/test/base";
import { QueryClient } from "@tanstack/react-query";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    completeNewShow,
    resolveNewShowFilePath,
    sanitizeFilename,
} from "../newShowCompletion";
import { wizardStateToFormState } from "../newShowTypes";
import type { NewShowWizardState } from "../newShowTypes";
import { getWorkspaceSettingsParsed } from "@/db-functions/workspaceSettings";
import { getFieldProperties } from "@/global/classes/FieldProperties";
import { allDatabaseBeatsQueryOptions } from "@/hooks/queries/useBeats";
import { allDatabasePagesQueryOptions } from "@/hooks/queries/usePages";

describe("newShowCompletion helpers", () => {
    it("sanitizeFilename removes invalid characters", () => {
        expect(sanitizeFilename('My Show: "Test"')).toBe("My Show_ _Test_");
    });

    it("resolveNewShowFilePath ensures .dots extension", () => {
        expect(
            resolveNewShowFilePath("My Show", "/Users/me/Documents/My Show"),
        ).toBe("/Users/me/Documents/My Show.dots");
    });
});

describeDbTests("completeNewShow", (it) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    beforeEach(() => {
        window.electron ??= {} as typeof window.electron;
        window.electron.log = vi.fn();
        window.electron.databaseIsReady = vi.fn().mockResolvedValue(true);
        window.electron.finalizeNewShowDraft = vi.fn().mockResolvedValue(200);
        window.electron.getDefaultDocumentsPath = vi
            .fn()
            .mockResolvedValue("/tmp");
    });

    it("applies workspace settings, field template, beats, and pages", async ({
        task,
        db,
    }) => {
        const wizardState: NewShowWizardState = {
            project: {
                projectName: "Test Show",
                fileLocation: `/tmp/test-show-${task.id}.dots`,
                designer: "Designer Name",
                client: "Client Name",
            },
            ensemble: {
                environment: "outdoor",
                ensemble_type: "Marching Band",
            },
            field: {
                template:
                    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
                isCustom: false,
            },
            performers: { method: "skip", marchers: [] },
            music: { method: "tempo_only", tempo: 100 },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);
        await completeNewShow(form, queryClient);

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.projectName).toBe("Test Show");
        expect(settings.designer).toBe("Designer Name");
        expect(settings.client).toBe("Client Name");
        expect(settings.defaultTempo).toBe(100);
        expect(settings.ensembleEnvironment).toBe("outdoor");
        expect(settings.ensembleType).toBe("Marching Band");

        const field = await getFieldProperties();
        expect(field.name).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES.name,
        );

        const beats = await queryClient.fetchQuery(
            allDatabaseBeatsQueryOptions(),
        );
        expect(beats.length).toBeGreaterThanOrEqual(129);

        const pages = await queryClient.fetchQuery(
            allDatabasePagesQueryOptions(),
        );
        expect(pages.length).toBeGreaterThanOrEqual(8);

        expect(window.electron.finalizeNewShowDraft).toHaveBeenCalledWith(
            "/tmp/Test Show.dots",
            "Test Show",
        );
    });
});
