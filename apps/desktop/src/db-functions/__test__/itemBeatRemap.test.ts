// cspell:ignore partwise
import { describe, expect, it as plainIt } from "vitest";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { readShowTiming } from "@/timeline/showTiming";
import { _replaceAllBeatObjects } from "@/components/timeline/audio/EditableAudioPlayerUtils";
import {
    _importMusicXmlFile,
    parseMusicXmlFile,
} from "@/components/music/MusicXmlImport";
import Measure from "@/global/classes/Measure";
import { performUndo } from "../history";
import { deleteBeats, deleteBeatsInTransaction } from "../beat";
import {
    createItems,
    getItemGeometry,
    setItemGeometry,
    type NewItemArgs,
} from "../items";
import {
    nearestSurvivingBeatByTime,
    remapItemChangesOntoReplacementBeatsInTransaction,
} from "../itemBeatRemap";

/*
 * Replacing every beat (a tempo edit, a MusicXML import) deletes all the old beats but beat 0,
 * and `item_geometry.beat_id` cascades: these check that item changes move to the new beat at
 * their time first, so a prop made after beat 0 stays on the field.
 */

const riser = (beatId: number): NewItemArgs => ({
    kind: "prop",
    name: "Riser",
    surfaceType: "platform",
    home: [120, 80],
    beatId,
    geometry: { outlineType: "rectangle", width: 2.4, depth: 1.2, height: 0.4 },
});

/** Each Outline change's beat time, in seconds, in item then time order. */
const geometryTimes = async (db: DbConnection) => {
    const { beats } = await readShowTiming(db);
    const at = new Map(beats.map((b) => [b.id, b.timestamp]));
    return (await getItemGeometry({ db }))
        .map((g) => ({
            item: g.item_id,
            at: at.get(g.beat_id),
            width: g.width,
        }))
        .sort((a, b) => a.item - b.item || a.at! - b.at!);
};

/** A MusicXML score of `measures` 4/4 measures of quarter notes at 120 BPM (0.5 s a beat). */
const scoreOf = (measures: number) => {
    const notes =
        "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>".repeat(
            4,
        );
    const body = Array.from(
        { length: measures },
        (_, i) =>
            `<measure number="${i + 1}">${
                i === 0
                    ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>'
                    : ""
            }${notes}</measure>`,
    ).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
};

describe("nearestSurvivingBeatByTime", () => {
    const beat = (id: number, position: number, duration: number) => ({
        id,
        position,
        duration,
    });

    plainIt("maps each old beat to the new beat nearest its time", () => {
        // Old: 0, then 1 s beats 1-3 (at 0, 1, 2). New: 0.4 s beats 10-16 (at 0, 0.4, ... 2.4)
        const beats = [
            beat(0, 0, 0),
            ...[10, 11, 12, 13, 14, 15, 16].map((id, i) =>
                beat(id, i + 1, 0.4),
            ),
            beat(1, 8, 1),
            beat(2, 9, 1),
            beat(3, 10, 1),
        ];
        const nearest = nearestSurvivingBeatByTime(beats, new Set([1, 2, 3]));
        expect(Object.fromEntries(nearest)).toEqual({
            // 0 s: beat 0 and beat 10 are both there, the counted beat wins
            1: { to: 10, at: 0 },
            // 1 s: 0.8 (beat 12) and 1.2 (beat 13) are both 0.2 away, the earlier wins
            2: { to: 12, at: 1 },
            3: { to: 15, at: 2 },
        });
    });

    plainIt("puts a change past the new end on the last new beat", () => {
        const beats = [
            beat(0, 0, 0),
            beat(10, 1, 1),
            beat(1, 2, 5),
            beat(2, 3, 5),
        ];
        expect(
            nearestSurvivingBeatByTime(beats, new Set([1, 2])).get(2),
        ).toEqual({ to: 10, at: 5 });
    });
});

