from fastapi import APIRouter, HTTPException, Depends, Query, Request, Response
from pydantic import BaseModel
from typing import Optional
import requests
import os
import sys
import subprocess
import json
import re
from backend.config import config, update_env_key
from backend.database import SessionLocal
from backend.models import UserChannelConfig

router = APIRouter(prefix="/api/channels", tags=["Channels"])

# Map of running Telegram bot listeners keyed by bot_token
running_bot_listeners = {}

def get_running_telegram_bot_pids(token: str) -> list:
    """Inspects running OS processes for active telegram_bot listeners matching this bot token."""
    try:
        pids = []
        if sys.platform == "win32":
            cmd = f'powershell -Command "Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like \'*backend.telegram_bot*--token {token}*\' }} | Select-Object ProcessId, CommandLine"'
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            for line in proc.stdout.splitlines():
                if "backend.telegram_bot" in line and token in line:
                    match = re.search(r'^\s*(\d+)', line)
                    if match:
                        pids.append(int(match.group(1)))
        else:
            cmd = f'ps -ef | grep backend.telegram_bot | grep {token} | grep -v grep'
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            for line in proc.stdout.splitlines():
                parts = line.split()
                if len(parts) > 1:
                    pids.append(int(parts[1]))
        return pids
    except Exception:
        return []

def kill_orphaned_telegram_bot_process(token: str):
    """Kills any orphaned background python process running telegram_bot for the given token."""
    pids = get_running_telegram_bot_pids(token)
    for pid in pids:
        try:
            if sys.platform == "win32":
                subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
            else:
                subprocess.run(f"kill -9 {pid}", shell=True, capture_output=True)
            print(f"[Telegram Bot Manager] Terminated orphaned bot listener PID {pid}")
        except Exception:
            pass

def sync_telegram_listener_for_token(token: str, enable: bool = True):
    """
    Spawns or terminates a background Telegram bot listener process for a specific bot token.
    """
    global running_bot_listeners
    
    if not token:
        return

    pids = get_running_telegram_bot_pids(token)

    if enable:
        if pids:
            return

        try:
            cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            env = os.environ.copy()
            env["TELEGRAM_BOT_TOKEN"] = token
            
            kwargs = {}
            if sys.platform == "win32":
                kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            
            log_file = open(os.path.join(cwd, "telegram_bot_crash.log"), "a")
            proc = subprocess.Popen(
                [sys.executable, "-m", "backend.telegram_bot", "--token", token],
                cwd=cwd,
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                **kwargs
            )
            running_bot_listeners[token] = proc
            print(f"[Telegram Bot Manager] Launched listener for token {token[:10]}... (PID {proc.pid})")
        except Exception as e:
            print(f"[Error] Failed to spawn Telegram bot process for token {token[:10]}...: {e}")
    else:
        if token in running_bot_listeners:
            try:
                proc = running_bot_listeners[token]
                proc.terminate()
            except Exception:
                pass
            del running_bot_listeners[token]

        kill_orphaned_telegram_bot_process(token)

class TelegramConnectRequest(BaseModel):
    bot_token: str
    user_id: Optional[int] = None

class TelegramDisconnectRequest(BaseModel):
    user_id: Optional[int] = None

@router.get("/status")
def get_channels_status(user_id: Optional[int] = Query(None)):
    """
    Returns real-time connection status for Telegram and WhatsApp, scoped by user_id.
    """
    uid = user_id or 1
    telegram_info = {
        "connected": False,
        "bot_username": None,
        "first_name": None,
        "message": "Not configured"
    }

    target_token = None
    if user_id:
        db = SessionLocal()
        try:
            cfg = db.query(UserChannelConfig).filter(UserChannelConfig.user_id == user_id).first()
            if cfg and cfg.telegram_bot_token:
                target_token = cfg.telegram_bot_token
                if cfg.telegram_bot_username:
                    telegram_info["bot_username"] = cfg.telegram_bot_username
        finally:
            db.close()
    else:
        target_token = config.TELEGRAM_BOT_TOKEN

    if target_token:
        try:
            res = requests.get(f"https://api.telegram.org/bot{target_token}/getMe", timeout=8)
            if res.status_code == 200 and res.json().get("ok"):
                bot_data = res.json().get("result", {})
                telegram_info["connected"] = True
                telegram_info["bot_username"] = bot_data.get("username")
                telegram_info["first_name"] = bot_data.get("first_name")
                telegram_info["message"] = f"Connected as @{bot_data.get('username')}"
                
                proc = running_bot_listeners.get(target_token)
                if not proc or proc.poll() is not None:
                    sync_telegram_listener_for_token(target_token, enable=True)
            else:
                telegram_info["message"] = f"Invalid Token (HTTP {res.status_code})"
        except Exception as e:
            telegram_info["message"] = f"Telegram Check Failed: {str(e)}"
    else:
        telegram_info["message"] = "No Telegram bot token connected for this account."

    # Query WhatsApp Web Service (Port 8006)
    whatsapp_info = {
        "connected": False,
        "phone": "Disconnected"
    }
    try:
        wa_res = requests.get(f"{config.WHATSAPP_SERVICE_URL}/api/wa/status?user_id={uid}", timeout=4)
        if wa_res.status_code == 200:
            data = wa_res.json()
            whatsapp_info["connected"] = data.get("connected", False)
            whatsapp_info["phone"] = data.get("phone") or ("Connected" if data.get("connected") else "Disconnected")
    except Exception as e:
        whatsapp_info["phone"] = "Service Offline (Start whatsapp_service.js)"

    return {
        "telegram": telegram_info,
        "whatsapp": whatsapp_info
    }



