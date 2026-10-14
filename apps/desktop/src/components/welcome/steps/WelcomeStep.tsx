import { T } from "@tolgee/react";

export default function WelcomeStep() {
    return (
        <div className="flex flex-col items-center gap-8 py-16 text-center">
            <p className="text-body text-text-subtitle">
                <T keyName="welcomeFlow.welcome.description" />
            </p>
        </div>
    );
}
