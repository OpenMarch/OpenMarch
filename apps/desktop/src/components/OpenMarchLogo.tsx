import logoSvgRaw from "@/assets/open-march-logo.svg?raw";

// The asset's own <svg> wrapper is replaced so the size and class can be set.
const logoPaths = logoSvgRaw
    .replace(/^\s*<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();

/** The OpenMarch logo (stacked "OPEN MARCH"), drawn in `currentColor`. */
export default function OpenMarchLogo({
    height = 32,
    className,
}: {
    height?: number;
    className?: string;
}) {
    return (
        <svg
            height={height}
            width={(height * 54) / 32}
            viewBox="0 0 54 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            role="img"
            aria-label="OpenMarch" // i18n-ignore: product name, the same in every language
            dangerouslySetInnerHTML={{ __html: logoPaths }}
        />
    );
}
