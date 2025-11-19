/**
 * Web Worker for processing audio offset operations off the main thread.
 * This prevents UI blocking when trimming/padding large audio files.
 */

interface AudioOffsetMessage {
    type: "processAudio";
    audioBuffer: {
        numberOfChannels: number;
        length: number;
        sampleRate: number;
        channelData: Float32Array[];
    };
    offsetSeconds: number;
}

interface AudioOffsetResponse {
    type: "audioProcessed";
    audioBuffer: {
        numberOfChannels: number;
        length: number;
        sampleRate: number;
        channelData: Float32Array[];
    };
    waveformBuffer: ArrayBuffer;
}

interface ErrorResponse {
    type: "error";
    message: string;
}

/**
 * Helper function to apply audio offset by padding or trimming the audio buffer
 * @param originalBuffer - The original decoded audio buffer data
 * @param offsetSeconds - The offset in seconds (positive = pad start, negative = trim start)
 * @returns Channel data for the new buffer
 */
function applyAudioOffset(
    channelData: Float32Array[],
    length: number,
    numberOfChannels: number,
    sampleRate: number,
    offsetSeconds: number,
): { newChannelData: Float32Array[]; newLength: number } {
    const offsetSamples = Math.floor(Math.abs(offsetSeconds) * sampleRate);

    if (offsetSeconds > 0) {
        // Positive offset: pad silence at the start
        const newLength = length + offsetSamples;
        const newChannelData: Float32Array[] = [];

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const newData = new Float32Array(newLength);
            // Leave the first offsetSamples as silence (0), then copy original data
            newData.set(channelData[channel], offsetSamples);
            newChannelData.push(newData);
        }

        return { newChannelData, newLength };
    } else if (offsetSeconds < 0) {
        // Negative offset: trim from the start
        const newLength = Math.max(0, length - offsetSamples);
        const newChannelData: Float32Array[] = [];

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const newData = new Float32Array(newLength);
            // Copy from offsetSamples to the end
            newData.set(channelData[channel].subarray(offsetSamples, length));
            newChannelData.push(newData);
        }

        return { newChannelData, newLength };
    }

    // No offset, return original
    return { newChannelData: channelData, newLength: length };
}

/**
 * Helper function to create a padded or trimmed ArrayBuffer for waveform visualization
 * @param offsetChannelData - The offset audio channel data
 * @param length - The length of the audio in samples
 * @param numberOfChannels - Number of audio channels
 * @param sampleRate - The sample rate of the audio
 * @returns A new ArrayBuffer with padding or trimming applied (WAV format)
 */
function createWaveformBuffer(
    offsetChannelData: Float32Array[],
    length: number,
    numberOfChannels: number,
    sampleRate: number,
): ArrayBuffer {
    // WAV file header size
    const headerSize = 44;
    const bytesPerSample = 2; // 16-bit audio
    const dataSize = length * numberOfChannels * bytesPerSample;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // Sub-chunk 1 Size
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true); // ByteRate
    view.setUint16(32, numberOfChannels * bytesPerSample, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    // Write audio data
    let offset = headerSize;
    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = offsetChannelData[channel][i];
            // Convert float sample to 16-bit PCM
            const s = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
            offset += 2;
        }
    }

    return buffer;
}

// Listen for messages from the main thread
onmessage = async (e: MessageEvent<AudioOffsetMessage>) => {
    try {
        const { audioBuffer, offsetSeconds } = e.data;
        const { numberOfChannels, length, sampleRate, channelData } =
            audioBuffer;

        // Early bailout: if offset is 0, skip processing to avoid unnecessary work
        if (offsetSeconds === 0 || Math.abs(offsetSeconds) < 0.001) {
            // Create waveform buffer using original data without modification
            const waveformBuffer = createWaveformBuffer(
                channelData,
                length,
                numberOfChannels,
                sampleRate,
            );

            // Send the data back without modification
            const response: AudioOffsetResponse = {
                type: "audioProcessed",
                audioBuffer: {
                    numberOfChannels,
                    length,
                    sampleRate,
                    channelData,
                },
                waveformBuffer,
            };

            // Transfer the buffers to avoid copying
            const transferList: Transferable[] = [waveformBuffer];
            channelData.forEach((data) => transferList.push(data.buffer));

            postMessage(response, { transfer: transferList });
            return;
        }

        // Apply the offset
        const { newChannelData, newLength } = applyAudioOffset(
            channelData,
            length,
            numberOfChannels,
            sampleRate,
            offsetSeconds,
        );

        // Create waveform buffer
        const waveformBuffer = createWaveformBuffer(
            newChannelData,
            newLength,
            numberOfChannels,
            sampleRate,
        );

        // Send the processed data back to the main thread
        const response: AudioOffsetResponse = {
            type: "audioProcessed",
            audioBuffer: {
                numberOfChannels,
                length: newLength,
                sampleRate,
                channelData: newChannelData,
            },
            waveformBuffer,
        };

        // Transfer the buffers to avoid copying
        const transferList: Transferable[] = [waveformBuffer];
        newChannelData.forEach((data) => transferList.push(data.buffer));

        postMessage(response, { transfer: transferList });
    } catch (error) {
        const errorResponse: ErrorResponse = {
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
        };
        postMessage(errorResponse);
    }
};
