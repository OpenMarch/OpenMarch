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
    minimumDuration?: number;
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
 * Helper function to pad the end of audio with silence if it's shorter than the minimum duration
 * @param channelData - The audio channel data
 * @param length - The length of the audio in samples
 * @param numberOfChannels - Number of audio channels
 * @param sampleRate - The sample rate of the audio
 * @param minimumDuration - The minimum duration in seconds
 * @returns Channel data for the new buffer with padding applied
 */
function padAudioToMinimumDuration(
    channelData: Float32Array[],
    length: number,
    numberOfChannels: number,
    sampleRate: number,
    minimumDuration: number,
): { newChannelData: Float32Array[]; newLength: number } {
    const currentDuration = length / sampleRate;

    // If audio is already longer than or equal to minimum, no padding needed
    if (currentDuration >= minimumDuration) {
        return { newChannelData: channelData, newLength: length };
    }

    // Calculate the minimum number of samples needed
    const minimumSamples = Math.ceil(minimumDuration * sampleRate);

    const newChannelData: Float32Array[] = [];
    for (let channel = 0; channel < numberOfChannels; channel++) {
        const newData = new Float32Array(minimumSamples);
        // Copy original data
        newData.set(channelData[channel], 0);
        // The rest is already zeros (silence) by default
        newChannelData.push(newData);
    }

    return { newChannelData, newLength: minimumSamples };
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
        const { audioBuffer, offsetSeconds, minimumDuration } = e.data;
        const { numberOfChannels, length, sampleRate, channelData } =
            audioBuffer;

        // Start with the original data
        let processedChannelData = channelData;
        let processedLength = length;

        // Apply the offset if needed
        if (offsetSeconds !== 0 && Math.abs(offsetSeconds) >= 0.001) {
            const offsetResult = applyAudioOffset(
                channelData,
                length,
                numberOfChannels,
                sampleRate,
                offsetSeconds,
            );
            processedChannelData = offsetResult.newChannelData;
            processedLength = offsetResult.newLength;
        }

        // Apply minimum duration padding if needed
        if (minimumDuration !== undefined && minimumDuration > 0) {
            const paddingResult = padAudioToMinimumDuration(
                processedChannelData,
                processedLength,
                numberOfChannels,
                sampleRate,
                minimumDuration,
            );
            processedChannelData = paddingResult.newChannelData;
            processedLength = paddingResult.newLength;
        }

        // Create waveform buffer
        const waveformBuffer = createWaveformBuffer(
            processedChannelData,
            processedLength,
            numberOfChannels,
            sampleRate,
        );

        // Send the processed data back to the main thread
        const response: AudioOffsetResponse = {
            type: "audioProcessed",
            audioBuffer: {
                numberOfChannels,
                length: processedLength,
                sampleRate,
                channelData: processedChannelData,
            },
            waveformBuffer,
        };

        // Transfer the buffers to avoid copying
        const transferList: Transferable[] = [waveformBuffer];
        processedChannelData.forEach((data) => transferList.push(data.buffer));

        postMessage(response, { transfer: transferList });
    } catch (error) {
        const errorResponse: ErrorResponse = {
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
        };
        postMessage(errorResponse);
    }
};
