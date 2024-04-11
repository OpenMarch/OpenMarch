import { useUiSettingsStore } from "@/stores/uiSettings/useUiSettingsStore";
import { useEffect, useRef } from "react";
import { Button, ButtonGroup, Tooltip, OverlayTrigger } from "react-bootstrap";
import { TbAxisX, TbAxisY, TbKeyframeAlignCenterFilled } from "react-icons/tb";
import { MdAlignHorizontalCenter, MdAlignVerticalCenter } from "react-icons/md";
import * as Interfaces from "../../global/Interfaces";
import { useRegisteredActionsStore } from "@/stores/registeredAction/useRegisteredActionsStore";
import { RegisteredActionsEnum, RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import { FaEllipsisH, FaEllipsisV } from "react-icons/fa";

export default function UiSettingsToolbar({ className }: Interfaces.topBarComponentProps) {
    const { uiSettings } = useUiSettingsStore();
    const { linkRegisteredAction } = useRegisteredActionsStore();

    const lockXRef = useRef<HTMLButtonElement>(null);
    const lockYRef = useRef<HTMLButtonElement>(null);
    const snapToNearestWholeRef = useRef<HTMLButtonElement>(null);
    const setAllMarchersToPreviousPageRef = useRef<HTMLButtonElement>(null);
    const setSelectedMarchersToPreviousPageRef = useRef<HTMLButtonElement>(null);
    const alignVerticallyRef = useRef<HTMLButtonElement>(null);
    const alignHorizontallyRef = useRef<HTMLButtonElement>(null);
    const evenlyDistVerticallyRef = useRef<HTMLButtonElement>(null);
    const evenlyDistHorizontallyRef = useRef<HTMLButtonElement>(null);

    // register the button refs for the keyboard shortcuts
    useEffect(() => {
        if (lockXRef.current) linkRegisteredAction(RegisteredActionsEnum.lockX, lockXRef);
        if (lockYRef.current) linkRegisteredAction(RegisteredActionsEnum.lockY, lockYRef);
        if (snapToNearestWholeRef.current) linkRegisteredAction(RegisteredActionsEnum.snapToNearestWhole, snapToNearestWholeRef);
        if (setAllMarchersToPreviousPageRef.current) linkRegisteredAction(RegisteredActionsEnum.setAllMarchersToPreviousPage, setAllMarchersToPreviousPageRef);
        if (setSelectedMarchersToPreviousPageRef.current) linkRegisteredAction(RegisteredActionsEnum.setSelectedMarchersToPreviousPage, setSelectedMarchersToPreviousPageRef);
        if (alignVerticallyRef.current) linkRegisteredAction(RegisteredActionsEnum.alignVertically, alignVerticallyRef);
        if (alignHorizontallyRef.current) linkRegisteredAction(RegisteredActionsEnum.alignHorizontally, alignHorizontallyRef);
        if (evenlyDistVerticallyRef.current) linkRegisteredAction(RegisteredActionsEnum.evenlyDistributeVertically, evenlyDistVerticallyRef);
        if (evenlyDistHorizontallyRef.current) linkRegisteredAction(RegisteredActionsEnum.evenlyDistributeHorizontally, evenlyDistHorizontallyRef);
    }, [linkRegisteredAction, lockXRef, lockYRef, snapToNearestWholeRef, setAllMarchersToPreviousPageRef, setSelectedMarchersToPreviousPageRef]);

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
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.setAllMarchersToPreviousPage.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={setAllMarchersToPreviousPageRef}>
                        Set all to prev
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.setSelectedMarchersToPreviousPage.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={setSelectedMarchersToPreviousPageRef}>
                        Set selected to prev
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
            <ButtonGroup className={className}>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.alignVertically.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={alignVerticallyRef}>
                        <MdAlignVerticalCenter />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.alignHorizontally.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={alignHorizontallyRef}>
                        <MdAlignHorizontalCenter />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.evenlyDistributeVertically.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={evenlyDistVerticallyRef}>
                        <FaEllipsisV />
                    </Button>
                </OverlayTrigger>
                <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip id={`tooltip-top`}>
                        {RegisteredActionsObjects.evenlyDistributeHorizontally.instructionalString}
                    </Tooltip>}
                >
                    <Button ref={evenlyDistHorizontallyRef}>
                        <FaEllipsisH />
                    </Button>
                </OverlayTrigger>
            </ButtonGroup>
        </div>
    );
}

