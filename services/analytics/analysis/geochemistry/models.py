from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from analysis.geochemistry.custom_diagram import DiagramSpec


class ComputeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    tool: str
    columns: dict[str, str]
    units: dict[str, Literal['pct','ppm','ppb','raw']] = Field(default_factory=dict)
    iron_basis: Literal['FeOT','Fe2O3T'] = 'FeOT'
    include_qaqc: bool = False
    log_x: bool = False
    log_y: bool = False
    group_column: str | None = None
    label_column: str | None = None
    size_column: str | None = None
    color_column: str | None = None
    # Only for tool 'custom-diagram' (Diagram Builder): the user's diagram definition.
    diagram: DiagramSpec | None = None


class DatasetRequest(ComputeRequest):
    dataset_id: str
