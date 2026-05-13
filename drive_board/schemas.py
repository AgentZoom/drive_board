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


class ActorUpdate(BaseModel):
    display_name: str | None = None
    password: str | None = None
    token: str | None = None
    is_admin: bool | None = None
    is_active: bool | None = None


class SelfUpdate(BaseModel):
    display_name: str | None = None
    password: str | None = None


class MemberUpdate(BaseModel):
    actor_id: str
    permission: str = Field(pattern="^(read|write|owner)$")


class WorkspaceCreate(BaseModel):
    name: str
    kind: str = Field(default="share_group", pattern="^(share_group)$")
    members: list[MemberUpdate] = Field(default_factory=list)


class FolderCreate(BaseModel):
    workspace: str
    path: str


class TextWrite(BaseModel):
    workspace: str
    path: str
    content: str


class PathCopyOrMove(BaseModel):
    workspace: str
    source_path: str
    destination_path: str


class PathRename(BaseModel):
    workspace: str
    path: str
    new_name: str


class ShareCreate(BaseModel):
    workspace: str
    path: str = ""
    actor_id: str
    permission: str = Field(pattern="^(read|write)$")


class PublicLinkCreate(BaseModel):
    workspace: str
    path: str
