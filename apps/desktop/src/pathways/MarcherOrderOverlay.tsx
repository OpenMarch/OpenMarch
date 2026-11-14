/**
 * A line's order on the field (pathways steps 4h and 4i): a lane under the line's dots, fading from
 * dark at the leader to pale at the tail, cut away round every dot so dots and selection rings keep
 * their own color, with a solid tip past the leader (the drawing rules are `orderLane`). It carries
 * its own ground on any floor: a light wash just strong enough for the floor under it (`floor`; none
 * on a white field), a faint rim, and a halo round each of its dots in the tone that sets that dot's
 * color apart. The fade is multiplied onto the field, so it reads as ink. An order that runs back over its own
 * marchers loses the tip and shows its numbers; one whose legs cross thins to a thread with darts and
 * shows its numbers. A guessed order isn't drawn at rest; while Alt is held it shows hollow and
 * dashed. Position badges show while Alt is held, and always while Set order is on (touch has no
 * Alt). Set order draws the lane it has picked so far, growing behind the pointer, with the bar that
 * says how to go on and keeps or cancels it.
 *
 * The forms are read once per edit (`followOrderForms`), the selection's only unless Always shows
 * every line; what's drawn follows the camera and where the lines' marchers are drawn
 * (`FieldMarchers`), so it's worked out again only when either changes. It sits over the selection
 * box and its handles, takes no presses, and hides while the Follow tool or a shape tool is open
 * (they draw their own ends).
 */
import {
    memo,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import Shortcut from "@/components/ui/Shortcut";
import { performersOnly } from "@/global/classes/Marcher";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useIsPlaying } from "@/context/IsPlayingContext";
import {
    fieldBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { runAction } from "@/shortcuts/registry";
import { readShortcutContext } from "@/shortcuts/context";
import type { FieldMarchers } from "@/field/three/fieldMarchers";
import type { FieldTheme } from "@openmarch/core";
import { useFieldViewStore, type FieldView } from "@/field/three/fieldView";
import { ordersInForce } from "@/db-functions/rememberedOrder";
import { DOT_RADIUS } from "@/field/editor/hitTest";
import { setSelectionCover } from "@/field/editor/selectionCoverStore";
import type { FieldRect } from "@/field/editor/selectionArea";
import { dotSizes, ringReach } from "@/field/three/selectionRing";
import {
    labelBoxAt,
    autoLabelSizeOf,
    labelSizeOf,
    type LabelStyle,
} from "@/field/three/layers/LabelsLayer";
import type { GlyphAtlas } from "@/field/three/sdfText";
import { useShapeToolStore } from "@/shapes/tool/shapeToolStore";
import {
    Divider,
    EDITOR_BAR,
    EditorButton,
    IconButton,
} from "@/shapes/editor/EditorBarParts";
import {
    followOrderForms,
    formsCover,
    shownOrderOf,
    useMarcherOrderStore,
    withOwnOrder,
    type ShownOrder,
} from "./marcherOrderStore";
import type { XY } from "./orderSweep";
import {
    BADGE_FONT,
    BADGE_HEIGHT,
    badgeWidth,
    classifyOrder,
    distanceToSegment,
    alongFractions,
    FADE_LEAD,
    FADE_TAIL,
    fadeAt,
    FOLDED_INK,
    haloTone,
    haloWidth,
    laneHalfWidth,
    laneSamplePoints,
    ownHalfWidth,
    THREAD_LEAD,
    THREAD_TAIL,
    washAlpha,
    laneTip,
    neighborHalfWidths,
    placeNumbers,
    threadDarts,
    type Box,
    type OrderLaneKind,
    type OtherLane,
    type PlacedBadge,
} from "./orderLane";
import { usePathPenStore } from "./pathPenStore";
import type { FloorSampler } from "./floorSampler";
import { resolveMarcherLook } from "@/entity-components/appearance";

/** The lane's dark ink: the tip, the leader's badge, the darts */
const LANE_INK = "#1c1f26";
/** How far the selection box stands clear of the selection's lane and names, in CSS px (step 4j) */
const SELECTION_CLEARANCE = 5;

/**
 * A guessed order's colors on a light or a dark field (its hollow dashed outline has no ground of
 * its own), and the darts' ink
 */
interface OrderInk {
    readonly thread: string;
    readonly guess: string;
    readonly guessTip: string;
}

function orderInk(dark: boolean): OrderInk {
    return dark
        ? {
              thread: "rgba(255,255,255,0.85)",
              guess: "rgba(255,255,255,0.9)",
              guessTip: "rgba(255,255,255,0.15)",
          }
        : {
              thread: "rgba(28,31,38,0.55)",
              guess: "rgba(28,31,38,0.6)",
              guessTip: "#fff",
          };
}

/**
 * Whether Alt (Option) is held for the position numbers: not while typing in a text field, nor
 * while a press is held (Alt then changes a drag's snapping, it doesn't ask for numbers); let go
 * when the window loses focus
 */
function useAltHeld(enabled: boolean): boolean {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        if (!enabled) {
            setHeld(false);
            return;
        }
        let alt = false;
        let pressed = false;
        const update = () =>
            setHeld(alt && !pressed && !readShortcutContext().inTextInput);
        const keys = (event: KeyboardEvent) => {
            alt = event.altKey;
            update();
        };
        const down = () => {
            pressed = true;
            update();
        };
        const up = () => {
            pressed = false;
            update();
        };
        const blur = () => {
            alt = false;
            pressed = false;
            update();
        };
        window.addEventListener("keydown", keys, true);
        window.addEventListener("keyup", keys, true);
        window.addEventListener("pointerdown", down, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("keydown", keys, true);
            window.removeEventListener("keyup", keys, true);
            window.removeEventListener("pointerdown", down, true);
            window.removeEventListener("pointerup", up, true);
            window.removeEventListener("pointercancel", up, true);
            window.removeEventListener("blur", blur);
        };
    }, [enabled]);
    return held;
}

