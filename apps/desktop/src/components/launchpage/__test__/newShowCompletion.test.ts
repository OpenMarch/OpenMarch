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
import { allDatabaseMeasuresQueryOptions } from "@/hooks/queries/useMeasures";
import { getUtility } from "@/db-functions/utility";
import { getMarchers } from "@/db-functions/marcher";

describe("newShowCompletion helpers", () => {
    it("sanitizeFilename removes invalid characters", () => {
        expect(sanitizeFilename('My Show: "Test"')).toBe("My Show_ _Test_");
    });

    it("resolveNewShowFilePath ensures .dots extension", () => {
        expect(
            resolveNewShowFilePath("My Show", "/Users/me/Documents/My Show"),
        ).toBe("/Users/me/Documents/My Show.dots");
    });

    it("maps split audio and tempo wizard state to completion form state", () => {
        const wizardState: NewShowWizardState = {
            project: {
                projectName: "Test Show",
                fileLocation: "/tmp/test-show.dots",
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
            audio: { method: "skip" },
            tempo: {
                method: "tempo_only",
                tempo: 96,
                timeSignature: "4/4",
            },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);

        expect(form.audio).toEqual({ method: "skip" });
        expect(form.tempo).toEqual({
            method: "tempo_only",
            tempo: 96,
            timeSignature: "4/4",
        });
        expect(form.defaultTempo).toBe(96);
    });
});

describeDbTests("completeNewShow", (it) => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
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
            audio: { method: "skip" },
            tempo: {
                method: "tempo_only",
                tempo: 100,
                timeSignature: "4/4",
            },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);
        await completeNewShow(form, queryClient);

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.projectName).toBe("Test Show");
        expect(settings.designer).toBe("Designer Name");
        expect(settings.client).toBe("Client Name");
        expect(settings.defaultTempo).toBe(100);
        expect(settings.defaultBeatsPerMeasure).toBe(4);
        expect(settings.defaultNewPageCounts).toBe(16);
        expect(settings.ensembleEnvironment).toBe("outdoor");
        expect(settings.ensembleType).toBe("Marching Band");

        const field = await getFieldProperties();
        expect(field.name).toBe(
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES.name,
        );

        const beats = await queryClient.fetchQuery(
            allDatabaseBeatsQueryOptions(),
        );
        expect(beats.length).toBe(1 + 20 * 4);

        const measures = await queryClient.fetchQuery(
            allDatabaseMeasuresQueryOptions(),
        );
        expect(measures.length).toBe(20);

        const pages = await queryClient.fetchQuery(
            allDatabasePagesQueryOptions(),
        );
        expect(pages.length).toBe(6);

        const utility = await getUtility({ db });
        expect(utility?.last_page_counts).toBe(8);

        expect(window.electron.finalizeNewShowDraft).toHaveBeenCalledWith(
            "/tmp/Test Show.dots",
            "Test Show",
        );
    });

    it("creates tempo-only show with 3/4 time signature", async ({
        task,
        db,
    }) => {
        const wizardState: NewShowWizardState = {
            project: {
                projectName: "Triple Meter Show",
                fileLocation: `/tmp/triple-meter-${task.id}.dots`,
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
            audio: { method: "skip" },
            tempo: {
                method: "tempo_only",
                tempo: 120,
                timeSignature: "3/4",
            },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);
        await completeNewShow(form, queryClient);

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.defaultBeatsPerMeasure).toBe(3);
        expect(settings.defaultNewPageCounts).toBe(12);

        const beats = await queryClient.fetchQuery(
            allDatabaseBeatsQueryOptions(),
        );
        expect(beats.length).toBe(1 + 20 * 3);

        const utility = await getUtility({ db });
        expect(utility?.last_page_counts).toBe(6);
    });

    it("aborts when audio method is audio but no audio files exist", async ({
        task,
        db: _db,
    }) => {
        window.electron.getAudioFilesDetails = vi.fn().mockResolvedValue([]);

        const wizardState: NewShowWizardState = {
            project: {
                projectName: "Audio Show",
                fileLocation: `/tmp/audio-show-${task.id}.dots`,
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
            audio: { method: "audio" },
            tempo: { method: "skip" },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);
        await expect(completeNewShow(form, queryClient)).rejects.toThrow(
            /audio/i,
        );
        expect(window.electron.finalizeNewShowDraft).not.toHaveBeenCalled();
    });

    it("aborts when tempo method is xml but no measures exist", async ({
        task,
        db: _db,
    }) => {
        const wizardState: NewShowWizardState = {
            project: {
                projectName: "XML Show",
                fileLocation: `/tmp/xml-show-${task.id}.dots`,
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
            audio: { method: "skip" },
            tempo: { method: "xml" },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);
        await expect(completeNewShow(form, queryClient)).rejects.toThrow(
            /musicxml|imported/i,
        );
        expect(window.electron.finalizeNewShowDraft).not.toHaveBeenCalled();
    });

    it("does not duplicate tempo-only timing data when completion is retried", async ({
        task,
        db: _db,
    }) => {
        window.electron.finalizeNewShowDraft = vi
            .fn()
            .mockResolvedValueOnce(-1)
            .mockResolvedValueOnce(200);

        const wizardState: NewShowWizardState = {
            project: {
                projectName: "Retry Show",
                fileLocation: `/tmp/retry-show-${task.id}.dots`,
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
            audio: { method: "skip" },
            tempo: {
                method: "tempo_only",
                tempo: 100,
                timeSignature: "4/4",
            },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);

        await expect(completeNewShow(form, queryClient)).rejects.toThrow(
            /failed to save show/i,
        );
        await completeNewShow(form, queryClient);

        const beats = await queryClient.fetchQuery(
            allDatabaseBeatsQueryOptions(),
        );
        expect(beats.length).toBe(1 + 20 * 4);

        const measures = await queryClient.fetchQuery(
            allDatabaseMeasuresQueryOptions(),
        );
        expect(measures.length).toBe(20);

        const pages = await queryClient.fetchQuery(
            allDatabasePagesQueryOptions(),
        );
        expect(pages.length).toBe(6);
    });

    it("does not duplicate marchers when completion is retried", async ({
        task,
        db,
    }) => {
        window.electron.finalizeNewShowDraft = vi
            .fn()
            .mockResolvedValueOnce(-1)
            .mockResolvedValueOnce(200);

        const wizardState: NewShowWizardState = {
            project: {
                projectName: "Performer Retry Show",
                fileLocation: `/tmp/performer-retry-${task.id}.dots`,
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
            performers: {
                method: "add",
                marchers: [
                    {
                        section: "Trumpet",
                        drill_prefix: "T",
                        drill_order: 1,
                    },
                    {
                        section: "Trumpet",
                        drill_prefix: "T",
                        drill_order: 2,
                    },
                ],
            },
            audio: { method: "skip" },
            tempo: {
                method: "tempo_only",
                tempo: 100,
                timeSignature: "4/4",
            },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);

        await expect(completeNewShow(form, queryClient)).rejects.toThrow(
            /failed to save show/i,
        );
        await completeNewShow(form, queryClient);

        const marchers = await getMarchers({ db });
        expect(marchers).toHaveLength(2);
    });
});
