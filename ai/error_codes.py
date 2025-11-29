"""Error code definitions by logger type.

Centralized error code database for diagnostic tools.
Each logger type has its own set of error codes with descriptions,
severity levels, and suggested fixes.
"""

from typing import TypedDict


class ErrorDefinition(TypedDict):
    """Definition for a single error code."""

    description: str
    severity: str  # "info" | "warning" | "critical"
    fix: str


# Error code definitions organized by logger type
ERROR_CODES: dict[str, dict[str, ErrorDefinition]] = {
    "goodwe": {
        "E001": {
            "description": "Grid Voltage Out of Range",
            "severity": "warning",
            "fix": "Check grid connection and voltage stability",
        },
        "E002": {
            "description": "Grid Frequency Out of Range",
            "severity": "warning",
            "fix": "Contact utility if persistent",
        },
        "E003": {
            "description": "DC Voltage Too High",
            "severity": "critical",
            "fix": "Check PV string configuration",
        },
        "E004": {
            "description": "Inverter Overtemperature",
            "severity": "critical",
            "fix": "Check ventilation and ambient temperature",
        },
        "E005": {
            "description": "Isolation Fault",
            "severity": "critical",
            "fix": "Check cable insulation and connections",
        },
        "E006": {
            "description": "GFCI Fault",
            "severity": "critical",
            "fix": "Check ground fault circuit interrupter",
        },
        "E007": {
            "description": "PV Overcurrent",
            "severity": "warning",
            "fix": "Check string configuration and module ratings",
        },
        "E008": {
            "description": "Communication Error",
            "severity": "warning",
            "fix": "Check network/RS485 connections",
        },
        "E009": {
            "description": "Fan Failure",
            "severity": "warning",
            "fix": "Inspect and replace cooling fan if needed",
        },
        "E010": {
            "description": "Anti-Islanding Failure",
            "severity": "critical",
            "fix": "Inverter requires professional inspection",
        },
    },
    "lti": {
        "F01": {
            "description": "Communication Timeout",
            "severity": "warning",
            "fix": "Check network connection",
        },
        "F02": {
            "description": "Sensor Fault",
            "severity": "warning",
            "fix": "Inspect temperature/irradiance sensors",
        },
        "F03": {
            "description": "Data Logging Error",
            "severity": "info",
            "fix": "Check storage capacity and retry",
        },
        "F04": {
            "description": "Clock Sync Error",
            "severity": "info",
            "fix": "Resync device clock with NTP",
        },
        "F05": {
            "description": "Memory Full",
            "severity": "warning",
            "fix": "Export data and clear memory",
        },
    },
    "smartdog": {
        "ERR_COMM": {
            "description": "Communication Error",
            "severity": "warning",
            "fix": "Check RS485/Modbus connection",
        },
        "ERR_TEMP": {
            "description": "Temperature Sensor Fault",
            "severity": "warning",
            "fix": "Replace temperature sensor",
        },
        "ERR_IRR": {
            "description": "Irradiance Sensor Fault",
            "severity": "warning",
            "fix": "Check pyranometer connection and calibration",
        },
        "ERR_PWR": {
            "description": "Power Measurement Error",
            "severity": "warning",
            "fix": "Verify CT sensor placement and wiring",
        },
        "ERR_MEM": {
            "description": "Memory Error",
            "severity": "warning",
            "fix": "Reset device or replace memory module",
        },
        "ERR_CONF": {
            "description": "Configuration Error",
            "severity": "info",
            "fix": "Reconfigure device parameters",
        },
    },
    "meier": {
        "W100": {
            "description": "Low Production Warning",
            "severity": "info",
            "fix": "May be due to weather - monitor",
        },
        "W101": {
            "description": "Yield Below Expected",
            "severity": "info",
            "fix": "Check for shading or soiling",
        },
        "E100": {
            "description": "Inverter Offline",
            "severity": "critical",
            "fix": "Check inverter power supply",
        },
        "E101": {
            "description": "Grid Disconnection",
            "severity": "critical",
            "fix": "Verify grid connection and utility status",
        },
        "E102": {
            "description": "DC Input Error",
            "severity": "warning",
            "fix": "Check PV array connections",
        },
        "E103": {
            "description": "Inverter Fault",
            "severity": "critical",
            "fix": "Professional inspection required",
        },
    },
    "meteocontrol": {
        "ALM001": {
            "description": "Sensor Disconnected",
            "severity": "warning",
            "fix": "Check sensor cable connections",
        },
        "ALM002": {
            "description": "Data Gap Detected",
            "severity": "info",
            "fix": "Review communication logs",
        },
        "ALM003": {
            "description": "Irradiance Sensor Error",
            "severity": "warning",
            "fix": "Calibrate or replace pyranometer",
        },
        "ALM004": {
            "description": "Temperature Sensor Error",
            "severity": "warning",
            "fix": "Check ambient temperature sensor",
        },
        "ALM005": {
            "description": "Wind Sensor Error",
            "severity": "info",
            "fix": "Inspect anemometer",
        },
    },
    "integra": {
        "SYS_ERR": {
            "description": "System Error",
            "severity": "critical",
            "fix": "Restart system and check logs",
        },
        "COMM_FAIL": {
            "description": "Communication Failure",
            "severity": "warning",
            "fix": "Check network connectivity",
        },
        "DATA_ERR": {
            "description": "Data Integrity Error",
            "severity": "warning",
            "fix": "Verify data transmission",
        },
    },
    "mbmet": {
        "SENS_ERR": {
            "description": "Sensor Error",
            "severity": "warning",
            "fix": "Check meteorological sensors",
        },
        "CALIB_REQ": {
            "description": "Calibration Required",
            "severity": "info",
            "fix": "Schedule sensor calibration",
        },
    },
    "plexlog": {
        "DB_ERR": {
            "description": "Database Error",
            "severity": "warning",
            "fix": "Check SQLite database integrity",
        },
        "SYNC_FAIL": {
            "description": "Sync Failure",
            "severity": "warning",
            "fix": "Retry data synchronization",
        },
    },
}


def get_error_definition(logger_type: str, code: str) -> ErrorDefinition | None:
    """Look up error code definition.

    Args:
        logger_type: Type of logger (e.g., 'goodwe', 'lti')
        code: Error code to look up

    Returns:
        ErrorDefinition if found, None otherwise
    """
    return ERROR_CODES.get(logger_type, {}).get(code)


def get_all_codes_for_logger(logger_type: str) -> dict[str, ErrorDefinition]:
    """Get all error codes for a specific logger type.

    Args:
        logger_type: Type of logger

    Returns:
        Dictionary of error codes and their definitions
    """
    return ERROR_CODES.get(logger_type, {})


def get_supported_logger_types() -> list[str]:
    """Get list of logger types with error code definitions.

    Returns:
        List of supported logger type names
    """
    return list(ERROR_CODES.keys())
