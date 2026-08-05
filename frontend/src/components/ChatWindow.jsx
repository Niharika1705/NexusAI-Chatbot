import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Phone, Sparkles } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function ChatWindow({ 
  messages, 
  isTyping, 
  isAnalyzingImage,
  activeChannel = 'webchat',
  activeSession = '',
  channelsStatus = {}
}) {
  const messagesEndRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const getFullImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      return url;
    }
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const getHeaderDetails = () => {
    if (activeChannel === 'telegram') {
      let botDisplayName = channelsStatus.telegram?.bot_username ? `@${channelsStatus.telegram.bot_username}` : 'Telegram Bot';
      if (activeSession && activeSession.startsWith('telegram_')) {
        if (activeSession === 'telegram_5968608339') {
          botDisplayName = 'Gogi Bot (5968608339)';
        } else {
          const parts = activeSession.split('_');
          if (parts.length >= 3) {
            const rawBotUser = parts[1];
            let cleanBotName = rawBotUser.replace(/_bot$/i, '').replace(/bot$/i, '');
            if (cleanBotName.toLowerCase() === 'mayaautomation') cleanBotName = 'Maya';
            else if (cleanBotName.toLowerCase() === 'kiraautomation') cleanBotName = 'Kira';
            else if (cleanBotName) {
              cleanBotName = cleanBotName.charAt(0).toUpperCase() + cleanBotName.slice(1);
            }
            botDisplayName = `@${rawBotUser} (${cleanBotName} Bot)`;
          }
        }
      }
      return {
        title: `Telegram Chat (${botDisplayName})`,
        subtitle: channelsStatus.telegram?.connected ? 'Live Syncing & Active' : 'Disconnected / Token Required',
        icon: <Send size={18} className="channel-icon telegram" />,
        badgeClass: channelsStatus.telegram?.connected ? 'connected' : 'disconnected'
      };
    }
    if (activeChannel === 'whatsapp') {
      const phone = channelsStatus.whatsapp?.phone || 'WhatsApp Web';
      return {
        title: `WhatsApp Bot Section (${phone})`,
        subtitle: channelsStatus.whatsapp?.connected ? 'Direct WhatsApp Web Connected' : 'Disconnected / QR Pairing Required',
        icon: <Phone size={18} className="channel-icon whatsapp" />,
        badgeClass: channelsStatus.whatsapp?.connected ? 'connected' : 'disconnected'
      };
    }
    return {
      title: 'NexusAI Web Assistant',
      subtitle: 'Powered by Mistral AI Engine',
      icon: <MessageSquare size={18} className="channel-icon web" />,
      badgeClass: 'connected'
    };
  };

  const header = getHeaderDetails();

  return (
    <div className="chat-window-container">
      {/* Top Bot Header Bar */}
      <div className="chat-header-bar">
        <div className="chat-header-info">
          <div className="chat-header-icon-wrapper">
            {header.icon}
          </div>
          <div>
            <div className="chat-header-title">{header.title}</div>
            <div className="chat-header-subtitle">{header.subtitle}</div>
          </div>
        </div>
        <div className="chat-header-meta">
          <span className={`status-pill-badge ${header.badgeClass}`}>
            <Sparkles size={11} /> {header.badgeClass.toUpperCase()}
          </span>
          {activeSession && (
            <span className="session-id-pill">
              Session: {activeSession.startsWith('telegram_') ? activeSession.replace('telegram_', '') : activeSession.startsWith('whatsapp_') ? activeSession.replace('whatsapp_', '') : activeSession.slice(-8)}
            </span>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="chat-window">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender} animate-slide-up`}>
            <div className="message-bubble">
              {msg.imageUrl && (
                <div className="chat-message-image-container">
                  <img 
                    src={getFullImageUrl(msg.imageUrl)} 
                    alt="Uploaded content" 
                    className="chat-message-image"
                    onClick={() => setSelectedImage(getFullImageUrl(msg.imageUrl))}
                  />
                </div>
              )}
              {msg.text && <div className="message-text-content">{msg.text}</div>}
            </div>
            <div className="message-time">{msg.timestamp}</div>
          </div>
        ))}
        
        {isTyping && (
          <div className="message ai animate-slide-up">
            <div className="message-bubble typing-indicator">
              {isAnalyzingImage ? (
                <span className="analyzing-text font-medium text-blue-400">Analyzing image & solving step-by-step...</span>
              ) : (
                <>
                  <span className="dot animate-pulse">.</span>
                  <span className="dot animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                  <span className="dot animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
                </>
              )}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />

        {/* Fullscreen Image Lightbox Modal */}
        {selectedImage && (
          <div className="image-lightbox-overlay" onClick={() => setSelectedImage(null)}>
            <div className="image-lightbox-content">
              <img src={selectedImage} alt="Expanded view" />
              <button className="lightbox-close-btn" onClick={() => setSelectedImage(null)}>✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
