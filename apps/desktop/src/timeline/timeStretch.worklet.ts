/**
 * The audio worklet that plays the music and the metronome at any speed (`StretchPlayer`). The
 * audio player loads it with `audioWorklet.addModule` and talks to it over its port; output 0 is
 * the music, output 1 the metronome, so each keeps its own gain. Times arrive in context seconds
 * and positions in show seconds; the player works in frames and samples.
 */
import { StretchPlayer } from "./timeStretch";
import {
    TIME_STRETCH_PROCESSOR,
    type StretchMessage,
} from "./timeStretchMessages";

// The AudioWorkletGlobalScope, which the DOM typings don't describe
declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
    readonly port: MessagePort;
}

class TimeStretchProcessor extends AudioWorkletProcessor {
    private player = new StretchPlayer();
    private disposed = false;

    constructor() {
        super();
        this.port.onmessage = (event: MessageEvent<StretchMessage>) => {
            const message = event.data;
            const frame = (seconds: number) => Math.round(seconds * sampleRate);
            switch (message.type) {
                case "music":
                    this.player.setMusic(message.channels);
                    break;
                case "metronome":
                    this.player.setMetronome(
                        message.track,
                        message.onsets.map((s) => s * sampleRate),
                    );
                    break;
                case "play":
                    this.player.schedule({
                        kind: "play",
                        frame: frame(message.at),
                        position: message.from * sampleRate,
                        rate: message.rate,
                    });
                    break;
                case "rate":
                    this.player.schedule({
                        kind: "rate",
                        frame: frame(message.at),
                        rate: message.rate,
                    });
                    break;
                case "stop":
                    this.player.schedule({
                        kind: "stop",
                        frame: frame(message.at),
                    });
                    break;
                case "dispose":
                    this.disposed = true;
                    this.player = new StretchPlayer();
                    break;
            }
        };
    }

    // Returning false lets the browser end the processor once its node is disconnected
    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
        if (this.disposed) return false;
        this.player.process(outputs[0] ?? [], outputs[1]?.[0], currentFrame);
        return true;
    }
}

registerProcessor(TIME_STRETCH_PROCESSOR, TimeStretchProcessor);
