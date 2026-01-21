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
    // 1. Sort and Format Data
    const formattedData = [...data]
        .map(point => ({
            ...point,
            timestamp: new Date(point.ds).getTime()
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

    const anomalyMap = new Map(
        anomalies.map(a => [new Date(a.ds).getTime(), a])
    );

    const chartData = formattedData.map(point => {
        const anomaly = anomalyMap.get(point.timestamp);
        return {
            ...point,
            anomalyValue: anomaly ? (anomaly as any).y : null,
            severity_level: anomaly ? (anomaly as any).severity_level : null,
        };
    });

    const anomalySeries = chartData
        .filter(d => d.anomalyValue !== null)
        .map(d => ({
            timestamp: d.timestamp,
            anomalyValue: d.anomalyValue,
            severity_level: d.severity_level
        }));

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
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            stroke="#64748b"
                            minTickGap={40}
                            scale="time"
                        />
                        <YAxis
                            stroke="#64748b"
                            tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString() : val}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                            }}
                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                            formatter={(value: any, name: any) => {
                                if (typeof value !== 'number') return [value, name];
                                return [value.toLocaleString(undefined, { maximumFractionDigits: 2 }), name];
                            }}
                        />
                        <Legend
                            verticalAlign="top"
                            height={40}
                            iconType="circle"
                            formatter={(value) => <span style={{ color: '#475569', fontWeight: 500 }}>{value}</span>}
                        />

                        <Area
                            type="monotone"
                            dataKey="yhat_upper"
                            stroke="none"
                            fill="#94a3b8"
                            fillOpacity={0.25}
                            name="Confidence Interval"
                            legendType="none"
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
                            stroke="#64748b"
                            name="Upper Confidence Bound"
                            strokeDasharray="4 4"
                            dot={false}
                            strokeWidth={1.5}
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
                            data={anomalySeries}
                            dataKey="anomalyValue"
                            name="Critical Anomaly"
                            fill="#ef4444"
                            shape={(props: any) => {
                                const { cx, cy, payload } = props;
                                if (typeof cx !== 'number' || typeof cy !== 'number') return <path d="" />;

                                const severity = payload.severity_level;
                                let fill = "#ef4444"; // High
                                let size = 8;

                                if (severity === 'Medium') {
                                    fill = "#f97316"; // Medium
                                    size = 6;
                                } else if (severity === 'Low') {
                                    fill = "#f59e0b"; // Low
                                    size = 4;
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

                        <Brush dataKey="timestamp" height={30} stroke="#cbd5e1" fill="#f8fafc" tickFormatter={(t) => new Date(t).getFullYear().toString()} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
