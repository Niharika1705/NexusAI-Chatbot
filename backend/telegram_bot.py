import sys
import os
import requests
import asyncio
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

# Ensure workspace root is in python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.config import config

API_URL = f"http://localhost:{config.FASTAPI_PORT}/ask"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Hello! I am your NexusAI Chatbot. Ask me anything!")

from telegram.constants import ParseMode

async def send_telegram_reply(update: Update, answer: str):
    """Sends clean markdown formatted message to Telegram."""
    try:
        await update.message.reply_text(answer)
    except Exception as e:
        print(f"[Error sending Telegram message]: {e}")
        await update.message.reply_text(answer)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_question = update.message.text
    chat_id = update.message.chat_id
    if not user_question:
        return
        
    bot_username = context.bot.username or "bot"
    session_id = f"telegram_{bot_username}_{chat_id}"

    await update.message.reply_text("Thinking...")

    try:
        # Send user message to FastAPI backend in a thread executor to avoid blocking event loop
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(
            None,
            lambda: requests.post(API_URL, json={
                "question": user_question, 
                "channel": "telegram",
                "session_id": session_id,
                "bot_username": bot_username
            }, timeout=60)
        )
        if res.status_code == 200:
            answer = res.json().get("solution", "No solution returned.")
        else:
            answer = f"Backend error (Status code: {res.status_code})"
    except Exception as e:
        answer = f"Error connecting to backend ({API_URL}): {str(e)}"

    await send_telegram_reply(update, answer)

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.message.chat_id
    caption = update.message.caption or ""
    
    if not update.message.photo:
        return
        
    bot_username = context.bot.username or "bot"
    session_id = f"telegram_{bot_username}_{chat_id}"

    await update.message.reply_text("Analyzing image with Vision AI...")

    try:
        # Download highest resolution photo from Telegram
        photo_item = update.message.photo[-1]
        telegram_file = await context.bot.get_file(photo_item.file_id)
        image_bytes = await telegram_file.download_as_bytearray()

        loop = asyncio.get_running_loop()
        image_url = f"http://localhost:{config.FASTAPI_PORT}/api/chat/image"

        files = {'image': ('telegram_photo.jpg', bytes(image_bytes), 'image/jpeg')}
        data = {
            'message': caption,
            'channel': 'telegram',
            'session_id': session_id
        }

        res = await loop.run_in_executor(
            None,
            lambda: requests.post(image_url, files=files, data=data, timeout=90)
        )

        if res.status_code == 200:
            answer = res.json().get("solution", "No solution returned.")
        else:
            answer = f"Backend error analyzing photo (Status: {res.status_code})"
    except Exception as e:
        answer = f"Error processing Telegram photo: {str(e)}"

    await send_telegram_reply(update, answer)

from telegram.request import HTTPXRequest
from telegram.error import Conflict
import argparse

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if isinstance(context.error, Conflict):
        print(f"[Telegram Bot] Conflict detected: another listener for this bot is running. Terminating gracefully.")
        sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="NexusAI Telegram Bot Listener")
    parser.add_argument("--token", type=str, help="Telegram Bot Token", default=None)
    args, _ = parser.parse_known_args()

    token = args.token or os.environ.get("TELEGRAM_BOT_TOKEN") or config.TELEGRAM_BOT_TOKEN
    if not token:
        print("[Error] TELEGRAM_BOT_TOKEN is not provided via --token argument, env, or .env")
        sys.exit(1)

    print("=" * 60)
    print("NexusAI Telegram Bot Listener Starting...")
    print(f"Targeting FastAPI Backend: {API_URL}")
    print("=" * 60)

    request_opts = HTTPXRequest(connect_timeout=30, read_timeout=30)
    app = ApplicationBuilder().token(token).request(request_opts).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_error_handler(error_handler)

    print("Bot is listening for text and photo messages on Telegram... Press Ctrl+C to stop.")
    try:
        app.run_polling(drop_pending_updates=True)
    except Conflict:
        print("[Telegram Bot] Conflict detected. Listener terminating gracefully.")
        sys.exit(0)
    except Exception as e:
        if "Conflict" in str(e) or "terminated by other getUpdates" in str(e):
            print("[Telegram Bot] Conflict detected. Listener terminating gracefully.")
            sys.exit(0)
        else:
            print(f"[Telegram Bot Exit]: {e}")

if __name__ == "__main__":
    main()
