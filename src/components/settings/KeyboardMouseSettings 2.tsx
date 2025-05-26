import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { Switch } from "../ui/Switch";
import { Slider } from "../ui/Slider";

export default function MouseSettings() {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    return (
        <div className="flex flex-col gap-16">
            <h4 className="text-h5 leading-none">Mouse & Touchpad Settings</h4>
            <div className="flex flex-col gap-16 px-12">
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="zoomSensitivity" className="text-body">
                        Zoom sensitivity
                    </label>
                    <div className="w-[200px]">
                        <Slider
                            id="zoomSensitivity"
                            min={1}
                            max={10}
                            step={1}
                            value={[uiSettings.mouseSettings.zoomSensitivity]}
                            onValueChange={([value]) =>
                                setUiSettings({
                                    ...uiSettings,
                                    mouseSettings: {
                                        ...uiSettings.mouseSettings,
                                        zoomSensitivity: value,
                                    },
                                })
                            }
                        />
                    </div>
                </div>
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="touchpadGestures" className="text-body">
                        Enable touchpad gestures
                    </label>
                    <Switch
                        id="touchpadGestures"
                        checked={
                            uiSettings.mouseSettings.enableTouchpadGestures
                        }
                        onCheckedChange={(checked) =>
                            setUiSettings({
                                ...uiSettings,
                                mouseSettings: {
                                    ...uiSettings.mouseSettings,
                                    enableTouchpadGestures: checked,
                                },
                            })
                        }
                    />
                </div>
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="momentumScrolling" className="text-body">
                        Enable momentum scrolling
                    </label>
                    <Switch
                        id="momentumScrolling"
                        checked={
                            uiSettings.mouseSettings.enableMomentumScrolling
                        }
                        onCheckedChange={(checked) =>
                            setUiSettings({
                                ...uiSettings,
                                mouseSettings: {
                                    ...uiSettings.mouseSettings,
                                    enableMomentumScrolling: checked,
                                },
                            })
                        }
                    />
                </div>
                <div className="flex w-full items-center justify-between gap-16">
                    <label htmlFor="canvasPanning" className="text-body">
                        Enable canvas panning with left click
                    </label>
                    <Switch
                        id="canvasPanning"
                        checked={uiSettings.mouseSettings.enableCanvasPanning}
                        onCheckedChange={(checked) =>
                            setUiSettings({
                                ...uiSettings,
                                mouseSettings: {
                                    ...uiSettings.mouseSettings,
                                    enableCanvasPanning: checked,
                                },
                            })
                        }
                    />
                </div>
            </div>
        </div>
    );
}
