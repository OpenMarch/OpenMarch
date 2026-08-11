import {
    MARCHER_ICON_VIEWBOX,
    marcherIconSvgRaw,
} from "@/assets/open-march-marcher";

const marcherIconPaths = marcherIconSvgRaw
    .replace(/^\s*<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();

export type MarcherLogoProps = {
    width?: number | string;
    height?: number | string;
    className?: string;
};

export default function MarcherLogo({
    width = 8,
    height = 21,
    className,
}: MarcherLogoProps) {
    return (
        <svg
            width={width}
            height={height}
            viewBox={MARCHER_ICON_VIEWBOX}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            dangerouslySetInnerHTML={{ __html: marcherIconPaths }}
        />
    );
}
