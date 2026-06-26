import { useEffect, useRef, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    Input,
    WarningNote,
} from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { T, useTolgee } from "@tolgee/react";
import MusicXmlSelector from "@/components/music/MusicXmlSelector";
import { useQuery } from "@tanstack/react-query";
import { allDatabaseMeasuresQueryOptions } from "@/hooks/queries/useMeasures";
import type {
    NewShowTempoData,
    TempoOnlyTimeSignature,
} from "../../newShowTypes";
import {
    DEFAULT_TEMPO_ONLY_TIME_SIGNATURE,
    TEMPO_ONLY_TIME_SIGNATURES,
} from "../../newShowTypes";

interface TempoStepProps {
    tempo: NewShowTempoData | null;
    onChange: (tempo: NewShowTempoData) => void;
}

export default function TempoStep({ tempo, onChange }: TempoStepProps) {
    const { t } = useTolgee();
    const [databaseReady, setDatabaseReady] = useState(false);
    const [checkingDatabase, setCheckingDatabase] = useState(true);
    const { data: measures } = useQuery({
        ...allDatabaseMeasuresQueryOptions(),
        enabled: databaseReady,
    });

    const [method, setMethod] = useState<NewShowTempoData["method"]>(
        tempo?.method ?? "tempo_only",
    );
    const [tempoValue, setTempoValue] = useState(tempo?.tempo ?? 120);
    const [timeSignature, setTimeSignature] = useState<TempoOnlyTimeSignature>(
        tempo?.timeSignature ?? DEFAULT_TEMPO_ONLY_TIME_SIGNATURE,
    );
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const hasSyncedInitial = useRef(tempo !== null);

    const emitTempo = (
        nextMethod: NewShowTempoData["method"],
        nextTempo: number = tempoValue,
        nextTimeSignature: TempoOnlyTimeSignature = timeSignature,
    ) => {
        onChangeRef.current({
            method: nextMethod,
            tempo: nextMethod === "tempo_only" ? nextTempo : undefined,
            timeSignature:
                nextMethod === "tempo_only" ? nextTimeSignature : undefined,
        });
    };

    useEffect(() => {
        if (hasSyncedInitial.current) return;
        hasSyncedInitial.current = true;
        emitTempo(method, tempoValue, timeSignature);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const checkDatabase = async () => {
            setCheckingDatabase(true);
            for (let i = 0; i < 10; i++) {
                if (cancelled) return;
                if (await window.electron.databaseIsReady()) {
                    setDatabaseReady(true);
                    setCheckingDatabase(false);
                    return;
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            setDatabaseReady(false);
            setCheckingDatabase(false);
        };
        void checkDatabase();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (
            method === "xml" &&
            measures &&
            Array.isArray(measures) &&
            measures.length > 0
        ) {
            onChangeRef.current({ method: "xml" });
        }
    }, [method, measures]);

    const getMethodLabel = () => {
        switch (method) {
            case "tempo_only":
                return t("launchpage.newShow.steps.tempo.tempoOnly");
            case "xml":
                return t("launchpage.newShow.steps.tempo.musicXml");
            case "skip":
                return t("launchpage.newShow.steps.tempo.skip");
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <WizardFormField
                label={t("launchpage.newShow.steps.tempo.method")}
                helperText={t("launchpage.newShow.steps.tempo.methodHelper")}
            >
                <Select
                    value={method}
                    onValueChange={(v) => {
                        const nextMethod = v as NewShowTempoData["method"];
                        setMethod(nextMethod);
                        emitTempo(nextMethod);
                    }}
                >
                    <SelectTriggerButton label={getMethodLabel()} />
                    <SelectContent>
                        <SelectItem value="tempo_only">
                            <T keyName="launchpage.newShow.steps.tempo.tempoOnly" />
                        </SelectItem>
                        <SelectItem value="xml">
                            <T keyName="launchpage.newShow.steps.tempo.musicXml" />
                        </SelectItem>
                        <SelectItem value="skip">
                            <T keyName="launchpage.newShow.steps.tempo.skip" />
                        </SelectItem>
                    </SelectContent>
                </Select>
            </WizardFormField>

            {method === "tempo_only" && (
                <>
                    <WizardFormField
                        label={t(
                            "launchpage.newShow.steps.tempo.timeSignature",
                        )}
                        helperText={t(
                            "launchpage.newShow.steps.tempo.timeSignatureHelper",
                        )}
                    >
                        <Select
                            value={timeSignature}
                            onValueChange={(v) => {
                                const nextTimeSignature =
                                    v as TempoOnlyTimeSignature;
                                setTimeSignature(nextTimeSignature);
                                emitTempo(
                                    "tempo_only",
                                    tempoValue,
                                    nextTimeSignature,
                                );
                            }}
                        >
                            <SelectTriggerButton label={timeSignature} />
                            <SelectContent>
                                {TEMPO_ONLY_TIME_SIGNATURES.map((sig) => (
                                    <SelectItem key={sig} value={sig}>
                                        {sig}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </WizardFormField>
                    <WizardFormField label={t("launchpage.newShow.tempo")}>
                        <Input
                            type="number"
                            value={tempoValue}
                            onChange={(e) => {
                                const nextTempo =
                                    parseInt(e.target.value, 10) || 120;
                                setTempoValue(nextTempo);
                                emitTempo(
                                    "tempo_only",
                                    nextTempo,
                                    timeSignature,
                                );
                            }}
                            min={1}
                            max={300}
                        />
                    </WizardFormField>
                </>
            )}

            {method === "xml" && (
                <div className="flex flex-col gap-8">
                    {checkingDatabase && (
                        <WarningNote>
                            <T keyName="launchpage.newShow.steps.tempo.waitingDb" />
                        </WarningNote>
                    )}
                    {!checkingDatabase && !databaseReady && (
                        <WarningNote>
                            <T keyName="launchpage.newShow.steps.tempo.dbNotReady" />
                        </WarningNote>
                    )}
                    {databaseReady && <MusicXmlSelector />}
                </div>
            )}

            {method === "skip" && (
                <p className="text-body text-text/70">
                    <T keyName="launchpage.newShow.steps.tempo.skipDescription" />
                </p>
            )}
        </div>
    );
}
