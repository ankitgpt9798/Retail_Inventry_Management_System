// Small helpers shared by the SVG charts

// Clean axis ticks for a value scale: maxValue 7 → 0, 2, 4, 6, 8 (never 0, 2.5, 5, 7.5, 10).
// Returns { top, ticks }: `top` is the last tick, where the chart's scale ends.
export const buildTicks = (maxValue, count = 4) => {
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
        return { top: 1, ticks: [0, 1] };
    }
    const rawStep = maxValue / count;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const fraction = rawStep / magnitude;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    const step = niceFraction * magnitude;
    const top = Math.ceil(maxValue / step) * step;

    const ticks = [];
    for (let value = 0; value <= top + step / 1000; value += step) {
        ticks.push(value);
    }
    return { top, ticks };
};

// 12900 → "12.9K", 4200000 → "42L" (Indian short form). For axis ticks and small labels.
export const formatCompact = (value) => {
    return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);
};

// "2026-09" → "Sep"  /  "Sep 2026"
const monthDate = (month) => new Date(`${month}-01T00:00:00`);
export const shortMonth = (month) => new Intl.DateTimeFormat("en-IN", { month: "short" }).format(monthDate(month));
export const longMonth = (month) => new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(monthDate(month));

// A column: square at the baseline (bottom), 4px rounded at the top — the data end.
export const roundedTopBar = (x, y, width, height, radius = 4) => {
    if (height <= 0) return "";
    const r = Math.min(radius, height, width / 2);
    return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
};

// A horizontal bar: square at the baseline (left), 4px rounded at the right — the data end.
export const roundedRightBar = (x, y, width, height, radius = 4) => {
    if (width <= 0) return "";
    const r = Math.min(radius, width, height / 2);
    return `M${x},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height - r} Q${x + width},${y + height} ${x + width - r},${y + height} L${x},${y + height} Z`;
};

// Cuts long labels so they fit the space left of a bar: "Wireless Keyboard Pro" → "Wireless Keybo…"
export const truncate = (text, max = 16) => {
    const value = String(text ?? "");
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
