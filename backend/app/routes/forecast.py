from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from app.utils.forecasting import generate_forecast, normalize_columns
import os
import io
import pandas as pd

router = APIRouter()

# Data directory path
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
os.makedirs(DATA_DIR, exist_ok=True)

@router.post("/forecast", tags=["Forecasting"])
async def get_forecast(
    file: UploadFile = File(...),
    days: int = Query(30, description="Number of days to forecast"),
    seasonality_mode: str = Query('additive', enum=['additive', 'multiplicative']),
    growth: str = Query('linear', enum=['linear', 'flat']),
    daily_seasonality: str = 'auto',
    weekly_seasonality: str = 'auto',
    yearly_seasonality: str = 'auto'
):
    """
    Generate a forecast using the Prophet model based on uploaded CSV data.
    """
    # Read file content
    contents = await file.read()
    
    try:
        # Try reading as CSV
        df = pd.read_csv(io.BytesIO(contents))
    except Exception:
        # Try with different encoding if default fails
        try:
            df = pd.read_csv(io.BytesIO(contents), encoding='latin1')
        except Exception as e:
            raise HTTPException(status_code=400, detail="Invalid CSV file. Could not parse.")

    # Normalize columns
    try:
        df = normalize_columns(df)
    except ValueError as e:
         raise HTTPException(status_code=400, detail=str(e))

    # Save the standardized file
    file_location = os.path.join(DATA_DIR, f"clean_{file.filename}")
    df.to_csv(file_location, index=False)

    try:
        # Generate analysis (Forecast + Anomalies + Metrics)
        analysis_result = generate_forecast(
            file_path=file_location,
            days=days,
            seasonality_mode=seasonality_mode,
            growth=growth,
            daily_seasonality=daily_seasonality,
            weekly_seasonality=weekly_seasonality,
            yearly_seasonality=yearly_seasonality
        )
        
        forecast_df = analysis_result["forecast"]
        anomalies_df = analysis_result["anomalies"]
        metrics = analysis_result["metrics"]
        insights_data = analysis_result["insights"] # Structured dict
        
        # Prepare result for JSON response
        forecast_data = forecast_df.to_dict(orient="records")
        anomalies_data = anomalies_df.to_dict(orient="records")
        
        return {
            "message": f"Analysis complete. Forecasted {days} days.",
            "row_count": len(df),
            "parameters": {
                "seasonality_mode": seasonality_mode,
                "growth": growth,
            },
            "metrics": metrics,
            "anomalies": anomalies_data,
            "insights": insights_data.get("insights", []),
            "recommendations": insights_data.get("recommendations", []),
            "data": forecast_data
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecasting error: {str(e)}")

@router.post("/report", tags=["Forecasting"])
async def get_forecast_report(
    file: UploadFile = File(...),
    days: int = Query(30, description="Number of days to forecast"),
    seasonality_mode: str = Query('additive', enum=['additive', 'multiplicative']),
    growth: str = Query('linear', enum=['linear', 'flat']),
    daily_seasonality: str = 'auto',
    weekly_seasonality: str = 'auto',
    yearly_seasonality: str = 'auto'
):
    """
    Generates a PDF report for the forecast.
    """
    # 1. Save upload to temp file
    os.makedirs("data", exist_ok=True)
    file_location = os.path.join("data", file.filename)
    with open(file_location, "wb") as f:
        f.write(await file.read())

    # 2. Read DataFrame and normalize
    try:
        df = pd.read_csv(file_location)
        df = normalize_columns(df)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid CSV file.")

    # 3. Generate Analysis
    try:
        analysis_result = generate_forecast(
            file_path=df, 
            days=days,
            seasonality_mode=seasonality_mode,
            growth=growth,
            daily_seasonality=daily_seasonality,
            weekly_seasonality=weekly_seasonality,
            yearly_seasonality=yearly_seasonality
        )
        
        # 4. Generate PDF
        from app.utils.reporting import generate_pdf_report
        pdf_buffer = generate_pdf_report(
            forecast_df=analysis_result["forecast"],
            metrics=analysis_result["metrics"],
            insights_data=analysis_result["insights"], # Fixed parameter name
            anomalies=analysis_result["anomalies"]
        )
        
        # 5. Return as Download
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=forecast_report.pdf"}
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reporting error: {str(e)}")
