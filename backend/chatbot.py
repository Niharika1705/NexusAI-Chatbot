from fastapi import FastAPI, Depends, Request, BackgroundTasks, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from backend.database import engine, get_db, SessionLocal
from backend.models import ChatMessage, Base, User, ImageMetadata, InvalidatedToken
from backend.mistral_client import MistralClient
import requests
import uuid
import time
import os
from backend.config import config
from backend.formatter import format_ai_response
from backend.channels_api import router as channels_router

app = FastAPI(title="NexusAI API Wrapper")
app.include_router(channels_router)

# Mount static file directory for uploaded images
UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
UPLOAD_DIR = os.path.join(UPLOAD_ROOT, "images")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

mistral = MistralClient()

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

def save_message(session_id: str, channel: str, sender: str, content: str, user_id: int = None, image_url: str = None):
    db = SessionLocal()
    try:
        msg = ChatMessage(session_id=session_id, channel=channel, sender=sender, content=content, user_id=user_id, image_url=image_url)
        db.add(msg)
        db.commit()
    finally:
        db.close()

from backend.models import UserChannelConfig

class AskRequest(BaseModel):
    question: str
    channel: str = "webchat"
    session_id: str = "api_ask"
    user_id: Optional[int] = None
    bot_username: Optional[str] = None

class LoginRequest(BaseModel):
    identifier: str
    password: str

class LogoutRequest(BaseModel):
    token: Optional[str] = None
    user_id: Optional[int] = None

@app.post("/v1/auth/logout")
def logout(request: LogoutRequest, db: Session = Depends(get_db)):
    """
    Backend logout endpoint: Blacklists/invalidates the auth token,
    logs the logout event in the DB, and completes server-side session cleanup.
    """
    if request.token:
        existing = db.query(InvalidatedToken).filter(InvalidatedToken.token == request.token).first()
        if not existing:
            invalidated = InvalidatedToken(token=request.token, user_id=request.user_id)
            db.add(invalidated)
            db.commit()
    print(f"[Auth] User ID {request.user_id} logged out from backend.")
    return {"status": "success", "message": "Successfully logged out from backend server."}


class AskResponse(BaseModel):
    solution: str

def get_ai_solution(question: str, channel: str = "webchat") -> str:
    """Uses Mistral AI directly to generate solutions."""
    try:
        raw_solution = mistral.get_solution(question)
        return format_ai_response(raw_solution, channel=channel)
    except Exception as e:
        print(f"[Error] Failed to get AI solution: {e}")
        return f"I encountered an issue generating a response: {str(e)}"

@app.post("/ask", response_model=AskResponse)
def ask_question(request: AskRequest):
    """
    Endpoint to receive a question from terminal / Telegram bot
    and fetch the solution.
    """
    target_user_id = request.user_id

    # If user_id was not explicitly passed in payload, look it up via UserChannelConfig
    if not target_user_id:
        db = SessionLocal()
        try:
            bot_user = request.bot_username
            if not bot_user and "telegram_" in request.session_id:
                parts = request.session_id.split("_")
                if len(parts) >= 3:
                    bot_user = parts[1]
                    
            if bot_user:
                cfg = db.query(UserChannelConfig).filter(UserChannelConfig.telegram_bot_username == bot_user).first()
                if cfg:
                    target_user_id = cfg.user_id
            
            if not target_user_id:
                target_user_id = 1  # Fallback to primary account
        finally:
            db.close()

    solution = get_ai_solution(request.question, channel=request.channel)
    save_message(request.session_id, request.channel, "user", request.question, user_id=target_user_id)
    save_message(request.session_id, request.channel, "ai", solution, user_id=target_user_id)
    return AskResponse(solution=solution)

@app.get("/health")
def health_check():
    return {"status": "ok"}

def process_and_reply_telegram(chat_id: int, question: str):
    """Background task to fetch solution and reply to Telegram."""
    if not config.TELEGRAM_BOT_TOKEN:
        print("[Warning] TELEGRAM_BOT_TOKEN is not configured.")
        return

    session_id = f"telegram_{chat_id}"
    save_message(session_id, "telegram", "user", question)
    solution = get_ai_solution(question, channel="telegram")
    save_message(session_id, "telegram", "ai", solution)
    telegram_api_url = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        requests.post(telegram_api_url, json={
            "chat_id": chat_id,
            "text": solution,
            "parse_mode": "HTML"
        }, timeout=10)
    except Exception as e:
        print(f"[Error] Failed to send Telegram message: {e}")

