import AudioPlayer from "@/components/timeline/audio/AudioPlayer";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import PageTimeline from "@/components/timeline/PageTimeline";
import { T } from "@tolgee/react";
import clsx from "clsx";
import FooterContainer from "@/components/timeline/FooterContainer";
import TimelineContainer from "@/components/timeline/TimelineContainer";

export default function LightDesignerTimeline() {
    const { isFullscreen } = useFullscreenStore();

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
                        <PageTimeline editable={false} />
                    </section>

                    <section
                        className={clsx("flex items-center", {
                            flex: isFullscreen,
                        })}
                        aria-label="audio"
                    >
                        {!isFullscreen && (
                            <div className="flex w-[4rem] gap-6">
                                <p className="text-sub">
                                    <T keyName="timeline.audio" />
                                </p>
                            </div>
                        )}
                        <AudioPlayer compact editable={false} />
                    </section>
                </div>
            </TimelineContainer>
        </FooterContainer>
    );
}
