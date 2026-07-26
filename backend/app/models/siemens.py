"""Pydantic models for Siemens-specific validation."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SiemensAlignment(BaseModel):
    matches_strategic_domain: bool = False
    strategic_domains: list[str] = Field(default_factory=list)
    recommended_business_unit: str = ""
    portfolio_conflict: bool = False
    portfolio_conflict_notes: str = ""
    competitive_advantage: str = ""
    technology_readiness_level: int = 1
    assessment: str = "Pending"


class SiemensGateResult(BaseModel):
    gate_name: str = ""
    passed: bool = False
    passed_items: int = 0
    total_items: int = 0
    failed_items: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SiemensValidation(BaseModel):
    alignment: SiemensAlignment = Field(default_factory=SiemensAlignment)
    gate_results: list[SiemensGateResult] = Field(default_factory=list)
    composite_score_at_validation: float = 0.0
    counsel_approved: bool = False
    filing_strategy: str = ""
