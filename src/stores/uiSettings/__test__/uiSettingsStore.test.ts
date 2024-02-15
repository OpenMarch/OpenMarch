import { act, renderHook } from '@testing-library/react';
import { useUiSettingsStore } from '../useUiSettingsStore';
import { ElectronApi } from 'electron/preload';

window.electron = {
    sendLockX: jest.fn(),
    sendLockY: jest.fn(),
} as Partial<ElectronApi> as ElectronApi;

describe('uiSettings Store', () => {
    const initialSettings = {
        isPlaying: false,
        lockX: false,
        lockY: false,
    };

    it('inital settings', async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useUiSettingsStore());

        expect(result.current.uiSettings).toEqual(initialSettings);
    });

    it('set is playing', async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            isPlaying: true,
        };

        // Expect isPlaying to be true
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect isPlaying to be false
        expectedSettings.isPlaying = false;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });

    it('set lockX and lockY', async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            lockX: true,
            lockY: false,
        };

        // Expect lockX to be true and lockY to be false
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect lockY to be true and lockX to be false
        expectedSettings.lockX = false;
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect both to be false
        expectedSettings.lockX = false;
        expectedSettings.lockY = false;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect both to be true
        expectedSettings.lockX = true;
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }));
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });

    it('expect that lockX and lockY cannot both be true when "type" is passed', async () => {
        const { result } = renderHook(() => useUiSettingsStore());

        const expectedSettings = {
            ...initialSettings,
            lockX: true,
            lockY: false,
        };

        // Set lockX to true and lockY to false initially
        act(() => result.current.setUiSettings({ ...expectedSettings }));

        // Expect that changing lockY to true will also change lockX to false
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }, "lockY"));
        expectedSettings.lockX = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect that changing lockX to true will also change lockY to false
        expectedSettings.lockX = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }, "lockX"));
        expectedSettings.lockY = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect that lockY will be false
        expectedSettings.lockX = true;
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }, "lockX"));
        expectedSettings.lockY = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);

        // Expect that lockX will be false
        expectedSettings.lockX = true;
        expectedSettings.lockY = true;
        act(() => result.current.setUiSettings({ ...expectedSettings }, "lockY"));
        expectedSettings.lockX = false;
        expect(result.current.uiSettings).toEqual(expectedSettings);
    });
});
