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
    // Merge anomalies into chart data
    const chartData = data.map(point => {
        const anomaly = anomalies.find(a => new Date(a.ds).getTime() === new Date(point.ds).getTime());
        return {
            ...point,
            anomalyValue: anomaly ? anomaly.y : null,
            severity_level: anomaly ? anomaly.severity_level : null,
        };
    });

    return (
        <div className="glass-panel chart-panel">
            <div className="panel-header">
                <h2>Forecast & Anomaly Detection</h2>
                <div className="badges">
                    <span className="badge">Drag to Zoom</span>
                </div>
            </div>

            <div style={{ width: '100%', height: 450 }}>
                <ResponsiveContainer>
                    <ComposedChart data={chartData}>
                        <defs>
                            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                            dataKey="ds"
                            tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            stroke="#64748b"
                        />
                        <YAxis stroke="#64748b" tickFormatter={(val) => typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 1 }) : val} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                            labelFormatter={(label) => new Date(label).toDateString()}
                            formatter={(value: any) => typeof value === 'number' ? [value.toFixed(2), ''] : ['', '']}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ paddingTop: '10px' }} />

                        <Area
                            type="monotone"
                            dataKey="yhat_upper"
                            stroke="none"
                            fill="#94a3b8"
                            fillOpacity={0.15}
                            name="Confidence Interval"
                        />

                        <Line
                            type="monotone"
                            dataKey="yhat"
                            stroke="#0ea5e9"
                            name="Primary Forecast"
                            dot={false}
                            strokeWidth={3}
                            activeDot={{ r: 8 }}
                        />

                        <Line
                            type="monotone"
                            dataKey="yhat_upper"
                            stroke="#94a3b8"
                            name="Upper/Lower Bound"
                            strokeDasharray="5 5"
                            dot={false}
                            strokeWidth={1}
                            legendType='none'
                        />
                        <Line
                            type="monotone"
                            dataKey="yhat_lower"
                            stroke="#94a3b8"
                            strokeDasharray="5 5"
                            dot={false}
                            strokeWidth={1}
                            legendType='none'
                        />

                        <Scatter
                            dataKey="anomalyValue"
                            name="Critical Anomaly"
                            line={false}
                            shape={(props: any) => {
                                const { cx, cy, payload } = props;
                                const severity = payload.severity_level;

                                // Specific colors and smaller sizes
                                let fill = "#ef4444"; // High (Red)
                                let size = 8;

                                if (severity === 'Medium') {
                                    fill = "#f97316"; // Orange
                                    size = 5;
                                } else if (severity === 'Low') {
                                    fill = "#f59e0b"; // Amber
                                    size = 3;
                                }

                                return (
                                    <circle
                                        cx={cx}
                                        cy={cy}
                                        r={size}
                                        fill={fill}
                                        stroke="#ffffff"
                                        strokeWidth={1.5}
                                    />
                                );
                            }}
                        />

                        <Brush dataKey="ds" height={30} stroke="#3b82f6" fill="#f8fafc" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