/**
 * Where `ids` are drawn (`FieldMarchers.drawn`), as the same map until one of them moves, so a fill
 * that moves no one of them (another marcher dragged, a selection change) works nothing out again
 */
function useDrawnAt(
    marchers: FieldMarchers,
    ids: readonly number[],
    version: number,
): ReadonlyMap<number, XY> {
    const where = useMemo(() => {
        void version;
        const at = marchers.drawn(ids);
        return ids
            .map((id) => {
                const p = at.get(id);
                return p ? `${p.x},${p.y}` : "-";
            })
            .join(";");
    }, [marchers, ids, version]);
    return useMemo(() => {
        void where;
        return marchers.drawn(ids);
    }, [marchers, ids, where]);
}

/**
 * Where every marcher (not an item) is drawn, in field units, as the same array until one of them
 * moves: the marchers a leg of the line mustn't cover
 */
function useEveryoneAt(
    marchers: FieldMarchers,
    version: number,
    enabled: boolean,
): readonly XY[] {
    const last = useRef<readonly XY[]>([]);
    return useMemo(() => {
        void version;
        if (!enabled) return (last.current = []);
        const at: XY[] = [];
        const { positions, hidden, isItem } = marchers;
        for (let i = 0; i < marchers.ids.length; i++)
            if (!hidden[i] && !isItem[i])
                at.push({ x: positions[i * 2]!, y: positions[i * 2 + 1]! });
        const before = last.current;
        const same =
            before.length === at.length &&
            before.every((p, i) => p.x === at[i]!.x && p.y === at[i]!.y);
        return same ? before : (last.current = at);
    }, [marchers, version, enabled]);
}

/** The marchers' name labels as the field draws them, for the line to keep clear of */
export interface OrderLabels {
    /** Each marcher's label text, by id */
    readonly text: ReadonlyMap<number, string>;
    readonly style: LabelStyle;
    /** The labels' font, to measure them */
    readonly atlas: GlyphAtlas;
    /**
     * Labels smaller than this on screen, in CSS px per em, aren't drawn: the field quality's
     * `labelFadeFrom`
     */
    readonly fadeFrom: number;
}

/** A line as drawn, on screen, and how it looks */
interface DrawnLine {
    readonly kind: OrderLaneKind;
    readonly guessed: boolean;
    /** Leader first; Set order's pointer last while it grows the line */
    readonly points: readonly XY[];
    readonly halfWidth: number;
    /** The solid tip past the leader (a plain lane only) */
    readonly tip: string | null;
    /** The tip has a white outline: the floor round it is dark */
    readonly tipOutlined: boolean;
    /** A crossed order's thread darts */
    readonly darts: readonly string[];
    /** How far along each point is (0 at the leader, 1 at the last), for the fade */
    readonly along: readonly number[];
    /** The light wash under the lane (0: none), for the floor beneath it */
    readonly wash: number;
    /** Where the wash runs: the lane, and on past the leader under the tip */
    readonly washPoints: readonly XY[];
    /** Name labels the lane reaches, cut out of it so names stay readable (their ink, 1 px clear) */
    readonly labelHoles: readonly Box[];
    readonly numbers: readonly PlacedBadge[];
    /** Some numbers had no room: only the ends show, and the field asks for a closer zoom */
    readonly crowded: boolean;
    /** The lane's box, for the closer-zoom note */
    readonly box: Box;
    /** What the lane covers as drawn: its points as wide as the lane, and the tip */
    readonly extent: Box;
}

/**
 * A line through `points` (leader first; the first `marchers` are marchers, a last one past them is
 * Set order's pointer) as drawn: its kind, the tip and darts of a plain lane, and its numbers when
 * `numbered` or when the lane can't tell the order (doubling back, crossing). Numbers keep clear of
 * the tip, the marchers' name labels (`busy`), every dot (`dots`) and the other lines' lanes.
 */
