import { describe, expect, it } from "vitest";
import { STRETCH_WINDOW, StretchPlayer } from "../timeStretch";

const RATE = 44100;
const QUANTUM = 128;

function sine(seconds: number, hz: number): Float32Array {
    const out = new Float32Array(Math.round(seconds * RATE));
    for (let i = 0; i < out.length; i++)
        out[i] = Math.sin((2 * Math.PI * hz * i) / RATE);
    return out;
}

// Renders `frames` output frames from frame `start`, in render quanta, as the worklet does
function render(player: StretchPlayer, frames: number, start = 0) {
    const music = new Float32Array(frames);
    const clicks = new Float32Array(frames);
    for (let f = 0; f < frames; f += QUANTUM) {
        const left = new Float32Array(QUANTUM);
        const right = new Float32Array(QUANTUM);
        const metronome = new Float32Array(QUANTUM);
        player.process([left, right], metronome, start + f);
        music.set(left.subarray(0, Math.min(QUANTUM, frames - f)), f);
        clicks.set(metronome.subarray(0, Math.min(QUANTUM, frames - f)), f);
    }
    return { music, clicks };
}

// Rising zero crossings per second over a stretch of output: the pitch
function pitch(samples: Float32Array, from: number, to: number): number {
    let crossings = 0;
    for (let i = from + 1; i < to; i++)
        if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
    return (crossings * RATE) / (to - from);
}

