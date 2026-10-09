import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import {
    ArrowDownIcon,
    ArrowUpIcon,
    PlusIcon,
    TrashIcon,
} from "@phosphor-icons/react";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Slider,
    ToggleGroup,
    ToggleGroupItem,
} from "@openmarch/ui";
import {
    MAX_ABS_BULGE,
    type OrderMode,
    type PathStyle,
    type XY,
} from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import {
    applyTransitionEdit,
    clampBulge,
    clampSlotCount,
    followTheLeaderBlocker,
    MAX_SLOT_COUNT,
    shapeBlocker,
    planTransitionEdit,
    type TransitionEdit,
    type TransitionEditTarget,
    type TransitionShapeOption,
} from "@/timeline/timelineTransitionEditor";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import type { TimelineInspectorStringKey } from "./timelineInspectorStrings";

type Translate = (
    key: TimelineInspectorStringKey,
    params?: Record<string, string | number>,
) => string;

const PATH_STYLES: readonly PathStyle[] = [
    "direct",
    "arc",
    "follow_the_leader",
];
const ORDER_MODES: readonly OrderMode[] = ["inherit", "slot"];
const BULGE_STEP = 0.05;

/** A number for display, rounded for reading. */
export const shown = (value: number) => String(Math.round(value * 1000) / 1000);

/**
 * A numeric text field that commits on Enter or blur, and shows the current value again when
 * that value changes or the text isn't a number.
 */
export function NumberField({
    value,
    onCommit,
    label,
    disabled,
    min,
    max,
    step,
    testId,
}: {
    value: number;
    onCommit: (value: number) => void;
    label: string;
    disabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
    testId?: string;
}) {
    const [text, setText] = useState(shown(value));
    useEffect(() => setText(shown(value)), [value]);
    const commit = () => {
        // Unchanged text: the shown value is rounded, so committing it would write a new value
        if (text === shown(value)) return;
        const parsed = Number(text);
        if (text.trim() === "" || !Number.isFinite(parsed)) {
            setText(shown(value));
            return;
        }
        // Show the stored value until the edit lands (a refused or clamped value doesn't stay)
        setText(shown(value));
        onCommit(parsed);
    };
    return (
        <Input
            compact
            type="number"
            aria-label={label}
            data-testid={testId}
            className="w-[5.5rem]"
            value={text}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") commit();
            }}
        />
    );
}

export function Field({
    label,
    children,
    help,
}: {
    label: string;
    children: ReactNode;
    help?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-6">
            <p className="text-sub text-text/60">{label}</p>
            {children}
            {help}
        </div>
    );
}

export const Help = ({
    children,
    testId,
}: {
    children: ReactNode;
    testId?: string;
}) => (
    <p className="text-sub text-text/60" data-testid={testId}>
        {children}
    </p>
);

function shapeLabel(shape: TransitionShapeOption, t: Translate): string {
    return shape.name
        ? t("inspector.timeline.destination.shape", {
              name: shape.name,
              kind: shape.kind,
          })
        : t("inspector.timeline.destination.shapeUnnamed", {
              id: shape.id,
              kind: shape.kind,
          });
}

