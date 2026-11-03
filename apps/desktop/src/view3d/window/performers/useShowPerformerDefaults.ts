import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { performerDefaultsOf } from "@/settings/workspaceSettings";

/** The show's saved performer defaults (left foot and foot on the dot unless stored). */
export function useShowPerformerDefaults() {
    const { data } = useQuery(workspaceSettingsQueryOptions());
    return useMemo(() => performerDefaultsOf(data), [data]);
}