@app.post("/telegram-webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    message = data.get("message") or data.get("edited_message")
    if message and "text" in message:
        chat_id = message["chat"]["id"]
        question = message["text"]
        background_tasks.add_task(process_and_reply_telegram, chat_id, question)
    return {"status": "ok"}

import re
import shutil

def clean_user_message(raw_text: str) -> str:
    if not raw_text:
        return ""
    cleaned = raw_text
    cleaned = re.sub(r'\[media attached:.*?\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[Image\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[WhatsApp.*?\]\s*\(self\):?\s*<media:image>?', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'<media:image>', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'```[\s\S]*?```', '', cleaned)
    cleaned = re.sub(r'\[.*?\]\s*Conversation info.*?:?', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'Sender\s*\(.*?\):?', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\(untrusted metadata\):?', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'User text:', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'Description:', '', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    return cleaned if cleaned else "Analyze and solve the problem shown in the attached image."



ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/jpg", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

@app.post("/api/chat/image")
async def chat_image(
    image: UploadFile = File(...),
    message: str = Form(""),
    session_id: str = Form("default"),
    channel: str = Form("webchat"),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        content_type = image.content_type.lower() if image.content_type else ""
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail="Invalid image format. Allowed formats: JPG, JPEG, PNG, WEBP.")

        contents = await image.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Image size exceeds maximum 10 MB limit.")

        ext = content_type.split("/")[-1]
        if ext == "jpeg":
            ext = "jpg"
        filename = f"{uuid.uuid4().hex}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, filename)

        with open(file_path, "wb") as f:
            f.write(contents)

        rel_image_url = f"/uploads/images/{filename}"

        img_meta = ImageMetadata(
            session_id=session_id,
            user_id=user_id,
            filename=filename,
            file_path=file_path,
            mime_type=content_type
        )
        db.add(img_meta)
        db.commit()

        display_question = message.strip() if (message and message.strip()) else "Analyze this uploaded image in detail."
        save_message(session_id, channel, "user", display_question, user_id=user_id, image_url=rel_image_url)

        raw_solution = mistral.get_solution_with_image(display_question, contents, content_type)
        solution = format_ai_response(raw_solution, channel=channel)
        save_message(session_id, channel, "ai", solution, user_id=user_id)

        return {
            "solution": solution,
            "image_url": rel_image_url
        }
    except Exception as e:
        print(f"[Error in /api/chat/image] {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/history")
def get_history(channel: str, session_id: str = None, db: Session = Depends(get_db)):
    query = db.query(ChatMessage).filter(ChatMessage.channel == channel)
    if session_id:
        query = query.filter(ChatMessage.session_id == session_id)
    messages = query.order_by(ChatMessage.timestamp).all()
    return {
        "messages": [
            {
                "sender": m.sender,
                "content": m.content,
                "image_url": m.image_url,
                "timestamp": (m.timestamp.isoformat() + "Z") if m.timestamp else None
            }
            for m in messages
        ]
    }

@app.post("/v1/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.email == request.identifier) | (User.mobile == request.identifier)
    ).first()
    
    if not user:
        # Auto-register for demo purposes if user doesn't exist
        user = User(
            email=request.identifier if '@' in request.identifier else None,
            mobile=request.identifier if '@' not in request.identifier else None,
            password_hash=request.password
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.password_hash != request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    return {"token": f"fake-jwt-{user.id}", "user_id": user.id, "email": user.email, "mobile": user.mobile}

@app.get("/v1/sessions")
def get_sessions(channel: str, user_id: int = None, bot_username: str = None, db: Session = Depends(get_db)):
    query = db.query(ChatMessage.session_id, func.max(ChatMessage.timestamp).label('last_msg')).filter(ChatMessage.channel == channel)
    
    if user_id:
        query = query.filter(ChatMessage.user_id == user_id)
    else:
        return {"sessions": []}

    sessions = query.group_by(ChatMessage.session_id).order_by(func.max(ChatMessage.timestamp).desc()).all()
    return {"sessions": [s[0] for s in sessions if s[0]]}

@app.delete("/v1/sessions")
def delete_session(session_id: str, user_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """
    Deletes all ChatMessage history for a given session_id (scoped by user_id if provided).
    """
    query = db.query(ChatMessage).filter(ChatMessage.session_id == session_id)
    if user_id:
        query = query.filter(ChatMessage.user_id == user_id)
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"status": "ok", "deleted": deleted, "session_id": session_id}

# Mount React Frontend
import os
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    print(f"[Warning] Frontend dist directory not found at {FRONTEND_DIR}. Frontend will not be served.")