function WaypointsEditor({
    waypoints,
    onChange,
    disabled,
    t,
}: {
    waypoints: readonly XY[];
    onChange: (waypoints: XY[]) => void;
    disabled: boolean;
    t: Translate;
}) {
    const replace = (index: number, point: XY) =>
        onChange(waypoints.map((p, i) => (i === index ? point : p)));
    const swap = (a: number, b: number) => {
        const next = [...waypoints];
        [next[a], next[b]] = [next[b]!, next[a]!];
        onChange(next);
    };
    return (
        <Field
            label={t("inspector.timeline.label.waypoints")}
            help={<Help>{t("inspector.timeline.edit.waypointsHelp")}</Help>}
        >
            {waypoints.length === 0 && (
                <p className="text-sub">
                    {t("inspector.timeline.edit.noWaypoints")}
                </p>
            )}
            <ol className="flex flex-col gap-4">
                {waypoints.map((point, i) => {
                    const n = i + 1;
                    return (
                        <li
                            key={i}
                            className="flex items-center gap-4"
                            data-testid={`timeline-waypoint-${i}`}
                        >
                            <span className="text-sub w-16">{n}</span>
                            <NumberField
                                label={t("inspector.timeline.edit.waypointX", {
                                    n,
                                })}
                                value={point[0]}
                                disabled={disabled}
                                onCommit={(x) => replace(i, [x, point[1]])}
                            />
                            <NumberField
                                label={t("inspector.timeline.edit.waypointY", {
                                    n,
                                })}
                                value={point[1]}
                                disabled={disabled}
                                onCommit={(y) => replace(i, [point[0], y])}
                            />
                            <Button
                                size="compact"
                                variant="secondary"
                                content="icon"
                                aria-label={t(
                                    "inspector.timeline.edit.waypointUp",
                                    { n },
                                )}
                                disabled={disabled || i === 0}
                                onClick={() => swap(i, i - 1)}
                            >
                                <ArrowUpIcon size={16} />
                            </Button>
                            <Button
                                size="compact"
                                variant="secondary"
                                content="icon"
                                aria-label={t(
                                    "inspector.timeline.edit.waypointDown",
                                    { n },
                                )}
                                disabled={
                                    disabled || i === waypoints.length - 1
                                }
                                onClick={() => swap(i, i + 1)}
                            >
                                <ArrowDownIcon size={16} />
                            </Button>
                            <Button
                                size="compact"
                                variant="secondary"
                                content="icon"
                                aria-label={t(
                                    "inspector.timeline.edit.waypointRemove",
                                    { n },
                                )}
                                disabled={disabled}
                                onClick={() =>
                                    onChange(
                                        waypoints.filter((_, j) => j !== i),
                                    )
                                }
                            >
                                <TrashIcon size={16} />
                            </Button>
                        </li>
                    );
                })}
            </ol>
            <Button
                size="compact"
                variant="secondary"
                className="w-fit"
                disabled={disabled}
                onClick={() => {
                    const last = waypoints[waypoints.length - 1];
                    onChange([
                        ...waypoints,
                        last ? [last[0], last[1]] : [0, 0],
                    ]);
                }}
            >
                <PlusIcon size={16} />
                {t("inspector.timeline.edit.waypointAdd")}
            </Button>
        </Field>
    );
}

export function BulgeEditor({
    bulge,
    onCommit,
    disabled,
    t,
}: {
    bulge: number;
    onCommit: (bulge: number) => void;
    disabled: boolean;
    t: Translate;
}) {
    const [dragged, setDragged] = useState(bulge);
    useEffect(() => setDragged(bulge), [bulge]);
    return (
        <Field
            label={t("inspector.timeline.label.bulge")}
            help={
                <Help testId="timeline-edit-bulge-help">
                    {t("inspector.timeline.edit.bulgeHelp")}
                </Help>
            }
        >
            <div className="flex items-center gap-8">
                <Slider
                    aria-label={t("inspector.timeline.label.bulge")}
                    min={-MAX_ABS_BULGE}
                    max={MAX_ABS_BULGE}
                    step={BULGE_STEP}
                    value={[dragged]}
                    disabled={disabled}
                    onValueChange={([v]) => setDragged(v!)}
                    onValueCommit={([v]) => onCommit(v!)}
                />
                <NumberField
                    label={t("inspector.timeline.edit.bulgeInput")}
                    testId="timeline-edit-bulge"
                    value={bulge}
                    min={-MAX_ABS_BULGE}
                    max={MAX_ABS_BULGE}
                    step={BULGE_STEP}
                    disabled={disabled}
                    onCommit={onCommit}
                />
            </div>
        </Field>
    );
}

/**
 * Edits one transition (P8.3, ui.md "What the timeline doesn't show"): path style, bulge,
 * waypoints, order mode, destination and slot count. Each change is one undoable edit through
 * the transition db-functions, a change that writes nothing is skipped, and a refusal is shown
 * as a toast with its friendly message.
 */
