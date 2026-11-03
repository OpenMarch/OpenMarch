import * as RadioGroup from "@radix-ui/react-radio-group";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { T, useTranslate } from "@tolgee/react";
import clsx from "clsx";
import { APP_LANGUAGES } from "@/utilities/languages";
import TranslationHelpNote from "@/components/i18n/TranslationHelpNote";

/**
 * The app's languages, each named in itself. Choosing one switches the app
 * right away, so the rest of the flow is in that language.
 */
export default function LanguageStep({
    value,
    onChange,
}: {
    value: string;
    onChange: (code: string) => void;
}) {
    const { t } = useTranslate();
    return (
        <div className="flex flex-col gap-12">
            <RadioGroup.Root
                value={value}
                onValueChange={onChange}
                aria-label={t("welcomeFlow.language.title")}
                className="grid grid-cols-2 gap-8"
                data-testid="welcome-language-options"
            >
                {APP_LANGUAGES.map((language) => {
                    const checked = value === language.code;
                    return (
                        <RadioGroup.Item
                            key={language.code}
                            value={language.code}
                            lang={language.code}
                            data-testid={`welcome-language-${language.code}`}
                            className={clsx(
                                "rounded-6 flex items-center gap-8 border px-12 py-10 text-left transition-colors duration-150 ease-out",
                                "focus-visible:outline-accent outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
                                checked
                                    ? "bg-accent/20 border-accent"
                                    : "bg-fg-2 border-stroke hover:border-accent/60",
                            )}
                        >
                            {checked ? (
                                <CheckCircleIcon
                                    size={18}
                                    weight="fill"
                                    className="text-accent shrink-0"
                                />
                            ) : (
                                <CircleIcon
                                    size={18}
                                    className="text-text/50 shrink-0"
                                />
                            )}
                            <span className="text-body text-text font-medium">
                                {language.name}
                            </span>
                        </RadioGroup.Item>
                    );
                })}
            </RadioGroup.Root>
            <div className="text-sub text-text-subtitle flex flex-col gap-4 text-center">
                <p>
                    <TranslationHelpNote language={value} />
                </p>
                <p>
                    <T keyName="welcomeFlow.changeLater" />
                </p>
            </div>
        </div>
    );
}
