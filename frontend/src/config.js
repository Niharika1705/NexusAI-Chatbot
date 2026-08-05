// If VITE_API_URL is set, use it. Otherwise, if on localhost use port 8005, else default to window.location.origin (for Hugging Face Spaces).
const rawUrl = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8005'
    : window.location.origin);

export const API_BASE_URL = rawUrl.replace(/[/]+$/, '');
