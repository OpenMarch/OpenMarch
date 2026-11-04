import {
    ArrowSquareOutIcon,
    CubeIcon,
    FlagIcon,
    MagnetIcon,
    MusicNotesIcon,
    PolygonIcon,
    SlidersHorizontalIcon,
    WaveformIcon,
    type Icon,
} from "@phosphor-icons/react";
import { T } from "@tolgee/react";

/** The docs site, as Help › Docs/Guides opens it. */
const GUIDES_URL = "https://openmarch.com/guides";

/** One line each, in the order a returning director meets them. */
const ITEMS: readonly { key: string; icon: Icon }[] = [
    { key: "welcomeFlow.whatsNew.timeline", icon: WaveformIcon },
    { key: "welcomeFlow.whatsNew.tempo", icon: MusicNotesIcon },
    { key: "welcomeFlow.whatsNew.modes", icon: SlidersHorizontalIcon },
    { key: "welcomeFlow.whatsNew.shapes", icon: PolygonIcon },
    { key: "welcomeFlow.whatsNew.snapping", icon: MagnetIcon },
    { key: "welcomeFlow.whatsNew.props", icon: FlagIcon },
    { key: "welcomeFlow.whatsNew.view3d", icon: CubeIcon },
];

/**
 * Returning people only: what this version adds, before the questions, and a
 * link to the guides (opened in the browser, like the app's other help links).
 */
export default function WhatsNewStep() {
    return (
        <div className="flex flex-col gap-12">
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
            <a
                href={GUIDES_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sub text-accent flex items-center gap-4 self-center hover:underline"
                data-testid="welcome-whats-new-guides"
            >
                <T keyName="welcomeFlow.whatsNew.guides" />
                <ArrowSquareOutIcon size={14} aria-hidden />
            </a>
        </div>
    );
}
