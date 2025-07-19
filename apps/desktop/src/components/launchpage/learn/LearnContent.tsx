import * as Tabs from "@radix-ui/react-tabs";
import Guides from "./Guides";
import TroubleshootingTips from "./TroubleshootingTips";
import { T } from "@tolgee/react";

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
                <Guides />
                <TroubleshootingTips />
            </div>
        </Tabs.Content>
    );
}
