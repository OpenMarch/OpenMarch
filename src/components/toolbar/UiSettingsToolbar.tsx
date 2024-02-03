import { useUiSettingsStore } from "@/global/Store";
import { useCallback, useEffect } from "react";
import { Button, ButtonGroup, Tooltip, OverlayTrigger } from "react-bootstrap";
import { TbAxisX, TbAxisY, TbKeyframeAlignCenterFilled } from "react-icons/tb";
import * as Interfaces from "../../global/Interfaces";
import { ReactKeyActions } from "../../global/KeyboardShortcuts";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";

export default function UiSettingsToolbar({ className }: Interfaces.topBarComponentProps) {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers } = useSelectedMarchers()!;

    const toggle = useCallback((setting: keyof Interfaces.UiSettings) => {
        setUiSettings({
            ...uiSettings,
            [setting]: !uiSettings[setting]
        }, setting);
    }, [uiSettings, setUiSettings]);

    const handleSnapButton = useCallback(() => {
        if (selectedMarchers.length < 1 || !selectedPage) return;

        const marcherPages = [];
        for (const selectedMarcher of selectedMarchers) {
            marcherPages.push({
                marcherId: selectedMarcher.id,
                pageId: selectedPage.id,
            });
        }
        window.electron.snapToGrid(marcherPages, 1, uiSettings.lockX, uiSettings.lockY);
    }, [selectedMarchers, selectedPage, uiSettings.lockX, uiSettings.lockY]);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (!document.activeElement?.matches("input, textarea, select, [contenteditable]") && !e.ctrlKey && !e.metaKey) {
            switch (e.key) {
                case ReactKeyActions.snapToNearestWhole:
                    handleSnapButton();
                    break;
            }
        }
    };

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockX ? "Enable " : "Lock "} X Movement [{ReactKeyActions.lockX.toUpperCase()}]
                    </Tooltip>}
                >
                    <Button variant={uiSettings.lockX ? "secondary" : "primary"} onClick={() => toggle("lockX")}>
                        < TbAxisX />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockY ? "Enable " : "Lock "} Y Movement [{ReactKeyActions.lockY.toUpperCase()}]
                    </Tooltip>}
                >
                    <Button variant={uiSettings.lockY ? "secondary" : "primary"} onClick={() => toggle("lockY")}>
                        < TbAxisY />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>Snap to nearest whole step [{ReactKeyActions.snapToNearestWhole.toUpperCase()}]</Tooltip>}
                >
                    <Button onClick={handleSnapButton}>
                        < TbKeyframeAlignCenterFilled />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>


        </div>
    );
}

