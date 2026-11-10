import type { ReactNode } from "react";

/**
 * The drawing for one section icon on Phosphor's 256 unit grid.
 * Shapes carry geometry only; SectionIcon.tsx supplies stroke color and widths.
 */
export type SectionIconGlyph = {
    /** Outline shapes, drawn at the icon weight's full stroke width. */
    main: ReactNode;
    /** Finer lines such as valve stems, key rods and tension rods. */
    detail?: ReactNode;
    /** Solid shapes such as key cups, valve buttons and mallet heads. */
    solid?: ReactNode;
    /** Drawn lying flat and shown rotated 45 degrees, as for a flute or rifle. */
    diagonal?: boolean;
};

/** Keyed like SECTIONS in @/global/classes/Sections. */
export const SECTION_ICON_GLYPHS = {
    Other: {
        main: (
            <>
                <path d="M110 62L114 32H142L146 62" />
                <path d="M104 62H166" />
                <line x1="128" y1="32" x2="128" y2="22" />
                <circle cx="128" cy="84" r="16" />
                <path d="M128 108V160M100 150L128 120L158 140" />
                <path d="M110 224L128 160L158 180L150 224" />
            </>
        ),
    },
    Piccolo: {
        main: (
            <>
                <line x1="52" y1="128" x2="204" y2="128" />
            </>
        ),
        detail: (
            <>
                <line x1="112" y1="112" x2="112" y2="144" />
            </>
        ),
        solid: (
            <>
                <ellipse cx="74" cy="120" rx="16" ry="7" />
                <circle cx="136" cy="118" r="11" />
                <circle cx="158" cy="118" r="11" />
                <circle cx="180" cy="118" r="11" />
                <circle cx="201" cy="119" r="10" />
            </>
        ),
        diagonal: true,
    },
    Flute: {
        main: (
            <>
                <line x1="-8" y1="128" x2="264" y2="128" />
            </>
        ),
        detail: (
            <>
                <line x1="72" y1="112" x2="72" y2="144" />
            </>
        ),
        solid: (
            <>
                <ellipse cx="26" cy="120" rx="21" ry="8" />
                <circle cx="120" cy="119" r="11" />
                <circle cx="146" cy="119" r="11" />
                <circle cx="172" cy="119" r="11" />
                <circle cx="204" cy="119" r="11" />
                <circle cx="230" cy="119" r="11" />
                <circle cx="254" cy="120" r="10" />
            </>
        ),
        diagonal: true,
    },
    Clarinet: {
        main: (
            <>
                <line x1="34" y1="128" x2="222" y2="128" />
                <path d="M34 128L-6 112V144Z" />
                <path d="M222 122H254L222 136Z" />
            </>
        ),
        detail: (
            <>
                <line x1="116" y1="112" x2="116" y2="144" />
                <line x1="196" y1="112" x2="196" y2="144" />
            </>
        ),
        solid: (
            <>
                <circle cx="68" cy="116" r="8" />
                <circle cx="92" cy="116" r="8" />
                <circle cx="140" cy="116" r="8" />
                <circle cx="164" cy="116" r="8" />
            </>
        ),
        diagonal: true,
    },
    BassClarinet: {
        main: (
            <>
                <path d="M136 44V206C136 226 124 236 110 234C96 232 90 222 86 208L72 180L120 166L114 200" />
                <path d="M136 44V36C136 20 154 16 164 26C170 32 178 32 192 18" />
            </>
        ),
        detail: (
            <>
                <line x1="136" y1="236" x2="136" y2="248" />
            </>
        ),
        solid: (
            <>
                <circle cx="123" cy="66" r="8" />
                <circle cx="123" cy="92" r="8" />
                <circle cx="123" cy="118" r="8" />
                <circle cx="123" cy="144" r="8" />
            </>
        ),
    },
    SopranoSax: {
        main: (
            <>
                <path d="M224 128L60 115C38 113 20 110 4 104V152C20 146 38 143 60 141Z" />
                <line x1="224" y1="128" x2="262" y2="128" />
            </>
        ),
        detail: (
            <>
                <line x1="232" y1="116" x2="232" y2="140" />
            </>
        ),
        solid: (
            <>
                <circle cx="76" cy="101" r="11" />
                <circle cx="108" cy="104" r="10" />
                <circle cx="140" cy="107" r="9" />
                <circle cx="170" cy="110" r="8" />
                <circle cx="196" cy="113" r="7" />
            </>
        ),
        diagonal: true,
    },
    AltoSax: {
        main: (
            <>
                <path d="M98 62L88 188C86 220 106 238 132 238C158 238 176 220 180 192L184 156C186 142 194 132 208 124L148 134C154 142 156 150 156 160L154 186C154 198 146 204 136 204C124 204 118 196 118 186L110 62Z" />
                <path d="M104 62C104 40 96 30 78 30L36 22" />
            </>
        ),
        solid: (
            <>
                <circle cx="84" cy="92" r="8" />
                <circle cx="81" cy="118" r="8" />
                <circle cx="78" cy="144" r="8" />
            </>
        ),
    },
    TenorSax: {
        main: (
            <>
                <path d="M104 66L92 194C90 224 110 242 136 242C162 242 180 224 184 198L188 158C190 142 200 132 214 124L152 134C158 142 160 152 160 162L158 192C158 204 150 210 140 210C128 210 122 202 122 192L116 66Z" />
                <path d="M110 66C110 34 92 16 76 24C64 30 56 40 26 38" />
            </>
        ),
        solid: (
            <>
                <circle cx="90" cy="98" r="8" />
                <circle cx="87" cy="124" r="8" />
                <circle cx="84" cy="150" r="8" />
            </>
        ),
    },
    BariSax: {
        main: (
            <>
                <path d="M104 80L96 194C94 224 114 242 140 242C166 242 182 224 184 198L190 124C191 106 200 96 214 88L148 94C156 104 158 116 158 128L154 194C154 204 148 210 140 210C132 210 126 204 126 194L122 80Z" />
                <path d="M114 80V34A17 17 0 0 0 80 34V62A13 13 0 0 1 54 62V46Q54 30 38 30H24" />
            </>
        ),
        solid: (
            <>
                <circle cx="90" cy="112" r="8" />
                <circle cx="87" cy="142" r="8" />
                <circle cx="84" cy="172" r="8" />
                <circle cx="171" cy="134" r="7" />
                <circle cx="170" cy="162" r="7" />
                <circle cx="168" cy="190" r="7" />
            </>
        ),
    },
    Trumpet: {
        main: (
            <>
                <path d="M70 98H170" />
                <path d="M70 98A22 22 0 0 0 70 142H168A22 22 0 0 0 168 98" />
                <line x1="14" y1="120" x2="88" y2="120" />
                <line x1="14" y1="112" x2="14" y2="128" />
                <path d="M158 98C198.7 98 221.64 88.88 232 60" />
                <path d="M158 98C198.7 98 221.64 107.12 232 136" />
                <ellipse cx="232" cy="98" rx="12" ry="38" />
                <line x1="100" y1="98" x2="100" y2="158" />
                <line x1="124" y1="98" x2="124" y2="158" />
                <line x1="148" y1="98" x2="148" y2="158" />
            </>
        ),
        detail: (
            <>
                <line x1="100" y1="86" x2="100" y2="98" />
                <line x1="124" y1="86" x2="124" y2="98" />
                <line x1="148" y1="86" x2="148" y2="98" />
            </>
        ),
        solid: (
            <>
                <ellipse cx="100" cy="82" rx="10" ry="6" />
                <ellipse cx="124" cy="82" rx="10" ry="6" />
                <ellipse cx="148" cy="82" rx="10" ry="6" />
            </>
        ),
    },
    Mellophone: {
        main: (
            <>
                <path d="M14 100H134" />
                <line x1="14" y1="92" x2="14" y2="108" />
                <path d="M64 100A36 36 0 0 0 64 172H146Q182 172 186 128" />
                <path d="M124 100C180.1 100 211.72 82.72 226 28" />
                <path d="M124 100C180.1 100 211.72 117.28 226 172" />
                <ellipse cx="226" cy="100" rx="12" ry="72" />
                <line x1="100" y1="100" x2="100" y2="150" />
                <line x1="124" y1="100" x2="124" y2="150" />
                <line x1="148" y1="100" x2="148" y2="150" />
            </>
        ),
        detail: (
            <>
                <line x1="100" y1="92" x2="100" y2="100" />
                <line x1="124" y1="92" x2="124" y2="100" />
                <line x1="148" y1="92" x2="148" y2="100" />
            </>
        ),
        solid: (
            <>
                <ellipse cx="100" cy="88" rx="10" ry="6" />
                <ellipse cx="124" cy="88" rx="10" ry="6" />
                <ellipse cx="148" cy="88" rx="10" ry="6" />
            </>
        ),
    },
    Trombone: {
        main: (
            <>
                <path d="M62 100H104" />
                <path d="M62 100A40 40 0 0 0 62 180H230A14 14 0 0 0 230 152H96" />
                <line x1="96" y1="144" x2="96" y2="160" />
                <path d="M92 100C128.3 100 148.76 91.84 158 66" />
                <path d="M92 100C128.3 100 148.76 108.16 158 134" />
                <ellipse cx="158" cy="100" rx="12" ry="34" />
            </>
        ),
        detail: (
            <>
                <line x1="50" y1="108" x2="50" y2="172" />
                <line x1="122" y1="158" x2="122" y2="174" />
            </>
        ),
    },
    BassTrombone: {
        main: (
            <>
                <path d="M66 92H112" />
                <path d="M66 92A46 46 0 0 0 66 184H230A14 14 0 0 0 230 156H110" />
                <line x1="110" y1="148" x2="110" y2="164" />
                <path d="M102 92C140.5 92 162.2 82.4 172 52" />
                <path d="M102 92C140.5 92 162.2 101.6 172 132" />
                <ellipse cx="172" cy="92" rx="12" ry="40" />
            </>
        ),
        detail: (
            <>
                <rect x="40" y="122" width="56" height="32" rx="16" />
                <line x1="138" y1="162" x2="138" y2="178" />
            </>
        ),
        solid: (
            <>
                <circle cx="96" cy="184" r="13" />
            </>
        ),
    },
    Baritone: {
        main: (
            <>
                <path d="M72 92H140" />
                <path d="M72 92A44 44 0 0 0 72 180H134A44 44 0 0 0 178 136V116" />
                <line x1="12" y1="118" x2="84" y2="118" />
                <line x1="12" y1="110" x2="12" y2="126" />
                <path d="M132 92C184.8 92 214.56 78.08 228 34" />
                <path d="M132 92C184.8 92 214.56 105.92 228 150" />
                <ellipse cx="228" cy="92" rx="11" ry="58" />
                <line x1="98" y1="92" x2="98" y2="150" />
                <line x1="122" y1="92" x2="122" y2="150" />
                <line x1="146" y1="92" x2="146" y2="150" />
            </>
        ),
        detail: (
            <>
                <line x1="98" y1="76" x2="98" y2="92" />
                <line x1="122" y1="76" x2="122" y2="92" />
                <line x1="146" y1="76" x2="146" y2="92" />
            </>
        ),
        solid: (
            <>
                <ellipse cx="98" cy="72" rx="10" ry="6" />
                <ellipse cx="122" cy="72" rx="10" ry="6" />
                <ellipse cx="146" cy="72" rx="10" ry="6" />
            </>
        ),
    },
    Euphonium: {
        main: (
            <>
                <path d="M72 84H140" />
                <path d="M72 84A52 52 0 0 0 72 188H134A50 50 0 0 0 184 138V114" />
                <line x1="12" y1="108" x2="84" y2="108" />
                <line x1="12" y1="100" x2="12" y2="116" />
                <path d="M130 84C183.9 84 214.28 68.16 228 18" />
                <path d="M130 84C183.9 84 214.28 99.84 228 150" />
                <ellipse cx="228" cy="84" rx="13" ry="66" />
                <line x1="100" y1="84" x2="100" y2="132" />
                <line x1="124" y1="84" x2="124" y2="132" />
                <line x1="148" y1="84" x2="148" y2="132" />
            </>
        ),
        detail: (
            <>
                <line x1="100" y1="78" x2="100" y2="84" />
                <line x1="124" y1="78" x2="124" y2="84" />
                <line x1="148" y1="78" x2="148" y2="84" />
                <path d="M90 134H76A16 16 0 0 0 76 166H140A24 24 0 0 0 164 142" />
            </>
        ),
        solid: (
            <>
                <ellipse cx="100" cy="74" rx="10" ry="6" />
                <ellipse cx="124" cy="74" rx="10" ry="6" />
                <ellipse cx="148" cy="74" rx="10" ry="6" />
            </>
        ),
    },
    Tuba: {
        main: (
            <>
                <path d="M94 104A64 64 0 1 0 162 152" />
                <circle cx="158" cy="88" r="64" />
            </>
        ),
        detail: (
            <>
                <circle cx="154" cy="92" r="25" />
                <g transform="rotate(-22 98 190)">
                    <line x1="82" y1="174" x2="82" y2="206" />
                    <line x1="98" y1="174" x2="98" y2="206" />
                    <line x1="114" y1="174" x2="114" y2="206" />
                </g>
                <path d="M92 170C84 150 86 130 100 118" />
            </>
        ),
    },
    Snare: {
        main: (
            <>
                <ellipse cx="118" cy="72" rx="78" ry="18" />
                <path d="M40 72V214A78 18 0 0 0 196 214V72" />
                <path d="M196 166H214V206H196" />
            </>
        ),
        detail: (
            <>
                <path d="M40 90A78 18 0 0 0 196 90" />
                <path d="M40 104A78 18 0 0 0 196 104" />
                <path d="M40 200A78 18 0 0 0 196 200" />
                <line x1="70" y1="120.2" x2="70" y2="212.2" />
                <line x1="102" y1="123.6" x2="102" y2="215.6" />
                <line x1="134" y1="123.6" x2="134" y2="215.6" />
                <line x1="166" y1="120.2" x2="166" y2="212.2" />
                <line x1="214" y1="166" x2="228" y2="142" />
                <line x1="84" y1="16" x2="152" y2="58" />
                <line x1="152" y1="16" x2="84" y2="58" />
            </>
        ),
    },
    Tenors: {
        main: (
            <>
                <ellipse cx="56" cy="96" rx="40" ry="15" />
                <path d="M16 96V160A40 15 0 0 0 86 174" />
                <line x1="96" y1="96" x2="96" y2="112" />
                <ellipse cx="114" cy="124" rx="28" ry="12" />
                <path d="M86 124V174A28 12 0 0 0 142 174V124" />
                <ellipse cx="174" cy="130" rx="32" ry="13" />
                <path d="M142 130V190A32 13 0 0 0 206 190V130" />
                <ellipse cx="204" cy="100" rx="38" ry="15" />
                <path d="M242 100V164A38 15 0 0 1 206 180" />
            </>
        ),
        detail: (
            <>
                <path d="M92 88V76H172V88" />
                <line x1="36" y1="120" x2="36" y2="142" />
                <line x1="66" y1="124" x2="66" y2="146" />
                <line x1="114" y1="146" x2="114" y2="164" />
                <line x1="174" y1="153" x2="174" y2="174" />
                <line x1="226" y1="122" x2="226" y2="144" />
            </>
        ),
    },
    BassDrum: {
        main: (
            <>
                <ellipse cx="88" cy="128" rx="68" ry="100" />
                <path d="M88 28H170A68 100 0 0 1 170 228H88" />
            </>
        ),
        detail: (
            <>
                <ellipse cx="88" cy="128" rx="46" ry="77" />
                <path d="M156 30A68 100 0 0 1 156 226" />
                <line x1="148" y1="78" x2="210" y2="78" />
                <line x1="156" y1="128" x2="219" y2="128" />
                <line x1="148" y1="178" x2="210" y2="178" />
                <line x1="24" y1="236" x2="68" y2="166" />
            </>
        ),
        solid: (
            <>
                <circle cx="180" cy="78" r="8" />
                <circle cx="188" cy="128" r="8" />
                <circle cx="180" cy="178" r="8" />
                <circle cx="78" cy="140" r="21" />
            </>
        ),
    },
    Cymbals: {
        main: (
            <>
                <g transform="translate(92 136) rotate(-14)">
                    <ellipse rx="14" ry="88" />
                    <path d="M-12 -28C-38 -22 -38 22 -12 28" />
                </g>
                <g transform="translate(164 136) rotate(14)">
                    <ellipse rx="14" ry="88" />
                    <path d="M12 -28C38 -22 38 22 12 28" />
                </g>
            </>
        ),
        detail: (
            <>
                <path d="M62 122C40 112 34 140 58 146" />
                <path d="M194 122C216 112 222 140 198 146" />
                <line x1="128" y1="24" x2="128" y2="48" />
                <line x1="110" y1="30" x2="114" y2="50" />
                <line x1="146" y1="30" x2="142" y2="50" />
            </>
        ),
    },
    FlubDrum: {
        main: (
            <>
                <ellipse cx="128" cy="84" rx="86" ry="17" />
                <path d="M42 84V212A86 17 0 0 0 214 212V84" />
            </>
        ),
        detail: (
            <>
                <line x1="78" y1="105.8" x2="78" y2="137.8" />
                <line x1="128" y1="109" x2="128" y2="141" />
                <line x1="178" y1="105.8" x2="178" y2="137.8" />
                <line x1="78" y1="185.8" x2="78" y2="217.8" />
                <line x1="128" y1="189" x2="128" y2="221" />
                <line x1="178" y1="185.8" x2="178" y2="217.8" />
                <line x1="64" y1="16" x2="94" y2="48" />
                <line x1="192" y1="16" x2="162" y2="48" />
            </>
        ),
        solid: (
            <>
                <circle cx="104" cy="54" r="13" />
                <circle cx="152" cy="54" r="13" />
            </>
        ),
    },
    ColorGuard: {
        main: (
            <>
                <line x1="64" y1="228" x2="160" y2="28" />
                <path d="M158 32C184 24 204 56 236 44L226 116C196 132 160 96 124 104" />
                <path d="M196 216Q120 150 56 48" />
                <line x1="178" y1="224" x2="204" y2="198" />
                <line x1="196" y1="216" x2="210" y2="230" />
            </>
        ),
        detail: (
            <>
                <path d="M204 198Q234 208 214 234" />
            </>
        ),
    },
    Rifle: {
        main: (
            <>
                <path d="M0 104L64 116L72 108L150 110L250 116L256 118V132L250 134L150 142L96 144L70 146L0 160Z" />
            </>
        ),
        detail: (
            <>
                <path d="M26 160Q122 170 216 142" />
                <line x1="98" y1="103" x2="108" y2="90" />
                <line x1="200" y1="113" x2="200" y2="139" />
            </>
        ),
        solid: (
            <>
                <circle cx="110" cy="88" r="7" />
            </>
        ),
        diagonal: true,
    },
    Flag: {
        main: (
            <>
                <line x1="60" y1="232" x2="124" y2="24" />
                <path d="M120 36C160 20 196 60 236 40L224 148C188 168 150 112 92 128" />
            </>
        ),
        detail: (
            <>
                <path d="M106 118C150 112 192 92 232 64" />
            </>
        ),
    },
    Dancer: {
        main: (
            <>
                <circle cx="150" cy="58" r="18" />
                <path d="M144 92L126 156" />
                <path d="M80 68L144 96L208 64" />
                <path d="M28 196L126 156L228 164" />
            </>
        ),
    },
    Twirler: {
        main: (
            <>
                <line x1="64" y1="192" x2="192" y2="64" />
            </>
        ),
        detail: (
            <>
                <path d="M111 66A64 64 0 0 0 66 111" />
                <path d="M145 190A64 64 0 0 0 190 145" />
                <path d="M82 48A92 92 0 0 0 48 82" />
                <path d="M174 208A92 92 0 0 0 208 174" />
            </>
        ),
        solid: (
            <>
                <circle cx="196" cy="60" r="19" />
                <circle cx="60" cy="196" r="12" />
            </>
        ),
    },
    Soloist: {
        main: (
            <>
                <ellipse cx="112" cy="212" rx="76" ry="18" />
                <circle cx="112" cy="72" r="18" />
                <path d="M112 108V160M76 136L112 120L152 96M88 208L112 160L136 208" />
                <path d="M200 24Q204 52 232 56Q204 60 200 88Q196 60 168 56Q196 52 200 24Z" />
            </>
        ),
    },
    Marimba: {
        main: (
            <>
                <path d="M12 52L244 74V96L12 112Z" />
                <line x1="20" y1="112" x2="20" y2="196" />
                <line x1="236" y1="96" x2="236" y2="196" />
                <circle cx="20" cy="210" r="10" />
                <circle cx="236" cy="210" r="10" />
                <path d="M44 124V188C60 150 110 128 212 112" />
            </>
        ),
        detail: (
            <>
                <line x1="35" y1="54.2" x2="35" y2="110.4" />
                <line x1="58" y1="56.4" x2="58" y2="108.8" />
                <line x1="81" y1="58.5" x2="81" y2="107.2" />
                <line x1="104" y1="60.7" x2="104" y2="105.7" />
                <line x1="127" y1="62.9" x2="127" y2="104.1" />
                <line x1="150" y1="65.1" x2="150" y2="102.5" />
                <line x1="173" y1="67.3" x2="173" y2="100.9" />
                <line x1="196" y1="69.4" x2="196" y2="99.3" />
                <line x1="219" y1="71.6" x2="219" y2="97.7" />
                <line x1="68" y1="122" x2="68" y2="158" />
                <line x1="92" y1="119" x2="92" y2="140" />
                <line x1="116" y1="116" x2="116" y2="128" />
            </>
        ),
    },
    Vibraphone: {
        main: (
            <>
                <path d="M40 48L216 54V104L40 110Z" />
                <line x1="48" y1="110" x2="48" y2="208" />
                <line x1="208" y1="104" x2="208" y2="208" />
                <circle cx="48" cy="222" r="10" />
                <circle cx="208" cy="222" r="10" />
                <path d="M92 214H164" />
                <line x1="128" y1="176" x2="128" y2="214" />
            </>
        ),
        detail: (
            <>
                <line x1="75" y1="49.2" x2="75" y2="108.8" />
                <line x1="110" y1="50.4" x2="110" y2="107.6" />
                <line x1="146" y1="51.6" x2="146" y2="106.4" />
                <line x1="181" y1="52.8" x2="181" y2="105.2" />
                <line x1="72" y1="124" x2="72" y2="172" />
                <line x1="96" y1="124" x2="96" y2="164" />
                <line x1="160" y1="124" x2="160" y2="142" />
                <line x1="184" y1="124" x2="184" y2="134" />
                <line x1="120" y1="124" x2="120" y2="154" />
                <line x1="136" y1="124" x2="136" y2="150" />
            </>
        ),
    },
    Xylophone: {
        main: (
            <>
                <path d="M58 62L198 66V96L58 100Z" />
                <line x1="66" y1="100" x2="66" y2="208" />
                <line x1="190" y1="96" x2="190" y2="208" />
                <circle cx="66" cy="222" r="10" />
                <circle cx="190" cy="222" r="10" />
            </>
        ),
        detail: (
            <>
                <line x1="78" y1="62.6" x2="78" y2="99.4" />
                <line x1="98" y1="63.1" x2="98" y2="98.9" />
                <line x1="118" y1="63.7" x2="118" y2="98.3" />
                <line x1="138" y1="64.3" x2="138" y2="97.7" />
                <line x1="158" y1="64.9" x2="158" y2="97.1" />
                <line x1="178" y1="65.4" x2="178" y2="96.6" />
                <line x1="66" y1="184" x2="190" y2="184" />
                <line x1="120" y1="184" x2="190" y2="116" />
                <line x1="84" y1="112" x2="84" y2="132" />
                <line x1="100" y1="112" x2="100" y2="126" />
                <line x1="116" y1="112" x2="116" y2="120" />
            </>
        ),
    },
    AuxPercussion: {
        main: (
            <>
                <path d="M38 116L92 24L150 128H52" />
                <path d="M204.6 146.1A44 44 0 0 1 218.2 156" />
                <path d="M229.7 191.4A44 44 0 0 1 224.5 207.3" />
                <path d="M194.4 229.2A44 44 0 0 1 177.6 229.2" />
                <path d="M147.5 207.3A44 44 0 0 1 142.3 191.4" />
                <path d="M153.8 156A44 44 0 0 1 167.4 146.1" />
            </>
        ),
        detail: (
            <>
                <line x1="182" y1="28" x2="122" y2="76" />
            </>
        ),
        solid: (
            <>
                <circle cx="186" cy="142" r="10" />
                <circle cx="227.8" cy="172.4" r="10" />
                <circle cx="211.9" cy="221.6" r="10" />
                <circle cx="160.1" cy="221.6" r="10" />
                <circle cx="144.2" cy="172.4" r="10" />
            </>
        ),
    },
    Synthesizer: {
        main: (
            <>
                <rect x="24" y="64" width="208" height="80" rx="8" />
                <path d="M56 152L200 224M200 152L56 224" />
            </>
        ),
        detail: (
            <>
                <line x1="24" y1="100" x2="232" y2="100" />
                <line x1="50" y1="100" x2="50" y2="144" />
                <line x1="76" y1="100" x2="76" y2="144" />
                <line x1="102" y1="100" x2="102" y2="144" />
                <line x1="128" y1="100" x2="128" y2="144" />
                <line x1="154" y1="100" x2="154" y2="144" />
                <line x1="180" y1="100" x2="180" y2="144" />
                <line x1="206" y1="100" x2="206" y2="144" />
                <line x1="44" y1="76" x2="44" y2="90" />
                <line x1="60" y1="76" x2="60" y2="90" />
            </>
        ),
        solid: (
            <>
                <circle cx="206" cy="83" r="7" />
                <rect x="92" y="75" width="74" height="16" rx="2" />
                <rect x="42" y="100" width="16" height="24" />
                <rect x="68" y="100" width="16" height="24" />
                <rect x="120" y="100" width="16" height="24" />
                <rect x="146" y="100" width="16" height="24" />
                <rect x="172" y="100" width="16" height="24" />
            </>
        ),
    },
    DrumMajor: {
        main: (
            <>
                <circle cx="128" cy="44" r="16" />
                <path d="M128 72V136" />
                <path d="M64 44L84 92L128 84L172 92L192 44" />
                <path d="M104 192L128 136L152 192" />
                <path d="M68 192H188V232H68Z" />
            </>
        ),
        detail: (
            <>
                <line x1="40" y1="24" x2="48" y2="36" />
                <line x1="216" y1="24" x2="208" y2="36" />
                <line x1="44" y1="232" x2="212" y2="232" />
            </>
        ),
    },
} satisfies Record<string, SectionIconGlyph>;

/** Other drawings of a section's instrument. Tuba above is the sousaphone. */
export const ALTERNATE_SECTION_ICON_GLYPHS = {
    MarchingTuba: {
        main: (
            <>
                <path d="M222 46C194 90 138 98 70 98A47 47 0 0 0 70 192H176Q202 192 204 160" />
                <path d="M222 178C204 150 146 128 70 126A19 19 0 0 0 70 164H124" />
                <ellipse cx="222" cy="112" rx="14" ry="66" />
            </>
        ),
        detail: (
            <>
                <line x1="134" y1="132" x2="134" y2="176" />
                <line x1="152" y1="134" x2="152" y2="176" />
                <line x1="170" y1="138" x2="170" y2="176" />
                <path d="M124 164H186" />
            </>
        ),
    },
} satisfies Record<string, SectionIconGlyph>;
