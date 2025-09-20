import { useRef, useState, useMemo } from "react";
import { getButtonClassName } from "@openmarch/ui";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { toast } from "sonner";
import { useFieldProperties } from "@/hooks/queries";
import { useMarchersWithVisuals } from "@/global/classes/MarcherVisualGroup";
import { dryRunImportPdfCoordinates } from "@/importers/pdfCoordinates";

type NormalizedSheet = ReturnType<typeof dryRunImportPdfCoordinates> extends Promise<infer R>
	? R extends { normalized: infer N }
		? N extends any[]
			? N[number]
			: never
		: never
	: never;

export default function ImportCoordinatesButton() {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const { data: fieldProperties } = useFieldProperties();
	const { marchers } = useMarchersWithVisuals();
	const [open, setOpen] = useState(false);
	const [report, setReport] = useState<null | { pages: number; errors: number; warnings: number; details: any[]; normalized: NormalizedSheet[] }>(null);
	const [isLoading, setIsLoading] = useState(false);

	const hasExistingPerformers = useMemo(() => marchers && marchers.length > 0, [marchers]);

	function handleClick() {
		if (!fieldProperties) {
			toast.error("Select field properties before importing.");
			return;
		}
		if (hasExistingPerformers) {
			toast.error("Import is only supported on brand-new files with no performers.");
			return;
		}
		fileInputRef.current?.click();
	}

	async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			setIsLoading(true);
			const arrayBuffer = await file.arrayBuffer();
			const result = await dryRunImportPdfCoordinates(arrayBuffer, fieldProperties as any);
			const errors = result.dryRun.issues.filter((i) => i.type === "error").length;
			const warnings = result.dryRun.issues.filter((i) => i.type === "warning").length;
			setReport({ pages: result.pages, errors, warnings, details: result.dryRun.issues, normalized: result.normalized });
			setOpen(true);
		} catch (err: any) {
			console.error(err);
			toast.error(`Import failed: ${err?.message || "Unknown error"}`);
		} finally {
			setIsLoading(false);
			e.target.value = "";
		}
	}

	function toCsv(normalized: NormalizedSheet[]) {
		const header = ["pageIndex", "quadrant", "label", "symbol", "performer", "setId", "counts", "xSteps", "ySteps", "lateralText", "fbText"];
		const rows: string[] = [header.join(",")];
		normalized.forEach((s) => {
			s.rows.forEach((r) => {
				rows.push([
					s.pageIndex,
					s.quadrant,
					s.header.label || "",
					s.header.symbol || "",
					s.header.performer || "",
					r.setId,
					r.counts,
					r.xSteps,
					r.ySteps,
					JSON.stringify(r.lateralText),
					JSON.stringify(r.fbText),
				].join(","));
			});
		});
		return new Blob([rows.join("\n")], { type: "text/csv" });
	}

	function downloadCsv() {
		if (!report) return;
		const blob = toCsv(report.normalized);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "pdf-import-normalized.csv";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	const uniquePerformers = useMemo(() => {
		if (!report) return [] as { key: string; label?: string; symbol?: string; performer?: string }[];
		const map = new Map<string, { key: string; label?: string; symbol?: string; performer?: string }>();
		report.normalized.forEach((s) => {
			const key = (s.header.label || s.header.symbol || s.header.performer || "?").toLowerCase();
			if (!map.has(key)) map.set(key, { key, label: s.header.label, symbol: s.header.symbol, performer: s.header.performer });
		});
		return Array.from(map.values());
	}, [report]);

	return (
		<div className="flex items-center gap-8">
			<input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileSelected} />
			<button
				onClick={handleClick}
				disabled={isLoading}
				className={getButtonClassName({ variant: "primary", size: "default", content: "text", className: undefined })}
			>
				{isLoading ? "Importing…" : "Import"}
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-[800px]">
					<DialogTitle>PDF Import Dry-Run</DialogTitle>
					{report ? (
						<div className="flex flex-col gap-12">
							<div className="text-sm text-muted-foreground">
								Pages: {report.pages} · Errors: {report.errors} · Warnings: {report.warnings}
							</div>
							<div>
								<div className="font-medium mb-4">Detected performers</div>
								<div className="max-h-[180px] overflow-auto border rounded-md p-12 text-sm">
									<ul className="grid grid-cols-2 gap-x-24 gap-y-8">
										{uniquePerformers.map((p, idx) => (
											<li key={idx}>{p.label || p.symbol || p.performer}</li>
										))}
									</ul>
								</div>
							</div>
							<div className="flex gap-8">
								<button
									onClick={downloadCsv}
									className={getButtonClassName({ variant: "secondary", size: "default", content: "text", className: undefined })}
								>
									Export CSV
								</button>
								<button
									disabled
									title="Commit not implemented in prototype"
									className={getButtonClassName({ variant: "primary", size: "default", content: "text", className: undefined })}
								>
									Commit Import
								</button>
							</div>
							<div className="max-h-[240px] overflow-auto">
								<ul className="text-sm list-disc pl-16">
									{report.details.slice(0, 200).map((i, idx) => (
										<li key={idx} className={i.type === "error" ? "text-red-500" : "text-yellow-600"}>
											[{i.type}] {i.code}: {i.message}
										</li>
									))}
								</ul>
							</div>
							<div className="text-xs text-muted-foreground">This prototype performs a read-only dry-run. Database writes are not enabled yet.</div>
						</div>
					) : (
						<div className="text-sm">No report available.</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