function drawLine({
    points,
    marchers,
    guessed,
    numbered,
    halfWidth,
    dotRadius,
    busy,
    dots,
    others = [],
    floorAt,
    labels = [],
}: {
    points: readonly XY[];
    marchers: number;
    guessed: boolean;
    numbered: boolean;
    halfWidth: number;
    dotRadius: number;
    busy: readonly Box[];
    dots: readonly XY[];
    /** The other lines showing, whose lanes its numbers keep off */
    others?: readonly OtherLane[];
    /** How bright the floor is under a point (on screen, pan left out), 0 to 1 */
    floorAt: (p: XY) => number;
    /** Every drawn marcher's name label on screen: those the lane reaches are cut out of it */
    labels?: readonly Box[];
}): DrawnLine {
    const own = points.slice(0, marchers);
    // On the marchers only: Set order's pointer sits on the dot it just picked and crosses earlier
    // legs on its way to the next, which would make every pick look like a fold or a crossing
    const kind = classifyOrder(own, dotRadius);
    // The tip keeps the full width; the lane itself narrows where its own ranks are close
    const tip = kind === "lane" ? laneTip(points, halfWidth) : null;
    const tipHalf = halfWidth;
    halfWidth = ownHalfWidth(own, halfWidth, dotRadius);
    const darts = kind === "crossed" ? threadDarts(points) : [];
    // The wash runs on under the tip, so the tip always sits on the lane's own ground
    const lead = points[0];
    const next = points[1];
    const pastLead =
        tip && lead && next
            ? (() => {
                  const d = Math.hypot(lead.x - next.x, lead.y - next.y) || 1;
                  const reach = tipHalf * 1.9;
                  return [
                      {
                          x: lead.x + ((lead.x - next.x) / d) * reach,
                          y: lead.y + ((lead.y - next.y) / d) * reach,
                      },
                  ];
              })()
            : [];
    const washPoints = [...pastLead, ...points];
    const wash = washAlpha(
        laneSamplePoints(
            washPoints,
            kind === "crossed" ? 3 : halfWidth,
            Math.max(5, halfWidth),
        ).map(floorAt),
    );
    const tipOutlined =
        !!tip && !!lead && !!next && floorAt(pastLead[0] ?? lead) < 0.4;
    const { badges, crowded } =
        numbered || kind !== "lane"
            ? placeNumbers({
                  points: own,
                  kind,
                  halfWidth,
                  dotRadius,
                  busy: tip ? [...busy, tip.box] : busy,
                  dots,
                  others,
              })
            : { badges: [], crowded: false };
    // The lane's box: its points and the wash on past the leader, with room for the tip, the
    // wash's round end and the rim
    const xs = washPoints.map((p) => p.x);
    const ys = washPoints.map((p) => p.y);
    const pad = Math.max(halfWidth * 2.2 + 4, tipHalf * 0.2 + halfWidth + 6);
    // What's drawn, tightly: the lane and its wash (on past the leader, under the tip) as wide as
    // they're drawn with the rim (the thread is thinner), and the tip's corners
    // Half the wash stroke (LaneGround: the lane plus 3, or 6 for a thread) plus its 1.2 px rim
    const reach = kind === "crossed" ? 4.2 : halfWidth + 2.7;
    const tipCorners =
        tip?.points.split(" ").map((p) => {
            const [x, y] = p.split(",").map(Number);
            return { x: x!, y: y! };
        }) ?? [];
    // and the numbers, wherever they were placed
    const badgeCorners = badges.flatMap(({ at, text }) => {
        const w = badgeWidth(text) / 2;
        const h = BADGE_HEIGHT / 2;
        return [
            { x: at.x - w, y: at.y - h },
            { x: at.x + w, y: at.y + h },
        ];
    });
    const marks = [...tipCorners, ...badgeCorners];
    const extent = {
        minX: Math.min(
            ...washPoints.map((p) => p.x - reach),
            ...marks.map((p) => p.x),
        ),
        minY: Math.min(
            ...washPoints.map((p) => p.y - reach),
            ...marks.map((p) => p.y),
        ),
        maxX: Math.max(
            ...washPoints.map((p) => p.x + reach),
            ...marks.map((p) => p.x),
        ),
        maxY: Math.max(
            ...washPoints.map((p) => p.y + reach),
            ...marks.map((p) => p.y),
        ),
    };
    return {
        extent,
        kind,
        guessed,
        points,
        halfWidth,
        tip: tip?.points ?? null,
        tipOutlined,
        darts,
        along: alongFractions(points),
        wash,
        washPoints,
        labelHoles: labels.filter(
            (b) =>
                b.maxX >= Math.min(...xs) - pad &&
                b.minX <= Math.max(...xs) + pad &&
                b.maxY >= Math.min(...ys) - pad &&
                b.minY <= Math.max(...ys) + pad,
        ),
        numbers: badges,
        crowded,
        box: {
            minX: Math.min(...xs) - pad,
            minY: Math.min(...ys) - pad,
            maxX: Math.max(...xs) + pad,
            maxY: Math.max(...ys) + pad,
        },
    };
}

