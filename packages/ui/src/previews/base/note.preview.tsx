import {
    InfoNote,
    SuccessNote,
    WarningNote,
    DangerNote,
    BugNote,
} from "@/components/index";

export const PreviewProps = {
    title: "Note",
};

export default function Preview({ ..._props }) {
    return (
        <div>
            <InfoNote>Hello world</InfoNote>
            <SuccessNote>Hello world</SuccessNote>
            <WarningNote>Hello world</WarningNote>
            <DangerNote>Hello world</DangerNote>
            <BugNote>Hello world</BugNote>
        </div>
    );
}
