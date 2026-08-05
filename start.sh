#!/bin/bash
# Start Node.js WhatsApp Service in the background
export FASTAPI_URL="http://127.0.0.1:${PORT:-10000}"
export FASTAPI_PORT="${PORT:-10000}"
npm run start:wa &

# Start Python FastAPI server in the foreground
python -m uvicorn backend.chatbot:app --host 0.0.0.0 --port ${PORT:-10000}
