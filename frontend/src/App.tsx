import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, BarChart2 } from 'lucide-react';

import './App.css';
import { Controls } from './components/Controls';
import { MetricsCards } from './components/MetricsCards';
import { InsightsList } from './components/InsightsList';
import { ForecastChart } from './components/ForecastChart';

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
  severity_level: 'High' | 'Medium' | 'Low';
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
  const [recommendations, setRecommendations] = useState<string[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleFileChangeRaw = (newFile: File) => {
    setFile(newFile);
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
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForecastData(response.data.data);
      setAnomalies(response.data.anomalies);
      setMetrics(response.data.metrics);
      setInsights(response.data.insights || []);
      setRecommendations(response.data.recommendations || []);

    } catch (err: any) {
      const errorMessage = err.response?.data?.detail
        ? JSON.stringify(err.response.data.detail)
        : "An error occurred fetching the forecast.";
      setError(errorMessage.replace(/"/g, ''));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const response = await axios.post(`http://127.0.0.1:8000/report?days=${days}&seasonality_mode=${seasonalityMode}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });

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

  const EmptyState = () => (
    <motion.div
      className="glass-panel empty-state"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="empty-state-icon">
        <BarChart2 size={48} />
      </div>
      <h2>Ready for Insights?</h2>
      <p>Upload a CSV file or use the sample data to visualize future business trends and detect anomalies.</p>
    </motion.div>
  );

  return (
    <div className="app-container">
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <h1>
          <Sparkles style={{ marginRight: '10px', display: 'inline-block' }} />
          InsightCast
        </h1>
      </motion.div>

      <Controls
        file={file}
        days={days}
        seasonalityMode={seasonalityMode}
        loading={loading}
        hasData={forecastData.length > 0}
        onFileChange={handleFileChange}
        onDaysChange={setDays}
        onSeasonalityChange={setSeasonalityMode}
        onFileChangeRaw={handleFileChangeRaw}
        onSubmit={handleSubmit}
        onDownload={handleDownload}
      />

      {error && (
        <motion.div
          className="error-banner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {forecastData.length === 0 && !loading && !error && (
          <EmptyState key="empty" />
        )}

        {metrics && <MetricsCards key="metrics" metrics={metrics} />}

        {(insights.length > 0 || recommendations.length > 0) && (
          <InsightsList key="insights" insights={insights} recommendations={recommendations} />
        )}

        {forecastData.length > 0 && (
          <motion.div
            key="chart"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <ForecastChart data={forecastData} anomalies={anomalies} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;

