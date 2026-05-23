import { Input, Button } from "@openmarch/ui";
import {
    ArrowRightIcon,
    CheckCircleIcon,
    SealWarningIcon,
} from "@phosphor-icons/react";
import React, { useRef, useState } from "react";

const BUTTONDOWN_ACTION =
    "https://buttondown.com/api/emails/embed-subscribe/alexdumo";
// cspell:ignore sub_tag_09prxrndjh9svaanzgayxrdxm0
const BUTTONDOWN_TAG = "sub_tag_09prxrndjh9svaanzgayxrdxm0";

function NewsletterForm({
    variant = "primary",
}: {
    variant?: "primary" | "secondary";
}) {
    const formRef = useRef<HTMLFormElement>(null);
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("loading");
        setError("");

        const body = new URLSearchParams({
            email,
            tag: BUTTONDOWN_TAG,
            embed: "1",
        });

        try {
            const res = await fetch(BUTTONDOWN_ACTION, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body,
            });
            if (res.ok) {
                setStatus("success");
                setEmail("");
            } else {
                const text = await res.text();
                if (
                    text.includes("Verify Your Subscription") ||
                    text.includes("turnstile")
                ) {
                    // Turnstile required — complete subscription on Buttondown
                    formRef.current?.submit();
                } else {
                    setStatus("error");
                    setError(
                        "Something went wrong... Please tell us about this so we can fix it :)",
                    );
                }
            }
        } catch {
            // CORS or network failure — fall back to native form POST
            formRef.current?.submit();
        }
    }

    return (
        <form
            ref={formRef}
            action={BUTTONDOWN_ACTION}
            method="post"
            className="embeddable-buttondown-form flex w-full flex-col gap-8"
            onSubmit={handleSubmit}
        >
            <input type="hidden" name="tag" value={BUTTONDOWN_TAG} />
            <input type="hidden" name="embed" value="1" />
            <div className="flex gap-6">
                <Input
                    type="email"
                    name="email"
                    id="bd-email"
                    placeholder="youremail@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full"
                />
                <Button
                    type="submit"
                    content="icon"
                    disabled={status === "loading"}
                    variant={variant}
                >
                    <ArrowRightIcon size={24} />
                </Button>
            </div>
            {status === "success" && (
                <p className="text-text text-body flex items-center gap-6">
                    <CheckCircleIcon size={18} className="text-green" />
                    Thank you for signing up!
                </p>
            )}
            {status === "error" && (
                <p className="text-text text-body flex items-center gap-6">
                    <SealWarningIcon size={18} className="text-red" />
                    {error}
                </p>
            )}
        </form>
    );
}

export default NewsletterForm;
