import { XIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import AudioPlayer from "@/components/timeline/audio/AudioPlayer";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import EditableAudioPlayer from "@/components/timeline/audio/EditableAudioPlayer";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import PageTimeline from "@/components/timeline/PageTimeline";
import { T } from "@tolgee/react";
import clsx from "clsx";
import FooterContainer from "@/components/timeline/FooterContainer";
import TimelineContainer from "@/components/timeline/TimelineContainer";

export default function EditorTimeline() {
    const { uiSettings } = useUiSettingsStore();
    const { isFullscreen } = useFullscreenStore();

    const showEditableAudio = uiSettings.focussedComponent === "timeline";

    return (
        <FooterContainer>
            <TimelineContainer>
                <div
                    className={clsx(
                        "flex h-full min-h-0 w-fit flex-col justify-center gap-8",
                    )}
                >
                    <section
                        className="flex h-fit items-center"
                        aria-label="pages"
                    >
                        <div>
                            <p className={clsx("text-sub w-[4rem]")}>
                                <T keyName="timeline.pages" />
                            </p>
                        </div>
                        <PageTimeline />
                    </section>

                    <section className={"flex items-center"} aria-label="audio">
                        {!isFullscreen && (
                            <div className="flex w-[4rem] gap-6">
                                <p className="text-sub">
                                    <T keyName="timeline.audio" />
                                </p>
                                {uiSettings.focussedComponent !== "timeline" ? (
                                    <RegisteredActionButton
                                        registeredAction={
                                            RegisteredActionsObjects.focusTimeline
                                        }
                                        className="w-fit"
                                    >
                                        <PencilSimpleIcon />
                                    </RegisteredActionButton>
                                ) : (
                                    <RegisteredActionButton
                                        registeredAction={
                                            RegisteredActionsObjects.focusCanvas
                                        }
                                        className="w-fit"
                                    >
                                        <XIcon />
                                    </RegisteredActionButton>
                                )}
                            </div>
                        )}

                        {showEditableAudio ? (
                            <EditableAudioPlayer />
                        ) : (
                            <div
                                style={{
                                    display: isFullscreen ? "none" : "flex",
                                }}
                            >
                                <AudioPlayer />
                            </div>
                        )}
                    </section>
                </div>
            </TimelineContainer>
        </FooterContainer>
    );
}
