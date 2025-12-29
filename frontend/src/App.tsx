import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
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
import './App.css';

// Define types for forecast data
interface ForecastDataPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

interface AnomalyPoint {
  ds: string;
  y: number;
  yhat: number;
  severity: number;
}

interface Metrics {
  MAE: number;
  RMSE: number;
  MAPE: number;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [days, setDays] = useState<number>(30);
  const [seasonalityMode, setSeasonalityMode] = useState<string>('additive');

  const [forecastData, setForecastData] = useState<ForecastDataPoint[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyPoint[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [insights, setInsights] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please upload a CSV file.");
      return;
    }

    setLoading(true);
    setError(null);
    setForecastData([]);
    setAnomalies([]);
    setMetrics(null);
    setInsights([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`http://127.0.0.1:8000/forecast?days=${days}&seasonality_mode=${seasonalityMode}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      // API returns: { data: [...], anomalies: [...], metrics: {...}, insights: [...] }
      setForecastData(response.data.data);
      setAnomalies(response.data.anomalies);
      setMetrics(response.data.metrics);
      setInsights(response.data.insights || []);

    } catch (err: any) {
      // Axios error handling
      const errorMessage = err.response?.data?.detail
        ? JSON.stringify(err.response.data.detail) // detail can be object sometimes
        : "An error occurred fetching the forecast.";
      setError(errorMessage.replace(/"/g, '')); // Clean up quotes
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Merge anomalies into forecast data for easier plotting if needed, 
  // or pass separate data arrays to ComposedChart. 
  // Recharts ComposedChart works best with a single data array if sharing X-axis, 
  // but we can also have multiple data sources if careful. 
  // Easiest is to map anomalies onto the main data array or use a separate scatter.

  // Strategy: ComposedChart with `forecastData`. 
  // Anomalies usually are points on the same timeline.
  // We need to make sure the `anomalies` are represented in the data passed to the chart, OR use a separate Scatter with its own data prop (if X axis matches).
  // Safest: Use separate data prop for Scatter if supported, or map them.
  // Recharts XAxis must match. 

  // Let's attach anomaly info to the main forecastData item if ds matches.
  const chartData = forecastData.map(point => {
    const anomaly = anomalies.find(a => new Date(a.ds).getTime() === new Date(point.ds).getTime());
    return {
      ...point,
      anomalyValue: anomaly ? anomaly.y : null, // The actual value that was anomalous
    };
  });

  const handleDownload = async () => {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setLoading(true);
      const response = await axios.post(`http://127.0.0.1:8000/report?days=${days}&seasonality_mode=${seasonalityMode}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob', // Important for PDF download
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'forecast_report.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError("Failed to download report.");
    }
  };

  return (
    <div className="container">
      <h1>Predictive Business Insights Platform</h1>

      <div className="controls">
        <form onSubmit={handleSubmit}>
          {/* Form inputs... */}
          <div className="form-group">
            <label>Upload CSV Data:</label>
            <input type="file" accept=".csv,.txt" onChange={handleFileChange} />
          </div>

          <div className="form-group">
            <label>Forecast Horizon (Days):</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              min="1"
              max="365"
            />
          </div>

          <div className="form-group">
            <label>Seasonality Mode:</label>
            <select value={seasonalityMode} onChange={(e) => setSeasonalityMode(e.target.value)}>
              <option value="additive">Additive (Constant amplitude)</option>
              <option value="multiplicative">Multiplicative (Changes with trend)</option>
            </select>
          </div>

          <div className="button-group" style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Processing...' : 'Run Forecast & Analysis'}
            </button>
            
            {forecastData.length > 0 && (
                <button type="button" onClick={handleDownload} disabled={loading} style={{ backgroundColor: '#28a745' }}>
                  Download PDF Report
                </button>
            )}
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      {metrics && (
        <div className="metrics-container">
          <div className="metric-card">
            <h3>MAPE (Error %)</h3>
            <div className="value">{metrics.MAPE}%</div>
          </div>
          <div className="metric-card">
            <h3>RMSE (Error Units)</h3>
            <div className="value">{metrics.RMSE}</div>
          </div>
          <div className="metric-card">
            <h3>Forecast Confidence</h3>
            <div className="value">{(100 - metrics.MAPE).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="insights-section">
          <h3>🧠 AI Insights</h3>
          <ul>
            {insights.map((insight, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{ __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
            ))}
          </ul>
        </div>
      )}

      {forecastData.length > 0 && (
        <div className="chart-container">
          <h2>Forecast & Anomaly Detection (Drag to Zoom)</h2>
          <ResponsiveContainer width="100%" height={450}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="ds"
                tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(label) => new Date(label).toDateString()}
              />
              <Legend />

              {/* Uncertainty Band - approximated by area between upper/lower? 
                  Recharts doesn't handle "band" easily without custom shapes or stacked areas.
                  We'll just plot lines for now for simplicity or use Area for the whole range if data is structured right.
              */}
              <Area type="monotone" dataKey="yhat_upper" stroke="none" fill="#82ca9d" fillOpacity={0.2} />
              {/* Note: Correct area band requires advanced SVG w/ rechart. Simplified here with just lines */}

              <Line type="monotone" dataKey="yhat" stroke="#8884d8" name="Forecast" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="yhat_upper" stroke="#82ca9d" name="Upper/Lower Bound" strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="yhat_lower" stroke="#82ca9d" name="" strokeDasharray="3 3" dot={false} />

              {/* Anomalies as Scatter points */}
              <Scatter dataKey="anomalyValue" name="Anomaly" fill="red" shape="circle" />

              <Brush dataKey="ds" height={30} stroke="#8884d8" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {anomalies.length > 0 && (
        <div className="anomalies-section">
          <h3>⚠️ Detected Anomalies</h3>
          <p>Found {anomalies.length} data points that deviate significantly from the expected values.</p>
          <ul>
            {anomalies.slice(0, 5).map((a, i) => (
              <li key={i}>
                {new Date(a.ds).toDateString()}: Actual <strong>{a.y}</strong> vs Expected <strong>{a.yhat.toFixed(2)}</strong>
              </li>
            ))}
            {anomalies.length > 5 && <li>...and {anomalies.length - 5} more.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