describe("StretchPlayer", () => {
    it("at 1× plays the source exactly, after the first half window's fade in", () => {
        const source = sine(2, 330).map((v, i) => v * Math.cos(i / 900));
        const player = new StretchPlayer();
        player.setMusic([source]);
        const from = 0.5 * RATE;
        player.schedule({ kind: "play", frame: 0, position: from, rate: 1 });
        const { music } = render(player, RATE);
        for (let i = STRETCH_WINDOW / 2; i < RATE; i += 97)
            expect(music[i]).toBeCloseTo(source[from + i], 5);
    });

    it("keeps the pitch at other speeds, and covers the show at their rate", () => {
        const source = sine(20, 440);
        for (const rate of [0.5, 2, 8]) {
            const player = new StretchPlayer();
            player.setMusic([source]);
            player.schedule({ kind: "play", frame: 0, position: 0, rate });
            const { music } = render(player, 2 * RATE);
            expect(pitch(music, 0.2 * RATE, 2 * RATE)).toBeCloseTo(440, -1);
            expect(player.positionAt(2 * RATE)).toBe(2 * RATE * rate);
        }
    });

    it("a speed change keeps the position where the change lands", () => {
        const player = new StretchPlayer();
        player.setMusic([sine(10, 220)]);
        player.schedule({ kind: "play", frame: 0, position: 1000, rate: 1 });
        render(player, RATE);
        // Arrives late, applies as if on time
        player.schedule({ kind: "rate", frame: RATE / 2, rate: 2 });
        render(player, RATE + QUANTUM);
        expect(player.positionAt(RATE / 2)).toBe(1000 + RATE / 2);
        expect(player.positionAt(RATE)).toBe(1000 + RATE / 2 + RATE);
    });

    it("plays each click unstretched when the show reaches its beat", () => {
        const click = Float32Array.from({ length: 400 }, (_, i) => 1 - i / 400);
        const beat = RATE / 2;
        const track = new Float32Array(4 * RATE);
        const onsets = Float64Array.from(
            [0, 1, 2, 3, 4, 5, 6, 7],
            (b) => b * beat,
        );
        for (const at of onsets) track.set(click, at);
        const player = new StretchPlayer();
        player.setMusic([new Float32Array(4 * RATE)]);
        player.setMetronome(track, onsets);
        player.schedule({ kind: "play", frame: 0, position: 0, rate: 2 });
        const { clicks } = render(player, RATE);
        // At 2× the beats come every quarter second, each click at its own length
        for (const start of [0, RATE / 4, RATE / 2, (3 * RATE) / 4]) {
            expect(clicks[start]).toBeCloseTo(1, 5);
            expect(clicks[start + 200]).toBeCloseTo(0.5, 5);
            expect(clicks[start + 400]).toBe(0);
        }
    });

    it("at 8× cuts each click where the next starts, so they never pile up", () => {
        const click = new Float32Array(3000).fill(0.9);
        const beat = RATE / 2;
        const onsets = Float64Array.from({ length: 40 }, (_, b) => b * beat);
        const track = new Float32Array(21 * RATE);
        for (const at of onsets) track.set(click, at);
        const player = new StretchPlayer();
        player.setMusic([new Float32Array(21 * RATE)]);
        player.setMetronome(track, onsets);
        player.schedule({ kind: "play", frame: 0, position: 0, rate: 8 });
        const { clicks } = render(player, RATE);
        // A beat every 2756 output samples, each click 3000 long: never two at once
        expect(Math.max(...clicks)).toBeCloseTo(0.9, 5);
        expect(clicks[Math.floor(beat / 8) - 1]).toBeLessThan(0.05);
    });

    it("a new click track while playing clicks from the next beat, not every beat since play", () => {
        const click = Float32Array.from({ length: 400 }, (_, i) => 1 - i / 400);
        const beat = RATE / 2;
        const onsets = Float64Array.from({ length: 20 }, (_, b) => b * beat);
        const track = new Float32Array(11 * RATE);
        for (const at of onsets) track.set(click, at);
        const player = new StretchPlayer();
        player.setMusic([new Float32Array(11 * RATE)]);
        player.setMetronome(track, onsets);
        player.schedule({ kind: "play", frame: 0, position: 0, rate: 1 });
        // Up to the quantum just before beat 8: eight beats have passed
        const now = Math.floor((4 * RATE) / QUANTUM) * QUANTUM;
        render(player, now);
        // The new track mustn't play them all at once
        player.setMetronome(track.slice(), onsets.slice());
        const { clicks } = render(player, RATE, now);
        expect(Math.max(...clicks)).toBeCloseTo(1, 5);
        expect(clicks[4 * RATE - now]).toBeCloseTo(1, 5);
        expect(clicks[4 * RATE - now + beat]).toBeCloseTo(1, 5);
    });

    it("new music while playing carries on from where the show is", () => {
        const source = sine(4, 330).map((v, i) => v * Math.cos(i / 900));
        const player = new StretchPlayer();
        player.setMusic([source]);
        player.schedule({ kind: "play", frame: 0, position: 0, rate: 1 });
        const now = 345 * QUANTUM;
        render(player, now);
        player.setMusic([source.slice()]);
        const { music } = render(player, RATE, now);
        for (let i = STRETCH_WINDOW / 2; i < RATE; i += 97)
            expect(music[i]).toBeCloseTo(source[now + i], 5);
    });

    it("a stop before a queued play starts keeps it stopped", () => {
        const player = new StretchPlayer();
        player.setMusic([sine(2, 440)]);
        // Play is pressed, then Stop before the play's start lands
        player.schedule({
            kind: "play",
            frame: RATE / 10,
            position: 0,
            rate: 1,
        });
        player.schedule({ kind: "stop", frame: RATE / 100 });
        const { music } = render(player, RATE / 2);
        expect(Math.max(...music.map(Math.abs))).toBe(0);
        expect(player.isPlaying).toBe(false);
    });

    it("is silent once stopped", () => {
        const player = new StretchPlayer();
        player.setMusic([sine(2, 440)]);
        player.schedule({ kind: "play", frame: 0, position: 0, rate: 1 });
        player.schedule({ kind: "stop", frame: RATE / 4 });
        const { music } = render(player, RATE / 2);
        expect(Math.max(...music.subarray(RATE / 4).map(Math.abs))).toBe(0);
        expect(player.isPlaying).toBe(false);
    });
});
