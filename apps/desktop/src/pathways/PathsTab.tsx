import { useMemo } from "react";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { performersOnly } from "@/global/classes/Marcher";
import { PathPenButton } from "./PathPenButton";
import { OrderButtons } from "./OrderButtons";
import { useFollowTheLeader } from "./followTheLeader";

/**
 * The top bar's Paths tab (pathways): drawing the way a marcher walks its move, kept apart from
 * the Shapes tab, which places marchers (owner, lab feedback on fork #674). Step 1 holds the
 * Path pen; curves and paths for groups join it later. Step 4g adds a line's order, shown only
 * with Follow-the-leader on (#1095).
 */
export default function PathsTab() {
    const selected = useSelectedMarchers()?.selectedMarchers;
    const performers = useMemo(
        () => performersOnly(selected ?? []),
        [selected],
    );
    const followTheLeader = useFollowTheLeader();
    return (
        <div className="flex w-full flex-wrap items-center gap-8">
            <PathPenButton performers={performers.length} />
            {followTheLeader && <OrderButtons performers={performers.length} />}
        </div>
    );
}
