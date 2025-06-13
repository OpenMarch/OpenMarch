import { Input, Button } from "@openmarch/ui";
import React, { useState } from "react";

const SUPABASE_URL =
    "https://vjdgrmhzmihuoxcjtqnv.supabase.co/rest/v1/Newsletter Emails";
const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_KEY;

function NewsletterForm({
    variant = "primary",
    buttonText = "Sign Up",
}: {
    variant?: "primary" | "secondary";
    buttonText?: string;
}) {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [error, setError] = useState("");
    console.log("SUPABASE_KEY", SUPABASE_KEY);

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
        <form className="flex w-fit flex-col gap-12" onSubmit={handleSubmit}>
            <Input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
            />
            <Button
                type="submit"
                disabled={status === "loading"}
                variant={variant}
            >
                {status === "loading" ? "Signing up..." : buttonText}
            </Button>
            {status === "success" && (
                <p className="text-green text-body">
                    Thank you for signing up!
                </p>
            )}
            {status === "error" && (
                <p className="text-red text-body">{error}</p>
            )}
        </form>
    );
}

export default NewsletterForm;
