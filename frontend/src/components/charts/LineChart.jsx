import { useState } from "react";
import ChartTooltip from "./ChartTooltip";
import { buildTicks, formatCompact } from "../../utils/chart";
import { formatNumber } from "../../utils/format";

const AXIS_TEXT = { fill: "var(--color-base-content)", opacity: 0.7, fontSize: 12.5 };
const GRID = { stroke: "var(--color-base-300)", strokeWidth: 1 };

// Two lines or so over time (more than four series stops being readable: use small charts instead).
//   data:   [{ label: "Sep", title: "Sep 2026", <seriesKey>: number, … }]
//   series: [{ key, label, color }]        colours from the fixed order: var(--series-1), var(--series-2)…
// A legend is always shown; a series is also named at its line end when there is room.
const LineChart = ({ data, series, formatValue = formatNumber, ariaLabel }) => {
    const [hovered, setHovered] = useState(null);

    const width = 640;
    const height = 260;
    const margin = { top: 16, right: 88, bottom: 28, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const maxValue = Math.max(0, ...data.flatMap((point) => series.map((item) => point[item.key] || 0)));
    const { top, ticks } = buildTicks(maxValue);

    const xAt = (index) => margin.left + (data.length === 1 ? plotWidth / 2 : (index * plotWidth) / (data.length - 1));
    const yAt = (value) => margin.top + plotHeight - (value / top) * plotHeight;

    const last = data.length - 1;

    // Name a line at its end only when the ends are far enough apart not to collide
    const endYs = series.map((item) => yAt(data[last]?.[item.key] || 0));
    const canLabelEnds = endYs.every((y, i) => endYs.every((other, j) => i === j || Math.abs(y - other) >= 16));

    return (
        <div>
            <div className="relative">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="group" aria-label={ariaLabel} onMouseLeave={() => setHovered(null)}>
                    {ticks.map((tick) => (
                        <g key={tick}>
                            <line x1={margin.left} x2={width - margin.right} y1={yAt(tick)} y2={yAt(tick)} style={GRID} />
                            <text x={margin.left - 8} y={yAt(tick) + 4} textAnchor="end" style={AXIS_TEXT}>
                                {formatCompact(tick)}
                            </text>
                        </g>
                    ))}

                    {data.map((point, index) => (
                        <text key={point.label} x={xAt(index)} y={height - 8} textAnchor="middle" style={AXIS_TEXT}>
                            {point.label}
                        </text>
                    ))}

                    {hovered !== null && <line x1={xAt(hovered)} x2={xAt(hovered)} y1={margin.top} y2={margin.top + plotHeight} style={{ ...GRID, stroke: "var(--color-base-content)", opacity: 0.35 }} />}

                    {series.map((item) => (
                        <g key={item.key}>
                            <path
                                d={data.map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index)},${yAt(point[item.key] || 0)}`).join(" ")}
                                fill="none"
                                strokeWidth={2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                style={{ stroke: item.color }}
                            />
                            {/* End dot; the 2px ring in the surface colour keeps it readable where lines cross */}
                            {data.length > 0 && hovered === null && (
                                <circle cx={xAt(last)} cy={yAt(data[last][item.key] || 0)} r={4} strokeWidth={2} style={{ fill: item.color, stroke: "var(--color-base-100)" }} />
                            )}
                            {hovered !== null && (
                                <circle cx={xAt(hovered)} cy={yAt(data[hovered][item.key] || 0)} r={4} strokeWidth={2} style={{ fill: item.color, stroke: "var(--color-base-100)" }} />
                            )}
                            {canLabelEnds && data.length > 0 && (
                                <text x={xAt(last) + 10} y={yAt(data[last][item.key] || 0) + 4} style={{ ...AXIS_TEXT, opacity: 0.9 }}>
                                    {item.label}
                                </text>
                            )}
                        </g>
                    ))}

                    {/* One wide target per month; each announces all series for screen readers */}
                    {data.map((point, index) => {
                        const slice = plotWidth / Math.max(1, data.length - 1);
                        return (
                            <rect
                                key={point.label}
                                x={xAt(index) - slice / 2}
                                y={0}
                                width={slice}
                                height={height}
                                fill="transparent"
                                tabIndex={0}
                                role="img"
                                aria-label={`${point.title || point.label}: ${series.map((item) => `${item.label} ${formatValue(point[item.key] || 0)}`).join(", ")}`}
                                onMouseEnter={() => setHovered(index)}
                                onFocus={() => setHovered(index)}
                                onBlur={() => setHovered(null)}
                            />
                        );
                    })}
                </svg>

                {hovered !== null && (
                    <ChartTooltip
                        x={xAt(hovered) / width}
                        y={yAt(Math.max(...series.map((item) => data[hovered][item.key] || 0))) / height}
                        title={data[hovered].title || data[hovered].label}
                        rows={series.map((item) => ({ label: item.label, value: formatValue(data[hovered][item.key] || 0), color: item.color }))}
                    />
                )}
            </div>

            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
                {series.map((item) => (
                    <li key={item.key} className="flex items-center gap-2">
                        <span className="inline-block h-0.5 w-4 rounded" style={{ background: item.color }} aria-hidden="true"></span>
                        {item.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default LineChart;
