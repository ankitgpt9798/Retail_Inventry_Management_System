import { useState } from "react";
import ChartTooltip from "./ChartTooltip";
import { buildTicks, formatCompact, roundedRightBar, roundedTopBar, truncate } from "../../utils/chart";
import { formatNumber } from "../../utils/format";

// Text colours come from the app theme, never from the series colour
const AXIS_TEXT = { fill: "var(--color-base-content)", opacity: 0.7, fontSize: 12.5 };
const GRID = { stroke: "var(--color-base-300)", strokeWidth: 1 };

const MAX_BAR = 24; // bars are thin: at most 24px, however much room there is

// One series of bars.
//   data:        [{ label, title?, value, detail? }]   label = short name on the axis ("Sept"), title = full name for screen
//                readers and the tooltip ("Sept 2026"; defaults to the label), detail = extra tooltip line, e.g. "3 orders"
//   orientation: "vertical" (columns, for time) or "horizontal" (ranked lists, long names)
//   color:       a CSS colour, normally "var(--series-1)"
//   formatValue: how a value is written in the tooltip and value labels
//   valueName:   what the value is, e.g. "Revenue" (tooltip row label)
const BarChart = ({ data, orientation = "vertical", color = "var(--series-1)", formatValue = formatNumber, valueName = "Value", ariaLabel }) => {
    const [hovered, setHovered] = useState(null);
    const horizontal = orientation === "horizontal";

    const maxValue = Math.max(0, ...data.map((item) => item.value));
    const { top, ticks } = buildTicks(maxValue);

    // ----- geometry (the SVG scales to its container; these are its own units) -----
    const width = 640;
    const margin = horizontal ? { top: 8, right: 64, bottom: 8, left: 136 } : { top: 20, right: 12, bottom: 28, left: 52 };
    const rowHeight = 32;
    const height = horizontal ? margin.top + margin.bottom + data.length * rowHeight : 260;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // The hover box sits on the bar's tip
    const anchor = (index) => {
        const item = data[index];
        if (horizontal) {
            const x = margin.left + (item.value / top) * plotWidth;
            return { x: x / width, y: (margin.top + index * rowHeight + rowHeight / 2) / height };
        }
        const band = plotWidth / data.length;
        return { x: (margin.left + band * (index + 0.5)) / width, y: (margin.top + plotHeight - (item.value / top) * plotHeight) / height };
    };

    // Vertical charts label only the latest and the highest bar (the tooltip and table carry the rest)
    const maxIndex = data.findIndex((item) => item.value === maxValue);
    const labelled = new Set([data.length - 1, maxIndex]);

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="group" aria-label={ariaLabel} onMouseLeave={() => setHovered(null)}>
                {/* value axis + hairline grid (columns only: ranked bars carry their value at the tip) */}
                {!horizontal &&
                    ticks.map((tick) => {
                        const y = margin.top + plotHeight - (tick / top) * plotHeight;
                        return (
                            <g key={tick}>
                                <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} style={GRID} />
                                <text x={margin.left - 8} y={y + 4} textAnchor="end" style={AXIS_TEXT}>
                                    {formatCompact(tick)}
                                </text>
                            </g>
                        );
                    })}
                {horizontal && <line x1={margin.left} x2={margin.left} y1={margin.top} y2={height - margin.bottom} style={GRID} />}

                {data.map((item, index) => {
                    const label = `${item.title ?? item.label}: ${formatValue(item.value)}${item.detail ? `, ${item.detail}` : ""}`;
                    let mark;
                    let text;
                    let hit;

                    if (horizontal) {
                        const rowTop = margin.top + index * rowHeight;
                        const barHeight = Math.min(MAX_BAR, rowHeight - 8);
                        const barWidth = (item.value / top) * plotWidth;
                        const y = rowTop + (rowHeight - barHeight) / 2;
                        mark = <path d={roundedRightBar(margin.left, y, barWidth, barHeight)} style={{ fill: color }} />;
                        text = (
                            <>
                                <text x={margin.left - 8} y={rowTop + rowHeight / 2 + 4} textAnchor="end" style={{ ...AXIS_TEXT, opacity: 0.85, fontSize: 13 }}>
                                    {truncate(item.label, 17)}
                                </text>
                                <text x={margin.left + barWidth + 6} y={rowTop + rowHeight / 2 + 4} style={{ fill: "var(--color-base-content)", fontSize: 13, fontWeight: 600 }}>
                                    {formatCompact(item.value)}
                                </text>
                            </>
                        );
                        hit = { x: 0, y: rowTop, width, height: rowHeight };
                    }
                    else {
                        const band = plotWidth / data.length;
                        const barWidth = Math.min(MAX_BAR, band * 0.6);
                        const barHeight = (item.value / top) * plotHeight;
                        const x = margin.left + band * index + (band - barWidth) / 2;
                        const y = margin.top + plotHeight - barHeight;
                        mark = <path d={roundedTopBar(x, y, barWidth, barHeight)} style={{ fill: color }} />;
                        text = (
                            <>
                                <text x={margin.left + band * (index + 0.5)} y={height - 8} textAnchor="middle" style={AXIS_TEXT}>
                                    {truncate(item.label, 10)}
                                </text>
                                {labelled.has(index) && item.value > 0 && (
                                    <text x={margin.left + band * (index + 0.5)} y={y - 6} textAnchor="middle" style={{ fill: "var(--color-base-content)", fontSize: 12, fontWeight: 600 }}>
                                        {formatCompact(item.value)}
                                    </text>
                                )}
                            </>
                        );
                        hit = { x: margin.left + band * index, y: 0, width: band, height };
                    }

                    return (
                        <g key={item.label}>
                            {mark}
                            {text}
                            {/* An invisible, larger target so hovering (or tabbing to) a small bar still works */}
                            <rect
                                {...hit}
                                fill="transparent"
                                tabIndex={0}
                                role="img"
                                aria-label={label}
                                onMouseEnter={() => setHovered(index)}
                                onFocus={() => setHovered(index)}
                                onBlur={() => setHovered(null)}
                            />
                        </g>
                    );
                })}
            </svg>

            {hovered !== null && (
                <ChartTooltip
                    {...anchor(hovered)}
                    title={data[hovered].title ?? data[hovered].label}
                    rows={[
                        { label: valueName, value: formatValue(data[hovered].value), color },
                        ...(data[hovered].detail ? [{ label: "Note", value: data[hovered].detail }] : [])
                    ]}
                />
            )}
        </div>
    );
};

export default BarChart;
