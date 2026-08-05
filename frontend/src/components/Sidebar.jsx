import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Phone, Search, Settings, LogOut, Plus, MoreVertical, Pin, Trash2 } from 'lucide-react';

export default function Sidebar({ 
  activeChannel, 
  setActiveChannel, 
  recentSessions, 
  activeSession, 
  setActiveSession,
  handleNewChat,
  handleLogout,
  openSettings,
  onDeleteSession,
  channelsStatus = {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuSessionId, setOpenMenuSessionId] = useState(null);
  const [pinnedSessions, setPinnedSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('nexus_pinned_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const menuRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('nexus_pinned_sessions', JSON.stringify(pinnedSessions));
    } catch (e) {
      console.error(e);
    }
  }, [pinnedSessions]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuSessionId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePinSession = (sessionId, e) => {
    e.stopPropagation();
    setPinnedSessions((prev) => 
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
    setOpenMenuSessionId(null);
  };

  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    setOpenMenuSessionId(null);
    if (window.confirm('Are you sure you want to delete this chat conversation?')) {
      if (onDeleteSession) {
        onDeleteSession(sessionId);
      }
    }
  };

  const getBotSubtitle = (channelId) => {
    if (channelId === 'webchat') return 'NexusAI Web Assistant';
    if (channelId === 'telegram') {
      return channelsStatus.telegram?.connected && channelsStatus.telegram?.bot_username
        ? `@${channelsStatus.telegram.bot_username}`
        : 'Not Configured';
    }
    if (channelId === 'whatsapp') {
      return channelsStatus.whatsapp?.connected
        ? (channelsStatus.whatsapp.phone || 'Linked')
        : 'Disconnected';
    }
    return '';
  };

  const isConnected = (channelId) => {
    if (channelId === 'webchat') return true;
    if (channelId === 'telegram') return !!channelsStatus.telegram?.connected;
    if (channelId === 'whatsapp') return !!channelsStatus.whatsapp?.connected;
    return false;
  };

  const channels = [
    { id: 'webchat', name: 'Web Assistant', icon: <MessageSquare size={16} />, colorClass: 'web' },
    { id: 'telegram', name: 'Telegram Bot', icon: <Send size={16} />, colorClass: 'telegram' },
    { id: 'whatsapp', name: 'WhatsApp Bot', icon: <Phone size={16} />, colorClass: 'whatsapp' },
  ];

  const getChannelLabel = () => {
    if (activeChannel === 'telegram') return 'TELEGRAM CHATS';
    if (activeChannel === 'whatsapp') return 'WHATSAPP CHATS';
    return 'WEB CHATS';
  };

  const formatSessionLabel = (sessionId) => {
    if (sessionId.startsWith('telegram_')) {
      if (sessionId === 'telegram_5968608339') {
        return 'Gogi Bot (5968608339)';
      }
      const parts = sessionId.split('_');
      if (parts.length >= 3) {
        const rawBotUser = parts[1];
        const chatTarget = parts[parts.length - 1];
        
        let cleanBotName = rawBotUser.replace(/_bot$/i, '').replace(/bot$/i, '');
        if (cleanBotName.toLowerCase() === 'mayaautomation') cleanBotName = 'Maya';
        else if (cleanBotName.toLowerCase() === 'kiraautomation') cleanBotName = 'Kira';
        else if (cleanBotName) {
          cleanBotName = cleanBotName.charAt(0).toUpperCase() + cleanBotName.slice(1);
        } else {
          cleanBotName = 'Telegram';
        }
        return `${cleanBotName} Bot (${chatTarget})`;
      } else {
        const chatTarget = parts[parts.length - 1] || 'User';
        return `Gogi Bot (${chatTarget})`;
      }
    }
    if (sessionId.startsWith('whatsapp_')) {
      const chatTarget = sessionId.replace('whatsapp_', '');
      return `WhatsApp (${chatTarget})`;
    }
    return `Session ${sessionId.slice(-6)}`;
  };

  // Sort sessions so pinned ones appear first
  const sortedSessions = [...recentSessions].sort((a, b) => {
    const isAPinned = pinnedSessions.includes(a);
    const isBPinned = pinnedSessions.includes(b);
    if (isAPinned && !isBPinned) return -1;
    if (!isAPinned && isBPinned) return 1;
    return 0;
  });

  const filteredSessions = sortedSessions.filter(sessionId => 
    formatSessionLabel(sessionId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>
          <div className="logo-glow"></div>
          NexusAI
        </h1>
        
        <div className="search-bar">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search conversations..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-scrollable">
        <div className="bot-sections-header">BOT & CHANNELS</div>
        <div className="channel-list">
          {channels.map((channel) => {
            const connected = isConnected(channel.id);
            const subtitle = getBotSubtitle(channel.id);

            return (
              <div 
                key={channel.id}
                className={`channel-item ${activeChannel === channel.id ? 'active' : ''}`}
                onClick={() => setActiveChannel(channel.id)}
              >
                <div className={`channel-icon ${channel.colorClass}`}>
                  {channel.icon}
                </div>
                <div className="channel-info">
                  <div className="channel-name-row">
                    <span className="channel-name">{channel.name}</span>
                    <span className={`channel-status-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Connected' : 'Disconnected'} />
                  </div>
                  <span className="channel-subtitle">{subtitle}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="recent-section">
          <div className="recent-header">
            <h2>{getChannelLabel()}</h2>
            <Plus size={14} className="add-icon" onClick={handleNewChat} title="Start new chat" />
          </div>
          <div className="recent-list">
            {recentSessions.length === 0 && (
              <div className="recent-item empty-state">No active chats in this section</div>
            )}
            {recentSessions.length > 0 && filteredSessions.length === 0 && (
              <div className="recent-item empty-state">No results found</div>
            )}
            {filteredSessions.map((sessionId) => {
              const isPinned = pinnedSessions.includes(sessionId);
              const isMenuOpen = openMenuSessionId === sessionId;

              return (
                <div 
                  key={sessionId} 
                  className={`recent-item ${activeSession === sessionId ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
                  onClick={() => setActiveSession(sessionId)}
                  title={sessionId}
                >
                  <div className="recent-item-content">
                    {isPinned && <Pin size={12} className="pinned-icon-badge" />}
                    <span className="recent-item-title">{formatSessionLabel(sessionId)}</span>
                  </div>

                  <div className="session-menu-wrapper" ref={isMenuOpen ? menuRef : null}>
                    <button 
                      className="three-dots-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuSessionId(isMenuOpen ? null : sessionId);
                      }}
                      title="Options"
                    >
                      <MoreVertical size={14} />
                    </button>

                    {isMenuOpen && (
                      <div className="session-dropdown-menu">
                        <button 
                          className="dropdown-item"
                          onClick={(e) => togglePinSession(sessionId, e)}
                        >
                          <Pin size={13} />
                          <span>{isPinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                        </button>

                        <button 
                          className="dropdown-item delete-item"
                          onClick={(e) => handleDeleteSession(sessionId, e)}
                        >
                          <Trash2 size={13} />
                          <span>Delete Chat</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="footer-item" onClick={openSettings}>
          <Settings size={16} />
          <span>Settings & Integrations</span>
        </div>
        <div className="footer-item logout" onClick={handleLogout}>
          <LogOut size={16} />
          <span>Logout</span>
        </div>
      </div>
    </aside>
  );
}
