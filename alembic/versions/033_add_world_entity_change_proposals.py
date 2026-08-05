"""Add pending chapter-sourced entity change proposals.

Revision ID: 033
Revises: 032
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "world_entity_change_proposals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False, comment="主键"),
        sa.Column("novel_id", sa.Integer(), nullable=False, comment="所属小说"),
        sa.Column("chapter_id", sa.Integer(), nullable=False, comment="来源章节"),
        sa.Column("chapter_number", sa.Integer(), nullable=False, comment="来源章节编号"),
        sa.Column("entity_id", sa.Integer(), nullable=False, comment="待更新实体"),
        sa.Column("entity_name", sa.String(length=255), nullable=False, comment="实体名称快照"),
        sa.Column("summary", sa.Text(), nullable=False, server_default="", comment="变更摘要"),
        sa.Column("evidence", sa.Text(), nullable=False, server_default="", comment="章节证据"),
        sa.Column("delta", sa.JSON(), nullable=False, comment="结构化变更内容"),
        sa.Column("fingerprint", sa.String(length=64), nullable=False, comment="去重指纹"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending", comment="pending/applied/rejected"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True, comment="创建时间"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True, comment="更新时间"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["world_entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["novel_id"], ["novels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("novel_id", "fingerprint", name="uq_world_entity_change_novel_fingerprint"),
    )
    op.create_index(
        "ix_world_entity_change_novel_status",
        "world_entity_change_proposals",
        ["novel_id", "status"],
    )
    op.create_index(
        "ix_world_entity_change_entity_status",
        "world_entity_change_proposals",
        ["entity_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_world_entity_change_entity_status", table_name="world_entity_change_proposals")
    op.drop_index("ix_world_entity_change_novel_status", table_name="world_entity_change_proposals")
    op.drop_table("world_entity_change_proposals")
