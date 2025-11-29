"""Configuration constants for solar-analyst service.

Centralizes all hardcoded values for maintainability and environment-based configuration.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Solar Analyst configuration with environment variable support.

    All settings can be overridden via environment variables with SOLAR_ prefix.
    Example: SOLAR_DATABASE_URL="postgresql://user:pass@host/db"
    """

    # Database
    database_url: str = "postgresql://admin:admin@localhost:5432/pv_db"
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_pre_ping: bool = True

    # Analysis thresholds
    anomaly_irradiance_threshold: float = 50.0  # W/m2 - below this, no sunlight expected
    resample_interval: str = "15min"
    max_data_points: int = 1000

    # Financial calculations
    co2_per_kwh: float = 0.85  # kg CO2 per kWh avoided (grid average)
    kg_co2_per_tree_year: float = 21.0  # kg CO2 absorbed per tree per year
    default_electricity_rate: float = 0.20  # USD/kWh

    # Performance ratio calculation
    reference_panel_efficiency: float = 0.15  # 15% typical panel efficiency
    max_performance_ratio: float = 1.5  # Cap at 150% to handle edge cases

    # Query limits
    default_result_limit: int = 100
    anomaly_result_limit: int = 100
    comparison_max_points: int = 500
    diagnostic_issue_limit: int = 20

    # Forecast settings
    forecast_max_days: int = 7
    forecast_history_days: int = 14
    forecast_min_history_days: int = 3

    # Fleet monitoring
    fleet_active_threshold_minutes: int = 15

    # MCP Server
    mcp_host: str = "0.0.0.0"
    mcp_port: int = 4000
    mcp_transport: str = "sse"

    model_config = {"env_prefix": "SOLAR_"}


settings = Settings()
