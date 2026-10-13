import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, useTolgee } from "@tolgee/react";
import { Button, InfoNote } from "@openmarch/ui";
import {
    CaretLeftIcon,
    DownloadSimpleIcon,
    XIcon,
} from "@phosphor-icons/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import {
    allMarchersQueryOptions,
    createMarchersMutationOptions,
} from "@/hooks/queries";
import { MarcherListContents } from "../MarchersModal";
import {
    MARCHER_CSV_COLUMNS,
    exampleMarcherCsv,
    planMarcherCsv,
    sectionPrefixTable,
    type MarcherCsvMode,
} from "./marcherCsv";

const PREVIEW_ROWS = 8;

/** `File.text()` is missing in some environments (jsdom), so read through FileReader */
const readText = (f: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(f);
    });

function downloadExample(mode: MarcherCsvMode) {
    const blob = new Blob([exampleMarcherCsv(mode)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
        mode === "section"
            ? "marchers-by-section.csv"
            : "marchers-by-drill-number.csv";
    a.click();
    URL.revokeObjectURL(url);
}

export function MarcherCsvImportContents() {
    const { setContent, toggleOpen } = useSidebarModalStore();
    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        onClick={() =>
                            setContent(<MarcherListContents />, "marchers")
                        }
                        className="hover:text-accent duration-150 ease-out"
                        aria-label="Back"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">
                        <T keyName="marchers.csv.title" />
                    </h4>
                </div>
                <button
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>
            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <MarcherCsvImport />
            </div>
        </div>
    );
}

export default function MarcherCsvImport() {
    const { t } = useTolgee();
    const queryClient = useQueryClient();
    const { setContent } = useSidebarModalStore();
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const createMarchers = useMutation(
        createMarchersMutationOptions(queryClient),
    );
    const fileInput = useRef<HTMLInputElement>(null);
    const [mode, setMode] = useState<MarcherCsvMode>("section");
    const [file, setFile] = useState<{ name: string; text: string }>();
    const [readError, setReadError] = useState(false);

    const plan = useMemo(
        () =>
            file ? planMarcherCsv(file.text, mode, marchers ?? []) : undefined,
        [file, mode, marchers],
    );
    const valid = plan?.rows.filter((r) => r.marcher) ?? [];
    const invalid = plan?.rows.filter((r) => r.error) ?? [];
    const sections = useMemo(sectionPrefixTable, []);

    const onFile = async (f: File | undefined) => {
        if (!f) return;
        try {
            setReadError(false);
            setFile({ name: f.name, text: await readText(f) });
        } catch {
            setReadError(true);
            setFile(undefined);
        }
    };

    const onImport = () => {
        createMarchers.mutate(
            valid.map((r) => r.marcher!),
            {
                onSuccess: () =>
                    setContent(<MarcherListContents />, "marchers"),
            },
        );
    };

    const errorText = (code: string, value?: string) =>
        t(`marchers.csv.error.${code}`, { value: value ?? "" });

    return (
        <div className="flex flex-col gap-16 px-12">
            <div className="flex flex-col gap-8" role="radiogroup">
                {(["section", "drillNumber"] as const).map((m) => (
                    <label
                        key={m}
                        className="border-stroke has-[:checked]:border-accent rounded-6 flex cursor-pointer gap-8 border p-8"
                    >
                        <input
                            type="radio"
                            name="marcher-csv-mode"
                            checked={mode === m}
                            onChange={() => setMode(m)}
                        />
                        <span className="flex flex-col gap-4">
                            <span className="text-body">
                                <T keyName={`marchers.csv.mode.${m}.title`} />
                            </span>
                            <span className="text-sub text-text/70">
                                <T keyName={`marchers.csv.mode.${m}.help`} />
                            </span>
                            <code className="text-sub text-text/70">
                                {MARCHER_CSV_COLUMNS[m].join(", ")}
                            </code>
                        </span>
                    </label>
                ))}
            </div>

            <div className="flex gap-8">
                <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => downloadExample(mode)}
                >
                    <DownloadSimpleIcon size={18} />
                    <T keyName="marchers.csv.downloadExample" />
                </Button>
                <Button
                    size="compact"
                    onClick={() => fileInput.current?.click()}
                >
                    <T keyName="marchers.csv.chooseFile" />
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    aria-label="Marcher CSV file"
                    onChange={(e) => {
                        void onFile(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </div>

            <details className="text-sub">
                <summary className="cursor-pointer">
                    <T keyName="marchers.csv.sections" />
                </summary>
                <p className="text-text/70 my-8">
                    <T keyName="marchers.csv.sectionsHelp" />
                </p>
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            <th>
                                <T keyName="marchers.section" />
                            </th>
                            <th>
                                <T keyName="marchers.drillPrefix" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sections.map((s) => (
                            <tr key={s.name}>
                                <td>{t(s.tName)}</td>
                                <td>
                                    <code>{s.prefix}</code>
                                    {s.shared && " *"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="text-text/70 mt-8">
                    * <T keyName="marchers.csv.sharedPrefix" />
                </p>
            </details>

            {readError && (
                <p className="text-red text-sub">
                    <T keyName="marchers.csv.readError" />
                </p>
            )}

            {file && plan && (
                <div className="flex flex-col gap-8">
                    <p className="text-body">
                        {file.name}:{" "}
                        {t("marchers.csv.summary", {
                            valid: valid.length,
                            invalid: invalid.length,
                        })}
                    </p>
                    {plan.missingColumns.length > 0 && (
                        <p className="text-red text-sub">
                            {t("marchers.csv.missingColumns", {
                                columns: plan.missingColumns.join(", "),
                            })}
                        </p>
                    )}
                    {plan.ignoredColumns.length > 0 && (
                        <p className="text-text/70 text-sub">
                            {t("marchers.csv.ignoredColumns", {
                                columns: plan.ignoredColumns.join(", "),
                            })}
                        </p>
                    )}
                    {invalid.length > 0 && (
                        <ul className="text-red text-sub max-h-[8rem] overflow-y-auto">
                            {invalid.map((r) => (
                                <li key={r.line}>
                                    {t("marchers.csv.line", { line: r.line })}:{" "}
                                    {errorText(r.error!.code, r.error!.value)}
                                </li>
                            ))}
                        </ul>
                    )}
                    {valid.length > 0 && (
                        <table className="text-sub w-full text-left">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>
                                        <T keyName="marchers.section" />
                                    </th>
                                    <th>
                                        <T keyName="marchers.name" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {valid.slice(0, PREVIEW_ROWS).map((r) => (
                                    <tr key={r.line}>
                                        <td>
                                            {r.marcher!.drill_prefix}
                                            {r.marcher!.drill_order}
                                        </td>
                                        <td>{r.marcher!.section}</td>
                                        <td>{r.marcher!.name ?? "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {valid.length > PREVIEW_ROWS && (
                        <p className="text-text/70 text-sub">
                            {t("marchers.csv.more", {
                                count: valid.length - PREVIEW_ROWS,
                            })}
                        </p>
                    )}
                </div>
            )}

            <Button
                className="w-full"
                disabled={valid.length === 0 || createMarchers.isPending}
                onClick={onImport}
            >
                {t("marchers.csv.importButton", { count: valid.length })}
            </Button>
            <InfoNote>
                <T keyName="marchers.csv.info" />
            </InfoNote>
        </div>
    );
}