export function TimelineTransitionEditor({
    target,
    shapes,
    database,
    t,
}: {
    target: TransitionEditTarget;
    shapes: readonly TransitionShapeOption[];
    database: DbConnection;
    t: Translate;
}) {
    /**
     * The target the last committed edit was planned from. The inspector keeps showing it until
     * the rows of the new store version are read, so the controls stay disabled until `target`
     * is rebuilt; a second edit planned from the old target would undo the first (a waypoint
     * removed twice from the same list, say). The ref guards clicks before the next render.
     */
    const plannedFrom = useRef<TransitionEditTarget | null>(null);
    const [awaiting, setAwaiting] = useState<TransitionEditTarget | null>(null);
    const pending = awaiting === target;
    const edit = useCallback(
        async (change: TransitionEdit) => {
            if (plannedFrom.current === target) return;
            let plan;
            try {
                plan = planTransitionEdit(target, change);
            } catch (error) {
                toastTimelineError(error);
                return;
            }
            if (plan === null) return;
            plannedFrom.current = target;
            setAwaiting(target);
            try {
                await applyTransitionEdit(database, plan);
            } catch (error) {
                // Nothing was written, so the shown target is still current
                plannedFrom.current = null;
                setAwaiting(null);
                toastTimelineError(error);
            }
        },
        [target, database],
    );

    const ftlBlocker = followTheLeaderBlocker(target);
    const isFtl = target.style === "follow_the_leader";
    const destination = target.destination;

    return (
        <section
            className="flex flex-col gap-12"
            data-testid={`timeline-transition-editor-${target.id}`}
            aria-label={t("inspector.timeline.edit.title", { id: target.id })}
        >
            <div>
                <h5 className="text-body font-medium">
                    {t("inspector.timeline.edit.title", { id: target.id })}
                </h5>
                <p className="text-sub text-text/60">
                    {t("inspector.timeline.edit.range", {
                        start: shown(target.start),
                        end: shown(target.end),
                    })}
                </p>
            </div>

            <Field
                label={t("inspector.timeline.label.pathStyle")}
                help={
                    ftlBlocker && (
                        <Help testId="timeline-edit-ftl-blocker">
                            {ftlBlocker === "noShape"
                                ? t("inspector.timeline.edit.ftlNeedsShape")
                                : t("inspector.timeline.edit.ftlNotBlock")}
                        </Help>
                    )
                }
            >
                <ToggleGroup
                    type="single"
                    aria-label={t("inspector.timeline.label.pathStyle")}
                    value={target.style}
                    disabled={pending}
                    onValueChange={(value: string) => {
                        if (value)
                            void edit({
                                kind: "pathStyle",
                                style: value as PathStyle,
                            });
                    }}
                >
                    {PATH_STYLES.map((style) => (
                        <ToggleGroupItem
                            key={style}
                            value={style}
                            className="text-sub px-8"
                            disabled={
                                pending ||
                                (style === "follow_the_leader" &&
                                    ftlBlocker !== null &&
                                    !isFtl)
                            }
                        >
                            {t(`inspector.timeline.pathStyle.${style}`)}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </Field>

            {target.style === "arc" && target.bulge !== null && (
                <BulgeEditor
                    bulge={target.bulge}
                    disabled={pending}
                    t={t}
                    onCommit={(value) => {
                        const bulge = clampBulge(value);
                        if (bulge !== null) void edit({ kind: "bulge", bulge });
                    }}
                />
            )}

            {isFtl && (
                <WaypointsEditor
                    waypoints={target.waypoints}
                    disabled={pending}
                    t={t}
                    onChange={(waypoints) =>
                        void edit({ kind: "waypoints", waypoints })
                    }
                />
            )}

            <Field
                label={t("inspector.timeline.label.orderMode")}
                help={
                    <Help>
                        {target.order === "inherit"
                            ? t("inspector.timeline.edit.orderInheritHelp")
                            : t("inspector.timeline.edit.orderSlotHelp")}
                    </Help>
                }
            >
                <ToggleGroup
                    type="single"
                    aria-label={t("inspector.timeline.label.orderMode")}
                    value={target.order}
                    disabled={pending}
                    onValueChange={(value: string) => {
                        if (value)
                            void edit({
                                kind: "orderMode",
                                order: value as OrderMode,
                            });
                    }}
                >
                    {ORDER_MODES.map((order) => (
                        <ToggleGroupItem
                            key={order}
                            value={order}
                            className="text-sub px-8"
                            disabled={pending}
                        >
                            {t(`inspector.timeline.orderMode.${order}`)}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </Field>

            <Field
                label={t("inspector.timeline.label.destination")}
                help={
                    destination.kind === "individual" ? (
                        <Help>
                            {t("inspector.timeline.edit.individualHelp")}
                        </Help>
                    ) : isFtl ? (
                        <Help testId="timeline-edit-individual-ftl">
                            {t("inspector.timeline.edit.individualFtl")}
                        </Help>
                    ) : null
                }
            >
                <ToggleGroup
                    type="single"
                    aria-label={t("inspector.timeline.label.destination")}
                    value={destination.kind}
                    disabled={pending}
                    onValueChange={(value: string) => {
                        if (value === "individual")
                            void edit({ kind: "destinationIndividual" });
                    }}
                >
                    <ToggleGroupItem
                        value="shape"
                        className="text-sub px-8"
                        // A shape is picked below; this only shows which kind is in use
                        disabled={pending || destination.kind === "individual"}
                    >
                        {t("inspector.timeline.edit.destinationShape")}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="individual"
                        className="text-sub px-8"
                        disabled={pending || isFtl}
                    >
                        {t("inspector.timeline.edit.destinationIndividual")}
                    </ToggleGroupItem>
                </ToggleGroup>
                {shapes.length === 0 ? (
                    <Help>{t("inspector.timeline.edit.noShapes")}</Help>
                ) : (
                    <Select
                        value={
                            destination.kind === "shape"
                                ? String(destination.shapeId)
                                : ""
                        }
                        disabled={pending}
                        onValueChange={(value) => {
                            if (value)
                                void edit({
                                    kind: "destinationShape",
                                    shapeId: Number(value),
                                });
                        }}
                    >
                        <SelectTriggerButton
                            label={t("inspector.timeline.edit.pickShape")}
                        />
                        <SelectContent>
                            {shapes.map((shape) => {
                                const blocker = shapeBlocker(target, shape);
                                const label = shapeLabel(shape, t);
                                return (
                                    <SelectItem
                                        key={shape.id}
                                        value={String(shape.id)}
                                        disabled={blocker !== null}
                                    >
                                        {blocker === null
                                            ? label
                                            : blocker === "ftlBlock"
                                              ? t(
                                                    "inspector.timeline.edit.shapeNoFtl",
                                                    { shape: label },
                                                )
                                              : t(
                                                    "inspector.timeline.edit.shapeTooSmall",
                                                    {
                                                        shape: label,
                                                        capacity:
                                                            shape.capacity ?? 0,
                                                        slots: target.slotCount,
                                                    },
                                                )}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                )}
            </Field>

            <Field
                label={t("inspector.timeline.edit.slotCount")}
                help={
                    <>
                        {target.minSlotCount > 1 && (
                            <Help testId="timeline-edit-slot-min">
                                {t("inspector.timeline.edit.slotCountMin", {
                                    min: target.minSlotCount,
                                    slot: target.minSlotCount - 1,
                                })}
                            </Help>
                        )}
                        {destination.kind === "individual" && (
                            <Help>
                                {t("inspector.timeline.edit.slotCountPoints")}
                            </Help>
                        )}
                    </>
                }
            >
                <NumberField
                    label={t("inspector.timeline.edit.slotCount")}
                    testId="timeline-edit-slot-count"
                    value={target.slotCount}
                    min={target.minSlotCount}
                    max={MAX_SLOT_COUNT}
                    step={1}
                    disabled={pending}
                    onCommit={(value) =>
                        void edit({
                            kind: "slotCount",
                            slotCount: clampSlotCount(
                                value,
                                target.minSlotCount,
                            ),
                        })
                    }
                />
            </Field>
        </section>
    );
}

export default TimelineTransitionEditor;
