import pandas as pd
import numpy as np
from prophet import Prophet
import os
from typing import Optional, Dict, List

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardize column names to 'ds' and 'y' using smart detection.
    """
    # 1. Detect Date Column
    date_col = None
    if 'ds' in df.columns:
        date_col = 'ds'
    else:
        # Case-insensitive search for 'date' or 'ds' or 'timestamp'
        for col in df.columns:
            if col.lower() in ['date', 'ds', 'timestamp', 'time']:
                date_col = col
                break
    
    if not date_col:
        raise ValueError("Could not detect a date column (looking for 'ds', 'date', 'timestamp').")

    # 2. Detect Target Column
    target_col = None
    if 'y' in df.columns:
        target_col = 'y'
    else:
        # Potential targets (excluding date column)
        potential_targets = [c for c in df.columns if c != date_col]
        
        # Check for explicit 'y' match first
        for col in potential_targets:
            if col.lower() == 'y':
                target_col = col
                break
        
        if not target_col:
            # Check for generic value names
            common_names = ['value', 'sales', 'revenue', 'quantity', 'amount', 'close', 'price']
            for col in potential_targets:
                if col.lower() in common_names:
                    target_col = col
                    break
            
            # If still not found, pick the first numeric column
            if not target_col:
                numeric_cols = df[potential_targets].select_dtypes(include=['number', 'float', 'int']).columns
                if len(numeric_cols) > 0:
                    target_col = numeric_cols[0]

    if not target_col:
        raise ValueError("Could not detect a numeric target column. Please ensure one exists.")

    # 3. Rename and Filter
    df = df.rename(columns={date_col: 'ds', target_col: 'y'})
    
    # Ensure y is numeric
    df['y'] = pd.to_numeric(df['y'], errors='coerce')
    df = df.dropna(subset=['y'])
    
    return df[['ds', 'y']]

def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Calculate performance metrics: MAE, RMSE, MAPE.
    """
    # Remove NaNs if any
    mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    y_true = y_true[mask]
    y_pred = y_pred[mask]
    
    if len(y_true) == 0:
        return {"MAE": 0.0, "RMSE": 0.0, "MAPE": 0.0}

    mae = np.mean(np.abs(y_true - y_pred))
    rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
    
    # Avoid division by zero for MAPE
    with np.errstate(divide='ignore', invalid='ignore'):
        mape = np.mean(np.abs((y_true - y_pred) / y_true)) * 100
        if np.isinf(mape) or np.isnan(mape):
            mape = 0.0

    return {
        "MAE": round(mae, 4),
        "RMSE": round(rmse, 4),
        "MAPE": round(mape, 2)
    }

