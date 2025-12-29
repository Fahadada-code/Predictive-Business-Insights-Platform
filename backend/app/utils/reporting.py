from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import io
import pandas as pd
from typing import Dict, List, Any

def generate_pdf_report(
    forecast_df: pd.DataFrame,
    metrics: Dict[str, float],
    insights: List[str],
    anomalies: pd.DataFrame
) -> io.BytesIO:
    """
    Generates a PDF report for the Executive Dashboard.
    Returns: BytesIO object containing the PDF.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = styles['Title']
    story.append(Paragraph("Executive Forecast Report", title_style))
    story.append(Spacer(1, 12))

    # 1. Executive Summary (Insights)
    header_style = styles['Heading2']
    story.append(Paragraph("Executive Summary", header_style))
    story.append(Spacer(1, 6))
    
    body_style = styles['BodyText']
    if insights:
        for insight in insights:
            # Clean markdown bolding for PDF
            clean_text = insight.replace("**", "<b>").replace("**", "</b>") # Simple replace not perfect but ok
            # Helper to fix the double replace issue above or just strip
            clean_text = insight.replace("**", "") 
            story.append(Paragraph(f"• {clean_text}", body_style))
    else:
        story.append(Paragraph("No specific insights generated.", body_style))
    story.append(Spacer(1, 12))

    # 2. Key Metrics
    story.append(Paragraph("Model Performance Metrics", header_style))
    story.append(Spacer(1, 6))
    
    metric_data = [["Metric", "Value"]]
    for k, v in metrics.items():
        metric_data.append([k, str(v)])
        
    t = Table(metric_data, colWidths=[2*inch, 2*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # 3. Anomaly Report
    if not anomalies.empty:
        story.append(Paragraph(f"Detected Anomalies ({len(anomalies)})", header_style))
        story.append(Spacer(1, 6))
        story.append(Paragraph(f"The system detected {len(anomalies)} data points deviating significantly from expected patterns.", body_style))
        story.append(Spacer(1, 6))
        
        # List top 5 anomalies
        anomaly_data = [["Date", "Actual", "Expected", "Severity"]]
        top_anomalies = anomalies.sort_values(by='severity', ascending=False).head(5)
        
        for _, row in top_anomalies.iterrows():
            date_str = pd.to_datetime(row['ds']).strftime('%Y-%m-%d')
            anomaly_data.append([
                date_str, 
                f"{row['y']:.2f}", 
                f"{row['yhat']:.2f}",
                f"{row['severity']:.2f}"
            ])
            
        at = Table(anomaly_data, colWidths=[1.5*inch, 1.2*inch, 1.2*inch, 1.2*inch])
        at.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkred),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        story.append(at)
    else:
        story.append(Paragraph("No significant anomalies detected.", body_style))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer
