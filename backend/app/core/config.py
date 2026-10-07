from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "dev" enables browser sign-in without Telegram; "test" disables connection pooling
    app_env: str = "prod"
    database_url: str = "postgresql+asyncpg://careerflow:careerflow_dev@db:5432/careerflow"
    public_url: str = "http://localhost:8090"
    admin_password: str = ""
    secrets_dir: str = "/data/secrets"
    static_dir: str = "/app/static"

    init_data_max_age: int = 86400          # seconds a Telegram launch stays valid
    peer_approvals_required: int = 1          # pilot: small groups; raise it in the admin page as groups grow
    review_points: int = 2                  # reward for reviewing a peer's work


settings = Settings()
