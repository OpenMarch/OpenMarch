import { TooltipContents } from "@/components/index";
import {
    Tooltip,
    TooltipProvider,
    TooltipTrigger,
} from "@radix-ui/react-tooltip";

export const PreviewProps = {
    title: "Tooltip",
};

export default function Preview({ ...props }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>Hover me</TooltipTrigger>

                <TooltipContents>Tooltip</TooltipContents>
            </Tooltip>
        </TooltipProvider>
    );
}
