/* eslint-disable max-lines-per-function */
import { dialog, BrowserWindow, app, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import sanitize from "sanitize-filename";
import PDFDocument from "pdfkit";
// @ts-ignore - svg-to-pdfkit doesn't have types
import SVGtoPDF from "svg-to-pdfkit";
import Page from "@/global/classes/Page";
import Store from "electron-store";
import { getOrmConnection } from "../../database/database.services";

const store = new Store();

const logoSvg = `<svg
width="54"
height="32"
viewBox="0 0 54 32"
fill="none"
xmlns="http://www.w3.org/2000/svg"
>
<g clipPath="url(#clip0_272_2245)">
    <path
        d="M10.6087 10.1732C10.5646 10.3253 10.5166 10.4733 10.4612 10.6187C10.2197 11.2577 9.8706 11.8452 9.43084 12.3524C9.28506 12.5197 9.13055 12.6782 8.96802 12.8272C8.94494 13.4768 8.80274 14.1154 8.54934 14.7077C8.28931 15.3145 7.86379 15.8254 7.32734 16.1747C6.76037 16.5097 6.12173 16.6856 5.47228 16.6856C4.82282 16.6856 4.18418 16.5097 3.61721 16.1747C3.07979 15.8243 2.65208 15.314 2.38765 14.7077C2.12873 14.1171 1.98382 13.4778 1.9614 12.8272C1.30248 12.2276 0.790248 11.4686 0.468272 10.6147C0.414045 10.472 0.366124 10.3266 0.324508 10.1799C0.101886 10.9054 -0.00757912 11.6644 0.000407481 12.4271C0.000407481 13.6354 0.233289 14.6952 0.699052 15.6066C1.13977 16.4942 1.80689 17.2334 2.62474 17.7404C3.48557 18.2618 4.46406 18.5264 5.45588 18.506C6.46061 18.5289 7.45259 18.2649 8.32739 17.7418C9.14721 17.2391 9.81372 16.4986 10.248 15.6079C10.7003 14.6957 10.9269 13.6359 10.9278 12.4284C10.9353 11.6636 10.8276 10.9023 10.6087 10.1732Z"
        fill="currentColor"
    />
    <path
        d="M10.731 8.60217C10.6685 8.92827 10.5786 9.24784 10.4624 9.55707C10.0637 10.6142 9.37449 11.5205 8.48368 12.1591C7.59287 12.7976 6.54146 13.1389 5.46532 13.1389C4.38918 13.1389 3.33778 12.7976 2.44697 12.1591C1.55616 11.5205 0.8669 10.6142 0.468254 9.55707C0.351394 9.24706 0.261074 8.92658 0.198381 8.5995C0.194731 8.57949 0.195215 8.55889 0.199797 8.5391C0.20438 8.51931 0.212953 8.5008 0.22493 8.48484C0.236907 8.46888 0.252005 8.45585 0.269189 8.44663C0.286373 8.43742 0.305238 8.43224 0.32449 8.43146H10.6011C10.6209 8.43159 10.6405 8.4364 10.6584 8.44552C10.6762 8.45464 10.692 8.46785 10.7044 8.4842C10.7168 8.50054 10.7257 8.5196 10.7303 8.54001C10.7349 8.56041 10.7351 8.58165 10.731 8.60217Z"
        fill="currentColor"
    />
    <path
        d="M10.76 2.47262V7.55922C10.76 7.62996 10.7335 7.6978 10.6862 7.74783C10.6389 7.79785 10.5747 7.82595 10.5078 7.82595H0.411538C0.344646 7.82595 0.280493 7.79785 0.233193 7.74783C0.185893 7.6978 0.15932 7.62996 0.15932 7.55922V2.45261C0.159914 2.34286 0.192989 2.23606 0.253902 2.1472C0.603224 1.63641 1.9816 0 5.31466 0C8.64772 0 10.2127 1.6164 10.6339 2.13387C10.714 2.2265 10.7589 2.34713 10.76 2.47262Z"
        fill="currentColor"
    />
    <path
        d="M8.71453 20.0597L5.47605 23.0831L2.16065 20.0597H0.073544V31.8466H1.83907L1.86934 23.0858L4.78624 25.1543H6.16713L9.08403 23.0698L9.05377 31.8466H10.8193V20.0597H8.71453Z"
        fill="currentColor"
    />
    <path
        d="M2.93498 26.2772H7.69434L7.71578 26.9641H2.91354L2.93498 26.2772Z"
        fill="currentColor"
    />
    <path
        d="M3.20735 28.2844H7.47236L7.49127 28.9712H3.18843L3.20735 28.2844Z"
        fill="currentColor"
    />
    <path
        d="M3.63233 30.2929H7.31975L7.33615 30.9797H3.61467L3.63233 30.2929Z"
        fill="currentColor"
    />
    <path
        d="M3.48229 27.0081C3.48635 27.0578 3.48059 27.1078 3.46538 27.1551C3.45018 27.2023 3.42586 27.2457 3.39396 27.2824C3.36206 27.3192 3.32329 27.3486 3.2801 27.3687C3.2369 27.3887 3.19024 27.3991 3.14306 27.3991C3.09587 27.3991 3.0492 27.3887 3.00601 27.3687C2.96282 27.3486 2.92405 27.3192 2.89215 27.2824C2.86025 27.2457 2.83593 27.2023 2.82073 27.1551C2.80552 27.1078 2.79976 27.0578 2.80382 27.0081C2.71175 27 2.62591 26.9556 2.56334 26.8837C2.50076 26.8118 2.46603 26.7177 2.46603 26.62C2.46603 26.5223 2.50076 26.4281 2.56334 26.3562C2.62591 26.2843 2.71175 26.2399 2.80382 26.2319C2.80897 26.162 2.83326 26.0953 2.87372 26.0399C2.91418 25.9844 2.96905 25.9427 3.03162 25.9197C3.09418 25.8967 3.16172 25.8936 3.22596 25.9106C3.2902 25.9276 3.34836 25.964 3.39332 26.0154C3.43827 26.0669 3.46807 26.131 3.47906 26.2001C3.49005 26.2692 3.48175 26.3401 3.45519 26.4043C3.42864 26.4684 3.38496 26.523 3.32952 26.5613C3.27408 26.5996 3.20928 26.62 3.14306 26.62C3.23661 26.6241 3.32481 26.6673 3.38837 26.74C3.45194 26.8127 3.4857 26.9091 3.48229 27.0081Z"
        fill="currentColor"
    />
    <path
        d="M3.61471 29.0165C3.61753 29.0654 3.61086 29.1144 3.59512 29.1604C3.57938 29.2064 3.5549 29.2486 3.52318 29.2842C3.49146 29.3199 3.45318 29.3483 3.41069 29.3677C3.36819 29.3871 3.32239 29.3972 3.2761 29.3972C3.22981 29.3972 3.18401 29.3871 3.14152 29.3677C3.09903 29.3483 3.06075 29.3199 3.02903 29.2842C2.99731 29.2486 2.97283 29.2064 2.95709 29.1604C2.94135 29.1144 2.93468 29.0654 2.9375 29.0165C2.84543 29.0085 2.75959 28.9641 2.69702 28.8922C2.63444 28.8203 2.59971 28.7262 2.59971 28.6285C2.59971 28.5307 2.63444 28.4366 2.69702 28.3647C2.75959 28.2928 2.84543 28.2484 2.9375 28.2404C2.94265 28.1709 2.96683 28.1044 3.00709 28.0492C3.04736 27.994 3.10196 27.9524 3.16422 27.9295C3.22648 27.9066 3.2937 27.9034 3.35767 27.9202C3.42164 27.9371 3.47958 27.9733 3.52441 28.0244C3.56924 28.0755 3.59902 28.1393 3.6101 28.208C3.62119 28.2768 3.6131 28.3474 3.58682 28.4113C3.56055 28.4753 3.51723 28.5297 3.46216 28.5681C3.40709 28.6064 3.34266 28.6269 3.27674 28.6271C3.3703 28.6316 3.45837 28.6751 3.5217 28.7481C3.58503 28.8211 3.61847 28.9176 3.61471 29.0165Z"
        fill="currentColor"
    />
    <path
        d="M4.06868 31.0251C4.07274 31.0748 4.06698 31.1249 4.05177 31.1721C4.03657 31.2193 4.01225 31.2627 3.98035 31.2995C3.94845 31.3362 3.90968 31.3656 3.86649 31.3857C3.8233 31.4058 3.77663 31.4161 3.72945 31.4161C3.68226 31.4161 3.6356 31.4058 3.5924 31.3857C3.54921 31.3656 3.51044 31.3362 3.47854 31.2995C3.44665 31.2627 3.42232 31.2193 3.40712 31.1721C3.39191 31.1249 3.38615 31.0748 3.39021 31.0251C3.29644 31.0193 3.20831 30.9758 3.14386 30.9035C3.07941 30.8312 3.04351 30.7357 3.04351 30.6363C3.04351 30.537 3.07941 30.4414 3.14386 30.3691C3.20831 30.2968 3.29644 30.2534 3.39021 30.2475C3.39536 30.1777 3.41966 30.111 3.46012 30.0556C3.50058 30.0001 3.55545 29.9583 3.61801 29.9354C3.68057 29.9124 3.74811 29.9092 3.81235 29.9262C3.87659 29.9432 3.93475 29.9797 3.97971 30.0311C4.02466 30.0826 4.05446 30.1467 4.06545 30.2158C4.07644 30.2849 4.06815 30.3558 4.04159 30.42C4.01503 30.4841 3.97135 30.5387 3.91591 30.577C3.86047 30.6153 3.79567 30.6357 3.72945 30.6356C3.82323 30.6398 3.91162 30.6831 3.97522 30.7562C4.03882 30.8292 4.07244 30.9259 4.06868 31.0251Z"
        fill="currentColor"
    />
    <path
        d="M7.40806 27.0081C7.40524 27.0569 7.4119 27.1059 7.42764 27.1519C7.44338 27.198 7.46787 27.2401 7.49959 27.2758C7.5313 27.3114 7.56959 27.3398 7.61208 27.3593C7.65457 27.3787 7.70037 27.3887 7.74666 27.3887C7.79295 27.3887 7.83875 27.3787 7.88124 27.3593C7.92373 27.3398 7.96202 27.3114 7.99374 27.2758C8.02545 27.2401 8.04994 27.198 8.06568 27.1519C8.08142 27.1059 8.08808 27.0569 8.08526 27.0081C8.17734 27 8.26318 26.9556 8.32575 26.8837C8.38832 26.8118 8.42305 26.7177 8.42305 26.62C8.42305 26.5223 8.38832 26.4281 8.32575 26.3562C8.26318 26.2843 8.17734 26.24 8.08526 26.2319C8.07987 26.1624 8.05546 26.0961 8.015 26.0411C7.97455 25.986 7.91981 25.9446 7.85748 25.922C7.79514 25.8993 7.72791 25.8963 7.66401 25.9134C7.6001 25.9305 7.54229 25.9669 7.49763 26.0182C7.45298 26.0695 7.42342 26.1334 7.41256 26.2021C7.40171 26.2709 7.41003 26.3415 7.43652 26.4054C7.463 26.4692 7.5065 26.5235 7.56169 26.5616C7.61688 26.5997 7.68137 26.62 7.74729 26.62C7.65373 26.6241 7.56553 26.6673 7.50197 26.74C7.43841 26.8127 7.40464 26.9091 7.40806 27.0081Z"
        fill="currentColor"
    />
    <path
        d="M7.20755 29.0165C7.20473 29.0654 7.21139 29.1144 7.22713 29.1604C7.24287 29.2064 7.26736 29.2486 7.29908 29.2842C7.3308 29.3199 7.36908 29.3483 7.41157 29.3677C7.45406 29.3871 7.49986 29.3972 7.54615 29.3972C7.59244 29.3972 7.63824 29.3871 7.68073 29.3677C7.72322 29.3483 7.76151 29.3199 7.79323 29.2842C7.82495 29.2486 7.84943 29.2064 7.86517 29.1604C7.88091 29.1144 7.88757 29.0654 7.88475 29.0165C7.97683 29.0085 8.06267 28.9641 8.12524 28.8922C8.18781 28.8203 8.22254 28.7262 8.22254 28.6285C8.22254 28.5307 8.18781 28.4366 8.12524 28.3647C8.06267 28.2928 7.97683 28.2484 7.88475 28.2404C7.87961 28.1709 7.85542 28.1044 7.81516 28.0492C7.7749 27.994 7.7203 27.9524 7.65804 27.9295C7.59578 27.9066 7.52855 27.9034 7.46459 27.9202C7.40062 27.9371 7.34268 27.9733 7.29785 28.0244C7.25302 28.0755 7.22324 28.1393 7.21215 28.208C7.20107 28.2768 7.20916 28.3474 7.23543 28.4113C7.2617 28.4753 7.30502 28.5297 7.36009 28.5681C7.41516 28.6064 7.4796 28.6269 7.54552 28.6271C7.45196 28.6316 7.36388 28.6751 7.30055 28.7481C7.23722 28.8211 7.20379 28.9176 7.20755 29.0165Z"
        fill="currentColor"
    />
    <path
        d="M6.75478 31.0251C6.75196 31.074 6.75863 31.1229 6.77437 31.169C6.79011 31.215 6.81459 31.2571 6.84631 31.2928C6.87803 31.3284 6.91631 31.3569 6.9588 31.3763C7.0013 31.3957 7.0471 31.4057 7.09339 31.4057C7.13968 31.4057 7.18548 31.3957 7.22797 31.3763C7.27046 31.3569 7.30874 31.3284 7.34046 31.2928C7.37218 31.2571 7.39666 31.215 7.4124 31.169C7.42814 31.1229 7.43481 31.074 7.43199 31.0251C7.52576 31.0193 7.61389 30.9758 7.67834 30.9035C7.74279 30.8313 7.77869 30.7357 7.77869 30.6363C7.77869 30.537 7.74279 30.4414 7.67834 30.3691C7.61389 30.2969 7.52576 30.2534 7.43199 30.2476C7.4266 30.1781 7.40218 30.1118 7.36173 30.0567C7.32128 30.0017 7.26654 29.9603 7.2042 29.9376C7.14187 29.915 7.07464 29.912 7.01073 29.9291C6.94683 29.9462 6.88901 29.9826 6.84436 30.0339C6.7997 30.0852 6.77014 30.1491 6.75929 30.2178C6.74843 30.2866 6.75676 30.3572 6.78324 30.421C6.80972 30.4849 6.85322 30.5392 6.90841 30.5773C6.9636 30.6154 7.0281 30.6357 7.09402 30.6357C7.00023 30.6398 6.91184 30.6832 6.84824 30.7562C6.78463 30.8292 6.75103 30.9259 6.75478 31.0251Z"
        fill="currentColor"
    />
    <path
        d="M13.2204 18.2832V6.81372H17.1298C17.9974 6.81372 18.715 6.96932 19.2825 7.2805C19.8144 7.55578 20.2569 7.99217 20.5536 8.53415C20.8261 9.08049 20.9697 9.68832 20.9723 10.306C20.975 10.9236 20.8365 11.5328 20.5688 12.0817C20.2812 12.6314 19.8441 13.0771 19.314 13.3607C18.7448 13.6825 18.0167 13.8435 17.1298 13.8435H15.0805V18.2846L13.2204 18.2832ZM15.0805 12.2364H17.0175C17.7507 12.2364 18.2774 12.0644 18.5977 11.7203C18.918 11.3762 19.0773 10.9147 19.0756 10.3359C19.0756 9.734 18.9155 9.26411 18.5952 8.92625C18.2749 8.58839 17.7481 8.41901 17.015 8.41812H15.0805V12.2364Z"
        fill="currentColor"
    />
    <path
        d="M22.5802 18.2832V6.81372H29.5831V8.40345H24.4391V11.6976H29.119V13.254H24.4391V16.6949H29.5831V18.2846L22.5802 18.2832Z"
        fill="currentColor"
    />
    <path
        d="M31.5352 18.2832V6.81371H33.3953L38.6225 15.1078V6.81238H40.4763V18.2819H38.6225L33.4004 10.0132V18.2886L31.5352 18.2832Z"
        fill="currentColor"
    />
    <path
        d="M12.8093 31.8039L16.7792 20.3251H18.8575L22.8261 31.8039H20.8576L17.8032 22.6203L14.7476 31.8039H12.8093ZM14.5748 29.0979L15.0704 27.5402H20.4212L20.9168 29.0979H14.5748Z"
        fill="currentColor"
    />
    <path
        d="M24.3155 31.8039V20.3251H28.2072C29.0648 20.3251 29.7756 20.4807 30.3397 20.7919C30.8656 21.0668 31.3024 21.5008 31.5945 22.0388C31.863 22.5723 32.0041 23.1671 32.0057 23.7714C32.0072 24.3758 31.8691 24.9714 31.6033 25.5064C31.3127 26.052 30.8732 26.4922 30.3422 26.7693C29.7773 27.0859 29.0484 27.2441 28.1555 27.2441H26.1756V31.8026L24.3155 31.8039ZM26.1756 25.7851H28.0836C28.7764 25.7851 29.2854 25.6073 29.6108 25.2516C29.7762 25.0638 29.9045 24.8429 29.9883 24.6021C30.0721 24.3612 30.1097 24.105 30.0989 23.8486C30.1098 23.5981 30.0728 23.3478 29.9903 23.1127C29.9077 22.8776 29.7813 22.6625 29.6184 22.4803C29.2981 22.1344 28.7865 21.9619 28.0836 21.9628H26.1756V25.7851ZM29.9753 31.8039L27.6952 26.736H29.713L32.1002 31.8039H29.9753Z"
        fill="currentColor"
    />
    <path
        d="M38.7487 32C37.6734 32 36.7456 31.7515 35.9654 31.2545C35.187 30.7596 34.5617 30.0358 34.1659 29.1713C33.7315 28.207 33.5156 27.149 33.5353 26.0812C33.5353 24.8995 33.7455 23.8633 34.1659 22.9724C34.5657 22.1061 35.1937 21.3803 35.9743 20.8825C36.7553 20.3793 37.683 20.1277 38.7575 20.1277C40.0488 20.1277 41.1031 20.4638 41.9203 21.1359C42.7375 21.8081 43.2545 22.7568 43.4714 23.982H41.4184C41.299 23.3811 40.9872 22.8422 40.5356 22.4563C40.09 22.0855 39.4906 21.8997 38.7373 21.8988C38.1153 21.8797 37.5015 22.0535 36.9718 22.3989C36.466 22.7496 36.0707 23.2521 35.8368 23.8419C35.5588 24.551 35.4244 25.3138 35.4421 26.0812C35.4268 26.8439 35.5653 27.6013 35.8482 28.3031C36.0853 28.8862 36.4802 29.3822 36.9831 29.7287C37.5129 30.0741 38.1266 30.248 38.7487 30.2289C39.5053 30.2289 40.1048 30.0568 40.547 29.7127C40.9946 29.362 41.3079 28.8526 41.4297 28.2777H43.4651C43.2583 29.4336 42.7438 30.3436 41.9216 31.0077C41.0993 31.6719 40.0417 32.0026 38.7487 32Z"
        fill="currentColor"
    />
    <path
        d="M45.2786 31.8039V20.3251H47.14V31.8039H45.2786ZM46.86 26.7533V25.1529H52.4945V26.7533H46.86ZM52.1326 31.8039V20.3251H53.9927V31.8039H52.1326Z"
        fill="currentColor"
    />
</g>
<defs>
    <clipPath id="clip0_272_2245">
        <rect width="54" height="32" fill="currentColor" />
    </clipPath>
</defs>
</svg>`;

let logoDataUri = "";

try {
    // For HTML exports (coordinate sheets) - use SVG data URI
    logoDataUri = `data:image/svg+xml;base64,${Buffer.from(
        logoSvg.replace(/currentColor/g, "black"),
    ).toString("base64")}`;

    console.debug("Logo data URI created for HTML exports");
} catch (error) {
    console.error("Error loading logo for PDF export:", error);
}

const headerHtml = ({ showName }: { showName: string }) => `
<div style="
    padding: 4px 16px;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: #999;
    width: 100%;
    box-sizing: border-box;
    height: 20px;
">
    <div style="flex: 1; text-align: left;">
        ${logoDataUri ? `<img src="${logoDataUri}" style="height: 16px; width: auto;" />` : "Logo not found"}
    </div>
    <div style="flex: 1; text-align: center; font-weight: bold; font-size: 8px;">
        ${showName}
    </div>
    <div style="flex: 1;"></div>
</div>
`;

const footerHtml = `
<div style="
    padding: 4px 16px;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 8px;
    color: #999;
    width: 100%;
    box-sizing: border-box;
    height: 16px;
">
    <div style="flex: 1; text-align: left;">Exported ${new Date().toLocaleDateString()}</div>
    <div style="flex: 1; text-align: center;">Made with OpenMarch</div>
    <div style="flex: 1; text-align: right;"></div>
</div>
`;

function chunkArray<T>(array: T[], size: number): T[][] {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

// Modified from Page.ts for export purposes
const measureRangeString = (page: Page): string => {
    if (!page.measures || page.measures.length === 0) {
        return "START";
    }
    try {
        const firstMeasure = page.measures[0];
        const lastMeasure = page.measures[page.measures.length - 1];

        // If the page starts on the first measure, just return the measure number. Otherwise, return the measure number and the beat.
        const firstMeasureString =
            page.measureBeatToStartOn === 1
                ? firstMeasure.number.toString()
                : `${firstMeasure.number}(${page.measureBeatToStartOn})`;
        const beatToEndOn = page.measureBeatToEndOn;
        const lastMeasureString =
            beatToEndOn === 0
                ? lastMeasure.number.toString()
                : `${lastMeasure.number}(${beatToEndOn})`;

        if (firstMeasureString === lastMeasureString) return firstMeasureString;
        return `${firstMeasureString} -> ${lastMeasureString}`;
    } catch (err) {
        return "N/A";
    }
};

interface ExportSheet {
    name: string;
    drillNumber: string;
    section: string;
    renderedPage: string;
}

export class PDFExportService {
    // Cache for the field image to avoid repeated DB queries during bulk exports
    private static fieldImageCache: string | null | undefined = undefined;

    /**
     * Clear the field image cache. Call this when starting a new export session
     * or when the field image might have changed.
     */
    public static clearFieldImageCache() {
        this.fieldImageCache = undefined;
    }

    private static async generateSinglePDF(
        sheets: string[],
        quarterPages: boolean,
    ) {
        return new Promise<Buffer>((resolve, reject) => {
            let combinedHtml: string;

            if (quarterPages) {
                const pageChunks: string[][] = chunkArray(sheets, 4);
                combinedHtml = pageChunks
                    .map(
                        (page: string[]) => `
                        <div class="grid-container">
                            ${page.map((sheet: string) => `<div class="grid-item">${sheet}</div>`).join("")}
                        </div>
                    `,
                    )
                    .join("");
            } else {
                combinedHtml = sheets
                    .map((sheet) => `<div class="marcher-sheet">${sheet}</div>`)
                    .join("");
            }

            console.debug("generateSinglePDF called with:", {
                pageCount: sheets.length,
                quarterPages,
                firstPageLength: sheets[0]?.length || 0,
            });

            const win = new BrowserWindow({
                width: 1200,
                height: 800,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                },
            });

            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                console.error("PDF generation timed out after 30 seconds");
                win.close();
                reject(new Error("PDF generation timed out after 30 seconds"));
            }, 30000);

            // Handle window errors
            win.webContents.on(
                "did-fail-load",
                (event, errorCode, errorDescription) => {
                    console.error("Failed to load content:", {
                        errorCode,
                        errorDescription,
                    });
                    clearTimeout(timeout);
                    win.close();
                    reject(
                        new Error(
                            `Failed to load content: ${errorDescription} (${errorCode})`,
                        ),
                    );
                },
            );

            win.on("closed", () => {
                clearTimeout(timeout);
            });

            // Create HTML for each marcher's coordinate sheet with proper page breaks
            // Extract the header from the first page to repeat it on all pages
            let extractedHeaderHtml = "";
            let modifiedPages = sheets;

            if (sheets.length > 0) {
                const firstPageContent = sheets[0];
                const headerMatch = firstPageContent.match(
                    /<div[^>]*class="sheetHeader"[^>]*>.*?<\/div>/s,
                );
                if (headerMatch) {
                    extractedHeaderHtml = headerMatch[0];
                    // Remove header from all pages since we'll add it separately
                    modifiedPages = sheets.map((page) =>
                        page.replace(
                            /<div[^>]*class="sheetHeader"[^>]*>.*?<\/div>/s,
                            "",
                        ),
                    );
                }
            }

            const htmlContent = `
                    <html>
                      <head>
                        <title>PDF Export</title>
                        <style>
                          @media print {
                            .marcher-sheet {
                                page-break-before: auto;
                                page-break-after: always;
                                min-height: 10in;
                                width: 100%;
                                box-sizing: border-box;
                            }
                            ${
                                quarterPages
                                    ? `
                              .grid-container {
                                display: grid;
                                grid-template-columns: 50% 50%;
                                grid-template-rows: 50% 50%;
                                height: 10in;
                                width: 7.5in;
                                page-break-after: always;
                              }
                              .grid-item {
                                  box-sizing: border-box;
                                  padding: 0.1in;
                                  border: 1px solid #333;
                              }
                              .marcher-sheet {
                                page-break-before: auto;
                                page-break-after: auto;
                              }
                            `
                                    : ""
                            }

                            /* Allow tables to break across pages but keep headers */
                            table {
                              page-break-inside: auto;
                            }

                            /* Ensure table headers repeat on each page */
                            thead {
                              display: table-header-group;
                            }

                            /* Ensure performer header repeats on each page */
                            .sheetHeader {
                              display: table-header-group;
                              page-break-inside: avoid;
                              page-break-after: avoid;
                            }

                            /* Add some spacing between coordinate rows */
                            tbody tr {
                              page-break-inside: avoid;
                            }

                            /* For quarter pages, use different layout */
                            ${
                                quarterPages
                                    ? `
                              .marcher-sheet {
                                page-break-before: auto;
                                page-break-after: auto;
                                min-height: auto;
                                padding: 0.5rem;
                              }
                            `
                                    : ""
                            }
                          }

                          @page {
                            margin: ${quarterPages ? "0.5in" : "0.5in"};
                          }

                          body {
                            margin: 0;
                            padding: 0;
                            font-family: Arial, sans-serif;
                          }
                        </style>
                      </head>
                      <body>${combinedHtml}</body>
                    </html>
                `;

            console.debug("HTML content length:", htmlContent.length);
            console.debug("Combined HTML length:", combinedHtml.length);
            console.debug(
                "First 500 chars of HTML:",
                htmlContent.substring(0, 500),
            );

            // Write HTML content to a temporary file to avoid URI length limitations
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `export-${Date.now()}.html`);

            fs.promises
                .writeFile(tempFile, htmlContent)
                .then(() => {
                    return win.loadFile(tempFile);
                })
                .catch((error) => {
                    console.error("Failed to write or load temp file:", error);
                    clearTimeout(timeout);
                    win.close();
                    // Clean up temp file on error
                    fs.promises.unlink(tempFile).catch(console.error);
                    reject(error);
                });

            // Clean up temp file after PDF generation
            const originalResolve = resolve;
            const originalReject = reject;
            resolve = (data) => {
                fs.promises.unlink(tempFile).catch(console.error);
                originalResolve(data);
            };
            reject = (error) => {
                fs.promises.unlink(tempFile).catch(console.error);
                originalReject(error);
            };

            win.webContents.on("did-finish-load", () => {
                win.webContents
                    .printToPDF({
                        margins: quarterPages
                            ? {
                                  top: 0.75,
                                  bottom: 0.5,
                                  left: 0,
                                  right: 0,
                              }
                            : {
                                  top: 0.75,
                                  bottom: 0.5,
                                  left: 0.25,
                                  right: 0.25,
                              },
                        pageSize: "Letter",
                        printBackground: true,
                        headerTemplate: headerHtml({
                            showName: PDFExportService.getCurrentFileName(),
                        }),
                        footerTemplate: footerHtml,
                        displayHeaderFooter: true,
                    })
                    .then((data) => {
                        clearTimeout(timeout);
                        win.close();
                        resolve(data);
                    })
                    .catch((error) => {
                        clearTimeout(timeout);
                        win.close();
                        reject(error);
                    });
            });
        });
    }

    private static async generateSeparatePDFs(
        sheets: ExportSheet[],
        outputPath: string,
        quarterPages: boolean,
    ) {
        const sectionMap = new Map<string, ExportSheet[]>();

        // Group sheets by section
        sheets.forEach((sheet) => {
            const section = sheet.section || "Other";
            if (!sectionMap.has(section)) {
                sectionMap.set(section, []);
            }
            sectionMap.get(section)!.push(sheet);
        });

        if (quarterPages) {
            // Output directory for all PDFs (no section subfolders)
            await fs.promises.mkdir(outputPath, { recursive: true });

            for (const [section, sectionSheets] of sectionMap) {
                // Chunk the sheets for this section into groups of 4
                const renderedPages = sectionSheets.map((s) => s.renderedPage);
                const pageChunks: string[][] = [];
                for (let i = 0; i < renderedPages.length; i += 4) {
                    pageChunks.push(renderedPages.slice(i, i + 4));
                }
                // Each chunk is a "page" of 2x2 quarter-pages
                const combinedHtml = pageChunks
                    .map(
                        (page) =>
                            `<div class="grid-container">
                    ${page.map((sheet) => `<div class="grid-item">${sheet}</div>`).join("")}
                </div>`,
                    )
                    .join("");

                // Style matches generateSinglePDF's quarter-page mode
                const htmlContent = `
                <html>
                  <head>
                    <title>PDF Export</title>
                    <style>
                      @media print {
                        .grid-container {
                          display: grid;
                          grid-template-columns: 50% 50%;
                          grid-template-rows: 50% 50%;
                          height: 10in;
                          width: 7.5in;
                          page-break-after: always;
                        }
                        .grid-item {
                            box-sizing: border-box;
                            padding: 0.1in;
                            border: 1px solid #333;
                        }
                        .marcher-sheet {
                            page-break-before: auto;
                            page-break-after: auto;
                            min-height: auto;
                            padding: 0.5rem;
                        }
                        table {
                          page-break-inside: auto;
                        }
                        thead {
                          display: table-header-group;
                        }
                        .sheetHeader {
                          display: table-header-group;
                          page-break-inside: avoid;
                          page-break-after: avoid;
                        }
                        tbody tr {
                          page-break-inside: avoid;
                        }
                      }
                      @page {
                        margin: 0.5in;
                      }
                      body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                      }
                    </style>
                  </head>
                  <body>
                    ${combinedHtml}
                  </body>
                </html>
            `;

                await new Promise<void>((resolve, reject) => {
                    const win = new BrowserWindow({
                        width: 1200,
                        height: 800,
                        show: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false,
                        },
                    });

                    const timeout = setTimeout(() => {
                        win.close();
                        reject(new Error("Section PDF generation timed out"));
                    }, 30000);

                    win.webContents.on(
                        "did-fail-load",
                        (event, errorCode, errorDescription) => {
                            clearTimeout(timeout);
                            win.close();
                            reject(
                                new Error(
                                    `Failed to load section content: ${errorDescription} (${errorCode})`,
                                ),
                            );
                        },
                    );

                    win.on("closed", () => {
                        clearTimeout(timeout);
                    });

                    // Write HTML to temp file
                    const tempDir = os.tmpdir();
                    const tempFile = path.join(
                        tempDir,
                        `export-section-${Date.now()}-${Math.random()}.html`,
                    );
                    fs.promises
                        .writeFile(tempFile, htmlContent)
                        .then(() => win.loadFile(tempFile))
                        .catch((error) => {
                            clearTimeout(timeout);
                            win.close();
                            fs.promises.unlink(tempFile).catch(() => {});
                            reject(error);
                        });

                    // Cleanup logic
                    const originalResolve = resolve;
                    const originalReject = reject;
                    resolve = () => {
                        fs.promises.unlink(tempFile).catch(() => {});
                        originalResolve();
                    };
                    reject = (error) => {
                        fs.promises.unlink(tempFile).catch(() => {});
                        originalReject(error);
                    };

                    win.webContents.on("did-finish-load", () => {
                        const currentFileName =
                            PDFExportService.getCurrentFileName();
                        const date = new Date().toISOString().split("T")[0];
                        const fileName = `${currentFileName}-${date}-${section}.pdf`;
                        const filePath = path.join(
                            outputPath,
                            sanitize(fileName),
                        );

                        win.webContents
                            .printToPDF({
                                margins: {
                                    top: 0.75,
                                    bottom: 0.5,
                                    left: 0,
                                    right: 0,
                                },
                                pageSize: "Letter",
                                printBackground: true,
                                headerTemplate: headerHtml({
                                    showName:
                                        PDFExportService.getCurrentFileName(),
                                }),
                                footerTemplate: footerHtml,
                                displayHeaderFooter: true,
                            })
                            .then(async (data) => {
                                const blob = new Blob(
                                    [data as unknown as ArrayBuffer],
                                    {
                                        type: "application/pdf",
                                    },
                                );
                                const arrayBuffer = await blob.arrayBuffer();
                                await fs.promises.writeFile(
                                    filePath,
                                    new Uint8Array(arrayBuffer),
                                );
                                clearTimeout(timeout);
                                win.close();
                                resolve();
                            })
                            .catch((error) => {
                                clearTimeout(timeout);
                                win.close();
                                reject(error);
                            });
                    });
                });
            }
        } else {
            for (const [section, sectionSheets] of sectionMap) {
                const sectionDir = path.join(outputPath, sanitize(section));
                await fs.promises.mkdir(sectionDir, { recursive: true });

                for (const sheet of sectionSheets) {
                    await new Promise<void>((resolve, reject) => {
                        const win = new BrowserWindow({
                            width: 1200,
                            height: 800,
                            show: false,
                            webPreferences: {
                                nodeIntegration: true,
                                contextIsolation: false,
                            },
                        });

                        // Add timeout for individual sheet generation
                        const timeout = setTimeout(() => {
                            win.close();
                            reject(
                                new Error(
                                    "Individual PDF generation timed out",
                                ),
                            );
                        }, 15000);

                        win.webContents.on(
                            "did-fail-load",
                            (event, errorCode, errorDescription) => {
                                clearTimeout(timeout);
                                win.close();
                                reject(
                                    new Error(
                                        `Failed to load sheet content: ${errorDescription} (${errorCode})`,
                                    ),
                                );
                            },
                        );

                        win.on("closed", () => {
                            clearTimeout(timeout);
                        });

                        // Write HTML content to a temporary file to avoid URI length limitations
                        const tempDir = os.tmpdir();
                        const tempFile = path.join(
                            tempDir,
                            `export-sheet-${Date.now()}-${Math.random()}.html`,
                        );

                        fs.promises
                            .writeFile(tempFile, sheet.renderedPage)
                            .then(() => {
                                return win.loadFile(tempFile);
                            })
                            .catch((error) => {
                                clearTimeout(timeout);
                                win.close();
                                // Clean up temp file on error
                                fs.promises.unlink(tempFile).catch(() => {});
                                reject(error);
                            });

                        // Clean up temp file after PDF generation
                        const originalResolve = resolve;
                        const originalReject = reject;
                        resolve = () => {
                            fs.promises.unlink(tempFile).catch(() => {});
                            originalResolve();
                        };
                        reject = (error) => {
                            fs.promises.unlink(tempFile).catch(() => {});
                            originalReject(error);
                        };

                        win.webContents.on("did-finish-load", () => {
                            const currentFileName =
                                PDFExportService.getCurrentFileName();
                            const date = new Date().toISOString().split("T")[0];
                            const fileName = `${currentFileName}-${date}-${sheet.drillNumber}${sheet.name ? " - " + sheet.name : ""}`;
                            const filePath = path.join(
                                sectionDir,
                                `${sanitize(fileName)}.pdf`,
                            );
                            win.webContents
                                .printToPDF({
                                    margins: {
                                        marginType: "custom",
                                        top: 0.25,
                                        bottom: 0.25,
                                        left: 0.25,
                                        right: 0.25,
                                    },
                                    pageSize: "Letter",
                                    printBackground: true,
                                    headerTemplate: headerHtml({
                                        showName:
                                            PDFExportService.getCurrentFileName(),
                                    }),
                                    footerTemplate: footerHtml,
                                    displayHeaderFooter: true,
                                })
                                .then(async (data) => {
                                    const blob = new Blob(
                                        [data as unknown as ArrayBuffer],
                                        {
                                            type: "application/pdf",
                                        },
                                    );
                                    const arrayBuffer =
                                        await blob.arrayBuffer();
                                    await fs.promises.writeFile(
                                        filePath,
                                        new Uint8Array(arrayBuffer),
                                    );
                                    clearTimeout(timeout);
                                    win.close();
                                    resolve();
                                })
                                .catch((error) => {
                                    clearTimeout(timeout);
                                    win.close();
                                    reject(error);
                                });
                        });
                    });
                }
            }
        }
    }
    public static async export(
        sheets: ExportSheet[],
        organizeBySection: boolean,
        quarterPages: boolean,
    ) {
        // Clear the field image cache at the start of a new export session
        this.clearFieldImageCache();

        try {
            let result: Electron.SaveDialogReturnValue;
            if (organizeBySection) {
                result = await dialog.showSaveDialog({
                    title: "Select Export Location",
                    defaultPath: PDFExportService.getDefaultPath(),
                    properties: [
                        "createDirectory",
                        "showOverwriteConfirmation",
                    ],
                    buttonLabel: "Export Here",
                });

                if (result.canceled || !result.filePath) {
                    return { success: false, path: "", cancelled: true };
                }
                await PDFExportService.generateSeparatePDFs(
                    sheets,
                    result.filePath,
                    quarterPages,
                );
            } else {
                result = await dialog.showSaveDialog({
                    title: "Save PDF",
                    defaultPath: `${PDFExportService.getDefaultPath()}.pdf`,
                    filters: [{ name: "PDF", extensions: ["pdf"] }],
                    properties: ["showOverwriteConfirmation"],
                });

                if (result.canceled || !result.filePath) {
                    return { success: false, path: "", cancelled: true };
                }

                const pdfBuffer = await PDFExportService.generateSinglePDF(
                    sheets.map((s) => s.renderedPage),
                    quarterPages,
                );

                await fs.promises.writeFile(
                    result.filePath,
                    new Uint8Array(pdfBuffer),
                );
            }
            return { success: true, path: result.filePath };
        } catch (error) {
            return {
                success: false,
                path: "",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private static getCurrentFileName(): string {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return "untitled";
        return path.basename(win.getTitle());
    }

    private static getDefaultPath(): string {
        const date = new Date().toISOString().split("T")[0];
        const win = BrowserWindow.getFocusedWindow();
        const currentFileName = win
            ? win.getTitle().replace(/\.[^/.]+$/, "")
            : "untitled";

        // Get the directory where the current .dots file is saved
        const currentFilePath = store.get("databasePath") as string;
        const baseDir = currentFilePath
            ? path.dirname(currentFilePath)
            : app.getPath("documents");

        return path.join(
            baseDir,
            `${currentFileName}-${date}-coordinate-sheets`,
        );
    }

    /**
     * Open the export directory in the file explorer
     * @param exportDir - The directory to open
     */
    public static async openExportDirectory(
        exportDir: string,
    ): Promise<string> {
        return await shell.openPath(exportDir);
    }

    /**
     * Create a directory for exporting files
     * @param defaultName - Default name for the export directory
     * @returns An object containing the export name and directory path
     */
    public static async createExportDirectory(
        defaultName: string,
    ): Promise<{ exportName: string; exportDir: string }> {
        // Clear the field image cache at the start of a new export session
        this.clearFieldImageCache();

        // Generate default path similar to coordinate sheets but with "charts"
        const date = new Date().toISOString().split("T")[0];
        const currentFileName = defaultName || "untitled";

        // Get the directory where the current .dots file is saved
        const currentFilePath = store.get("databasePath") as string;
        const baseDir = currentFilePath
            ? path.dirname(currentFilePath)
            : app.getPath("documents");

        const defaultPath = path.join(
            baseDir,
            `${currentFileName}-${date}-charts`,
        );

        // Prompt user for export location
        const result = await dialog.showSaveDialog({
            title: "Select Export Location",
            defaultPath: defaultPath,
            properties: ["createDirectory", "showOverwriteConfirmation"],
            buttonLabel: "Export Here",
        });

        // Error handling
        if (result.canceled) {
            throw new Error("Export cancelled");
        }
        if (!result.filePath) {
            throw new Error("No file path selected for export");
        }

        // Create export directory
        const exportDir = result.filePath;
        await fs.promises.mkdir(exportDir, { recursive: true });

        // Generate base file name
        const exportName = path.basename(
            path.basename(defaultName) === path.basename(result.filePath)
                ? defaultName
                : result.filePath,
        );

        return { exportName, exportDir };
    }

    /**
     * Helper function to get field image as base64 data URI from the database.
     * This is cached to avoid repeated DB queries during bulk exports.
     * The cache is cleared automatically when starting a new export session.
     */
    private static async getFieldImageDataUri(): Promise<string | null> {
        // Return cached value if available (undefined means not yet fetched, null means no image)
        if (this.fieldImageCache !== undefined) {
            return this.fieldImageCache;
        }

        try {
            // Access the database in the main process
            const db = getOrmConnection();
            const result = await db.query.field_properties.findFirst({
                columns: { image: true },
            });

            if (!result?.image) {
                this.fieldImageCache = null;
                return null;
            }

            // Convert Uint8Array to base64
            const base64 = Buffer.from(result.image).toString("base64");
            const mimeType = "image/png"; // Adjust if you detect the actual format
            const dataUri = `data:${mimeType};base64,${base64}`;

            // Cache the result
            this.fieldImageCache = dataUri;
            return dataUri;
        } catch (error) {
            console.error("Error fetching field image:", error);
            this.fieldImageCache = null;
            return null;
        }
    }

    /**
     * Generate a PDF for each marcher based on their SVG pages and coordinates
     * This will create a single PDF for each marcher with their respective pages.
     * @param svgPages
     * @param drillNumber
     * @param marcherCoordinates
     * @param pages
     * @param showName
     * @param exportDir
     * @param individualCharts
     */
    // eslint-disable-next-line max-lines-per-function
    public static async generateDocForMarcher(args: {
        svgPages: string[];
        drillNumber: string;
        marcherCoordinates: string[];
        pages: Page[];
        showName: string;
        exportDir: string;
        individualCharts: boolean;
        notesAppendixPages?: { pageName: string; notes: string }[];
    }) {
        const {
            svgPages,
            drillNumber,
            marcherCoordinates,
            pages,
            showName,
            exportDir,
            individualCharts,
            notesAppendixPages = [],
        } = args;
        // Debug: Confirm this is drill chart export
        console.debug(
            `🎺 DRILL CHART EXPORT - generateDocForMarcher called - ${drillNumber}`,
        );

        // Fetch the field image once from the database in the main process
        const fieldImageDataUri = await this.getFieldImageDataUri();

        // Replace the placeholder in all SVG pages with the actual image data
        const PLACEHOLDER = "OPENMARCH_FIELD_IMAGE_PLACEHOLDER";
        // The placeholder might be resolved to an absolute URL by the browser (e.g., http://localhost:5173/PLACEHOLDER)
        // so we need to match any URL that contains the placeholder
        const processedSvgPages = svgPages.map((svg) => {
            if (fieldImageDataUri && svg.includes(PLACEHOLDER)) {
                return svg.replace(PLACEHOLDER, fieldImageDataUri);
            }
            return svg;
        });
        // For each marcher, create a PDF of their pages
        const pdfFileName = `${showName}-${drillNumber}.pdf`;
        const pdfFilePath = path.join(exportDir, sanitize(pdfFileName));
        const doc = new PDFDocument({
            size: "LETTER",
            layout: "landscape",
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        const stream = fs.createWriteStream(pdfFilePath);
        doc.pipe(stream);

        // Helper to draw bold header and value with proper wrapping and y advancement
        function drawLabelValue(
            doc: PDFKit.PDFDocument,
            label: string,
            value: string,
            x: number,
            y: number,
            width: number,
            fontSize: number = 11,
        ): number {
            doc.fontSize(fontSize).font("Helvetica-Bold");
            doc.text(label, x, y, {
                width: width,
                continued: true,
            });

            doc.font("Helvetica");
            doc.text(` ${value}`, {
                width: width,
                continued: false,
            });

            const afterY = doc.y;
            return afterY + 2;
        }

        const renderHtmlText = (
            doc: PDFKit.PDFDocument,
            html: string,
            x: number,
            y: number,
            width: number,
            baseFontSize: number = 10,
            maxY?: number,
        ): number => {
            if (!html) return y;

            // Decode HTML entities first
            const entityMap: Record<string, string> = {
                "&amp;": "&",
                "&lt;": "<",
                "&gt;": ">",
                "&quot;": '"',
                "&#39;": "'",
                "&apos;": "'",
            };
            let text = html.replace(
                /&(?:amp|lt|gt|quot|#39|apos);/g,
                (match) => entityMap[match] || match,
            );
            text = text.replace(/&#(\d{1,6});/g, (match, num) => {
                const code = parseInt(num, 10);
                if (code >= 0 && code <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(code);
                    } catch {
                        return match;
                    }
                }
                return match;
            });
            text = text.replace(/&#x([0-9a-fA-F]{1,6});/g, (match, hex) => {
                const code = parseInt(hex, 16);
                if (code >= 0 && code <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(code);
                    } catch {
                        return match;
                    }
                }
                return match;
            });

            // Remove script and style tags for security
            let previousLength: number;
            let iterations = 0;
            do {
                previousLength = text.length;
                text = text.replace(
                    /<script[^>]{0,1000}>[\s\S]*?<\/script\s*[^>]*>/gi,
                    "",
                );
                text = text.replace(
                    /<style[^>]{0,1000}>[\s\S]*?<\/style\s*[^>]*>/gi,
                    "",
                );
                iterations++;
                if (iterations >= 100) break;
            } while (text.length !== previousLength);

            text = text.replace(/<li[^>]*>/gi, "• ");
            text = text.replace(/<\/li>/gi, "\n");
            text = text.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
            text = text.replace(/<(p|div)[^>]*>/gi, "\n");

            let currentY = y;

            // Extract and replace headings with placeholders to preserve them during splitting
            const headingPlaceholders: Array<{
                placeholder: string;
                type: "h1" | "h2" | "h3";
                content: string;
            }> = [];
            let placeholderCounter = 0;

            text = text.replace(
                /<h1[^>]*>([\s\S]*?)<\/h1>/gi,
                (match, content) => {
                    const placeholder = `__HEADING_H1_${placeholderCounter++}__`;
                    headingPlaceholders.push({
                        placeholder,
                        type: "h1",
                        content: content.replace(/<[^>]+>/g, "").trim(),
                    });
                    return placeholder;
                },
            );

            text = text.replace(
                /<h2[^>]*>([\s\S]*?)<\/h2>/gi,
                (match, content) => {
                    const placeholder = `__HEADING_H2_${placeholderCounter++}__`;
                    headingPlaceholders.push({
                        placeholder,
                        type: "h2",
                        content: content.replace(/<[^>]+>/g, "").trim(),
                    });
                    return placeholder;
                },
            );

            text = text.replace(
                /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
                (match, content) => {
                    const placeholder = `__HEADING_H3_${placeholderCounter++}__`;
                    headingPlaceholders.push({
                        placeholder,
                        type: "h3",
                        content: content.replace(/<[^>]+>/g, "").trim(),
                    });
                    return placeholder;
                },
            );

            const blockSplitRegex = /(?:<br\s*\/?>|<\/(?:p|div)\s*>)/gi;
            const blocks = text.split(blockSplitRegex);

            if (
                blocks.length === 0 ||
                (blocks.length === 1 && !blocks[0].trim())
            ) {
                blocks.length = 0;
                blocks.push(text);
            }

            for (const block of blocks) {
                const trimmedBlock = block.trim();
                if (!trimmedBlock) {
                    currentY += baseFontSize * 0.5;
                    continue;
                }

                // Check for heading placeholders
                const h1Placeholder = trimmedBlock.match(/__HEADING_H1_\d+__/);
                const h2Placeholder = trimmedBlock.match(/__HEADING_H2_\d+__/);
                const h3Placeholder = trimmedBlock.match(/__HEADING_H3_\d+__/);

                if (h1Placeholder) {
                    const placeholder = h1Placeholder[0];
                    const heading = headingPlaceholders.find(
                        (h) => h.placeholder === placeholder,
                    );
                    if (heading && heading.content) {
                        doc.fontSize(baseFontSize * 1.5).font("Helvetica-Bold");
                        doc.text(heading.content, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.3;
                    }
                    continue;
                } else if (h2Placeholder) {
                    const placeholder = h2Placeholder[0];
                    const heading = headingPlaceholders.find(
                        (h) => h.placeholder === placeholder,
                    );
                    if (heading && heading.content) {
                        doc.fontSize(baseFontSize * 1.3).font("Helvetica-Bold");
                        doc.text(heading.content, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.3;
                    }
                    continue;
                } else if (h3Placeholder) {
                    const placeholder = h3Placeholder[0];
                    const heading = headingPlaceholders.find(
                        (h) => h.placeholder === placeholder,
                    );
                    if (heading && heading.content) {
                        doc.fontSize(baseFontSize * 1.1).font("Helvetica-Bold");
                        doc.text(heading.content, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.3;
                    }
                    continue;
                }

                // Remove heading placeholders from block before processing
                const blockWithoutPlaceholders = trimmedBlock
                    .replace(/__HEADING_H[1-3]_\d+__/g, "")
                    .trim();
                if (!blockWithoutPlaceholders) {
                    currentY += baseFontSize * 0.5;
                    continue;
                }

                const formatTagsRegex =
                    /<(strong|b|em|i)(?:\s[^>]*)?>|<\/(strong|b|em|i)>/gi;
                const parts: Array<{
                    text: string;
                    bold: boolean;
                    italic: boolean;
                }> = [];
                let inBold = false;
                let inItalic = false;
                let lastIndex = 0;
                let match;

                formatTagsRegex.lastIndex = 0;

                while (
                    (match = formatTagsRegex.exec(blockWithoutPlaceholders)) !==
                    null
                ) {
                    if (match.index > lastIndex) {
                        const textBefore = blockWithoutPlaceholders.substring(
                            lastIndex,
                            match.index,
                        );
                        const cleanText = textBefore
                            .replace(/<(?!\/?(?:strong|b|em|i)\b)[^>]+>/gi, "")
                            .trim();
                        if (cleanText) {
                            parts.push({
                                text: cleanText,
                                bold: inBold,
                                italic: inItalic,
                            });
                        }
                    }

                    const tag = match[1] || match[2];
                    if (tag === "strong" || tag === "b") {
                        inBold = !inBold;
                    } else if (tag === "em" || tag === "i") {
                        inItalic = !inItalic;
                    }

                    lastIndex = match.index + match[0].length;
                }

                if (lastIndex < blockWithoutPlaceholders.length) {
                    const textAfter =
                        blockWithoutPlaceholders.substring(lastIndex);
                    const cleanText = textAfter
                        .replace(/<(?!\/?(?:strong|b|em|i)\b)[^>]+>/gi, "")
                        .trim();
                    if (cleanText) {
                        parts.push({
                            text: cleanText,
                            bold: inBold,
                            italic: inItalic,
                        });
                    }
                }

                if (parts.length === 0) {
                    const plainText = blockWithoutPlaceholders
                        .replace(/<[^>]+>/g, "")
                        .trim();
                    if (plainText) {
                        doc.fontSize(baseFontSize).font("Helvetica");
                        doc.text(plainText, x, currentY, { width });
                        currentY = doc.y + baseFontSize * 0.2;
                    }
                } else {
                    doc.fontSize(baseFontSize);
                    let isFirst = true;
                    let startX = x;

                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        if (!part.text) continue;

                        let font = "Helvetica";
                        if (part.bold && part.italic) {
                            font = "Helvetica-BoldOblique";
                        } else if (part.bold) {
                            font = "Helvetica-Bold";
                        } else if (part.italic) {
                            font = "Helvetica-Oblique";
                        }

                        doc.font(font);
                        doc.text(
                            part.text,
                            isFirst ? x : startX,
                            isFirst ? currentY : doc.y,
                            {
                                width,
                                continued: i < parts.length - 1,
                            },
                        );

                        if (isFirst) {
                            isFirst = false;
                            startX = doc.x;
                        }
                    }

                    currentY = doc.y + baseFontSize * 0.2;
                }
            }

            return currentY;
        };

        const htmlToPlainText = (html: string): string => {
            if (!html) return "";

            let text = html.replace(
                /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
                "",
            );
            const entityMap: Record<string, string> = {
                "&amp;": "&",
                "&lt;": "<",
                "&gt;": ">",
                "&quot;": '"',
                "&#39;": "'",
                "&apos;": "'",
            };
            text = text.replace(
                /&(?:amp|lt|gt|quot|#39|apos);/g,
                (match) => entityMap[match] || match,
            );
            text = text.replace(/&#(\d{1,6});/g, (match, num) => {
                const code = parseInt(num, 10);
                if (code >= 0 && code <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(code);
                    } catch {
                        return match;
                    }
                }
                return match;
            });
            text = text.replace(/&#x([0-9a-fA-F]{1,6});/g, (match, hex) => {
                const code = parseInt(hex, 16);
                if (code >= 0 && code <= 0x10ffff) {
                    try {
                        return String.fromCodePoint(code);
                    } catch {
                        return match;
                    }
                }
                return match;
            });

            text = text
                .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
                .replace(/<br\s*\/?>/gi, "\n");
            let previousLength: number;
            let iterations = 0;
            const maxIterations = 100;
            do {
                previousLength = text.length;
                text = text.replace(
                    /<script[^>]{0,1000}>[\s\S]*?<\/script\s*[^>]*>/gi,
                    "",
                );
                text = text.replace(
                    /<style[^>]{0,1000}>[\s\S]*?<\/style\s*[^>]*>/gi,
                    "",
                );
                text = text.replace(/<[^>]{0,1000}>/g, "");
                text = text.replace(/<[a-zA-Z\/!][^>]{0,999}(?!>)/g, "");
                iterations++;
                if (iterations >= maxIterations) {
                    break;
                }
            } while (text.length !== previousLength);

            text = text.replace(/[<>]/g, "");

            // Collapse excessive blank lines
            text = text.replace(/\n{3,}/g, "\n\n");

            return text.trim();
        };

        // Set up margins and top bar height
        const margin = 20;
        const topBarHeight = 34;

        // Loop through each SVG page and create a PDF page for it
        for (let i = 0; i < processedSvgPages.length; i++) {
            if (i > 0) doc.addPage();

            // Data for each page
            const page = pages?.[i];
            const setNumber = page?.name ?? "END";
            const counts = page?.counts != null ? String(page.counts) : "END";
            const measureNumbers = measureRangeString(page);
            const prevCoord = marcherCoordinates[i - 1] ?? "N/A";
            const currCoord = marcherCoordinates[i] ?? "N/A";
            const nextCoord = marcherCoordinates[i + 1] ?? "N/A";
            const notesHtml = page?.notes ?? "";
            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;

            // Top bar with drill number, show name, and set number
            doc.rect(margin, margin, pageWidth - 2 * margin, topBarHeight).fill(
                "#ddd",
            );
            const titleBarY = margin + topBarHeight / 2 - 6;

            doc.fillColor("black").fontSize(16).font("Helvetica-Bold");
            doc.fillColor("black").text(
                `${drillNumber}`,
                margin + 10,
                titleBarY,
                {
                    width: pageWidth * 0.15,
                    align: "left",
                },
            );
            doc.text(showName, pageWidth * 0.15, titleBarY, {
                width: pageWidth * 0.65,
                align: "center",
            });
            doc.text(`Set: ${setNumber}`, pageWidth * 0.8, titleBarY, {
                width: pageWidth * 0.2,
                align: "center",
            });

            // Field SVG
            const maxSVGHeight = 425;
            const maxSVGWidth = pageWidth - 2 * margin;
            try {
                SVGtoPDF(doc, processedSvgPages[i], margin, 65, {
                    height: maxSVGHeight,
                    width: maxSVGWidth,
                    preserveAspectRatio: "xMidYMid meet",
                });
            } catch (svgError) {
                doc.fillColor("red")
                    .fontSize(20)
                    .text(
                        `Error rendering SVG: ${svgError instanceof Error ? svgError.message : svgError}`,
                        margin * 2,
                        pageHeight / 2,
                        {
                            height: maxSVGHeight,
                            width: maxSVGWidth,
                            continued: true,
                        },
                    );
                doc.fillColor("black");
            }

            // Set, Counts, Measures, Coordinates, and Notes setup
            const bottomY = doc.page.height - 110;
            const columnPadding = 12;
            const marginSize = margin * 1.5;
            const contentWidth = pageWidth - marginSize * 2 - columnPadding * 2;

            // Variable column widths (18%, 56%, 26%)
            // If main sheet, no middle coordinates column
            const leftColWidth = contentWidth * 0.18;
            const midColWidth = individualCharts ? contentWidth * 0.56 : 0;
            const rightColWidth = individualCharts
                ? contentWidth * 0.26
                : contentWidth * 0.82;
            const leftX = marginSize;
            const midX = leftX + leftColWidth + columnPadding;
            const rightX = individualCharts
                ? midX + midColWidth + columnPadding
                : leftX + leftColWidth + columnPadding;

            // Initialize Y positions for each column
            let yLeft = bottomY;
            let yMid = bottomY;
            let yRight = bottomY;

            // Left column (Set, Counts, Measures)
            yLeft = drawLabelValue(
                doc,
                "Set:",
                setNumber,
                leftX,
                yLeft,
                leftColWidth,
            );
            yLeft = drawLabelValue(
                doc,
                "Counts:",
                counts,
                leftX,
                yLeft,
                leftColWidth,
            );
            yLeft = drawLabelValue(
                doc,
                "Measures:",
                measureNumbers,
                leftX,
                yLeft,
                leftColWidth,
            );

            // Middle column (Coordinates)
            if (individualCharts) {
                yMid = drawLabelValue(
                    doc,
                    "Previous Coordinate:",
                    prevCoord,
                    midX,
                    yMid,
                    midColWidth,
                );
                yMid = drawLabelValue(
                    doc,
                    "Current Coordinate:",
                    currCoord,
                    midX,
                    yMid,
                    midColWidth,
                );
                yMid = drawLabelValue(
                    doc,
                    "Next Coordinate:",
                    nextCoord,
                    midX,
                    yMid,
                    midColWidth,
                );
            }

            // Right column (Notes)
            doc.fontSize(11).font("Helvetica-Bold");
            doc.text("Notes:", rightX, yRight, {
                width: rightColWidth,
            });
            const notesStartY = doc.y + 2;
            if (notesHtml) {
                renderHtmlText(
                    doc,
                    notesHtml,
                    rightX,
                    notesStartY,
                    rightColWidth,
                    10,
                );
                yMid = doc.y;
            } else {
                yMid = notesStartY;
            }

            // Add footer at the bottom of the page
            const footerY = pageHeight - 25;

            // Footer text only (no logo)
            doc.fillColor("#666666").fontSize(8).font("Helvetica");
            doc.text(
                `Exported ${new Date().toLocaleDateString()}`,
                margin + 10,
                footerY + 6,
                {
                    width: pageWidth * 0.3,
                    align: "left",
                },
            );
            doc.text("Made with OpenMarch", pageWidth * 0.35, footerY + 6, {
                width: pageWidth * 0.3,
                align: "center",
            });
        }

        // Notes appendix pages
        const appendixEntries = notesAppendixPages
            .map((entry) => ({
                pageName: entry.pageName,
                notesHtml: entry.notes ?? "",
            }))
            .filter((entry) => entry.notesHtml.trim().length > 0);

        if (appendixEntries.length > 0) {
            const renderAppendixHeader = () => {
                doc.addPage({
                    size: "LETTER",
                    layout: "portrait",
                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                });

                const pageWidth = doc.page.width;
                const pageHeight = doc.page.height;

                doc.rect(
                    margin,
                    margin,
                    pageWidth - 2 * margin,
                    topBarHeight,
                ).fill("#ddd");
                const titleBarY = margin + topBarHeight / 2 - 6;

                doc.fillColor("black").fontSize(16).font("Helvetica-Bold");
                doc.text(`${drillNumber}`, margin + 10, titleBarY, {
                    width: pageWidth * 0.2,
                    align: "left",
                });
                doc.text(showName, pageWidth * 0.2, titleBarY, {
                    width: pageWidth * 0.6,
                    align: "center",
                });
                doc.text("Notes", pageWidth * 0.8, titleBarY, {
                    width: pageWidth * 0.2,
                    align: "center",
                });

                return {
                    pageWidth,
                    pageHeight,
                    startY: margin + topBarHeight + 20,
                };
            };

            const renderFooter = (pageWidth: number, pageHeight: number) => {
                const footerY = pageHeight - 25;
                doc.fillColor("#666666").fontSize(8).font("Helvetica");
                doc.text(
                    `Exported ${new Date().toLocaleDateString()}`,
                    margin + 10,
                    footerY + 6,
                    {
                        width: pageWidth * 0.3,
                        align: "left",
                    },
                );
                doc.text("Made with OpenMarch", pageWidth * 0.35, footerY + 6, {
                    width: pageWidth * 0.3,
                    align: "center",
                });
            };

            const writeNotesEntry = (entry: {
                pageName: string;
                notesHtml: string;
            }) => {
                if (!entry.notesHtml) return;

                const { pageWidth, pageHeight, startY } =
                    renderAppendixHeader();
                const contentWidth = pageWidth - 2 * margin;
                const maxContentBottom = pageHeight - 60;

                const title = `Set ${entry.pageName}`;
                doc.fillColor("black").fontSize(12).font("Helvetica-Bold");
                doc.text(title, margin, startY, {
                    width: contentWidth,
                });
                const notesStartY = doc.y + 4;

                const startPageIndex = doc.bufferedPageRange().start;

                renderHtmlText(
                    doc,
                    entry.notesHtml,
                    margin,
                    notesStartY,
                    contentWidth,
                    10,
                );

                const totalPages = doc.bufferedPageRange().count;
                const endPageIndex = startPageIndex + totalPages - 1;

                for (
                    let pageIdx = startPageIndex;
                    pageIdx <= endPageIndex;
                    pageIdx++
                ) {
                    doc.switchToPage(pageIdx);
                    const currentPageWidth = doc.page.width;
                    const currentPageHeight = doc.page.height;

                    if (pageIdx === startPageIndex) {
                        renderFooter(currentPageWidth, currentPageHeight);
                    } else {
                        const {
                            pageWidth: headerPageWidth,
                            pageHeight: headerPageHeight,
                        } = renderAppendixHeader();
                        renderFooter(headerPageWidth, headerPageHeight);
                    }
                }
            };

            for (const entry of appendixEntries) {
                writeNotesEntry(entry);
            }
        }

        doc.end();
        await new Promise<void>((resolve, reject) => {
            stream.on("finish", resolve);
            stream.on("error", reject);
        });

        return { success: true };
    }

    /**
     * Get the current filename from the focused window
     */
    public static getCurrentFilename(): string {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return "untitled";
        return win
            .getTitle()
            .replace(/^OpenMarch - /, "")
            .replace(/\.[^/.]+$/, "");
    }
}
