import { useUiSettingsStore } from "@/global/Store";
import { useCallback } from "react";
import { Button, ButtonGroup, Tooltip, OverlayTrigger } from "react-bootstrap";
import { TbAxisX, TbAxisY } from "react-icons/tb";
import * as Interfaces from "../../global/Interfaces";
import { KeyActions } from "../../global/Constants";

export default function UiSettingsToolbar({ className }: Interfaces.topBarComponentProps) {
    const { uiSettings, setUiSettings } = useUiSettingsStore();

    const toggle = useCallback((setting: keyof Interfaces.UiSettings) => {
        setUiSettings({
            ...uiSettings,
            [setting]: !uiSettings[setting]
        }, setting);
    }, [uiSettings, setUiSettings]);

    return (
        <div>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockX ? "Enable " : "Lock "} X Movement [{KeyActions.lockX.toUpperCase()}]
                    </Tooltip>}
                >
                    <Button variant={uiSettings.lockX ? "secondary" : "primary"} onClick={() => toggle("lockX")}>
                        < TbAxisX />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockY ? "Enable " : "Lock "} Y Movement [{KeyActions.lockY.toUpperCase()}]
                    </Tooltip>}
                >
                    <Button variant={uiSettings.lockY ? "secondary" : "primary"} onClick={() => toggle("lockY")}>
                        < TbAxisY />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>

        </div>
    );
}
