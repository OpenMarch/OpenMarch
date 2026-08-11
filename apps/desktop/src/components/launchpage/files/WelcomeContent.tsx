import { T } from "@tolgee/react";
import MarcherLogo from "@/components/MarcherLogo";

export default function WelcomeContent() {
    return (
        <div className="flex h-full w-[512px] flex-col items-center justify-center gap-12 self-center">
            <MarcherLogo width={28} height={75} className="text-accent" />
            <h3 className="text-h3 text-center">
                <T keyName="welcome.title" />
            </h3>
            <p className="text-body text-text-subtitle text-center leading-[190%]">
                <T keyName="welcome.description" />
            </p>
        </div>
    );
}
