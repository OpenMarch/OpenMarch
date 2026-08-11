import { useEffect, useRef, useState } from "react";
import { WarningNote } from "@openmarch/ui";
import { T } from "@tolgee/react";
import AudioSelector from "@/components/music/AudioSelector";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import type { NewShowAudioData } from "../../newShowTypes";

interface AudioStepProps {
    audio: NewShowAudioData | null;
    onChange: (audio: NewShowAudioData) => void;
}

export default function AudioStep({ audio, onChange }: AudioStepProps) {
    const { selectedAudioFile } = useSelectedAudioFile() || {};
    const [databaseReady, setDatabaseReady] = useState(false);
    const [checkingDatabase, setCheckingDatabase] = useState(true);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

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
        if (audio?.method === "audio" || selectedAudioFile) {
            onChangeRef.current({ method: "audio" });
        }
    }, [audio?.method, selectedAudioFile]);

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-12">
            {checkingDatabase && (
                <WarningNote>
                    <T keyName="launchpage.newShow.steps.audio.waitingDb" />
                </WarningNote>
            )}
            {!checkingDatabase && !databaseReady && (
                <WarningNote>
                    <T keyName="launchpage.newShow.steps.audio.dbNotReady" />
                </WarningNote>
            )}
            {databaseReady && <AudioSelector />}
            <p className="text-body text-text/70">
                <T keyName="launchpage.newShow.steps.audio.optionalDescription" />
            </p>
        </div>
    );
}
