import { useState } from 'react';
import {
    ComposedChart,
    Line,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Area,
    Brush
} from 'recharts';


interface ForecastChartProps {
    data: any[];
    anomalies: any[];
}

export function ForecastChart({ data, anomalies }: ForecastChartProps) {
    // Sort data by date and add timestamps for proper rendering
    const formattedData = [...data]
        .map(point => ({
            ...point,
            timestamp: new Date(point.ds).getTime()
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

    // Build a quick lookup map for anomalies
    const anomalyMap = new Map(
        anomalies.map(a => [new Date(a.ds).getTime(), a])
    );

    // Merge anomaly data into chart data
    const chartData = formattedData.map(point => {
        const anomaly = anomalyMap.get(point.timestamp);
        return {
            ...point,
            anomalyValue: anomaly ? (anomaly as any).y : null,
            severity_level: anomaly ? (anomaly as any).severity_level : null,
        };
    });

    // Track the current zoom/brush selection
    const [brushRange, setBrushRange] = useState<{ startIndex: number, endIndex: number }>({
        startIndex: 0,
        endIndex: chartData.length - 1
    });

    // Update the x-axis to fill the viewport based on selected range
    const visibleData = chartData.slice(brushRange.startIndex, brushRange.endIndex + 1);
    const xDomain = visibleData.length > 0
        ? [visibleData[0].timestamp, visibleData[visibleData.length - 1].timestamp]
        : ['dataMin' as const, 'dataMax' as const];

    return (
        <div className="glass-panel chart-panel">
            <div className="panel-header">
                <h2>Forecast & Anomaly Intelligence</h2>
                <div className="badges">
                    <span className="badge">Time-Series Analysis</span>
                </div>
            </div>

            <div style={{ width: '100%', height: 450 }}>
                <ResponsiveContainer>
                    <ComposedChart data={chartData}>
                        <defs>
                            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={xDomain}
                            tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            stroke="#94a3b8"
                            fontSize={12}
                            tickMargin={10}
                            minTickGap={40}
                            scale="time"
                        />
                        <YAxis
                            stroke="#94a3b8"
                            fontSize={12}
                            tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString() : val}
                            domain={['auto', 'auto']}
                            padding={{ top: 20, bottom: 20 }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#ffffff',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                            }}
                            itemStyle={{ padding: '4px 0' }}
                            labelStyle={{ marginBottom: '8px', color: '#64748b', fontWeight: 500 }}
                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                            formatter={(value: any, name: any) => {
                                if (typeof value !== 'number') return [value, name];
                                // Show friendly names in tooltip
                                const labelMap: Record<string, string> = {
                                    yhat: "Forecast",
                                    yhat_upper: "Upper Bound",
                                    yhat_lower: "Lower Bound",
                                    anomalyValue: "Actual (Anomaly)"
                                };
                                return [value.toLocaleString(undefined, { maximumFractionDigits: 2 }), labelMap[name] || name];
                            }}
                        />
                        <Legend
                            verticalAlign="top"
                            height={50}
                            iconType="circle"
                            formatter={(value) => <span style={{ color: '#475569', fontWeight: 600, fontSize: '13px', marginLeft: '6px' }}>{value}</span>}
                        />

                        {/* Confidence Interval Area */}
                        <Area
                            type="monotone"
                            dataKey="yhat_upper"
                            stroke="none"
                            fill="#94a3b8"
                            fillOpacity={0.15}
                            name="Confidence Interval"
                            legendType="none"
                        />

                        {/* Forecast Gradient Area */}
                        <Area
                            type="monotone"
                            dataKey="yhat"
                            stroke="none"
                            fill="url(#colorForecast)"
                            fillOpacity={1}
                            legendType="none"
                            activeDot={false}
                        />

                        <Line
                            type="monotone"
                            dataKey="yhat"
                            stroke="#0ea5e9"
                            name="Forecasted Trend"
                            dot={false}
                            strokeWidth={3}
                            activeDot={{ r: 6, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
                        />

                        <Line
                            type="monotone"
                            dataKey="yhat_upper"
                            stroke="#cbd5e1"
                            name="Upper Confidence Bound"
                            strokeDasharray="4 4"
                            dot={false}
                            strokeWidth={1}
                        />
                        <Line
                            type="monotone"
                            dataKey="yhat_lower"
                            stroke="#64748b"
                            name="Lower Confidence Bound"
                            strokeDasharray="4 4"
                            dot={false}
                            strokeWidth={1.5}
                        />

                        <Scatter
                            dataKey="anomalyValue"
                            name="Critical Anomaly"
                            fill="#ef4444"
                            legendType="circle"
                            shape={(props: any) => {
                                const { cx, cy, payload } = props;
                                // Don't render anything if there's no anomaly at this point
                                if (!cx || !cy || payload.anomalyValue === null) return <path d="" />;

                                const severity = payload.severity_level;
                                let fill = "#ef4444"; // High
                                let size = 10;

                                if (severity === 'Medium') {
                                    fill = "#f97316"; // Medium
                                    size = 7;
                                } else if (severity === 'Low') {
                                    fill = "#f59e0b"; // Low
                                    size = 5;
                                }

                                return (
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r={size}
                                        fill={fill}
                                        stroke="#ffffff"
                                        strokeWidth={2}
                                    />
                                );
                            }}
                        />

                        <Brush
                            dataKey="timestamp"
                            height={30}
                            stroke="#3b82f6"
                            fill="#f8fafc"
                            onChange={(range: any) => {
                                if (range && range.startIndex !== undefined && range.endIndex !== undefined) {
                                    setBrushRange({
                                        startIndex: range.startIndex,
                                        endIndex: range.endIndex
                                    });
                                }
                            }}
                            startIndex={brushRange.startIndex}
                            endIndex={brushRange.endIndex}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
