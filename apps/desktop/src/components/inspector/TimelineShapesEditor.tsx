import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
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
    ToggleGroup,
    ToggleGroupItem,
} from "@openmarch/ui";
import type { ShapeKind, ShapeRow, XY } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import {
    applyShapeEdit,
    blockNeeds,
    deleteBlocker,
    kindBlocker,
    planNewShape,
    planShapeEdit,
    SHAPE_KINDS,
    type PlannedShapeEdit,
    type ShapeEdit,
    type ShapeEditTarget,
    type ShapeFrame,
} from "@/timeline/timelineShapeEditor";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import {
    timelinePositionsSettled,
    TimelineNotReadyError,
} from "@/timeline/timelineCoordinateWrites";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import {
    useTimelineShapeCanvasStore,
    type ShapeCommitResult,
} from "@/timeline/timelineShapeCanvas";
import { toast } from "sonner";
import { Field, Help, NumberField } from "./TimelineTransitionEditor";
import type { TimelineInspectorStringKey } from "./timelineInspectorStrings";

type Translate = (
    key: TimelineInspectorStringKey,
    params?: Record<string, string | number>,
) => string;

const DEGREES = 180 / Math.PI;

const KIND_KEYS = {
    line: "inspector.timeline.shapes.kinds.line",
    freehand: "inspector.timeline.shapes.kinds.freehand",
    circle: "inspector.timeline.shapes.kinds.circle",
    box: "inspector.timeline.shapes.kinds.box",
    block: "inspector.timeline.shapes.kinds.block",
} as const satisfies Record<ShapeKind, TimelineInspectorStringKey>;

export function shapeName(
    target: Pick<ShapeEditTarget, "id" | "name" | "shape">,
    t: Translate,
): string {
    const kind = t(KIND_KEYS[target.shape.kind]);
    return target.name
        ? t("inspector.timeline.shapes.named", { name: target.name, kind })
        : t("inspector.timeline.shapes.unnamed", { id: target.id, kind });
}

/**
 * Where the selected marchers stand at `beat` (their homes with no page), for drawing a new shape
 * through them. Waits for earlier writes to reach the resolver first, so a marcher moved just
 * before isn't read where it was.
 *
 * @throws TimelineWriteError (E-ARGS, worded by `t`) when marchers are selected but the resolver
 * knows none of them, rather than drawing the shape somewhere they aren't
 */
async function selectedPositions(
    marcherIds: readonly number[],
    beat: number | null,
    t: Translate,
): Promise<XY[]> {
    await timelinePositionsSettled();
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) throw new TimelineNotReadyError();
    const known = new Set(resolver.marcherIds());
    const ids = marcherIds.filter((id) => known.has(id));
    if (marcherIds.length > 0 && ids.length === 0)
        throw new TimelineWriteError(
            "E-ARGS",
            t("inspector.timeline.shapes.noPositions"),
        );
    return ids.map((id) => {
        const [x, y] = resolver.positionAt(id, beat ?? 0);
        return [x, y];
    });
}

/** A text field that commits on Enter or blur, when its text changed. */
function NameField({
    value,
    onCommit,
    label,
    disabled,
}: {
    value: string;
    onCommit: (value: string) => void;
    label: string;
    disabled: boolean;
}) {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const commit = () => {
        if (text === value) return;
        onCommit(text);
    };
    return (
        <Input
            compact
            aria-label={label}
            data-testid="timeline-shape-name"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") commit();
            }}
        />
    );
}

/** An x and a y field for one point. */
function PointFields({
    point,
    onCommit,
    xLabel,
    yLabel,
    disabled,
    testId,
}: {
    point: XY;
    onCommit: (point: XY) => void;
    xLabel: string;
    yLabel: string;
    disabled: boolean;
    testId?: string;
}) {
    return (
        <div className="flex items-center gap-4" data-testid={testId}>
            <NumberField
                label={xLabel}
                value={point[0]}
                disabled={disabled}
                onCommit={(x) => onCommit([x, point[1]])}
            />
            <NumberField
                label={yLabel}
                value={point[1]}
                disabled={disabled}
                onCommit={(y) => onCommit([point[0], y])}
            />
        </div>
    );
}

