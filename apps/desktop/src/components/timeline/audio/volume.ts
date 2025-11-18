export const normalizeVolume = (volume: number): number => {
    const clamped = Math.min(100, Math.max(0, volume));
    return clamped / 100;
};

export const calculateMasterVolume = (
    volume: number,
    muted: boolean,
): number => {
    return muted ? 0 : normalizeVolume(volume);
};
