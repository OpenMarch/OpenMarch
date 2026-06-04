import { useState, useEffect, useRef } from "react";
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
import AudioSelector from "@/components/music/AudioSelector";
import MusicXmlSelector from "@/components/music/MusicXmlSelector";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { useQuery } from "@tanstack/react-query";
import { allDatabaseMeasuresQueryOptions } from "@/hooks/queries/useMeasures";
import type { NewShowMusicData } from "../../newShowTypes";

interface MusicStepProps {
    music: NewShowMusicData | null;
    onChange: (music: NewShowMusicData) => void;
}

export default function MusicStep({ music, onChange }: MusicStepProps) {
    const { t } = useTolgee();
    const { selectedAudioFile } = useSelectedAudioFile() || {};
    const [databaseReady, setDatabaseReady] = useState(false);
    const [checkingDatabase, setCheckingDatabase] = useState(true);
    const { data: measures } = useQuery({
        ...allDatabaseMeasuresQueryOptions(),
        enabled: databaseReady,
    });

    const [method, setMethod] = useState<NewShowMusicData["method"]>(
        music?.method ?? "tempo_only",
    );
    const [tempo, setTempo] = useState(music?.tempo ?? 120);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const hasSyncedInitial = useRef(music !== null);

    const emitMusic = (
        nextMethod: NewShowMusicData["method"],
        nextTempo: number = tempo,
    ) => {
        onChangeRef.current({
            method: nextMethod,
            tempo: nextMethod === "tempo_only" ? nextTempo : undefined,
        });
    };

    useEffect(() => {
        if (hasSyncedInitial.current) return;
        hasSyncedInitial.current = true;
        emitMusic(method, tempo);
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
        if (method === "mp3" && selectedAudioFile) {
            onChangeRef.current({ method: "mp3" });
        }
    }, [method, selectedAudioFile]);

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
                return t("launchpage.newShow.steps.music.tempoOnly");
            case "xml":
                return t("launchpage.newShow.steps.music.musicXml");
            case "mp3":
                return t("launchpage.newShow.steps.music.audioFile");
            case "skip":
                return t("launchpage.newShow.steps.music.skip");
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <WizardFormField
                label={t("launchpage.newShow.steps.music.method")}
                helperText={t("launchpage.newShow.steps.music.methodHelper")}
            >
                <Select
                    value={method}
                    onValueChange={(v) => {
                        const nextMethod = v as NewShowMusicData["method"];
                        setMethod(nextMethod);
                        emitMusic(nextMethod);
                    }}
                >
                    <SelectTriggerButton label={getMethodLabel()} />
                    <SelectContent>
                        <SelectItem value="tempo_only">
                            <T keyName="launchpage.newShow.steps.music.tempoOnly" />
                        </SelectItem>
                        <SelectItem value="xml">
                            <T keyName="launchpage.newShow.steps.music.musicXml" />
                        </SelectItem>
                        <SelectItem value="mp3">
                            <T keyName="launchpage.newShow.steps.music.audioFile" />
                        </SelectItem>
                        <SelectItem value="skip">
                            <T keyName="launchpage.newShow.steps.music.skip" />
                        </SelectItem>
                    </SelectContent>
                </Select>
            </WizardFormField>

            {method === "tempo_only" && (
                <WizardFormField label={t("launchpage.newShow.tempo")}>
                    <Input
                        type="number"
                        value={tempo}
                        onChange={(e) => {
                            const nextTempo =
                                parseInt(e.target.value, 10) || 120;
                            setTempo(nextTempo);
                            emitMusic("tempo_only", nextTempo);
                        }}
                        min={1}
                        max={300}
                    />
                </WizardFormField>
            )}

            {method === "mp3" && (
                <div className="flex flex-col gap-8">
                    {checkingDatabase && (
                        <WarningNote>
                            <T keyName="launchpage.newShow.steps.music.waitingDb" />
                        </WarningNote>
                    )}
                    {!checkingDatabase && !databaseReady && (
                        <WarningNote>
                            <T keyName="launchpage.newShow.steps.music.dbNotReady" />
                        </WarningNote>
                    )}
                    {databaseReady && <AudioSelector />}
                </div>
            )}

            {method === "xml" && (
                <div className="flex flex-col gap-8">
                    {checkingDatabase && (
                        <WarningNote>
                            <T keyName="launchpage.newShow.steps.music.waitingDb" />
                        </WarningNote>
                    )}
                    {!checkingDatabase && !databaseReady && (
                        <WarningNote>
                            <T keyName="launchpage.newShow.steps.music.dbNotReady" />
                        </WarningNote>
                    )}
                    {databaseReady && <MusicXmlSelector />}
                </div>
            )}

            {method === "skip" && (
                <p className="text-body text-text/70">
                    <T keyName="launchpage.newShow.steps.music.skipDescription" />
                </p>
            )}
        </div>
    );
}
