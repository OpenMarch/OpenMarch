import {
    CubeIcon,
    FlagIcon,
    PolygonIcon,
    SlidersHorizontalIcon,
    WaveformIcon,
    type Icon,
} from "@phosphor-icons/react";
import { T } from "@tolgee/react";

/** One line each, in the order a returning director meets them. */
const ITEMS: readonly { key: string; icon: Icon }[] = [
    { key: "welcomeFlow.whatsNew.timeline", icon: WaveformIcon },
    { key: "welcomeFlow.whatsNew.modes", icon: SlidersHorizontalIcon },
    { key: "welcomeFlow.whatsNew.view3d", icon: CubeIcon },
    { key: "welcomeFlow.whatsNew.shapes", icon: PolygonIcon },
    { key: "welcomeFlow.whatsNew.props", icon: FlagIcon },
];

/** Returning people only: what this version adds, before the questions. */
export default function WhatsNewStep() {
    return (
        <ul className="flex flex-col gap-8" data-testid="welcome-whats-new">
            {ITEMS.map(({ key, icon: ItemIcon }) => (
                <li
                    key={key}
                    className="bg-fg-2 border-stroke rounded-6 flex items-center gap-12 border px-12 py-10"
                >
                    <ItemIcon
                        size={20}
                        className="text-accent shrink-0"
                        aria-hidden
                    />
                    <span className="text-body text-text">
                        <T keyName={key} />
                    </span>
                </li>
            ))}
        </ul>
    );
}
