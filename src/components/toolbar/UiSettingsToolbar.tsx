import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { useEffect, useRef } from "react";
import { Button, ButtonGroup, Tooltip, OverlayTrigger } from "react-bootstrap";
import { TbAxisX, TbAxisY, TbKeyframeAlignCenterFilled } from "react-icons/tb";
import * as Interfaces from "../../global/Interfaces";
import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { RegisteredActionsEnum, RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";

export default function UiSettingsToolbar({ className }: Interfaces.topBarComponentProps) {
    const { uiSettings } = useUiSettingsStore();
    const { linkRegisteredAction } = useRegisteredActionsStore();
    const lockXRef = useRef<HTMLButtonElement>(null);
    const lockYRef = useRef<HTMLButtonElement>(null);
    const snapToNearestWholeRef = useRef<HTMLButtonElement>(null);
    const togglePreviousPathsRef = useRef<HTMLButtonElement>(null);
    const toggleNextPathsRef = useRef<HTMLButtonElement>(null);

    // register the button refs for the keyboard shortcuts
    useEffect(() => {
        if (lockXRef.current) linkRegisteredAction(RegisteredActionsEnum.lockX, lockXRef);
        if (lockYRef.current) linkRegisteredAction(RegisteredActionsEnum.lockY, lockYRef);
        if (snapToNearestWholeRef.current) linkRegisteredAction(RegisteredActionsEnum.snapToNearestWhole, snapToNearestWholeRef);
        if (togglePreviousPathsRef.current) linkRegisteredAction(RegisteredActionsEnum.togglePreviousPagePaths, togglePreviousPathsRef);
        if (toggleNextPathsRef.current) linkRegisteredAction(RegisteredActionsEnum.toggleNextPagePaths, toggleNextPathsRef);
    }, [linkRegisteredAction, lockXRef, lockYRef]);

    return (
        <div>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockX ?
                            RegisteredActionsObjects.lockX.instructionalStringToggleOff :
                            RegisteredActionsObjects.lockX.instructionalStringToggleOn
                        }
                    </Tooltip>}
                >
                    <Button
                        variant={uiSettings.lockX ? "secondary" : "primary"}
                        ref={lockXRef}
                    >
                        < TbAxisX />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {uiSettings.lockY ?
                            RegisteredActionsObjects.lockY.instructionalStringToggleOff :
                            RegisteredActionsObjects.lockY.instructionalStringToggleOn
                        }
                    </Tooltip>}
                >
                    <Button
                        variant={uiSettings.lockY ? "secondary" : "primary"}
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
                        {RegisteredActionsObjects.snapToNearestWhole.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={snapToNearestWholeRef}>
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
                                RegisteredActionsObjects.togglePreviousPagePaths.instructionalStringToggleOff :
                                RegisteredActionsObjects.togglePreviousPagePaths.instructionalStringToggleOn
                            }
                        </Tooltip>
                    }
                >
                    <Button
                        variant={uiSettings.previousPaths ? "primary" : "secondary"}
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
                                RegisteredActionsObjects.toggleNextPagePaths.instructionalStringToggleOff :
                                RegisteredActionsObjects.toggleNextPagePaths.instructionalStringToggleOn
                            }
                        </Tooltip>
                    }
                >
                    <Button
                        variant={uiSettings.nextPaths ? "primary" : "secondary"}
                        ref={toggleNextPathsRef}
                    >
                        Next Dots
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>


        </div>
    );
}

