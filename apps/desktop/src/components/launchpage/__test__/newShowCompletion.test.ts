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
import {
    getFieldProperties,
    getFieldPropertiesImage,
} from "@/global/classes/FieldProperties";
import { allDatabaseBeatsQueryOptions } from "@/hooks/queries/useBeats";
import { allDatabasePagesQueryOptions } from "@/hooks/queries/usePages";
import { allDatabaseMeasuresQueryOptions } from "@/hooks/queries/useMeasures";
import { getUtility } from "@/db-functions/utility";
import { getMarchers } from "@/db-functions/marcher";
import { marcherPagesByPageId } from "@/db-functions/marcherPage";
import { FIRST_PAGE_ID } from "@/db-functions/page";
import { getSectionAppearances } from "@/db-functions/sectionAppearance";
import { getMarcherTags, getTags } from "@/db-functions/tag";

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
            start: { mode: "blank" },
            project: {
                projectName: "Test Show",
                fileLocation: "/tmp/test-show.dots",
            },
            ensemble: {
                activity: "Marching Band",
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
            start: { mode: "blank" },
            project: {
                projectName: "Test Show",
                fileLocation: `/tmp/test-show-${task.id}.dots`,
                designer: "Designer Name",
                client: "Client Name",
            },
            ensemble: {
                activity: "Marching Band",
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
        expect(settings.activity).toBe("Marching Band");

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

        expect(await getFieldPropertiesImage()).toBeNull();
        expect(await getSectionAppearances({ db })).toEqual([]);
        expect(await getTags({ db })).toEqual([]);
        expect(await getMarcherTags({ db })).toEqual([]);
    });

    it("creates tempo-only show with 3/4 time signature", async ({
        task,
        db,
    }) => {
        const wizardState: NewShowWizardState = {
            start: { mode: "blank" },
            project: {
                projectName: "Triple Meter Show",
                fileLocation: `/tmp/triple-meter-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
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
            start: { mode: "blank" },
            project: {
                projectName: "Audio Show",
                fileLocation: `/tmp/audio-show-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
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
            start: { mode: "blank" },
            project: {
                projectName: "XML Show",
                fileLocation: `/tmp/xml-show-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
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

    it("aborts when tempo_only is missing time signature", async ({
        task,
        db,
    }) => {
        const wizardState: NewShowWizardState = {
            start: { mode: "blank" },
            project: {
                projectName: "Invalid Tempo Show",
                fileLocation: `/tmp/invalid-tempo-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
            },
            field: {
                template:
                    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES,
                isCustom: false,
            },
            performers: { method: "skip", marchers: [] },
            audio: { method: "skip" },
            tempo: { method: "tempo_only", tempo: 120 },
            draftFilePath: "/tmp/draft.dots",
        };

        const form = wizardStateToFormState(wizardState);
        const settingsBefore = await getWorkspaceSettingsParsed({ db });

        await expect(completeNewShow(form, queryClient)).rejects.toThrow(
            /tempo and time signature/i,
        );

        const settingsAfter = await getWorkspaceSettingsParsed({ db });
        expect(settingsAfter.projectName).toBe(settingsBefore.projectName);
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
            start: { mode: "blank" },
            project: {
                projectName: "Retry Show",
                fileLocation: `/tmp/retry-show-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
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
            start: { mode: "blank" },
            project: {
                projectName: "Performer Retry Show",
                fileLocation: `/tmp/performer-retry-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
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

    it("applies imported previous dots performers and first-page coordinates", async ({
        task,
        db,
    }) => {
        const importedField =
            FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
        const fieldImage = new Uint8Array([1, 2, 3, 4, 5]);
        const wizardState: NewShowWizardState = {
            start: { mode: "importPrevious" },
            project: {
                projectName: "Imported Previous Show",
                fileLocation: `/tmp/imported-previous-${task.id}.dots`,
            },
            ensemble: {
                activity: "Marching Band",
            },
            field: {
                template: importedField,
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
            tempo: { method: "skip" },
            draftFilePath: "/tmp/draft.dots",
            previousDotsImport: {
                sourcePath: "/tmp/source.dots",
                field: {
                    template: importedField,
                    isCustom: false,
                },
                fieldImage,
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
                coordinates: [
                    {
                        drill_prefix: "T",
                        drill_order: 1,
                        x: 321,
                        y: 654,
                    },
                    {
                        drill_prefix: "T",
                        drill_order: 2,
                        x: 987,
                        y: 123,
                    },
                ],
                sectionAppearances: [
                    {
                        section: "Trumpet",
                        fill_color: { r: 255, g: 0, b: 0, a: 1 },
                        outline_color: { r: 0, g: 0, b: 0, a: 1 },
                        shape_type: "circle",
                        visible: true,
                        label_visible: true,
                    },
                ],
                tags: [
                    {
                        key: 10,
                        name: "Soloists",
                        description: "Featured performers",
                        icon: "star",
                        color_hex: "#ff0000",
                    },
                    {
                        key: 20,
                        name: "Front",
                        description: null,
                        icon: null,
                        color_hex: "#00ff00",
                    },
                ],
                marcherTags: [
                    {
                        drill_prefix: "T",
                        drill_order: 1,
                        tagKey: 10,
                    },
                    {
                        drill_prefix: "T",
                        drill_order: 2,
                        tagKey: 20,
                    },
                    {
                        drill_prefix: "T",
                        drill_order: 1,
                        tagKey: 20,
                    },
                ],
                pageNumberOffset: 18,
            },
        };

        await completeNewShow(wizardStateToFormState(wizardState), queryClient);

        const marchers = await getMarchers({ db });
        const marcherByDrillNumber = new Map(
            marchers.map((marcher) => [
                `${marcher.drill_prefix}${marcher.drill_order}`,
                marcher,
            ]),
        );
        const firstPageMarcherPages = await marcherPagesByPageId({
            db,
            pageId: FIRST_PAGE_ID,
        });
        const firstPageByMarcherId = new Map(
            firstPageMarcherPages.map((marcherPage) => [
                marcherPage.marcher_id,
                marcherPage,
            ]),
        );

        const t1 = marcherByDrillNumber.get("T1");
        const t2 = marcherByDrillNumber.get("T2");
        expect(t1).toBeDefined();
        expect(t2).toBeDefined();
        expect(firstPageByMarcherId.get(t1!.id)).toMatchObject({
            x: 321,
            y: 654,
        });
        expect(firstPageByMarcherId.get(t2!.id)).toMatchObject({
            x: 987,
            y: 123,
        });

        const importedImage = await getFieldPropertiesImage();
        expect(importedImage).toEqual(fieldImage);

        const sectionAppearances = await getSectionAppearances({ db });
        expect(sectionAppearances).toHaveLength(1);
        expect(sectionAppearances[0]).toMatchObject({
            section: "Trumpet",
            fill_color: { r: 255, g: 0, b: 0, a: 1 },
            outline_color: { r: 0, g: 0, b: 0, a: 1 },
            shape_type: "circle",
            visible: true,
            label_visible: true,
        });

        const tags = await getTags({ db });
        expect(tags).toHaveLength(2);
        const tagByName = new Map(tags.map((tag) => [tag.name, tag]));
        expect(tagByName.get("Soloists")).toMatchObject({
            description: "Featured performers",
            icon: "star",
            color_hex: "#ff0000",
        });
        expect(tagByName.get("Front")).toMatchObject({
            description: null,
            icon: null,
            color_hex: "#00ff00",
        });

        const marcherTags = await getMarcherTags({ db });
        expect(marcherTags).toHaveLength(3);
        const soloistsId = tagByName.get("Soloists")!.id;
        const frontId = tagByName.get("Front")!.id;
        const marcherTagKeys = new Set(
            marcherTags.map(
                (marcherTag) => `${marcherTag.marcher_id}:${marcherTag.tag_id}`,
            ),
        );
        expect(marcherTagKeys).toEqual(
            new Set([
                `${t1!.id}:${soloistsId}`,
                `${t2!.id}:${frontId}`,
                `${t1!.id}:${frontId}`,
            ]),
        );

        const settings = await getWorkspaceSettingsParsed({ db });
        expect(settings.pageNumberOffset).toBe(18);
    });
});
