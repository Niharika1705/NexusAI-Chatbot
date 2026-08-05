from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    mobile = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=True)
    session_id = Column(String, index=True, nullable=False)
    channel = Column(String, index=True, nullable=False, server_default='webchat')
    sender = Column(String, nullable=False) # 'user' or 'ai'
    content = Column(Text, nullable=False)
    image_url = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class ImageMetadata(Base):
    __tablename__ = "image_metadata"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

class UserChannelConfig(Base):
    __tablename__ = "user_channel_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, unique=True, nullable=False)
    telegram_bot_token = Column(String, nullable=True)
    telegram_bot_username = Column(String, nullable=True)
    whatsapp_phone = Column(String, nullable=True)
    twilio_account_sid = Column(String, nullable=True)
    twilio_auth_token = Column(String, nullable=True)
    twilio_whatsapp_number = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class InvalidatedToken(Base):
    __tablename__ = "invalidated_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=True)
    invalidated_at = Column(DateTime, default=datetime.utcnow)


