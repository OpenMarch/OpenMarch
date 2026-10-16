/**
 * The playback engine that runs in the audio worklet (`timeStretch.worklet.ts`): the music and
 * the metronome at any playback speed, with the music's pitch kept, as YouTube does.
 *
 * - The music is time-stretched with WSOLA: windows of the source are overlap-added at a fixed
 *   output hop, each taken near where the speed says the show is, shifted a little to line up
 *   with the last one. At 1× the windows are contiguous, so the output is the source exactly.
 * - The metronome isn't stretched, which would smear its clicks: each click plays at its own
 *   speed from its beat's sample in the click track, when the show reaches that beat.
 *
 * Positions are in source samples, times in output frames (the worklet's `currentFrame`); the
 * source is at the output's sample rate, as `decodeAudioData` and the metronome make it. The
 * position at frame `f` is `anchorPosition + (f - anchorFrame) * rate`, the same line the main
 * thread's clock draws (`getLivePlaybackPosition`).
 */

/** Window length in samples, about 46 ms at 44.1 kHz */
export const STRETCH_WINDOW = 2048;
const HOP = STRETCH_WINDOW / 2;
/** How far a window may shift from its nominal place to line up with the last one */
const TOLERANCE = 512;
/** A click plays at most this many samples, or until the next beat's */
const MAX_CLICK = 8192;
/** A click cut short by the next one fades out over this many samples, so the cut doesn't pop */
const CLICK_FADE = 64;

// Periodic Hann, which sums to exactly 1 at a half-window hop
const HANN = (() => {
    const w = new Float32Array(STRETCH_WINDOW);
    for (let i = 0; i < STRETCH_WINDOW; i++)
        w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / STRETCH_WINDOW);
    return w;
})();

const EMPTY = new Float32Array(0);

/** A click playing: it reads its own track, so a new click track doesn't cut it */
interface Click {
    track: Float32Array;
    at: number;
    left: number;
    cut: boolean;
}

export type StretchEvent =
    | { kind: "play"; frame: number; position: number; rate: number }
    | { kind: "rate"; frame: number; rate: number }
    | { kind: "stop"; frame: number };

export class StretchPlayer {
    private music: Float32Array[] = [];
    private clickTrack: Float32Array = new Float32Array(0);
    private onsets: Float64Array = new Float64Array(0);

    private events: StretchEvent[] = [];
    private playing = false;
    private anchorFrame = 0;
    private anchorPosition = 0;
    private rate = 1;

    // WSOLA: the overlap-add buffer starts at output frame `accFrame`, and its first HOP
    // samples are final
    private acc: Float32Array[] = [];
    private accFrame = 0;
    private emitted = HOP;
    private lastStart: number | null = null;

    private clicks: Click[] = [];
    private nextOnset = 0;
    // The next output frame to render: where a change between quanta takes effect
    private frame = 0;

    /** New music; while playing it carries on from where the show is now */
    setMusic(channels: Float32Array[]): void {
        this.music = channels;
        this.accFrame = this.frame;
        this.restartSynthesis();
    }

    /**
     * The click track and its beats' samples, ascending. While playing, the clicks already
     * sounding finish and the next beat clicks from the new track.
     */
    setMetronome(track: Float32Array, onsets: Float64Array): void {
        this.clickTrack = track;
        this.onsets = onsets;
        if (this.playing)
            this.nextOnset = firstAtOrAfter(
                onsets,
                this.positionAt(this.frame),
            );
    }

    /**
     * Queues an event; one in the past applies at the next frame, as if it had applied on time.
     * A stop drops what was queued for its frame or later, so a play still waiting to start
     * doesn't start after it.
     */
    schedule(event: StretchEvent): void {
        if (event.kind === "stop")
            this.events = this.events.filter((e) => e.frame < event.frame);
        const at = this.events.findIndex((e) => e.frame > event.frame);
        if (at === -1) this.events.push(event);
        else this.events.splice(at, 0, event);
    }

    /** The show's position at `frame` while playing, in source samples */
    positionAt(frame: number): number {
        return this.anchorPosition + (frame - this.anchorFrame) * this.rate;
    }

    get isPlaying(): boolean {
        return this.playing;
    }

    /**
     * Fills one render quantum starting at output frame `frame`. `music` has the output's
     * channels (a mono source fills them all); `metronome` is one channel.
     */
    process(
        music: Float32Array[],
        metronome: Float32Array | undefined,
        frame: number,
    ): void {
        const length = music[0]?.length ?? metronome?.length ?? 0;
        let i = 0;
        while (i < length) {
            while (this.events.length && this.events[0].frame <= frame + i)
                this.apply(this.events.shift()!, frame + i);
            const nextEvent = this.events[0]?.frame ?? Infinity;
            const end = Math.min(length, Math.max(i + 1, nextEvent - frame));
            if (this.playing) {
                this.renderMusic(music, i, end);
                if (metronome) this.renderClicks(metronome, frame, i, end);
            } else {
                for (const channel of music) channel.fill(0, i, end);
                metronome?.fill(0, i, end);
            }
            i = end;
        }
        this.frame = frame + length;
    }

