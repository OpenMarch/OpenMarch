import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { useEffect, useRef } from "react";
import { Button, ButtonGroup, Tooltip, OverlayTrigger } from "react-bootstrap";
import * as Interfaces from "../../global/Interfaces";
import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { RegisteredActionsEnum, RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";

export default function UiSettingsToolbar({ className }: Interfaces.topBarComponentProps) {
    const { uiSettings } = useUiSettingsStore();
    const { linkRegisteredAction } = useRegisteredActionsStore();
    const togglePreviousPathsRef = useRef<HTMLButtonElement>(null);
    const toggleNextPathsRef = useRef<HTMLButtonElement>(null);

    // register the button refs for the keyboard shortcuts
    useEffect(() => {
        if (togglePreviousPathsRef.current) linkRegisteredAction(RegisteredActionsEnum.togglePreviousPagePaths, togglePreviousPathsRef);
        if (toggleNextPathsRef.current) linkRegisteredAction(RegisteredActionsEnum.toggleNextPagePaths, toggleNextPathsRef);
    }, [linkRegisteredAction]);

    return (
        <div>
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
                        Prev Paths
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
                        Next Paths
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>


        </div>
    );
}