/** Whether a field color is dark enough that the lane turns light on it */
function isDarkField({
    r,
    g,
    b,
}: {
    r: number;
    g: number;
    b: number;
}): boolean {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

export default function MarcherOrderOverlay({
    marchers,
    labels,
    theme,
    floor,
}: {
    marchers: FieldMarchers;
    /** The field's colors: a guessed order's outline turns light on a dark field */
    theme: FieldTheme;
    /** How bright the floor is (background and field image), for the lane's wash */
    floor: FloorSampler;
    /** The marchers' name labels as drawn; none: the line doesn't keep clear of them */
    labels?: OrderLabels;
}) {
    const setting = useUiSettingsStore(
        (s) => s.uiSettings.marcherOrder ?? "selected",
    );
    const isPlaying = useIsPlaying()?.isPlaying ?? false;
    const sweep = useMarcherOrderStore((s) => s.sweep);
    const forms = useMarcherOrderStore((s) => s.forms);
    const selected = useSelectedMarchers()?.selectedMarchers;
    const ids = useMemo(
        () =>
            performersOnly(selected ?? [])
                .map((m) => m.id)
                .sort((a, b) => a - b),
        [selected],
    );
    const beat = useTimelineSelectionStore(fieldBeat);
    const always = setting === "always";
    // The Follow tool draws its own ends, and a shape tool its own; the order waits till they close
    const followOpen = usePathPenStore(
        (s) => !!s.session?.follow && s.session.phase !== "closed",
    );
    const shapeOpen = useShapeToolStore((s) => s.tool !== null);
    // Set order on has the field, so it shows over either (opening it closes them)
    const showing =
        !isPlaying &&
        (sweep !== null ||
            (!followOpen &&
                !shapeOpen &&
                setting !== "off" &&
                (always || ids.length >= 2)));

    // The forms, read while anything shows the order: the selection's, or everyone's for Always
    const key = ids.join(",");
    useEffect(
        () => (showing ? followOrderForms(always ? "all" : ids) : undefined),
        // `key` is `ids`
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [showing, always, key],
    );
    const formsScope = useMarcherOrderStore((s) => s.formsScope);
    // Forms read for another selection say nothing of this one: nothing is drawn until they're in
    const ready = formsCover(formsScope, always ? "all" : ids);

    // Redrawn when what the field draws changes (a fill, a drag) and when the camera moves
    const version = useSyncExternalStore(
        marchers.subscribe,
        () => marchers.version,
    );
    const view = useFieldViewStore(
        useShallow(
            (s): FieldView => ({
                width: s.width,
                height: s.height,
                zoom: s.zoom,
                panX: s.panX,
                panY: s.panY,
            }),
        ),
    );
    const alt = useAltHeld(showing);

    // The lines in force (Always) follow the forms and the beat, never a fill
    const inForce = useMemo(
        () =>
            showing && !sweep && always && ready && forms
                ? ordersInForce(forms, beat)
                : [],
        [showing, sweep, always, ready, forms, beat],
    );
    // Where the selection stands: the same map until one of them moves
    const ownAt = useDrawnAt(marchers, ids, version);
    // The selection's own line
    const own = useMemo(
        (): ShownOrder | null =>
            !showing || sweep || !ready
                ? null
                : shownOrderOf(forms, ids, beat, ownAt),
        [showing, sweep, ready, forms, ids, beat, ownAt],
    );
    const lines = useMemo((): ShownOrder[] => {
        if (!showing || sweep || !ready) return [];
        return always ? withOwnOrder(inForce, own) : own ? [own] : [];
    }, [showing, sweep, ready, own, always, inForce]);

    // Where the lines' marchers stand: the same map until one of them moves
    const lineIds = useMemo(() => lines.flatMap((l) => l.order), [lines]);
    const linesAt = useDrawnAt(marchers, lineIds, version);
    // The dot and its selection ring as the marchers layer draws them, on screen
    const dotRadius = DOT_RADIUS * dotSizes(view.zoom).scale * view.zoom;
    const reach = ringReach(view.zoom) * view.zoom;
    // Everyone under a lane, whose dots it's cut away from: the same array until one of them moves
    const everyoneAt = useEveryoneAt(marchers, version, showing);
    // Worked out on screen but with the pan left out (the field scaled by the zoom, then moved by
    // the pan), so panning only moves what's drawn (the SVG group below) and works nothing out again
    const zoom = view.zoom;
    const everyone = useMemo(
        () => everyoneAt.map((p) => ({ x: p.x * zoom, y: p.y * zoom })),
        [everyoneAt, zoom],
    );
    // The size the labels are drawn at: Auto's for where everyone stands, else the style's
    const labelSize = useMemo(
        () =>
            !showing || !labels
                ? 0
                : labels.style.form === "auto"
                  ? autoLabelSizeOf(
                        labels.style,
                        marchers,
                        labels.text,
                        labels.atlas,
                    )
                  : labelSizeOf(labels.style),
        // `version` is where everyone stands
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [showing, labels, marchers, version],
    );
    // Every drawn label's ink on screen, when labels are drawn and big enough to read: numbers
    // keep clear of them, and the selection box stands clear of the selection's (step 4j)
    const labelBox = useMemo(
        () =>
            (id: number, p: XY): Box | null => {
                const text = labels?.text.get(id);
                if (
                    !labels ||
                    !text ||
                    labels.style.form === "off" ||
                    labelSize * zoom <= labels.fadeFrom
                )
                    return null;
                const box = labelBoxAt(
                    p.x,
                    p.y,
                    labels.atlas.measure(text),
                    labelSize,
                    labels.style.beside,
                    true,
                );
                return {
                    minX: (box.x - box.width / 2) * zoom,
                    minY: (box.y - box.height / 2) * zoom,
                    maxX: (box.x + box.width / 2) * zoom,
                    maxY: (box.y + box.height / 2) * zoom,
                };
            },
        [labels, labelSize, zoom],
    );
    const selectedSet = useMemo(() => new Set(ids), [ids]);
    const drawn = useMemo((): DrawnLine[] => {
        const onScreen = (p: XY): XY => ({ x: p.x * zoom, y: p.y * zoom });
        const floorAt = (p: XY) => floor.brightnessAt(p.x / zoom, p.y / zoom);
        const busyOf = (
            order: readonly number[],
            at: ReadonlyMap<number, XY>,
        ) =>
            order.flatMap((id) => {
                const p = at.get(id);
                const box = p ? labelBox(id, p) : null;
                return box ? [box] : [];
            });
        // Every drawn marcher's name: those under a lane are cut out of it, not only its own
        // marchers' (a neighboring rank's names sit on a selected rank's lane)
        const allLabels: Box[] = [];
        if (labels) {
            const { positions, hidden, isItem } = marchers;
            for (let i = 0; i < marchers.ids.length; i++) {
                if (hidden[i] || isItem[i]) continue;
                const box = labelBox(marchers.ids[i]!, {
                    x: positions[i * 2]!,
                    y: positions[i * 2 + 1]!,
                });
                if (box) allLabels.push(box);
            }
        }
        if (sweep) {
            const points = sweep.picked.flatMap((id) => {
                const p = sweep.at.get(id);
                return p ? [onScreen(p)] : [];
            });
            const count = points.length;
            if (sweep.pointer && count > 0)
                points.push(onScreen(sweep.pointer));
            // Numbers show throughout Set order (touch has no Alt)
            return [
                drawLine({
                    points,
                    marchers: count,
                    guessed: false,
                    numbered: true,
                    halfWidth: laneHalfWidth(dotRadius, reach, true),
                    dotRadius,
                    busy: busyOf(sweep.ids, sweep.at),
                    dots: everyone,
                    floorAt,
                    labels: allLabels,
                }),
            ];
        }
        // A guessed order isn't drawn at rest; Alt shows it, hollow and dashed
        const shown = lines.filter((line) => !line.guessed || alt);
        const pointsOf = shown.map((line) =>
            line.order.flatMap((id) => {
                const p = linesAt.get(id);
                return p ? [onScreen(p)] : [];
            }),
        );
        // Lanes of neighboring lines narrow so they never touch
        const halfWidths = neighborHalfWidths(
            pointsOf,
            shown.map((line) =>
                laneHalfWidth(
                    dotRadius,
                    reach,
                    line.order.some((id) => selectedSet.has(id)),
                ),
            ),
            dotRadius,
        );
        const busy = busyOf(lineIds, linesAt);
        return shown.map((line, l) =>
            drawLine({
                points: pointsOf[l]!,
                marchers: pointsOf[l]!.length,
                guessed: line.guessed,
                numbered: alt,
                halfWidth: halfWidths[l]!,
                dotRadius,
                busy,
                dots: everyone,
                others: pointsOf.flatMap((points, o) =>
                    o === l ? [] : [{ points, halfWidth: halfWidths[o]! }],
                ),
                floorAt,
                labels: allLabels,
            }),
        );
    }, [
        marchers,
        floor,
        sweep,
        lines,
        lineIds,
        linesAt,
        zoom,
        dotRadius,
        reach,
        alt,
        everyone,
        labels,
        labelBox,
        selectedSet,
    ]);
    // What the selection's own line covers (its lane, tip and names), for the selection box to stand
    // clear of (step 4j): in field units, CLEARANCE screen px out. None for a guess (Alt shows it only
    // for a moment) or while Set order draws its own lane
    const cover = useMemo((): FieldRect | null => {
        // Only the selection's own line, and only when it's known: a guess isn't drawn at rest, and
        // Always's other lines the selection is only part of keep today's box
        if (!showing || sweep || ids.length < 2 || !own || own.guessed)
            return null;
        const shownLines = lines.filter((line) => !line.guessed || alt);
        const l = shownLines.findIndex(
            (line) =>
                !line.guessed &&
                own.order.every((id) => line.order.includes(id)),
        );
        const line = l < 0 ? undefined : drawn[l];
        if (!line || line.points.length === 0) return null;
        let b: Box = line.extent;
        const add = (o: Box) => {
            b = {
                minX: Math.min(b.minX, o.minX),
                minY: Math.min(b.minY, o.minY),
                maxX: Math.max(b.maxX, o.maxX),
                maxY: Math.max(b.maxY, o.maxY),
            };
        };
        for (const id of shownLines[l]!.order) {
            const p = linesAt.get(id);
            const label = p && labelBox(id, p);
            if (label) add(label);
        }
        const rect = {
            left: (b.minX - SELECTION_CLEARANCE) / zoom,
            top: (b.minY - SELECTION_CLEARANCE) / zoom,
            right: (b.maxX + SELECTION_CLEARANCE) / zoom,
            bottom: (b.maxY + SELECTION_CLEARANCE) / zoom,
        };
        return Object.values(rect).every(Number.isFinite) ? rect : null;
    }, [showing, sweep, ids, own, lines, alt, drawn, linesAt, labelBox, zoom]);
    // Before paint, so the box drawn this frame stands round this frame's lane
    useLayoutEffect(() => setSelectionCover(cover), [cover]);
    useEffect(() => () => setSelectionCover(null), []);
    // The dots the lanes are cut away from: everyone's dot, and a selected marcher's ring too
    const holes = useMemo(() => {
        const selectedAt = [
            ...(sweep ? sweep.ids : ids).flatMap((id) => {
                const p = (sweep ? sweep.at : linesAt).get(id);
                return p
                    ? [{ at: { x: p.x * zoom, y: p.y * zoom }, r: reach }]
                    : [];
            }),
        ];
        return [
            ...everyone.map((at) => ({ at, r: dotRadius + 0.5 })),
            ...selectedAt,
        ];
    }, [sweep, ids, linesAt, everyone, zoom, dotRadius, reach]);
    const fieldBackground = theme.background;
    const ink = useMemo(
        () => orderInk(isDarkField(fieldBackground)),
        [fieldBackground],
    );

    // Each drawn line's marchers get a halo in the tone that sets their own color apart
    const haloIds = useMemo(
        () =>
            sweep
                ? sweep.picked
                : // A guess is only a hollow dashed outline: no halos
                  lines.filter((l) => !l.guessed).flatMap((l) => l.order),
        [sweep, lines],
    );
    const indexOf = useMemo(
        () => new Map(marchers.ids.map((id, i) => [id, i])),
        // `marchers.ids` is replaced whenever who is drawn changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [marchers, marchers.ids],
    );
    const halos = useMemo(() => {
        void version;
        const index = indexOf;
        const width = haloWidth(dotRadius);
        return haloIds.flatMap((id) => {
            const p = (sweep ? sweep.at : linesAt).get(id);
            const i = index.get(id);
            if (!p || i === undefined) return [];
            const look = resolveMarcherLook(marchers.stacks[i] ?? [], theme);
            if (!look.visible) return [];
            // A hollow dot is seen by its outline, not its (invisible) fill
            const fill =
                look.shape === "cross"
                    ? look.crossColor
                    : look.fill.a < 0.2
                      ? look.outline
                      : look.fill;
            const inner =
                selectedSet.has(id) || sweep ? reach : dotRadius + 0.5;
            return [
                {
                    at: { x: p.x * zoom, y: p.y * zoom },
                    r: inner + width / 2,
                    width,
                    tone: haloTone(fill),
                },
            ];
        });
    }, [
        haloIds,
        sweep,
        linesAt,
        marchers,
        version,
        indexOf,
        theme,
        dotRadius,
        reach,
        selectedSet,
        zoom,
    ]);

    const prefix = useId().replace(/:/g, "");
    if (!showing) return null;
    return (
        <>
            {/*
              Over the selection box and its handles, which still take the presses through it. Three
              layers: the lanes' ground (wash and rim), their ink multiplied onto the field so it
              reads as ink on any floor, then the marks (tips, darts, halos, numbers)
            */}
            <svg
                className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
                data-testid="marcherOrderGround"
            >
                <g transform={`translate(${view.panX} ${view.panY})`}>
                    {drawn.map((line, i) => (
                        <LaneGround
                            key={i}
                            id={`${prefix}-g${i}`}
                            line={line}
                            ink={ink}
                            holes={holes}
                        />
                    ))}
                </g>
            </svg>
            <svg
                className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
                style={{ mixBlendMode: "multiply" }}
                data-testid="marcherOrderInk"
            >
                <g transform={`translate(${view.panX} ${view.panY})`}>
                    {drawn.map((line, i) => (
                        <LaneInk
                            key={i}
                            id={`${prefix}-i${i}`}
                            line={line}
                            holes={holes}
                        />
                    ))}
                </g>
            </svg>
            <svg
                className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
                data-testid="marcherOrderOverlay"
                data-lines={drawn.length}
                data-guessed={drawn.some((l) => l.guessed) || undefined}
            >
                <g
                    transform={`translate(${view.panX} ${view.panY})`}
                    fontFamily="Inter, system-ui, Arial, sans-serif"
                >
                    {drawn.map((line, i) => (
                        <LaneMarks key={i} line={line} ink={ink} />
                    ))}
                    {halos.map(({ at, r, width, tone }, i) => (
                        <circle
                            key={i}
                            cx={at.x}
                            cy={at.y}
                            r={r}
                            fill="none"
                            stroke={
                                tone === "dark"
                                    ? "rgba(28,31,38,0.9)"
                                    : "rgba(255,255,255,0.92)"
                            }
                            strokeWidth={width}
                            data-testid="marcherOrderHalo"
                            data-tone={tone}
                        />
                    ))}
                    {drawn.flatMap((line, l) =>
                        line.numbers.map((badge, i) => (
                            <OrderBadge
                                key={`${l}-${i}`}
                                badge={badge}
                                guessed={line.guessed}
                            />
                        )),
                    )}
                    {drawn.map(
                        (line, i) =>
                            line.crowded && <ZoomNote key={i} box={line.box} />,
                    )}
                </g>
            </svg>
            {sweep && (
                <OrderSweepBar
                    picked={sweep.picked.length}
                    of={sweep.ids.length}
                />
            )}
        </>
    );
}

/** A path through `points` */
const pathOf = (points: readonly XY[]): string =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

/** The dots (and selection rings) a lane is cut away from, as an SVG mask: only those it reaches */
function HolesMask({
    id,
    line,
    holes,
    hollow = false,
}: {
    id: string;
    line: DrawnLine;
    holes: readonly { at: XY; r: number }[];
    /** Also cut the lane's inside, leaving its outline (a guessed order) */
    hollow?: boolean;
}) {
    const { points, washPoints, halfWidth, box } = line;
    const reach = halfWidth * 2.2 + 4;
    const near = holes.filter(
        ({ at, r }) =>
            at.x + r >= box.minX &&
            at.x - r <= box.maxX &&
            at.y + r >= box.minY &&
            at.y - r <= box.maxY &&
            washPoints.some(
                (p, i) =>
                    distanceToSegment(at, p, washPoints[i + 1] ?? p) <=
                    reach + r,
            ),
    );
    return (
        <mask
            id={id}
            maskUnits="userSpaceOnUse"
            x={box.minX - 4}
            y={box.minY - 4}
            width={box.maxX - box.minX + 8}
            height={box.maxY - box.minY + 8}
        >
            <rect
                x={box.minX - 4}
                y={box.minY - 4}
                width={box.maxX - box.minX + 8}
                height={box.maxY - box.minY + 8}
                fill="white"
            />
            {hollow && (
                <path
                    d={pathOf(points)}
                    fill="none"
                    stroke="black"
                    strokeWidth={Math.max(halfWidth * 2 - 2.4, 0)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
            {near.map(({ at, r }, i) => (
                <circle key={i} cx={at.x} cy={at.y} r={r} fill="black" />
            ))}
            {line.labelHoles.map((b, i) => (
                <rect
                    key={`l${i}`}
                    x={b.minX - 1}
                    y={b.minY - 1}
                    width={b.maxX - b.minX + 2}
                    height={b.maxY - b.minY + 2}
                    rx={1.5}
                    fill="black"
                />
            ))}
        </mask>
    );
}

/**
 * A lane's ground: the light wash (just strong enough for the floor under it) and a faint rim just
 * outside it, so a light lane keeps an edge on a mid-tone floor. A guessed order is a hollow dashed
 * outline instead, with nothing under it.
 */
const LaneGround = memo(function LaneGround({
    id,
    line,
    ink,
    holes,
}: {
    id: string;
    line: DrawnLine;
    ink: OrderInk;
    holes: readonly { at: XY; r: number }[];
}) {
    const { kind, guessed, points, washPoints, halfWidth, wash } = line;
    if (points.length < 2) return null;
    const width = halfWidth * 2;
    if (guessed)
        return (
            <g data-testid="marcherOrderGuess" data-kind={kind}>
                <defs>
                    <HolesMask
                        id={`${id}-holes`}
                        line={line}
                        holes={holes}
                        hollow={kind !== "crossed"}
                    />
                </defs>
                <path
                    d={pathOf(points)}
                    fill="none"
                    stroke={kind === "crossed" ? ink.thread : ink.guess}
                    strokeWidth={kind === "crossed" ? 1.25 : width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                    mask={`url(#${id}-holes)`}
                />
            </g>
        );
    const crossed = kind === "crossed";
    const washWidth = crossed ? 6 : width + 3;
    const d = pathOf(crossed ? points : washPoints);
    return (
        <g data-testid="marcherOrderLine" data-kind={kind} data-wash={wash}>
            <defs>
                <HolesMask id={`${id}-holes`} line={line} holes={holes} />
                {!crossed && (
                    <mask
                        id={`${id}-rim`}
                        maskUnits="userSpaceOnUse"
                        x={line.box.minX - 4}
                        y={line.box.minY - 4}
                        width={line.box.maxX - line.box.minX + 8}
                        height={line.box.maxY - line.box.minY + 8}
                    >
                        <path
                            d={d}
                            fill="none"
                            stroke="white"
                            strokeWidth={washWidth + 2.4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d={d}
                            fill="none"
                            stroke="black"
                            strokeWidth={washWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </mask>
                )}
            </defs>
            {!crossed && (
                <g mask={`url(#${id}-holes)`}>
                    <rect
                        x={line.box.minX - 4}
                        y={line.box.minY - 4}
                        width={line.box.maxX - line.box.minX + 8}
                        height={line.box.maxY - line.box.minY + 8}
                        fill="rgba(28,31,38,0.22)"
                        mask={`url(#${id}-rim)`}
                        data-testid="marcherOrderRim"
                    />
                </g>
            )}
            {wash > 0 && (
                <path
                    d={d}
                    fill="none"
                    stroke={`rgba(255,255,255,${wash.toFixed(3)})`}
                    strokeWidth={washWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    mask={`url(#${id}-holes)`}
                    data-testid="marcherOrderWash"
                />
            )}
        </g>
    );
});

/** Lane ink as an opaque grey: multiplied onto the field it reads as the ink at strength `alpha` */
const inkGrey = (alpha: number): string => {
    const c = (v: number) => Math.round(255 - alpha * (255 - v));
    return `rgb(${c(0x1c)},${c(0x1f)},${c(0x26)})`;
};

/**
 * A lane's ink, multiplied onto the field: fading from `FADE_LEAD` at the leader to `FADE_TAIL` at
 * the tail along a plain lane, one leg at a time so each leg carries its own part of the fade; flat
 * on an order that doubles back (a fade would lie); a fading thread on one whose legs cross
 */
const LaneInk = memo(function LaneInk({
    id,
    line,
    holes,
}: {
    id: string;
    line: DrawnLine;
    holes: readonly { at: XY; r: number }[];
}) {
    const { kind, guessed, points, halfWidth, along } = line;
    if (points.length < 2 || guessed) return null;
    const crossed = kind === "crossed";
    const width = crossed ? 1.5 : halfWidth * 2;
    const [lead, tail] = crossed
        ? [THREAD_LEAD, THREAD_TAIL]
        : kind === "folded"
          ? [FOLDED_INK, FOLDED_INK]
          : [FADE_LEAD, FADE_TAIL];
    return (
        <g data-testid="marcherOrderFade" data-kind={kind}>
            <defs>
                <HolesMask id={`${id}-holes`} line={line} holes={holes} />
                {points.slice(1).map((b, k) => {
                    const a = points[k]!;
                    return (
                        <linearGradient
                            key={k}
                            id={`${id}-leg${k}`}
                            gradientUnits="userSpaceOnUse"
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                        >
                            <stop
                                offset="0"
                                stopColor={inkGrey(
                                    fadeAt(along[k]!, lead, tail),
                                )}
                            />
                            <stop
                                offset="1"
                                stopColor={inkGrey(
                                    fadeAt(along[k + 1]!, lead, tail),
                                )}
                            />
                        </linearGradient>
                    );
                })}
            </defs>
            <g mask={`url(#${id}-holes)`}>
                {points.slice(1).map((b, k) => {
                    const a = points[k]!;
                    if (a.x === b.x && a.y === b.y) return null;
                    return (
                        <path
                            key={k}
                            d={`M${a.x},${a.y} L${b.x},${b.y}`}
                            fill="none"
                            stroke={`url(#${id}-leg${k})`}
                            strokeWidth={width}
                            strokeLinecap="round"
                        />
                    );
                })}
            </g>
        </g>
    );
});

/** A lane's marks over everything: the solid tip past the leader, and a crossed order's darts */
const LaneMarks = memo(function LaneMarks({
    line,
    ink,
}: {
    line: DrawnLine;
    ink: OrderInk;
}) {
    const { guessed, tip, tipOutlined, darts } = line;
    return (
        <g>
            {tip && (
                <polygon
                    points={tip}
                    fill={guessed ? ink.guessTip : LANE_INK}
                    stroke={
                        guessed
                            ? ink.guess
                            : tipOutlined
                              ? "rgba(255,255,255,0.9)"
                              : "none"
                    }
                    strokeWidth={guessed ? 1.2 : 1}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    data-testid="marcherOrderTip"
                />
            )}
            {darts.map((points, i) => (
                <polygon
                    key={i}
                    points={points}
                    fill={LANE_INK}
                    opacity={0.65}
                />
            ))}
        </g>
    );
});

/** A position badge: solid at the leader, rimmed at the tail, quiet between; dashed for a guess */
const OrderBadge = memo(function OrderBadge({
    badge,
    guessed,
}: {
    badge: PlacedBadge;
    guessed: boolean;
}) {
    const { at, text, role } = badge;
    const w = badgeWidth(text);
    const solid = role === "leader" && !guessed;
    const strong = role !== "middle";
    return (
        <g data-testid="marcherOrderNumber" data-role={role}>
            <rect
                x={at.x - w / 2}
                y={at.y - BADGE_HEIGHT / 2}
                width={w}
                height={BADGE_HEIGHT}
                rx={BADGE_HEIGHT / 2}
                fill={solid ? LANE_INK : "#fff"}
                stroke={
                    solid ? "#fff" : strong ? LANE_INK : "rgba(28,31,38,0.35)"
                }
                strokeWidth={solid ? 1 : strong ? 1.4 : 1}
                strokeDasharray={guessed ? "2.5 2" : undefined}
            />
            <text
                x={at.x}
                y={at.y + 3.1}
                textAnchor="middle"
                fontSize={BADGE_FONT}
                fontWeight={strong ? 700 : 600}
                fill={solid ? "#fff" : strong ? LANE_INK : "#3a3f4a"}
            >
                {text}
            </text>
        </g>
    );
});

/** The note under a line whose numbers didn't all fit */
function ZoomNote({ box }: { box: Box }) {
    const text = tolgee.t("pathways.order.zoomIn", "Zoom in to read the order");
    const w = 12 + text.length * 5.6;
    const x = (box.minX + box.maxX) / 2 - w / 2;
    const y = box.maxY + 20;
    return (
        <g data-testid="marcherOrderZoomNote">
            <rect
                x={x}
                y={y}
                width={w}
                height={18}
                rx={6}
                fill="#fff"
                stroke="rgba(0,0,0,0.14)"
            />
            <text x={x + 6} y={y + 12.5} fontSize={11} fill="#202020">
                {text}
            </text>
        </g>
    );
}

/**
 * Set order's bar, over the field's top: how to go on, how many are picked, and Cancel and Done,
 * which touch reaches without Escape or Enter
 */
function OrderSweepBar({ picked, of }: { picked: number; of: number }) {
    return (
        <div
            className={`${EDITOR_BAR} text-body text-text pointer-events-auto absolute top-12 left-1/2 z-10 -translate-x-1/2 gap-6 whitespace-nowrap`}
            data-testid="order-sweep-bar"
        >
            <span className="px-4">
                <T
                    keyName="pathways.order.banner"
                    defaultValue="Set order: drag through the marchers from the leader, or click them one by one · {picked} of {count}"
                    params={{ picked, count: of }}
                />
            </span>
            <Divider />
            <IconButton
                label={tolgee.t("pathways.order.cancel", "Cancel Set order")}
                action="cancelAlignmentUpdates"
                onClick={() => runAction("cancelAlignmentUpdates")}
                testId="order-sweep-cancel"
            >
                <XIcon size={14} />
            </IconButton>
            <EditorButton
                onClick={() => runAction("applyShape")}
                testId="order-sweep-done"
            >
                <CheckIcon size={14} />
                {tolgee.t("pathways.order.doneButton", "Done")}
                <Shortcut action="applyShape" />
            </EditorButton>
        </div>
    );
}
