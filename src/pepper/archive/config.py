"""Configuration via pydantic-settings, loaded from environment / .env.

A single ``Settings`` object is built once (``Settings.load()``) and threaded
through the CLI into every stage. No module-level globals, so tests stay
hermetic by constructing their own ``Settings`` pointing at a temp dir.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .errors import CredentialsMissing


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PEPPER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # subject
    reddit_username: str = "newppinpoint"
    data_dir: Path = Path("./data")

    # Reddit OAuth (PRAW). client_id/secret blank => public-sources-only mode.
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "pepper-archive/0.1"
    reddit_password: str = ""

    # Anthropic (dossier). Not prefixed with PEPPER_ by convention.
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    llm_model: str = "claude-sonnet-5"
    llm_price_input_per_mtok: float = 3.0
    llm_price_output_per_mtok: float = 15.0

    # rate limits
    rl_praw_per_min: float = 55.0
    rl_arcticshift_per_sec: float = 1.0
    rl_pullpush_per_sec: float = 0.2

    # feature flags
    include_deleted: bool = True

    # ── derived paths ──
    @property
    def db_path(self) -> Path:
        return self.data_dir / "pepper.sqlite"

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def gdpr_dir(self) -> Path:
        return self.raw_dir / "gdpr"

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def dossier_dir(self) -> Path:
        return self.data_dir / "dossier"

    @property
    def nltk_dir(self) -> Path:
        return self.data_dir / "nltk_data"

    # ── capability checks ──
    def has_reddit_api(self) -> bool:
        return bool(self.reddit_client_id and self.reddit_client_secret)

    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    def require_reddit_api(self) -> None:
        if not self.has_reddit_api():
            raise CredentialsMissing(
                "Reddit API credentials missing. Set PEPPER_REDDIT_CLIENT_ID and "
                "PEPPER_REDDIT_CLIENT_SECRET in .env (register a 'script' app at "
                "https://old.reddit.com/prefs/apps)."
            )

    def require_anthropic(self) -> None:
        if not self.has_anthropic():
            raise CredentialsMissing(
                "ANTHROPIC_API_KEY missing. Set it in .env to run the dossier stage."
            )

    @classmethod
    def load(cls) -> Settings:
        return cls()

    def ensure_dirs(self) -> None:
        for path in (
            self.data_dir,
            self.raw_dir,
            self.gdpr_dir,
            self.raw_dir / "arcticshift",
            self.raw_dir / "pullpush",
            self.media_dir / "by-hash",
            self.exports_dir,
            self.dossier_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)
