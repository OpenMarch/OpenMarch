import React from "react";
import { DeviceMobileIcon } from "@phosphor-icons/react";
import { SidebarModalLauncher } from "../sidebar/SidebarModal";
import { useQuery } from "@tanstack/react-query";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import EnsembleList from "./EnsembleList";
import MobileExportView from "./MobileExportView";

/**
 * Mobile Export Modal Component
 */
export default function MobileExportModal({
    label = <DeviceMobileIcon size={24} />,
    buttonClassName,
}: {
    label?: string | React.ReactNode;
    buttonClassName?: string;
}) {
    return (
        <SidebarModalLauncher
            contents={<MobileExportModalContents />}
            newContentId="mobile-export"
            buttonLabel={label}
            className={buttonClassName}
        />
    );
}

/**
 * Modal contents that conditionally shows EnsembleList or MobileExportView
 */
function MobileExportModalContents() {
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );

    const hasEnsembleId = !!workspaceSettings?.otmEnsembleId;

    // If no ensemble ID is set, show the list
    if (!hasEnsembleId) {
        return <EnsembleList />;
    }

    // If ensemble ID is set, show the export view
    return <MobileExportView />;
}
