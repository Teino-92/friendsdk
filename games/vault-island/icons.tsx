const C = { gold: "#ffcc3d", goldDark: "#c98a1c", crystal: "#46d6cf" };
const ICONS: Record<string, { grid: string[]; colors: Record<string, string> }> = {
  "Crystal dust": { grid: ["........", "...c....", ".c...c..", "....c...", "..cCc...", ".cCCCc..", "cCCCCCc.", "........"], colors: { c: "#9aa3c7", C: "#5f6899" } },
  "Silver coin": { grid: ["..sss...", ".sSSSs..", "sSwSSSs.", "sSwSSSs.", "sSSSSSs.", "sSSSSSs.", ".sSSSs..", "..sss..."], colors: { s: "#8b94ad", S: "#d4d9e6", w: "#ffffff" } },
  "Gold bar": { grid: ["........", "........", "..gggg..", ".gGwGGg.", "gGGGGGGg", "gdddddd.", "........", "........"], colors: { g: C.goldDark, G: C.gold, w: "#fff6c9", d: "#8a5a10" } },
  Ruby: { grid: ["..rrrr..", ".rRwRRr.", "rRRwRRRr", ".rRRRRr.", "..rRRr..", "...rr...", "........", "........"], colors: { r: "#8f1239", R: "#ef4d86", w: "#ffd1e1" } },
  "Friend crown": { grid: ["g..g..g.", "gg.g.gg.", "gGgGgGg.", "gGGGGGg.", "gRGcGRg.", "gGGGGGg.", "gggggggg", "........"], colors: { g: C.goldDark, G: C.gold, R: "#ef4d86", c: C.crystal } },
};
export function PixelIcon({ name, size = 64 }: { name: string; size?: number }) {
  const icon = ICONS[name]; if (!icon) return null;
  return <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
    {icon.grid.flatMap((row, y) => [...row].map((ch, x) => icon.colors[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={icon.colors[ch]} /> : null))}
  </svg>;
}
