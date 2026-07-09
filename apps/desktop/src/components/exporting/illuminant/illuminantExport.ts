import { db, schema, type DB } from "@/global/database/db";
import {
    LightingDataSchema,
    sampleMarcherCoordinates,
    type LightingData,
    type SampleMarcherCoordinatesBeat,
    type SampleMarcherCoordinatesMarcher,
    type SampleMarcherCoordinatesMarcherPage,
    type SampleMarcherCoordinatesPage,
    type SampleMarcherCoordinatesPathway,
    type SampledMarcherCoordinates,
} from "@openmarch/core";
import { asc } from "drizzle-orm";

export const ILLUMINANT_VISUALIZER_URL = "http://localhost:8788/visualize";
const DEFAULT_EXPORT_FPS = 30;

export type SerializableSampledMarcherCoordinates = Omit<
    SampledMarcherCoordinates,
    "coordinatesByMarcher"
> & {
    coordinatesByMarcher: Record<string, number[]>;
};

export type IlluminantVisualizerShowData = {
    sampledCoordinates: SerializableSampledMarcherCoordinates;
    beats: SampleMarcherCoordinatesBeat[];
    pages: SampleMarcherCoordinatesPage[];
};

export type IlluminantVisualizerSource = {
    showData: IlluminantVisualizerShowData;
    lightingData: LightingData;
};

export type IlluminantVisualizerRequest = IlluminantVisualizerSource & {
    filename: string;
    fps?: number;
    width?: number;
    height?: number;
    hideIds?: boolean;
};

export type IlluminantVisualizerResponse =
    | {
          success: true;
          outputPath: string;
          sourcePath: string;
          illuminantPath: string;
          stdout: string;
          stderr: string;
      }
    | {
          success?: false;
          error: string;
          exitCode?: number | null;
          stdout?: string;
          stderr?: string;
          sourcePath?: string;
          illuminantPath?: string;
          outputPath?: string;
      };

type BuildIlluminantVisualizerSourceArgs = {
    beats: SampleMarcherCoordinatesBeat[];
    pages: SampleMarcherCoordinatesPage[];
    marchers: SampleMarcherCoordinatesMarcher[];
    marcherPages: SampleMarcherCoordinatesMarcherPage[];
    pathways: SampleMarcherCoordinatesPathway[];
    lightingData: LightingData;
    fps?: number;
};

export async function buildIlluminantVisualizerRequest({
    database = db,
    filename,
    fps = DEFAULT_EXPORT_FPS,
    width = 1280,
    height = 720,
    hideIds = false,
}: {
    database?: DB;
    filename: string;
    fps?: number;
    width?: number;
    height?: number;
    hideIds?: boolean;
}): Promise<IlluminantVisualizerRequest> {
    const source = buildIlluminantVisualizerSource({
        ...(await fetchIlluminantVisualizerSourceData(database)),
        fps,
    });

    return {
        filename,
        ...source,
        fps,
        width,
        height,
        hideIds,
    };
}

export function buildIlluminantVisualizerSource({
    beats,
    pages,
    marchers,
    marcherPages,
    pathways,
    lightingData,
    fps = DEFAULT_EXPORT_FPS,
}: BuildIlluminantVisualizerSourceArgs): IlluminantVisualizerSource {
    const parsedLightingData = LightingDataSchema.parse(lightingData);
    const coordinateSamplingData = buildCoordinateSamplingTiming({
        beats,
        pages,
    });
    const sampledCoordinates = sampleMarcherCoordinates({
        beats: coordinateSamplingData.beats,
        pages: coordinateSamplingData.pages,
        marchers,
        marcherPages,
        pathways,
        fps,
    });

    return {
        showData: {
            sampledCoordinates:
                serializeSampledMarcherCoordinates(sampledCoordinates),
            beats,
            pages,
        },
        lightingData: parsedLightingData,
    };
}

function buildCoordinateSamplingTiming({
    beats,
    pages,
}: {
    beats: SampleMarcherCoordinatesBeat[];
    pages: SampleMarcherCoordinatesPage[];
}): {
    beats: SampleMarcherCoordinatesBeat[];
    pages: SampleMarcherCoordinatesPage[];
} {
    if (beats.length === 0 || pages.length === 0) return { beats, pages };

    const beatPositionById = new Map(
        beats.map((beat) => [beat.id, beat.position]),
    );
    const sortedPages = [...pages].sort((a, b) => {
        const aPosition = beatPositionById.get(a.start_beat) ?? Infinity;
        const bPosition = beatPositionById.get(b.start_beat) ?? Infinity;
        return aPosition - bPosition || a.id - b.id;
    });
    const pageIdToSamplingStartBeat = new Map<number, number>();
    const lastBeat = [...beats].sort((a, b) => b.position - a.position)[0]!;
    const syntheticShowEndBeat: SampleMarcherCoordinatesBeat = {
        id: Math.max(...beats.map((beat) => beat.id)) + 1,
        duration: 0,
        position: lastBeat.position + 1,
    };

    for (let i = 0; i < sortedPages.length; i++) {
        const page = sortedPages[i]!;
        const nextPage = sortedPages[i + 1];
        pageIdToSamplingStartBeat.set(
            page.id,
            i === 0
                ? page.start_beat
                : (nextPage?.start_beat ?? syntheticShowEndBeat.id),
        );
    }

    return {
        beats: [...beats, syntheticShowEndBeat],
        pages: pages.map((page) => ({
            ...page,
            start_beat:
                pageIdToSamplingStartBeat.get(page.id) ?? page.start_beat,
        })),
    };
}

