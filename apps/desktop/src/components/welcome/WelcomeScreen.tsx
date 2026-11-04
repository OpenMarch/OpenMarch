import TitleBar from "@/components/titlebar/TitleBar";
import WelcomeFlow from "./WelcomeFlow";

/**
 * The welcome flow as the whole window, styled like the launch page, for when
 * a show opens at launch (the last one, or one opened from the system) while
 * setup isn't finished: the flow comes first, then the show. On the launch
 * page itself, the launch page shows the flow.
 */
export default function WelcomeScreen() {
    return (
        <div className="from-bg-1 to-accent flex h-full min-h-0 w-full flex-col bg-linear-to-br from-[60%] to-[150%]">
            <TitleBar />
            <WelcomeFlow onFinish={() => {}} />
        </div>
    );
}
