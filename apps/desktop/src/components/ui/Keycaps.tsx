export default function Keycaps({ keys }: { keys: readonly string[] }) {
    return (
        <kbd className="keycaps">
            {keys.map((key, i) => (
                <kbd key={`${key}-${i}`} className="keycap">
                    {key}
                </kbd>
            ))}
        </kbd>
    );
}