describeDbTests("item changes when every beat is replaced", (it) => {
    describe("remapItemChangesOntoReplacementBeatsInTransaction", () => {
        it("keeps the latest change per item on a beat, and a change already there wins", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [item] = await createItems({ db, newItems: [riser(2)] });
            for (const [beatId, width] of [
                [3, 3],
                [5, 5],
                [6, 6],
            ] as const)
                await setItemGeometry({
                    db,
                    itemId: item!.id,
                    beatId,
                    geometry: { outlineType: "rectangle", width, depth: 1 },
                });
            await db.transaction(async (tx) => {
                const beatIds = new Set([2, 3, 5]);
                await remapItemChangesOntoReplacementBeatsInTransaction({
                    tx,
                    beatIds,
                });
                await deleteBeatsInTransaction({ tx, beatIds });
            });
            const rows = (await getItemGeometry({ db }))
                .map((g) => [g.beat_id, g.width])
                .sort((a, b) => a[0]! - b[0]!);
            // Old timeline 0, 2, 3, 5 at 0, 0, 0.5, 1 s; new 0, 1, 4, 6, 7... at 0, 0, 0.5, 1, 1.5 s.
            // 2 (0 s) and 3 (0.5 s) are nearest 1 and 4; 5 (1 s) is nearest 6, which already has
            // the change of width 6, so that one stays and 5's goes.
            expect(rows).toEqual([
                [1, 2.4],
                [4, 3],
                [6, 6],
            ]);
        });
    });

    describe("audio editor: replace all beats", () => {
        it("moves a prop's Outline changes to the new beats at the same times, in one undo", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [item] = await createItems({ db, newItems: [riser(9)] });
            await setItemGeometry({
                db,
                itemId: item!.id,
                beatId: 21,
                geometry: { outlineType: "rectangle", width: 5, depth: 1 },
            });
            const before = await geometryTimes(db);
            expect(before.map((r) => r.at)).toEqual([4, 10]);

            // Twice the tempo: 0.25 s beats over the same 48 s
            const { beats: oldBeats, pages } = await readShowTiming(db);
            const newBeats = Array.from({ length: 192 }, (_, i) => ({
                id: -1 - i,
                position: 0,
                index: 0,
                duration: 0.25,
                timestamp: 0.25 * i,
                includeInMeasure: true,
                notes: null,
            }));
            const oldMeasures = (
                await db.select().from(schema.measures).all()
            ).map((m) => ({ id: m.id }) as unknown as Measure);
            await _replaceAllBeatObjects({
                newBeats,
                oldBeats: [...oldBeats],
                newMeasures: [],
                oldMeasures,
                pages: [...pages],
            });

            const oldIds = new Set(
                oldBeats.map((b) => b.id).filter((id) => id !== 0),
            );
            const after = await getItemGeometry({ db });
            expect(after).toHaveLength(2);
            expect(after.some((g) => oldIds.has(g.beat_id))).toBe(false);
            expect(await geometryTimes(db)).toEqual(before);

            await performUndo(db);
            expect(
                (await getItemGeometry({ db })).map((g) => g.beat_id).sort(),
            ).toEqual([21, 9].sort());
        });
    });

    describe("MusicXML import", () => {
        it("moves a prop's Outline change to the imported beat at the same time", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            await createItems({ db, newItems: [riser(13)] });
            expect((await geometryTimes(db)).map((r) => r.at)).toEqual([6]);

            const { beats: allBeats, pages: allPages } =
                await readShowTiming(db);
            const parsed = await parseMusicXmlFile({
                arrayBuffer: async () =>
                    new TextEncoder().encode(scoreOf(24)).buffer,
            });
            const result = await _importMusicXmlFile({
                data: {
                    fileName: "score.musicxml",
                    parsed,
                    allPages: [...allPages],
                    measures: [],
                    allBeats: [...allBeats],
                },
            });
            expect(result.success).toBe(true);

            const oldIds = new Set(
                allBeats.map((b) => b.id).filter((id) => id !== 0),
            );
            const after = await getItemGeometry({ db });
            expect(after).toHaveLength(1);
            expect(oldIds.has(after[0]!.beat_id)).toBe(false);
            expect((await geometryTimes(db)).map((r) => r.at)).toEqual([6]);
        });
    });

    describe("deleting the last beats", () => {
        it("keeps a prop whose only Outline was on them, on the last beat left", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            await createItems({ db, newItems: [riser(95)] });
            await deleteBeats({ db, beatIds: new Set([95, 96]) });
            expect(
                (await getItemGeometry({ db })).map((g) => g.beat_id),
            ).toEqual([94]);
        });

        it("still drops the tail changes of a prop that keeps an earlier Outline", async ({
            db,
            beats,
        }) => {
            expect(beats).toBeDefined();
            const [item] = await createItems({ db, newItems: [riser(10)] });
            await setItemGeometry({
                db,
                itemId: item!.id,
                beatId: 96,
                geometry: { outlineType: "rectangle", width: 5, depth: 1 },
            });
            await deleteBeats({ db, beatIds: new Set([95, 96]) });
            expect(
                (await getItemGeometry({ db })).map((g) => g.beat_id),
            ).toEqual([10]);
        });
    });
});
