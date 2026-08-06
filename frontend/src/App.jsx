import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import SettingsModal from './components/SettingsModal';
import { API_BASE_URL } from './config';

function App() {
  const [auth, setAuth] = useState(() => {
    let storedUserId = localStorage.getItem('nexus_auto_user_id');
    if (!storedUserId) {
      storedUserId = Math.floor(Math.random() * 100000000) + 1000;
      localStorage.setItem('nexus_auto_user_id', storedUserId.toString());
    }
    return { token: 'mock-token', userId: parseInt(storedUserId, 10) };
  });

  // Persist selected channel & session in localStorage across reloads
  const [activeChannel, setActiveChannelState] = useState(() => {
    return localStorage.getItem('active_channel') || 'webchat';
  });

  const [activeSession, setActiveSessionState] = useState(() => {
    return localStorage.getItem('active_session') || `session_${Date.now()}`;
  });

  const [recentSessions, setRecentSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [channelsStatus, setChannelsStatus] = useState({});

  const setActiveChannel = (channel) => {
    setActiveChannelState(channel);
    localStorage.setItem('active_channel', channel);
  };

  const setActiveSession = (session) => {
    setActiveSessionState(session);
    localStorage.setItem('active_session', session);
  };

  const handleNewChat = () => {
    let prefix = 'session_';
    if (activeChannel === 'telegram') {
      const botUser = channelsStatus.telegram?.bot_username || 'bot';
      prefix = `telegram_${botUser}_chat_`;
    } else if (activeChannel === 'whatsapp') {
      prefix = 'whatsapp_chat_';
    }
    const newSessionId = `${prefix}${Date.now()}`;
    setActiveSession(newSessionId);
    setMessages([]);
  };

  const fetchChannelStatus = useCallback(async () => {
    if (!auth) return;
    try {
      const url = auth?.userId ? `${API_BASE_URL}/api/channels/status?user_id=${auth.userId}` : `${API_BASE_URL}/api/channels/status`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setChannelsStatus(data);
      }
    } catch (err) {
      console.error("Failed to load channel status:", err);
    }
  }, [auth]);

  const fetchSessions = useCallback(async () => {
    if (!auth) return;
    try {
      const botUser = activeChannel === 'telegram' ? (channelsStatus.telegram?.bot_username || '') : '';
      const url = `${API_BASE_URL}/v1/sessions?channel=${activeChannel}&user_id=${auth.userId}${botUser ? `&bot_username=${botUser}` : ''}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let sessions = data.sessions || [];
        
        const isValidPrefix = activeSession && activeSession.startsWith(activeChannel === 'webchat' ? 'session_' : `${activeChannel}_`);
        if (activeSession && isValidPrefix && !sessions.includes(activeSession)) {
          sessions = [activeSession, ...sessions];
        }

        setRecentSessions(sessions);
        
        // Auto-select session if there is no active session or the current one doesn't belong to this channel
        if (sessions.length > 0) {
          if (!activeSession || !sessions.includes(activeSession)) {
            setActiveSessionState(sessions[0]);
            localStorage.setItem('active_session', sessions[0]);
          }
        } else {
          // If no sessions exist for this channel, clear active session or start a new one
          if (activeSession && !activeSession.startsWith(activeChannel === 'webchat' ? 'session_' : `${activeChannel}_`)) {
             handleNewChat();
          }
        }
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, [activeChannel, activeSession, auth, channelsStatus]);

  const fetchHistory = useCallback(async (isSilent = false) => {
    if (!auth || !activeSession) return;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/history?channel=${activeChannel}&session_id=${activeSession}`);
      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          const historyMessages = data.messages.map((m, index) => {
            const formattedTs = typeof m.timestamp === 'string' && !m.timestamp.endsWith('Z') && !m.timestamp.includes('+')
              ? `${m.timestamp}Z`
              : m.timestamp;
            return {
              id: `hist_${index}_${m.timestamp || ''}`,
              sender: m.sender,
              text: m.content,
              imageUrl: m.image_url,
              timestamp: m.timestamp ? new Date(formattedTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
            };
          });

          // Only update state if message count or last message content changed to prevent re-render flickers
          setMessages((prev) => {
            if (prev.length !== historyMessages.length || (prev.length > 0 && prev[prev.length - 1].text !== historyMessages[historyMessages.length - 1].text)) {
              return historyMessages;
            }
            return prev;
          });
        } else if (!isSilent) {
          setMessages([]);
        }
      }
    } catch (error) {
      if (!isSilent) console.error("Failed to load history:", error);
    }
  }, [activeChannel, activeSession, auth]);

  // Real-time background sync (polls every 3s for incoming Telegram/WhatsApp messages)
  useEffect(() => {
    if (!auth) return;

    fetchChannelStatus();
    fetchSessions();
    fetchHistory();

    const interval = setInterval(() => {
      fetchChannelStatus();
      fetchSessions();
      fetchHistory(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeChannel, activeSession, auth, fetchChannelStatus, fetchSessions, fetchHistory]);

  const handleSendMessage = async (text, imageFile) => {
    if (!auth) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (imageFile) {
      setIsAnalyzingImage(true);
      setIsTyping(true);

      const tempBlobUrl = URL.createObjectURL(imageFile);
      const newUserMsg = {
        id: Date.now(),
        sender: 'user',
        text,
        imageUrl: tempBlobUrl,
        timestamp,
      };

      setMessages((prev) => [...prev, newUserMsg]);

      try {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('message', text || '');
        formData.append('channel', activeChannel);
        formData.append('session_id', activeSession);
        if (auth.userId) {
          formData.append('user_id', auth.userId);
        }

        const response = await fetch(`${API_BASE_URL}/api/chat/image`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();

          if (data.image_url) {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === newUserMsg.id ? { ...msg, imageUrl: data.image_url } : msg))
            );
          }

          const aiResponse = {
            id: Date.now() + 1,
            sender: 'ai',
            text: data.solution,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, aiResponse]);
          fetchSessions();
        } else {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Server error analyzing image");
        }
      } catch (error) {
        console.error(error);
        const errorResponse = {
          id: Date.now() + 1,
          sender: 'ai',
          text: `Image Analysis Error: ${error.message || "Failed to process image."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorResponse]);
      } finally {
        setIsTyping(false);
        setIsAnalyzingImage(false);
      }

      return;
    }

    setIsAnalyzingImage(false);

    const newUserMsg = {
      id: Date.now(),
      sender: 'user',
      text,
      timestamp,
    };
    
    setMessages((prev) => [...prev, newUserMsg]);
    setIsTyping(true);

    try {
      const response = await fetch(`${API_BASE_URL}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          question: text, 
          channel: activeChannel,
          session_id: activeSession,
          user_id: parseInt(auth.userId)
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiResponse = {
          id: Date.now() + 1,
          sender: 'ai',
          text: data.solution,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiResponse]);
        fetchSessions();
      } else {
        throw new Error("Backend returned an error");
      }
    } catch (error) {
      console.error(error);
      const errorResponse = {
        id: Date.now() + 1,
        sender: 'ai',
        text: "Sorry, I couldn't connect to the backend server. Make sure it's running!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleDeleteSession = async (sessionIdToDelete) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/sessions?session_id=${encodeURIComponent(sessionIdToDelete)}&user_id=${auth.userId}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        setRecentSessions((prev) => prev.filter((id) => id !== sessionIdToDelete));
        if (activeSession === sessionIdToDelete) {
          const remaining = recentSessions.filter((id) => id !== sessionIdToDelete);
          if (remaining.length > 0) {
            setActiveSession(remaining[0]);
          } else {
            handleNewChat();
          }
        }
      } else {
        alert('Failed to delete chat conversation.');
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Error deleting chat conversation.');
    }
  };

  // Removed Login block

  return (
    <div className="app-container">
      <Sidebar 
        activeChannel={activeChannel} 
        setActiveChannel={setActiveChannel}
        recentSessions={recentSessions}
        activeSession={activeSession}
        setActiveSession={setActiveSession}
        handleNewChat={handleNewChat}
        openSettings={() => setIsSettingsOpen(true)}
        onDeleteSession={handleDeleteSession}
        channelsStatus={channelsStatus}
      />
      <div className="main-content">
        <ChatWindow 
          messages={messages} 
          isTyping={isTyping} 
          isAnalyzingImage={isAnalyzingImage}
          activeChannel={activeChannel}
          activeSession={activeSession}
          channelsStatus={channelsStatus}
        />
        <div className="input-container">
          <MessageInput onSendMessage={handleSendMessage} disabled={isTyping} />
        </div>
      </div>
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        auth={auth} 
      />
    </div>
  );
}

export default App;