function FreehandPoints({
    points,
    onChange,
    disabled,
    t,
}: {
    points: readonly XY[];
    onChange: (points: XY[]) => void;
    disabled: boolean;
    t: Translate;
}) {
    const swap = (a: number, b: number) => {
        const next = points.map((p): XY => [p[0], p[1]]);
        [next[a], next[b]] = [next[b]!, next[a]!];
        onChange(next);
    };
    const atMinimum = points.length <= 2;
    return (
        <Field
            label={t("inspector.timeline.shapes.points")}
            help={
                <>
                    <Help>{t("inspector.timeline.shapes.pointsHelp")}</Help>
                    {atMinimum && (
                        <Help testId="timeline-shape-points-min">
                            {t("inspector.timeline.shapes.pointsMin")}
                        </Help>
                    )}
                </>
            }
        >
            <ol className="flex flex-col gap-4">
                {points.map((point, i) => {
                    const n = i + 1;
                    return (
                        <li
                            key={i}
                            className="flex items-center gap-4"
                            data-testid={`timeline-shape-point-${i}`}
                        >
                            <span className="text-sub w-16">{n}</span>
                            <PointFields
                                point={point}
                                xLabel={t("inspector.timeline.shapes.pointX", {
                                    n,
                                })}
                                yLabel={t("inspector.timeline.shapes.pointY", {
                                    n,
                                })}
                                disabled={disabled}
                                onCommit={(p) =>
                                    onChange(
                                        points.map((q, j) => (j === i ? p : q)),
                                    )
                                }
                            />
                            <Button
                                size="compact"
                                variant="secondary"
                                content="icon"
                                aria-label={t(
                                    "inspector.timeline.shapes.pointUp",
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
                                    "inspector.timeline.shapes.pointDown",
                                    { n },
                                )}
                                disabled={disabled || i === points.length - 1}
                                onClick={() => swap(i, i + 1)}
                            >
                                <ArrowDownIcon size={16} />
                            </Button>
                            <Button
                                size="compact"
                                variant="secondary"
                                content="icon"
                                aria-label={t(
                                    "inspector.timeline.shapes.pointRemove",
                                    { n },
                                )}
                                disabled={disabled || atMinimum}
                                onClick={() =>
                                    onChange(points.filter((_, j) => j !== i))
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
                    // A new point one step on from the last, so the path keeps its length
                    const last = points[points.length - 1]!;
                    const before = points[points.length - 2] ?? last;
                    onChange([
                        ...points,
                        [
                            last[0] + (last[0] - before[0]),
                            last[1] + (last[1] - before[1]),
                        ],
                    ]);
                }}
            >
                <PlusIcon size={16} />
                {t("inspector.timeline.shapes.pointAdd")}
            </Button>
        </Field>
    );
}

/** The geometry fields for the shape's kind (spec 5.2). Each commit is a whole new geometry. */
function GeometryFields({
    target,
    disabled,
    edit,
    t,
}: {
    target: ShapeEditTarget;
    disabled: boolean;
    edit: (change: ShapeEdit) => void;
    t: Translate;
}) {
    const shape: ShapeRow = target.shape;
    const xy = (what: string) => ({
        xLabel: t("inspector.timeline.shapes.x", { what }),
        yLabel: t("inspector.timeline.shapes.y", { what }),
    });
    const set = (geometry: ShapeRow["geometry"]) =>
        edit({ kind: "geometry", geometry });
    switch (shape.kind) {
        case "line": {
            const [a, b] = shape.geometry.points as [XY, XY];
            const start = t("inspector.timeline.shapes.lineStart");
            const end = t("inspector.timeline.shapes.lineEnd");
            return (
                <Field
                    label={t("inspector.timeline.shapes.points")}
                    help={
                        <Help>{t("inspector.timeline.shapes.pointsHelp")}</Help>
                    }
                >
                    <PointFields
                        point={a}
                        {...xy(start)}
                        disabled={disabled}
                        testId="timeline-shape-line-start"
                        onCommit={(p) => set({ points: [p, b] })}
                    />
                    <PointFields
                        point={b}
                        {...xy(end)}
                        disabled={disabled}
                        testId="timeline-shape-line-end"
                        onCommit={(p) => set({ points: [a, p] })}
                    />
                </Field>
            );
        }
        case "freehand":
            return (
                <FreehandPoints
                    points={shape.geometry.points}
                    disabled={disabled}
                    t={t}
                    onChange={(points) => set({ points })}
                />
            );
        case "circle": {
            const g = shape.geometry;
            return (
                <Field
                    label={t("inspector.timeline.shapes.center")}
                    help={
                        <Help>{t("inspector.timeline.shapes.circleHelp")}</Help>
                    }
                >
                    <PointFields
                        point={g.center}
                        {...xy(t("inspector.timeline.shapes.center"))}
                        disabled={disabled}
                        testId="timeline-shape-center"
                        onCommit={(center) => set({ ...g, center })}
                    />
                    <div className="flex flex-wrap items-center gap-6">
                        <span className="text-sub text-text/60">
                            {t("inspector.timeline.shapes.radius")}
                        </span>
                        <NumberField
                            label={t("inspector.timeline.shapes.radius")}
                            testId="timeline-shape-radius"
                            value={g.radius}
                            disabled={disabled}
                            onCommit={(radius) => set({ ...g, radius })}
                        />
                        <span className="text-sub text-text/60">
                            {t("inspector.timeline.shapes.startAngle")}
                        </span>
                        <NumberField
                            label={t("inspector.timeline.shapes.startAngle")}
                            testId="timeline-shape-start-angle"
                            value={g.start_angle * DEGREES}
                            disabled={disabled}
                            onCommit={(degrees) =>
                                set({ ...g, start_angle: degrees / DEGREES })
                            }
                        />
                    </div>
                    <ToggleGroup
                        type="single"
                        aria-label={t("inspector.timeline.shapes.direction")}
                        value={g.clockwise ? "cw" : "ccw"}
                        disabled={disabled}
                        onValueChange={(value: string) => {
                            if (value) set({ ...g, clockwise: value === "cw" });
                        }}
                    >
                        <ToggleGroupItem
                            value="ccw"
                            className="text-sub px-8"
                            disabled={disabled}
                        >
                            {t("inspector.timeline.shapes.counterclockwise")}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="cw"
                            className="text-sub px-8"
                            disabled={disabled}
                        >
                            {t("inspector.timeline.shapes.clockwise")}
                        </ToggleGroupItem>
                    </ToggleGroup>
                </Field>
            );
        }
        case "box": {
            const g = shape.geometry;
            return (
                <Field
                    label={t("inspector.timeline.shapes.origin")}
                    help={<Help>{t("inspector.timeline.shapes.boxHelp")}</Help>}
                >
                    <PointFields
                        point={g.origin}
                        {...xy(t("inspector.timeline.shapes.origin"))}
                        disabled={disabled}
                        testId="timeline-shape-origin"
                        onCommit={(origin) => set({ ...g, origin })}
                    />
                    <div className="flex flex-wrap items-center gap-6">
                        <span className="text-sub text-text/60">
                            {t("inspector.timeline.shapes.width")}
                        </span>
                        <NumberField
                            label={t("inspector.timeline.shapes.width")}
                            testId="timeline-shape-width"
                            value={g.width}
                            disabled={disabled}
                            onCommit={(width) => set({ ...g, width })}
                        />
                        <span className="text-sub text-text/60">
                            {t("inspector.timeline.shapes.height")}
                        </span>
                        <NumberField
                            label={t("inspector.timeline.shapes.height")}
                            testId="timeline-shape-height"
                            value={g.height}
                            disabled={disabled}
                            onCommit={(height) => set({ ...g, height })}
                        />
                    </div>
                </Field>
            );
        }
        case "block": {
            const g = shape.geometry;
            const needs = blockNeeds(target);
            return (
                <Field
                    label={t("inspector.timeline.shapes.origin")}
                    help={
                        <>
                            <Help testId="timeline-shape-cells">
                                {t("inspector.timeline.shapes.cells", {
                                    rows: g.rows,
                                    cols: g.cols,
                                    cells: g.rows * g.cols,
                                })}
                            </Help>
                            {needs.length > 0 && (
                                <Help testId="timeline-shape-cells-needed">
                                    {t(
                                        "inspector.timeline.shapes.cellsNeeded",
                                        {
                                            list: needs.join(", "),
                                            slots: target.minCells,
                                        },
                                    )}
                                </Help>
                            )}
                        </>
                    }
                >
                    <PointFields
                        point={g.origin}
                        {...xy(t("inspector.timeline.shapes.origin"))}
                        disabled={disabled}
                        testId="timeline-shape-origin"
                        onCommit={(origin) => set({ ...g, origin })}
                    />
                    <div className="flex flex-wrap items-center gap-6">
                        <span className="text-sub text-text/60">
                            {t("inspector.timeline.shapes.rows")}
                        </span>
                        <NumberField
                            label={t("inspector.timeline.shapes.rows")}
                            testId="timeline-shape-rows"
                            value={g.rows}
                            min={1}
                            step={1}
                            disabled={disabled}
                            onCommit={(rows) => set({ ...g, rows })}
                        />
                        <span className="text-sub text-text/60">
                            {t("inspector.timeline.shapes.cols")}
                        </span>
                        <NumberField
                            label={t("inspector.timeline.shapes.cols")}
                            testId="timeline-shape-cols"
                            value={g.cols}
                            min={1}
                            step={1}
                            disabled={disabled}
                            onCommit={(cols) => set({ ...g, cols })}
                        />
                    </div>
                    <PointFields
                        point={g.spacing}
                        {...xy(t("inspector.timeline.shapes.spacing"))}
                        disabled={disabled}
                        testId="timeline-shape-spacing"
                        onCommit={(spacing) => set({ ...g, spacing })}
                    />
                </Field>
            );
        }
    }
}

/** One shape's name, kind, geometry and delete button. */
function ShapeEditor({
    target,
    disabled,
    edit,
    t,
}: {
    target: ShapeEditTarget;
    disabled: boolean;
    edit: (change: ShapeEdit) => void;
    t: Translate;
}) {
    const used = target.usedBy.map((u) => u.transitionId).join(", ");
    const ftlUsers = target.usedBy
        .filter((u) => u.style === "follow_the_leader")
        .map((u) => u.transitionId)
        .join(", ");
    const noBlock = kindBlocker(target, "block");
    const cannotDelete = deleteBlocker(target);
    return (
        <div
            className="flex flex-col gap-12"
            data-testid={`timeline-shape-editor-${target.id}`}
        >
            <Field
                label={t("inspector.timeline.shapes.name")}
                help={
                    <>
                        <Help testId="timeline-shape-used">
                            {target.usedBy.length > 0
                                ? t("inspector.timeline.shapes.usedBy", {
                                      list: used,
                                  })
                                : t("inspector.timeline.shapes.unused")}
                        </Help>
                        {target.usedBy.length > 0 && (
                            <Help>
                                {t("inspector.timeline.shapes.usedHelp")}
                            </Help>
                        )}
                    </>
                }
            >
                <NameField
                    value={target.name ?? ""}
                    label={t("inspector.timeline.shapes.name")}
                    disabled={disabled}
                    onCommit={(name) => edit({ kind: "rename", name })}
                />
            </Field>
            <Field
                label={t("inspector.timeline.shapes.kindLabel")}
                help={
                    <>
                        <Help>{t("inspector.timeline.shapes.kindHelp")}</Help>
                        {target.usedBy.length > 0 && (
                            <Help testId="timeline-shape-kind-in-use">
                                {t("inspector.timeline.shapes.kindInUse", {
                                    list: used,
                                })}
                            </Help>
                        )}
                        {noBlock && (
                            <Help testId="timeline-shape-no-block">
                                {t("inspector.timeline.shapes.kindNoFtl", {
                                    list: ftlUsers,
                                })}
                            </Help>
                        )}
                    </>
                }
            >
                <ToggleGroup
                    type="single"
                    aria-label={t("inspector.timeline.shapes.kindLabel")}
                    value={target.shape.kind}
                    disabled={disabled}
                    onValueChange={(value: string) => {
                        if (value)
                            edit({ kind: "kind", to: value as ShapeKind });
                    }}
                >
                    {SHAPE_KINDS.map((kind) => (
                        <ToggleGroupItem
                            key={kind}
                            value={kind}
                            className="text-sub px-8"
                            disabled={
                                disabled || kindBlocker(target, kind) !== null
                            }
                        >
                            {t(KIND_KEYS[kind])}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </Field>
            <GeometryFields
                target={target}
                disabled={disabled}
                edit={edit}
                t={t}
            />
            <div className="flex flex-col gap-6">
                <Button
                    size="compact"
                    variant="secondary"
                    className="w-fit"
                    disabled={disabled || cannotDelete !== null}
                    onClick={() => edit({ kind: "delete" })}
                >
                    <TrashIcon size={16} />
                    {t("inspector.timeline.shapes.delete")}
                </Button>
                {cannotDelete && (
                    <Help testId="timeline-shape-delete-blocker">
                        {t("inspector.timeline.shapes.deleteInUse", {
                            list: used,
                        })}
                    </Help>
                )}
            </div>
        </div>
    );
}

/**
 * The show's shapes (P8.2): draw a new `line`, `freehand`, `circle`, `box` or `block` through the
 * selected marchers, and edit any shape's name, kind and geometry, in absolute field coordinates.
 * Each change is one undoable edit, a change that writes nothing is skipped, and a refusal (bad
 * geometry, E-S1; a change that breaks a transition using the shape, E-T3/E-T4) is a toast with
 * its friendly message. Options the database would refuse are disabled, with the reason.
 */
export function TimelineShapesEditor({
    shapes,
    version,
    selectedMarcherIds,
    beat,
    frame,
    database,
    t,
}: {
    shapes: readonly ShapeEditTarget[];
    /** The store version `shapes` were read at */
    version: number;
    selectedMarcherIds: readonly number[];
    /** Where the selected marchers are read for a new shape: the selected page's end beat */
    beat: number | null;
    frame: ShapeFrame;
    database: DbConnection;
    t: Translate;
}) {
    const [picked, setPicked] = useState<number | null>(null);
    const [newKind, setNewKind] = useState<ShapeKind>("line");
    /**
     * The store version the last committed edit was planned from. The controls stay disabled
     * until shapes read at a newer version arrive, so a second edit is never planned from the
     * shape before the first (P8.4's guard). The ref guards clicks before the next render.
     */
    const plannedAt = useRef<number | null>(null);
    /**
     * True for the whole of an edit, planning and writing. A second click while one is in flight
     * (a double click on New shape) does nothing, even once the first edit's version arrives.
     */
    const inFlight = useRef(false);
    const [awaiting, setAwaiting] = useState<number | null>(null);
    const pending = awaiting !== null && awaiting >= version;

    const run = useCallback(
        async (plan: () => Promise<PlannedShapeEdit | null>) => {
            if (inFlight.current) return;
            if (plannedAt.current !== null && plannedAt.current >= version)
                return;
            inFlight.current = true;
            const planned = version;
            plannedAt.current = planned;
            setAwaiting(planned);
            let created: number | null;
            try {
                const edit = await plan();
                if (edit === null) {
                    plannedAt.current = null;
                    setAwaiting(null);
                    return;
                }
                created = await applyShapeEdit(database, edit);
            } catch (error) {
                // Nothing was written, so the shown shapes are still current
                plannedAt.current = null;
                setAwaiting(null);
                toastTimelineError(error);
                return;
            } finally {
                inFlight.current = false;
            }
            if (created !== null) setPicked(created);
        },
        [version, database],
    );

    const target = shapes.find((s) => s.id === picked) ?? null;
    const edit = useCallback(
        (change: ShapeEdit) => {
            if (!target) return;
            void run(async () => planShapeEdit(target, change, frame));
        },
        [run, target, frame],
    );
    // The canvas draws the picked shape with handles; a drag commits through `run` (P7.11).
    // The commit says synchronously whether an edit started, so the canvas can put back a drag
    // that saved nothing.
    const commitDrag = useCallback(
        (shape: ShapeRow): ShapeCommitResult => {
            if (!target) return "unchanged";
            if (
                inFlight.current ||
                (plannedAt.current !== null && plannedAt.current >= version)
            ) {
                toast.warning(t("inspector.timeline.shapes.dragDropped"));
                return "busy";
            }
            // Drawn from an older kind: plan nothing rather than a geometry it can't take
            if (shape.kind !== target.shape.kind) return "unchanged";
            const plan = planShapeEdit(
                target,
                { kind: "geometry", geometry: shape.geometry },
                frame,
            );
            if (plan === null) return "unchanged";
            void run(async () => plan);
            return "started";
        },
        [target, version, frame, run, t],
    );
    const publish = useTimelineShapeCanvasStore((s) => s.set);
    useEffect(() => {
        publish({ target, pending, commit: target ? commitDrag : null });
    }, [publish, target, pending, commitDrag]);
    useEffect(
        () => () => publish({ target: null, pending: false, commit: null }),
        [publish],
    );

    const create = () =>
        void run(async () =>
            planNewShape(
                newKind,
                await selectedPositions(selectedMarcherIds, beat, t),
                frame,
            ),
        );

    return (
        <section
            className="flex flex-col gap-12"
            data-testid="timeline-shapes-editor"
            aria-label={t("inspector.timeline.shapes.title")}
        >
            <div>
                <h5 className="text-body font-medium">
                    {t("inspector.timeline.shapes.title")}
                </h5>
                <Help>{t("inspector.timeline.shapes.help")}</Help>
            </div>
            <div className="flex flex-wrap items-center gap-6">
                <Select
                    value={newKind}
                    disabled={pending}
                    onValueChange={(value) => {
                        if (value) setNewKind(value as ShapeKind);
                    }}
                >
                    <SelectTriggerButton
                        label={t("inspector.timeline.shapes.newKind")}
                    />
                    <SelectContent>
                        {SHAPE_KINDS.map((kind) => (
                            <SelectItem key={kind} value={kind}>
                                {t(KIND_KEYS[kind])}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    size="compact"
                    variant="secondary"
                    disabled={pending}
                    data-testid="timeline-shape-create"
                    onClick={create}
                >
                    <PlusIcon size={16} />
                    {t("inspector.timeline.shapes.create")}
                </Button>
            </div>
            {shapes.length === 0 ? (
                <Help>{t("inspector.timeline.shapes.none")}</Help>
            ) : (
                <Select
                    value={target ? String(target.id) : ""}
                    disabled={pending}
                    onValueChange={(value) => {
                        if (value) setPicked(Number(value));
                    }}
                >
                    <SelectTriggerButton
                        label={t("inspector.timeline.shapes.pick")}
                    />
                    <SelectContent>
                        {shapes.map((shape) => (
                            <SelectItem key={shape.id} value={String(shape.id)}>
                                {shapeName(shape, t)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            {target && (
                <Help testId="timeline-shape-canvas-help">
                    {t("inspector.timeline.shapes.canvasHelp")}
                </Help>
            )}
            {target && (
                <ShapeEditor
                    key={target.id}
                    target={target}
                    disabled={pending}
                    edit={edit}
                    t={t}
                />
            )}
        </section>
    );
}

export default TimelineShapesEditor;
