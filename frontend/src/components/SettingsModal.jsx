import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, XCircle, ShieldCheck, RefreshCw, Phone, Send, Eye, EyeOff, LogOut, Link2, QrCode, KeyRound, Smartphone } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function SettingsModal({ isOpen, onClose, auth }) {
  const [channelsStatus, setChannelsStatus] = useState({
    telegram: { connected: false, message: 'Checking...' },
    whatsapp: { connected: false, phone: 'Disconnected' }
  });

  const [telegramToken, setTelegramToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [teleLoading, setTeleLoading] = useState(false);
  const [teleMsg, setTeleMsg] = useState(null);

  // WhatsApp State
  const [pairingMethod, setPairingMethod] = useState('qr'); // 'qr' | 'code'
  const [qrCodeData, setQrCodeData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [pairingCode, setPairingCode] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [waMsg, setWaMsg] = useState(null);
  const [waDisconnectLoading, setWaDisconnectLoading] = useState(false);

  const pollIntervalRef = useRef(null);

  const fetchChannelStatus = async () => {
    try {
      const url = auth?.userId ? `${API_BASE_URL}/api/channels/status?user_id=${auth.userId}` : `${API_BASE_URL}/api/channels/status`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setChannelsStatus(data);
        if (data.whatsapp?.connected) {
          setQrCodeData(null);
          setPairingCode(null);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } else if (data.whatsapp?.qr_code) {
          setQrCodeData(data.whatsapp.qr_code);
        }
      }
    } catch (err) {
      console.error("Failed to fetch channel status:", err);
    }
  };

  const handleGenerateWhatsAppQR = async (force = false) => {
    setQrLoading(true);
    setWaMsg(null);
    try {
      const url = auth?.userId ? `${API_BASE_URL}/api/channels/whatsapp/qr?user_id=${auth.userId}&force=${force}` : `${API_BASE_URL}/api/channels/whatsapp/qr?force=${force}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          setWaMsg({ type: 'success', text: `WhatsApp already connected (${data.phone})` });
          setQrCodeData(null);
          fetchChannelStatus();
        } else {
          setQrCodeData(data.qr_code);
          if (!pollIntervalRef.current) {
            pollIntervalRef.current = setInterval(fetchChannelStatus, 3000);
          }
        }
      } else {
        const errData = await res.json();
        setWaMsg({ type: 'error', text: errData.detail || 'Failed to generate WhatsApp QR code.' });
      }
    } catch (err) {
      setWaMsg({ type: 'error', text: 'Error connecting to WhatsApp service.' });
    } finally {
      setQrLoading(false);
    }
  };

  const handleRequestPairingCode = async (e) => {
    e.preventDefault();
    if (!waPhoneInput.trim()) return;
    setCodeLoading(true);
    setWaMsg(null);
    setPairingCode(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/channels/whatsapp/pair-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: waPhoneInput.trim(),
          user_id: auth?.userId ? parseInt(auth.userId) : null
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPairingCode(data.pairing_code);
        setWaMsg({ type: 'success', text: '8-Digit Pairing Code Generated!' });
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(fetchChannelStatus, 3000);
        }
      } else {
        setWaMsg({ type: 'error', text: data.detail || 'Failed to request pairing code.' });
      }
    } catch (err) {
      setWaMsg({ type: 'error', text: 'Error requesting pairing code.' });
    } finally {
      setCodeLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    setWaDisconnectLoading(true);
    setWaMsg(null);
    try {
      const url = auth?.userId ? `${API_BASE_URL}/api/channels/whatsapp/disconnect?user_id=${auth.userId}` : `${API_BASE_URL}/api/channels/whatsapp/disconnect`;
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        setQrCodeData(null);
        setPairingCode(null);
        setWaMsg({ type: 'success', text: 'WhatsApp session disconnected successfully.' });
        fetchChannelStatus();
      }
    } catch (err) {
      setWaMsg({ type: 'error', text: err.message });
    } finally {
      setWaDisconnectLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchChannelStatus();
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen]);

  // Handle Telegram Connect
  const handleConnectTelegram = async (e) => {
    e.preventDefault();
    if (!telegramToken.trim()) return;
    setTeleLoading(true);
    setTeleMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/channels/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bot_token: telegramToken.trim(),
          user_id: auth?.userId ? parseInt(auth.userId) : null
        })
      });
      const data = await res.json();
      if (res.ok) {
        setTeleMsg({ type: 'success', text: data.message || 'Telegram Bot connected!' });
        setTelegramToken('');
        fetchChannelStatus();
      } else {
        setTeleMsg({ type: 'error', text: data.detail || 'Failed to connect Telegram bot.' });
      }
    } catch (err) {
      setTeleMsg({ type: 'error', text: `Network error: ${err.message}` });
    } finally {
      setTeleLoading(false);
    }
  };

  // Handle Telegram Disconnect
  const handleDisconnectTelegram = async () => {
    setTeleLoading(true);
    setTeleMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/channels/telegram/disconnect`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: auth?.userId ? parseInt(auth.userId) : null })
      });
      if (res.ok) {
        setTeleMsg({ type: 'success', text: 'Telegram bot disconnected.' });
        fetchChannelStatus();
      }
    } catch (err) {
      setTeleMsg({ type: 'error', text: err.message });
    } finally {
      setTeleLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            <ShieldCheck size={20} className="header-icon" />
            <h3>NexusAI Settings & Integrations</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="settings-modal-body">
          <div className="settings-section">
            <div className="section-header">
              <h4>Live Messaging Integrations</h4>
              <button className="refresh-health-btn" onClick={fetchChannelStatus}>
                <RefreshCw size={13} />
                <span>Refresh Status</span>
              </button>
            </div>

            <div className="status-grid">
              {/* WhatsApp Web Baileys Integration Card */}
              <div className="status-card full-width channel-card">
                <div className="status-card-header">
                  <div className="status-title">
                    <Phone size={16} className="channel-icon whatsapp" />
                    <span>WhatsApp Web Integration</span>
                  </div>
                  {channelsStatus.whatsapp?.connected ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} /> Connected ({channelsStatus.whatsapp?.phone || 'Linked'})
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      <XCircle size={12} /> Disconnected
                    </span>
                  )}
                </div>

                {waMsg && (
                  <div className={`channel-feedback ${waMsg.type}`} style={{ marginBottom: '10px' }}>
                    {waMsg.text}
                  </div>
                )}

                {channelsStatus.whatsapp?.connected ? (
                  <div className="connected-actions margin-top">
                    <div className="bot-info-badge">
                      <Link2 size={14} />
                      <span>Linked WhatsApp Account: {channelsStatus.whatsapp?.phone}</span>
                    </div>
                    <button 
                      className="channel-action-btn danger"
                      onClick={handleDisconnectWhatsApp}
                      disabled={waDisconnectLoading}
                    >
                      <LogOut size={14} />
                      <span>{waDisconnectLoading ? 'Disconnecting...' : 'Disconnect WhatsApp'}</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginTop: '6px' }}>
                    
                    {/* Option: QR Code */}
                    <div>
                      <button 
                        type="button"
                        className="channel-action-btn primary"
                        onClick={() => handleGenerateWhatsAppQR(true)}
                        disabled={qrLoading || (channelsStatus.whatsapp?.connecting && !qrCodeData)}
                        style={{ width: '100%', padding: '0.85rem 1.25rem', fontSize: '0.95rem', fontWeight: '700', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <QrCode size={18} />
                        <span>{qrLoading ? 'Generating Fresh QR Code...' : (channelsStatus.whatsapp?.connecting && !qrCodeData ? 'Starting WhatsApp Service...' : 'Generate WhatsApp Pairing QR Code')}</span>
                      </button>

                      {qrCodeData && (
                        <div style={{ width: '100%', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '12px', padding: '1.25rem', textAlign: 'center', marginTop: '10px' }}>
                          <div style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '700', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <QrCode size={18} />
                            <span>Scan QR Code on Mobile WhatsApp</span>
                          </div>
                          
                          <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '12px', display: 'inline-block', margin: '0 auto 1rem auto', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}>
                            <img src={qrCodeData} alt="WhatsApp Web Pairing QR Code" style={{ width: '220px', height: '220px', display: 'block', margin: '0 auto' }} />
                          </div>

                          <p style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6', margin: 0, textAlign: 'left', background: 'rgba(255,255,255,0.05)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
                            1. Open <strong>WhatsApp</strong> on your mobile phone.<br />
                            2. Tap <strong>Settings / Menu</strong> &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.<br />
                            3. Point your camera at this QR code to log in.
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {/* Telegram Bot Authentication Card */}
              <div className="status-card full-width channel-card">
                <div className="status-card-header">
                  <div className="status-title">
                    <Send size={16} className="channel-icon telegram" />
                    <span>Telegram Bot Integration</span>
                  </div>
                  {channelsStatus.telegram?.connected ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} /> {channelsStatus.telegram?.message}
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      <XCircle size={12} /> Not Configured
                    </span>
                  )}
                </div>

                {teleMsg && (
                  <div className={`channel-feedback ${teleMsg.type}`}>
                    {teleMsg.text}
                  </div>
                )}

                {/* Telegram Action Controls */}
                {channelsStatus.telegram?.connected ? (
                  <div className="connected-actions margin-top">
                    <div className="bot-info-badge">
                      <Link2 size={14} />
                      <span>Active Bot: @{channelsStatus.telegram?.bot_username} ({channelsStatus.telegram?.first_name})</span>
                    </div>
                    <button 
                      className="channel-action-btn danger"
                      onClick={handleDisconnectTelegram}
                      disabled={teleLoading}
                    >
                      <LogOut size={14} />
                      <span>Disconnect & Unpair Bot</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleConnectTelegram} className="telegram-connect-form">
                    <label className="input-label">Enter Telegram Bot Token</label>
                    <div className="token-input-wrapper">
                      <input 
                        type={showToken ? "text" : "password"}
                        placeholder="e.g. 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                        value={telegramToken}
                        onChange={(e) => setTelegramToken(e.target.value)}
                        required
                        className="token-input"
                      />
                      <button 
                        type="button" 
                        className="eye-toggle-btn"
                        onClick={() => setShowToken(!showToken)}
                        title={showToken ? "Hide token" : "Show token"}
                      >
                        {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button 
                      type="submit" 
                      className="channel-action-btn primary full-width-btn"
                      disabled={teleLoading || !telegramToken.trim()}
                    >
                      <Send size={14} />
                      <span>{teleLoading ? 'Verifying Token...' : 'Save & Connect Telegram Bot'}</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
