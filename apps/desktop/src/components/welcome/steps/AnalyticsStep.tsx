import AnalyticsOptInDetails from "@/components/AnalyticsOptInDetails";

/** The analytics opt-in, moved here from its own modal; the flow's buttons answer it. */
export default function AnalyticsStep() {
    return (
        <div className="flex flex-col gap-16">
            <AnalyticsOptInDetails />
        </div>
    );
}
