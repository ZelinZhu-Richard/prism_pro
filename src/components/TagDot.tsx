export function TagDot({ color }: { color: string }) {
  return (
    <span
      className="library-tag-dot"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}