@router.get("/whatsapp/qr")
def get_whatsapp_qr(user_id: Optional[int] = Query(None), force: bool = Query(False)):
    """
    Fetches real-time WhatsApp Web QR Code Base64 PNG for user_id.
    """
    uid = user_id or 1
    try:
        res = requests.get(f"{config.WHATSAPP_SERVICE_URL}/api/wa/qr?user_id={uid}&force={'true' if force else 'false'}", timeout=100)
        if res.status_code == 200:
            return res.json()
        else:
            raise HTTPException(status_code=500, detail="Failed to fetch WhatsApp QR Code from WhatsApp Web Service.")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"WhatsApp Web Service is not reachable on port {config.WHATSAPP_SERVICE_PORT}: {str(e)}")


@router.post("/whatsapp/disconnect")
def disconnect_whatsapp(user_id: Optional[int] = Query(None)):
    """
    Logs out and unlinks WhatsApp session for user_id.
    """
    uid = user_id or 1
    try:
        res = requests.post(f"{config.WHATSAPP_SERVICE_URL}/api/wa/logout?user_id={uid}", timeout=10)
        
        # Clear DB whatsapp_phone
        db = SessionLocal()
        try:
            cfg = db.query(UserChannelConfig).filter(UserChannelConfig.user_id == uid).first()
            if cfg:
                cfg.whatsapp_phone = None
                db.commit()
        finally:
            db.close()

        if res.status_code == 200:
            return res.json()
        return {"status": "success", "message": "WhatsApp session cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/telegram/connect")
def connect_telegram(req: TelegramConnectRequest):
    """
    Verifies and connects a Telegram Bot Token for a specific user.
    """
    token = req.bot_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Telegram bot token cannot be empty.")
        
    try:
        res = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=10)
        if res.status_code == 200 and res.json().get("ok"):
            bot_data = res.json().get("result", {})
            username = bot_data.get("username")
            first_name = bot_data.get("first_name")
            
            if req.user_id:
                db = SessionLocal()
                try:
                    cfg = db.query(UserChannelConfig).filter(UserChannelConfig.user_id == req.user_id).first()
                    if not cfg:
                        cfg = UserChannelConfig(user_id=req.user_id)
                        db.add(cfg)
                    
                    old_token = cfg.telegram_bot_token
                    if old_token and old_token != token:
                        sync_telegram_listener_for_token(old_token, enable=False)

                    cfg.telegram_bot_token = token
                    cfg.telegram_bot_username = username
                    db.commit()
                finally:
                    db.close()

            update_env_key("TELEGRAM_BOT_TOKEN", token)
            sync_telegram_listener_for_token(token, enable=True)
            
            return {
                "status": "connected",
                "message": f"Successfully connected to @{username}",
                "bot_username": username,
                "first_name": first_name
            }
        else:
            raise HTTPException(status_code=400, detail="Invalid Telegram Bot Token. Verification failed.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify Telegram token: {str(e)}")

@router.post("/telegram/disconnect")
def disconnect_telegram(req: TelegramDisconnectRequest = None):
    """
    Disconnects Telegram bot token for a user.
    """
    user_id = req.user_id if req else None
    if user_id:
        db = SessionLocal()
        try:
            cfg = db.query(UserChannelConfig).filter(UserChannelConfig.user_id == user_id).first()
            if cfg and cfg.telegram_bot_token:
                sync_telegram_listener_for_token(cfg.telegram_bot_token, enable=False)
                cfg.telegram_bot_token = None
                cfg.telegram_bot_username = None
                db.commit()
        finally:
            db.close()
    else:
        current_token = config.TELEGRAM_BOT_TOKEN
        if current_token:
            sync_telegram_listener_for_token(current_token, enable=False)
        update_env_key("TELEGRAM_BOT_TOKEN", "")

    return {"status": "disconnected", "message": "Telegram Bot token removed successfully."}
