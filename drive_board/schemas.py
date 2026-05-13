from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class ActorCreate(BaseModel):
    kind: str = Field(pattern="^(user|agent)$")
    username: str | None = None
    actor_id: str | None = None
    display_name: str
    password: str | None = None
    token: str | None = None
    is_admin: bool = False


class WorkspaceCreate(BaseModel):
    name: str
    kind: str = Field(default="share_group", pattern="^(share_group)$")


class MemberUpdate(BaseModel):
    actor_id: str
    permission: str = Field(pattern="^(read|write|owner)$")


class FolderCreate(BaseModel):
    workspace: str
    path: str


class TextWrite(BaseModel):
    workspace: str
    path: str
    content: str


class ShareCreate(BaseModel):
    workspace: str
    path: str = ""
    actor_id: str
    permission: str = Field(pattern="^(read|write)$")