export function serializeSampledMarcherCoordinates(
    sampledCoordinates: SampledMarcherCoordinates,
): SerializableSampledMarcherCoordinates {
    return {
        ...sampledCoordinates,
        coordinatesByMarcher: Object.fromEntries(
            Object.entries(sampledCoordinates.coordinatesByMarcher).map(
                ([marcherId, coordinates]) => [
                    marcherId,
                    Array.from(coordinates),
                ],
            ),
        ),
    };
}

export async function postIlluminantVisualizerRequest(
    request: IlluminantVisualizerRequest,
): Promise<IlluminantVisualizerResponse> {
    return (await window.electron.invoke(
        "lighting:visualize",
        request,
    )) as IlluminantVisualizerResponse;
}

async function fetchIlluminantVisualizerSourceData(
    database: DB,
): Promise<Omit<BuildIlluminantVisualizerSourceArgs, "fps">> {
    const [
        beats,
        pages,
        marchers,
        marcherPages,
        pathways,
        scenes,
        groups,
        groupMarchers,
        effects,
        effectGroups,
        effectLayers,
    ] = await Promise.all([
        database
            .select({
                id: schema.beats.id,
                duration: schema.beats.duration,
                position: schema.beats.position,
            })
            .from(schema.beats)
            .orderBy(asc(schema.beats.position)),
        database
            .select({
                id: schema.pages.id,
                start_beat: schema.pages.start_beat,
            })
            .from(schema.pages)
            .orderBy(asc(schema.pages.id)),
        database
            .select({
                id: schema.marchers.id,
                drill_prefix: schema.marchers.drill_prefix,
                drill_order: schema.marchers.drill_order,
            })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id)),
        database
            .select({
                marcher_id: schema.marcher_pages.marcher_id,
                page_id: schema.marcher_pages.page_id,
                x: schema.marcher_pages.x,
                y: schema.marcher_pages.y,
                path_data_id: schema.marcher_pages.path_data_id,
                path_start_position: schema.marcher_pages.path_start_position,
                path_end_position: schema.marcher_pages.path_end_position,
            })
            .from(schema.marcher_pages)
            .orderBy(
                asc(schema.marcher_pages.page_id),
                asc(schema.marcher_pages.marcher_id),
            ),
        database
            .select({
                id: schema.pathways.id,
                path_data: schema.pathways.path_data,
            })
            .from(schema.pathways)
            .orderBy(asc(schema.pathways.id)),
        database
            .select({
                id: schema.lighting_scenes.id,
                start_page_id: schema.lighting_scenes.start_page_id,
                name: schema.lighting_scenes.name,
            })
            .from(schema.lighting_scenes)
            .orderBy(asc(schema.lighting_scenes.id)),
        database
            .select({
                id: schema.lighting_groups.id,
                scene_id: schema.lighting_groups.scene_id,
                name: schema.lighting_groups.name,
            })
            .from(schema.lighting_groups)
            .orderBy(asc(schema.lighting_groups.id)),
        database
            .select({
                id: schema.lighting_group_marchers.id,
                group_id: schema.lighting_group_marchers.group_id,
                marcher_id: schema.lighting_group_marchers.marcher_id,
                scene_id: schema.lighting_group_marchers.scene_id,
            })
            .from(schema.lighting_group_marchers)
            .orderBy(asc(schema.lighting_group_marchers.id)),
        database
            .select({
                id: schema.lighting_effects.id,
                scene_id: schema.lighting_effects.scene_id,
                type: schema.lighting_effects.type,
                args: schema.lighting_effects.args,
                name: schema.lighting_effects.name,
                start_offset_beats: schema.lighting_effects.start_offset_beats,
                duration_beats: schema.lighting_effects.duration_beats,
            })
            .from(schema.lighting_effects)
            .orderBy(asc(schema.lighting_effects.id)),
        database
            .select({
                id: schema.lighting_effect_groups.id,
                lighting_effect_id:
                    schema.lighting_effect_groups.lighting_effect_id,
                lighting_group_id:
                    schema.lighting_effect_groups.lighting_group_id,
            })
            .from(schema.lighting_effect_groups)
            .orderBy(asc(schema.lighting_effect_groups.id)),
        database
            .select({
                id: schema.lighting_effect_layers.id,
                lighting_effect_id:
                    schema.lighting_effect_layers.lighting_effect_id,
                top: schema.lighting_effect_layers.top,
                left: schema.lighting_effect_layers.left,
                height: schema.lighting_effect_layers.height,
                width: schema.lighting_effect_layers.width,
            })
            .from(schema.lighting_effect_layers)
            .orderBy(asc(schema.lighting_effect_layers.id)),
    ]);

    return {
        beats,
        pages,
        marchers,
        marcherPages,
        pathways,
        lightingData: {
            scenes,
            groups,
            group_marchers: groupMarchers,
            effects,
            effect_groups: effectGroups,
            effect_layers: effectLayers,
        },
    };
}
