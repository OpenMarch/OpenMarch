import { FieldProperties, type Checkpoint } from "@openmarch/core";
import {
    type DrillGrid,
    frontSidelineUnits,
    backSidelineUnits,
    yUnitsToStepsFromCenterFront,
    fieldDepthSteps,
    halfWidthSteps,
} from "@openmarch/drill-interop";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

/**
 * Decides which OpenMarch field a drill was designed on. Fingerprints the source
 * grid (field depth, hash positions, half width — all in real steps) and matches
 * it against OpenMarch's built-in templates; when nothing matches (custom / indoor
 * grids) it reconstructs a field from the grid's own landmarks. Either way the
 * returned field lines up with the source geometry so imported coordinates land
 * where the designer placed them instead of being stretched onto a mismatched
 * template.
 */
export function resolveDrillField(grid: DrillGrid): FieldProperties {
    return matchTemplate(grid) ?? buildCustomField(grid);
}

/** Real inches spanned by one source unit, used to recover the step size. */
const INCHES_PER_UNIT_IMPERIAL = 36; // one yard
const INCHES_PER_UNIT_METRIC = 39.3701; // one meter

// Match tolerances, in steps. Hashes are the reliable discriminator between
// otherwise similar fields (HS 28/56 vs College 32/53), so they are tightest.
const WIDTH_TOLERANCE = 2;
const DEPTH_TOLERANCE = 3;
const HASH_TOLERANCE = 1.5;

interface GridFingerprint {
    /** Largest yard-line/edge distance from center, in steps. */
    halfWidthSteps: number;
    /** Front-sideline to back-sideline distance, in steps. */
    depthSteps: number;
    /** Distinct hash distances from the front sideline, in steps. */
    hashStepsFromFront: number[];
}

function fingerprintGrid(grid: DrillGrid): GridFingerprint {
    return {
        halfWidthSteps: halfWidthSteps(grid),
        depthSteps: fieldDepthSteps(grid),
        hashStepsFromFront: dedupe(
            grid.hashesY.map((h) =>
                Math.abs(yUnitsToStepsFromCenterFront(h, grid)),
            ),
        ),
    };
}

function fingerprintTemplate(template: FieldProperties): GridFingerprint {
    const yBack = Math.max(
        ...template.yCheckpoints.map((c) => Math.abs(c.stepsFromCenterFront)),
    );
    const hashes = template.yCheckpoints
        .filter((c) => /hash/i.test(c.name))
        .map((c) => Math.abs(c.stepsFromCenterFront));
    return {
        halfWidthSteps: Math.max(
            ...template.xCheckpoints.map((c) =>
                Math.abs(c.stepsFromCenterFront),
            ),
        ),
        depthSteps: yBack,
        hashStepsFromFront: dedupe(hashes),
    };
}

/**
 * Finds the built-in template whose geometry best fits the source grid, or
 * `undefined` when none is close enough.
 */
export function matchTemplate(grid: DrillGrid): FieldProperties | undefined {
    const source = fingerprintGrid(grid);
    let best: { template: FieldProperties; score: number } | undefined;

    for (const template of Object.values(FieldPropertiesTemplates)) {
        const candidate = fingerprintTemplate(template);
        const widthDiff = Math.abs(
            source.halfWidthSteps - candidate.halfWidthSteps,
        );
        const depthDiff = Math.abs(source.depthSteps - candidate.depthSteps);
        if (widthDiff > WIDTH_TOLERANCE || depthDiff > DEPTH_TOLERANCE)
            continue;

        const hashDiff = hashDistance(
            source.hashStepsFromFront,
            candidate.hashStepsFromFront,
        );
        if (hashDiff === null) continue;

        const score = widthDiff + depthDiff + hashDiff;
        if (!best || score < best.score) best = { template, score };
    }

    return best?.template;
}

/**
 * Total mismatch between the source hashes and a template's hashes, or `null`
 * when any source hash has no nearby template hash. Each source hash matches the
 * nearest template hash; extra template hashes are ignored, because templates
 * encode both grid and real hash positions (e.g. College carries a grid and a
 * real back hash ~1 step apart). A source with no hashes (an indoor floor) is
 * left to the width/depth check and scores zero here.
 */
function hashDistance(source: number[], template: number[]): number | null {
    if (source.length === 0) return 0;
    if (template.length === 0) return null;
    let total = 0;
    for (const s of source) {
        const nearest = Math.min(...template.map((t) => Math.abs(s - t)));
        if (nearest > HASH_TOLERANCE) return null;
        total += nearest;
    }
    return total;
}

/**
 * Reconstructs a custom field from the grid's own landmarks: yard lines become X
 * checkpoints, sidelines and hashes become Y checkpoints, and the step size is
 * recovered from the grid's step ratio so the field scales to real space.
 */
export function buildCustomField(grid: DrillGrid): FieldProperties {
    const inchesPerUnit =
        grid.measurementSystem === "metric"
            ? INCHES_PER_UNIT_METRIC
            : INCHES_PER_UNIT_IMPERIAL;
    // steps = units * stepsPerUnit, so one step spans (1 / stepsPerUnit) units.
    const stepSizeInches =
        grid.stepsPerUnitY > 0 ? inchesPerUnit / grid.stepsPerUnitY : 22.5;

    return new FieldProperties({
        name: grid.templateName
            ? `Imported grid (${grid.templateName})`
            : "Imported grid",
        xCheckpoints: buildXCheckpoints(grid),
        yCheckpoints: buildYCheckpoints(grid),
        stepSizeInches,
        measurementSystem: grid.measurementSystem,
        useHashes: grid.hashesY.length > 0,
        isCustom: true,
    });
}

function buildXCheckpoints(grid: DrillGrid): Checkpoint[] {
    const lines =
        grid.yardLinesX.length > 0
            ? grid.yardLinesX
            : [grid.border.minX, grid.border.maxX];
    let id = 0;
    return dedupe(lines.map((x) => x * grid.stepsPerUnitX))
        .sort((a, b) => a - b)
        .map((steps) => ({
            id: id++,
            name: `${Math.round(steps)} steps`,
            axis: "x" as const,
            terseName: `${Math.round(steps)}`,
            stepsFromCenterFront: steps,
            useAsReference: true,
            visible: true,
        }));
}

function buildYCheckpoints(grid: DrillGrid): Checkpoint[] {
    // The source front sideline is the shared reference (0 steps); everything
    // else trends negative toward the back, matching OpenMarch's convention.
    const toSteps = (units: number) =>
        yUnitsToStepsFromCenterFront(units, grid);
    const checkpoints: Checkpoint[] = [];
    let id = 0;

    const push = (units: number, name: string, terse: string) =>
        checkpoints.push({
            id: id++,
            name,
            axis: "y",
            terseName: terse,
            stepsFromCenterFront: toSteps(units),
            useAsReference: true,
            visible: true,
        });

    push(frontSidelineUnits(grid), "front sideline", "FSL");
    // Order hashes front-to-back (nearest the front sideline first).
    dedupe(grid.hashesY)
        .sort((a, b) => toSteps(b) - toSteps(a))
        .forEach((h, i) => push(h, `hash ${i + 1}`, `H${i + 1}`));
    push(backSidelineUnits(grid), "back sideline", "BSL");

    return checkpoints;
}

/** Numeric de-dup that folds values within half a step of an existing one. */
function dedupe(values: number[]): number[] {
    const result: number[] = [];
    for (const value of values) {
        if (!result.some((existing) => Math.abs(existing - value) < 0.5)) {
            result.push(value);
        }
    }
    return result;
}
