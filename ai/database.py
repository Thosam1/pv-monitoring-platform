"""
Database connection module for the Solar Analytics AI Service.

Uses SQLAlchemy to connect to PostgreSQL with READ-ONLY operations.
CRITICAL: Column names must match TypeORM entity exactly (camelCase with quotes).
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:admin@localhost:5432/pv_db"
)

# Create engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Verify connections before use
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """
    Dependency injection helper for database sessions.
    Ensures connections are properly closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
