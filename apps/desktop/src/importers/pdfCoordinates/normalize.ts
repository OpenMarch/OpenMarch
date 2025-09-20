import type { NormalizedSheet, ParsedSheet, NormalizedRow } from "./types";

const LATERAL_REGEX = /(?:On|on)|(?:(\d+(?:\.\d+)?)\s*steps\s*(Inside|Outside)\s*(\d{1,2})\s*yd\s*ln)/i;
const FB_REGEX = /^(?:On|on)\s*(Front|Back)\s*Hash|^(\d+(?:\.\d+)?)\s*steps\s*(In Front Of|Behind)\s*(Front|Back)\s*Hash/i;

type CheckpointLike = { name: string; stepsFromCenterFront: number; useAsReference: boolean };

type FieldPropsLike = {
	xCheckpoints: CheckpointLike[];
	yCheckpoints: CheckpointLike[];
};

export function normalizeSheets(
	sheets: ParsedSheet[],
	fieldProperties: FieldPropsLike,
): NormalizedSheet[] {
	return sheets.map((s) => ({
		pageIndex: s.pageIndex,
		quadrant: s.quadrant,
		header: s.header,
		rows: s.rows.map((r) => normalizeRow(r, fieldProperties)),
	}));
}

function normalizeRow(row: any, fieldProperties: FieldPropsLike): NormalizedRow {
	const xSteps = parseLateral(row.lateralText, fieldProperties);
	const ySteps = parseFrontBack(row.fbText, fieldProperties);
	return {
		setId: row.setId,
		counts: row.counts,
		xSteps,
		ySteps,
		lateralText: row.lateralText,
		fbText: row.fbText,
	};
}

function getYCheckpoint(field: FieldPropsLike, which: "Front" | "Back"): CheckpointLike {
	const nameNeedle = which === "Front" ? "front hash" : "back hash";
	const candidates = field.yCheckpoints.filter((c) => /hash/i.test(c.name) && c.name.toLowerCase().includes(nameNeedle));
	const preferred = candidates.find((c) => c.useAsReference) || candidates[0];
	if (!preferred) throw new Error(`No ${which} hash found in field properties`);
	return preferred;
}

function yardlineSteps(field: FieldPropsLike, yardNum: number, side: 1 | 2): number {
	const name = `${yardNum} yard line`;
	const checkpoints = field.xCheckpoints.filter((c) => c.name === name);
	if (checkpoints.length === 0) {
		const steps = ((yardNum - 50) / 5) * 8;
		return side === 1 ? -Math.abs(steps) : Math.abs(steps);
	}
	const desiredSign = side === 1 ? -1 : 1;
	const match = checkpoints.find((c) => Math.sign(c.stepsFromCenterFront) === desiredSign) || checkpoints[0];
	return match.stepsFromCenterFront;
}

function detectSide(text: string): 1 | 2 {
	const lc = text.toLowerCase();
	if (/(^|\s)(s1|side\s*1|side\s*a|left)\b/.test(lc)) return 1;
	if (/(^|\s)(s2|side\s*2|side\s*b|right)\b/.test(lc)) return 2;
	return 1;
}

export function parseLateral(text: string, field: FieldPropsLike): number {
	const side = detectSide(text);
	if (/^\s*(?:Side\s*[12ab]|Left|Right)\s*:\s*On\s*(\d{1,2})/i.test(text)) {
		const yard = parseInt(text.match(/(\d{1,2})\s*yd/i)?.[1] || "50", 10);
		return yardlineSteps(field, yard, side);
	}
	const m = text.match(LATERAL_REGEX);
	if (!m) return 0;
	const dist = m[1] ? parseFloat(m[1]) : 0;
	const relation = (m[2] || "On").toLowerCase();
	const yard = m[3] ? parseInt(m[3], 10) : 50;
	const base = yardlineSteps(field, yard, side);
	if (!dist || relation === "on") return base;
	if (relation.toLowerCase() === "inside") {
		return side === 1 ? base + dist : base - dist;
	} else {
		return side === 1 ? base - dist : base + dist;
	}
}

export function parseFrontBack(text: string, field: FieldPropsLike): number {
	const m = text.match(FB_REGEX);
	if (!m) {
		const simple = text.match(/On\s+(Front|Back)\s+Hash/i);
		if (simple) {
			const base = getYCheckpoint(field, simple[1] as any).stepsFromCenterFront;
			return base;
		}
		return 0;
	}
	if (m[0].toLowerCase().startsWith("on")) {
		const which = m[1] as "Front" | "Back";
		return getYCheckpoint(field, which).stepsFromCenterFront;
	}
	const dist = parseFloat(m[2]);
	const relation = m[3];
	const which = m[4] as "Front" | "Back";
	const base = getYCheckpoint(field, which).stepsFromCenterFront;
	if (/In Front Of/i.test(relation)) {
		return base + dist;
	}
	return base - dist;
}
