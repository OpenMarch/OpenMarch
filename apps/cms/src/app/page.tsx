import Link from "next/link";

export default function HomePage() {
    return (
        <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
            <h1>OpenMarch CMS</h1>
            <p>
                <Link href="/admin">Go to Admin</Link> to manage blog posts and
                media.
            </p>
        </main>
    );
}
