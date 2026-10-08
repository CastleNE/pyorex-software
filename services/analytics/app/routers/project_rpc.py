"""``project.*``: PyOreX project files (.orex). Blocking file work runs off the event loop."""
import asyncio

from pydantic import BaseModel, ConfigDict, Field

from analysis.project import orex


class SaveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    path: str
    name: str | None = None
    state: dict
    dataset_ids: list[str] = Field(default_factory=list)


class PathRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    path: str


async def save(params):
    req = SaveRequest.model_validate(params)
    return await asyncio.to_thread(orex.save_project, req.path, req.state, req.dataset_ids, req.name)


async def open_(params):
    req = PathRequest.model_validate(params)
    return await asyncio.to_thread(orex.open_project, req.path)


async def inspect(params):
    req = PathRequest.model_validate(params)
    return await asyncio.to_thread(orex.inspect_project, req.path)


PROJECT_METHODS = {'project.save': save, 'project.open': open_, 'project.inspect': inspect}
