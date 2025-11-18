import * as Tabs from "@radix-ui/react-tabs";
import Guides from "./Guides";
import TroubleshootingTips from "./TroubleshootingTips";
import { T } from "@tolgee/react";
import { YoutubeLogoIcon } from "@phosphor-icons/react";

export default function LearnContent() {
    return (
        <Tabs.Content
            value="learn"
            className="flex w-full min-w-0 flex-col items-center overflow-y-auto p-6 select-text"
        >
            <div className="flex h-fit w-full max-w-[512px] flex-col gap-16">
                <h3 className="text-h3">
                    <T keyName="launchpage.learn.title" />
                </h3>
                <div className="flex flex-col gap-8">
                    <h4 className="text-h4">
                        <T keyName="launchpage.learn.videoGuides.title" />
                    </h4>
                    <a
                        href="https://www.youtube.com/playlist?list=PLQYV6VxuRWjz-1XwK9aDtEvHqdBJunZHn"
                        target="_blank"
                        rel="noreferrer"
                        className="bg-fg-1 border-stroke rounded-6 hover:border-accent flex flex-col overflow-clip border duration-150"
                    >
                        <div className="relative h-64">
                            <div className="bg-accent absolute top-[-15%] right-[5%] -z-10 h-[3rem] w-[7rem] rounded-full text-transparent opacity-75 blur-2xl">
                                image placeholder
                            </div>
                        </div>
                        <div className="flex flex-col gap-6 p-8">
                            <YoutubeLogoIcon size={24} />
                            <p className="text-body">
                                <T keyName="launchpage.learn.videoGuides.description" />
                            </p>
                        </div>
                    </a>
                </div>
                <Guides />
                <TroubleshootingTips />
            </div>
        </Tabs.Content>
    );
}
