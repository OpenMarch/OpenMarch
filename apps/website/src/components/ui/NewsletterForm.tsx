import { Input, Button } from "@openmarch/ui";
import {
    ArrowRightIcon,
    CheckCircleIcon,
    SealWarningIcon,
} from "@phosphor-icons/react";
import React, { useState } from "react";

const SUPABASE_URL =
    "https://vjdgrmhzmihuoxcjtqnv.supabase.co/rest/v1/Newsletter Emails";
const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_KEY;

function NewsletterForm({
    variant = "primary",
}: {
    variant?: "primary" | "secondary";
}) {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [error, setError] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("loading");
        setError("");
        try {
            const res = await fetch(SUPABASE_URL, {
                method: "POST",
                headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                },
                body: JSON.stringify({ email }),
            });
            if (res.ok) {
                setStatus("success");
                setEmail("");
            } else {
                setStatus("error");
                setError(
                    "Something went wrong... Please tell us about this so we can fix it :)",
                );
            }
        } catch (err) {
            setStatus("error");
            setError("Network error.");
        }
    }

    return (
        <form className="flex w-full flex-col gap-8" onSubmit={handleSubmit}>
            <div className="flex gap-6">
                <Input
                    type="email"
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
                    {/*status === "loading" ? "Signing up..." : buttonText */}
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
