import os
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=env_path, override=False)

class Config:
    FASTAPI_HOST = os.getenv("FASTAPI_HOST", "0.0.0.0")
    FASTAPI_PORT = int(os.getenv("FASTAPI_PORT", 8005))
    WHATSAPP_SERVICE_PORT = int(os.getenv("WHATSAPP_SERVICE_PORT", 8006))
    WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", f"http://127.0.0.1:{os.getenv('WHATSAPP_SERVICE_PORT', 8006)}").rstrip('/')
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
    MISTRAL_MODEL = os.getenv("MISTRAL_MODEL", "mistral-small-latest")
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nexusai.db")
    
    # If running on Render and the database URL is still pointing to localhost, fallback to SQLite
    if os.getenv("RENDER") and "127.0.0.1" in DATABASE_URL:
        DATABASE_URL = "sqlite:///./nexusai.db"

config = Config()

def update_env_key(key: str, value: str):
    """Safely updates or removes a key in the workspace .env file and reloads config."""
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    lines = []
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
    key_found = False
    new_lines = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            key_found = True
            if value:
                new_lines.append(f"{key}={value}\n")
        else:
            new_lines.append(line)
            
    if not key_found and value:
        new_lines.append(f"\n{key}={value}\n")
        
    with open(env_file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    load_dotenv(dotenv_path=env_file, override=True)
    if key == "TELEGRAM_BOT_TOKEN":
        config.TELEGRAM_BOT_TOKEN = value

