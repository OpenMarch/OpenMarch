import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { useCallback, useEffect, useRef } from "react";
import { Button, ButtonGroup, Tooltip, OverlayTrigger } from "react-bootstrap";
import { TbAxisX, TbAxisY, TbKeyframeAlignCenterFilled } from "react-icons/tb";
import * as Interfaces from "../../global/Interfaces";
import { DefinedKeyboardActions } from "../../KeyboardListeners";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useKeyboardActionsStore } from "@/stores/keyboardShortcutButtons/useKeyboardActionsStore";

export default function UiSettingsToolbar({ className }: Interfaces.topBarComponentProps) {
    const { uiSettings, setUiSettings } = useUiSettingsStore();
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers } = useSelectedMarchers()!;
    const { registerKeyboardAction } = useKeyboardActionsStore();
    const lockXRef = useRef<HTMLButtonElement>(null);
    const lockYRef = useRef<HTMLButtonElement>(null);
    const snapToNearestWholeRef = useRef<HTMLButtonElement>(null);
    const togglePreviousPathsRef = useRef<HTMLButtonElement>(null);
    const toggleNextPathsRef = useRef<HTMLButtonElement>(null);

    // register the button refs for the keyboard shortcuts
    useEffect(() => {
        if (lockXRef.current)
            registerKeyboardAction(DefinedKeyboardActions.lockX.keyString, () => lockXRef.current?.click());
        if (lockYRef.current)
            registerKeyboardAction(DefinedKeyboardActions.lockY.keyString, () => lockYRef.current?.click());
        if (snapToNearestWholeRef.current)
            registerKeyboardAction(DefinedKeyboardActions.snapToNearestWhole.keyString, () => snapToNearestWholeRef.current?.click());
        if (togglePreviousPathsRef.current)
            registerKeyboardAction(DefinedKeyboardActions.togglePreviousPagePaths.keyString, () => togglePreviousPathsRef.current?.click());
        if (toggleNextPathsRef.current)
            registerKeyboardAction(DefinedKeyboardActions.toggleNextPagePaths.keyString, () => toggleNextPathsRef.current?.click());
    }, [lockXRef, lockYRef, registerKeyboardAction]);

    /**
     * Toggle a setting, lockX or lockY
     */
    const toggle = useCallback((setting: keyof Interfaces.UiSettings) => {
        setUiSettings({
            ...uiSettings,
            [setting]: !uiSettings[setting]
        }, setting);
    }, [uiSettings, setUiSettings]);

    /**
     * Snap the selected marchers to the nearest whole step
     */
    const handleSnapButton = useCallback(() => {
        if (selectedMarchers.length < 1 || !selectedPage) return;

        const marcherPages = [];
        for (const selectedMarcher of selectedMarchers) {
            marcherPages.push({
                marcherId: selectedMarcher.id,
                pageId: selectedPage.id,
            });
        }
        window.electron.sendSnapToGrid(marcherPages, 1, uiSettings.lockX, uiSettings.lockY);
    }, [selectedMarchers, selectedPage, uiSettings.lockX, uiSettings.lockY]);

    return (
        <div>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockX ?
                            DefinedKeyboardActions.lockX.instructionalStringToggleOn :
                            DefinedKeyboardActions.lockX.instructionalStringToggleOff
                        }
                    </Tooltip>}
                >
                    <Button
                        variant={uiSettings.lockX ? "secondary" : "primary"}
                        onClick={() => toggle("lockX")}
                        ref={lockXRef}
                    >
                        < TbAxisX />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockY ?
                            DefinedKeyboardActions.lockY.instructionalStringToggleOn :
                            DefinedKeyboardActions.lockY.instructionalStringToggleOff
                        }
                    </Tooltip>}
                >
                    <Button
                        variant={uiSettings.lockY ? "secondary" : "primary"}
                        onClick={() => toggle("lockY")}
                        ref={lockYRef}
                    >
                        < TbAxisY />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {DefinedKeyboardActions.snapToNearestWhole.instructionalString}
                    </Tooltip>}
                >
                    <Button onClick={handleSnapButton} ref={snapToNearestWholeRef}>
                        < TbKeyframeAlignCenterFilled />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>

            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={
                        <Tooltip id={`tooltip-top`}>
                            {uiSettings.previousPaths ?
                                DefinedKeyboardActions.togglePreviousPagePaths.instructionalStringToggleOff :
                                DefinedKeyboardActions.togglePreviousPagePaths.instructionalStringToggleOn
                            }
                        </Tooltip>
                    }
                >
                    <Button
                        variant={uiSettings.previousPaths ? "primary" : "secondary"}
                        onClick={() => toggle("previousPaths")}
                        ref={togglePreviousPathsRef}
                    >
                        Prev Dots
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={
                        <Tooltip id={`tooltip-top`}>
                            {uiSettings.nextPaths ?
                                DefinedKeyboardActions.toggleNextPagePaths.instructionalStringToggleOff :
                                DefinedKeyboardActions.toggleNextPagePaths.instructionalStringToggleOn
                            }
                        </Tooltip>
                    }
                >
                    <Button
                        variant={uiSettings.nextPaths ? "primary" : "secondary"}
                        onClick={() => toggle("nextPaths")}
                        ref={toggleNextPathsRef}
                    >
                        Next Dots
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>


        </div>
    );
}