def detect_anomalies(forecast: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """
    Identify anomalies where actual values fall outside the uncertainty intervals.
    Categorizes them by High, Medium, and Low severity.
    """
    # Merge forecast with actuals on 'ds'
    merged = pd.merge(actuals, forecast[['ds', 'yhat_lower', 'yhat_upper', 'yhat']], on='ds', how='inner')
    
    # Identify anomalies
    merged['is_anomaly'] = (merged['y'] < merged['yhat_lower']) | (merged['y'] > merged['yhat_upper'])
    
    # Return only the rows that are anomalies
    anomalies = merged[merged['is_anomaly']].copy()
    
    if anomalies.empty:
        return pd.DataFrame(columns=['ds', 'y', 'yhat', 'yhat_lower', 'yhat_upper', 'severity', 'severity_level'])

    # Calculate severity as percentage deviation from yhat
    anomalies['severity_pct'] = (np.abs(anomalies['y'] - anomalies['yhat']) / anomalies['yhat']) * 100
    
    # Classify severity levels
    def classify_severity(pct):
        if pct > 20: return 'High'
        if pct > 10: return 'Medium'
        return 'Low'
    
    anomalies['severity_level'] = anomalies['severity_pct'].apply(classify_severity)
    anomalies['severity'] = np.abs(anomalies['y'] - anomalies['yhat'])
    
    return anomalies[['ds', 'y', 'yhat', 'yhat_lower', 'yhat_upper', 'severity', 'severity_level']]

def generate_forecast(
    file_path: str | pd.DataFrame,
    days: int = 30,
    seasonality_mode: str = 'additive',
    growth: str = 'linear',
    daily_seasonality: str = 'auto',
    weekly_seasonality: str = 'auto',
    yearly_seasonality: str = 'auto',
    holidays: Optional[pd.DataFrame] = None
) -> Dict:
    """
    Loads data, trains Prophet, forecasts, detects anomalies, and calculates metrics.
    Returns a dictionary with 'forecast', 'anomalies', and 'metrics'.
    """
    # Load data
    if isinstance(file_path, str):
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Data file not found at {file_path}")
        try:
            df = pd.read_csv(file_path)
            # Ensure normalized if reading raw file, assuming caller might not have normalized
            # But usually we expect clean 'ds', 'y' here. 
            # If it fails, we assume it's already clean or let it error.
        except Exception as e:
            raise ValueError(f"Failed to read CSV: {str(e)}")
    elif isinstance(file_path, pd.DataFrame):
        df = file_path
    else:
        raise ValueError("file_path must be a string path or pandas DataFrame")
    
    # Ensure required columns
    if 'ds' not in df.columns or 'y' not in df.columns:
         # Best effort normalization if passed a raw frame with weird columns
         try:
             df = normalize_columns(df)
         except ValueError:
             raise ValueError("Input dataframe must contain 'ds' and 'y' columns.")

    # Convert ds to datetime
    try:
        df['ds'] = pd.to_datetime(df['ds'])
    except Exception:
        raise ValueError("Could not parse 'ds' column as dates.")
        
    if df['ds'].dt.tz is not None:
        df['ds'] = df['ds'].dt.tz_localize(None)

    # Initialize Prophet model
    # Optimization: uncertainty_samples=100 (default 1000) to speed up forecast by ~10x while keeping intervals
    m = Prophet(
        seasonality_mode=seasonality_mode,
        growth=growth,
        daily_seasonality=daily_seasonality,
        weekly_seasonality=weekly_seasonality,
        yearly_seasonality=yearly_seasonality,
        holidays=holidays,
        interval_width=0.95, # Increased for more conservative detection
        uncertainty_samples=300 # More samples for more stable intervals
    )
    
    m.fit(df)

    # Create future dataframe (includes history + future)
    future = m.make_future_dataframe(periods=days)

    # Forecast
    forecast = m.predict(future)

    # Detect Anomalies (on historical data)
    anomalies = detect_anomalies(forecast, df)
    
    # Calculate Metrics (on historical data)
    # We need to get the fitted values for the history
    history_forecast = forecast[forecast['ds'].isin(df['ds'])]
    # Merge to ensure alignment
    metrics_df = pd.merge(df, history_forecast[['ds', 'yhat']], on='ds')
    metrics = calculate_metrics(metrics_df['y'].values, metrics_df['yhat'].values)
    
    # Generate Insights
    insights = generate_insights(forecast, anomalies, df)

    # Sort by date for alignment
    forecast = forecast.sort_values('ds')
    anomalies = anomalies.sort_values('ds')

    return {
        "forecast": forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']],
        "anomalies": anomalies,
        "metrics": metrics,
        "insights": insights,
        "model": m
    }

def generate_insights(forecast: pd.DataFrame, anomalies: pd.DataFrame, history: pd.DataFrame) -> Dict[str, List[str]]:
    """
    Generate natural language insights and recommendations based on forecast data.
    """
    insights = []
    recommendations = []
    
    # 1. Trend Analysis
    current_val = history['y'].iloc[-1]
    future_val = forecast['yhat'].iloc[-1]
    trend_pct = ((future_val - current_val) / current_val) * 100
    
    direction = "growth" if trend_pct > 0 else "decline"
    intensity = "Significant" if abs(trend_pct) > 10 else "Moderate" if abs(trend_pct) > 3 else "Minimal"
    
    insights.append(f"<b>{intensity} {direction.capitalize()}</b>: Expect a {abs(trend_pct):.1f}% {direction} in values over the next forecast cycle.")
    
    # Add trend-based recommendations
    if direction == "growth":
        if abs(trend_pct) > 10:
            recommendations.append("<b>Scale Operations</b>: Increase capacity and inventory to meet projected high demand.")
        else:
            recommendations.append("<b>Monitor Steady Growth</b>: Continue current growth strategies with regular performance checks.")
    else:
        recommendations.append("<b>Cost Optimization</b>: Identify potential operational efficiencies to offset the projected decline.")

    # 2. Key Milestones (Peaks and Troughs)
    future_forecast = forecast[forecast['ds'] > history['ds'].max()]
    if not future_forecast.empty:
        peak_idx = future_forecast['yhat'].idxmax()
        peak_time = future_forecast.loc[peak_idx, 'ds'].strftime('%Y-%m-%d')
        peak_val = future_forecast.loc[peak_idx, 'yhat']
        
        insights.append(f"<b>Forecast Peak</b>: The model projects a high of <b>{peak_val:.2f}</b> around <b>{peak_time}</b>.")
        recommendations.append(f"<b>Peak Readiness</b>: Plan marketing or maintenance activities around the <b>{peak_time}</b> peak.")

    # 3. Anomaly & Volatility Summary
    if not anomalies.empty:
        high_severity = anomalies[anomalies['severity_level'] == 'High']
        if not high_severity.empty:
            insights.append(f"<b>Critical Volatility</b>: Detected {len(high_severity)} <b>High Severity</b> anomalies requiring immediate review.")
            recommendations.append("<b>Risk Mitigation</b>: Audit the high-severity data points to identify root causes and prevent recurrence.")
        
        total_anomalies = len(anomalies)
        insights.append(f"<b>Statistical Stability</b>: Over {total_anomalies} historical anomalies identified, helping refine model sensitivity.")
    else:
        insights.append("<b>Operational Stability</b>: No significant anomalies detected in recent historical data.")

    # 4. Confidence Interval
    last_point = forecast.iloc[-1]
    spread = (last_point['yhat_upper'] - last_point['yhat_lower']) / last_point['yhat'] * 100
    if spread < 15:
        insights.append("<b>High Confidence</b>: The model shows high convergence with a narrow prediction interval.")
    else:
        insights.append("<b>Variable Forecast</b>: Noted a wider uncertainty margin, suggesting potential external market influence.")
        recommendations.append("<b>Data Refinement</b>: Consider adding additional context columns (holidays, promos) to reduce forecast variance.")
    
    return {
        "insights": insights,
        "recommendations": recommendations
    }