    private apply(event: StretchEvent, now: number): void {
        if (event.kind === "stop") {
            this.playing = false;
            return;
        }
        if (event.kind === "rate") {
            if (!this.playing) {
                this.rate = event.rate;
                return;
            }
            // Rebased where the event was meant to land, so the main thread's clock agrees
            this.anchorPosition = this.positionAt(event.frame);
            this.anchorFrame = event.frame;
            this.rate = event.rate;
            return;
        }
        this.playing = true;
        this.rate = event.rate;
        this.anchorFrame = event.frame;
        this.anchorPosition = event.position;
        this.accFrame = now;
        this.restartSynthesis();
        this.clicks = [];
        this.nextOnset = firstAtOrAfter(
            this.onsets,
            this.positionAt(now) - 0.5,
        );
    }

    private restartSynthesis(): void {
        const channels = Math.max(1, this.music.length);
        if (this.acc.length !== channels)
            this.acc = Array.from(
                { length: channels },
                () => new Float32Array(STRETCH_WINDOW),
            );
        for (const a of this.acc) a.fill(0);
        this.emitted = HOP;
        this.lastStart = null;
    }

    private renderMusic(out: Float32Array[], from: number, to: number) {
        let i = from;
        while (i < to) {
            if (this.emitted === HOP) this.nextWindow();
            const n = Math.min(to - i, HOP - this.emitted);
            for (let c = 0; c < out.length; c++) {
                const acc = this.acc[Math.min(c, this.acc.length - 1)];
                out[c].set(acc.subarray(this.emitted, this.emitted + n), i);
            }
            this.emitted += n;
            i += n;
        }
    }

    // Shifts out the emitted hop and adds the window that starts at the new `accFrame`
    private nextWindow(): void {
        if (this.lastStart !== null) {
            for (const a of this.acc) {
                a.copyWithin(0, HOP);
                a.fill(0, STRETCH_WINDOW - HOP);
            }
            this.accFrame += HOP;
        }
        this.emitted = 0;
        // Centered on where the show is at the window's middle, so the stretch adds no delay
        const nominal = Math.round(
            this.positionAt(this.accFrame + STRETCH_WINDOW / 2) -
                STRETCH_WINDOW / 2,
        );
        const start = this.chooseStart(nominal);
        this.lastStart = start;
        for (let c = 0; c < this.acc.length; c++) {
            const src = this.music[c];
            if (!src) continue;
            const acc = this.acc[c];
            const lo = Math.max(0, -start);
            const hi = Math.min(STRETCH_WINDOW, src.length - start);
            for (let i = lo; i < hi; i++) acc[i] += HANN[i] * src[start + i];
        }
    }

    // The window start near `nominal` that best continues the last window
    private chooseStart(nominal: number): number {
        if (this.lastStart === null) return nominal;
        const natural = this.lastStart + HOP;
        // At 1× the natural continuation is exact; keep it while it's within reach
        if (this.rate === 1 && Math.abs(natural - nominal) <= TOLERANCE)
            return natural;
        let best = nominal;
        let bestScore = -Infinity;
        // Coarse, then fine around the coarse best
        for (let d = -TOLERANCE; d <= TOLERANCE; d += 8) {
            const s = this.score(natural, nominal + d, 4);
            if (s > bestScore) {
                bestScore = s;
                best = nominal + d;
            }
        }
        const coarse = best;
        for (let d = -7; d <= 7; d++) {
            const s = this.score(natural, coarse + d, 1);
            if (s > bestScore) {
                bestScore = s;
                best = coarse + d;
            }
        }
        return best;
    }

    // How well the window at `start` continues the one at `natural`. A method, not a closure,
    // so the audio thread doesn't allocate one per window
    private score(natural: number, start: number, step: number): number {
        let dot = 0;
        let energy = 1e-9;
        // The first channel stands for the rest, so a long show isn't copied again
        const x = this.music[0] ?? EMPTY;
        for (let i = 0; i < HOP; i += step) {
            const a = x[natural + i] ?? 0;
            const b = x[start + i] ?? 0;
            dot += a * b;
            energy += b * b;
        }
        return dot / Math.sqrt(energy);
    }

    private renderClicks(
        out: Float32Array,
        frame: number,
        from: number,
        to: number,
    ): void {
        const track = this.clickTrack;
        const onsets = this.onsets;
        for (let i = from; i < to; i++) {
            const position = this.positionAt(frame + i);
            while (
                this.nextOnset < onsets.length &&
                onsets[this.nextOnset] <= position
            ) {
                const at = onsets[this.nextOnset];
                const next = onsets[this.nextOnset + 1] ?? Infinity;
                // Until the next beat's click starts, in output samples: faster than 1× the
                // next click comes sooner than its beat's gap in the track, and they'd pile up
                const gap = Math.floor((next - at) / Math.max(1, this.rate));
                this.clicks.push({
                    track,
                    at: Math.floor(at),
                    left: Math.min(MAX_CLICK, gap),
                    cut: gap < MAX_CLICK && this.rate > 1,
                });
                this.nextOnset++;
            }
            let sample = 0;
            for (const click of this.clicks) {
                if (click.left <= 0) continue;
                const fade =
                    click.cut && click.left < CLICK_FADE
                        ? click.left / CLICK_FADE
                        : 1;
                sample += (click.track[click.at] ?? 0) * fade;
                click.at++;
                click.left--;
            }
            out[i] = sample;
            if (this.clicks.length && this.clicks[0].left <= 0)
                removeFinished(this.clicks);
        }
    }
}

// In place, so the audio thread doesn't allocate a new list per click
function removeFinished(clicks: Click[]): void {
    let kept = 0;
    for (const click of clicks) if (click.left > 0) clicks[kept++] = click;
    clicks.length = kept;
}

function firstAtOrAfter(sorted: Float64Array, value: number): number {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < value) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
