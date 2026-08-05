import { createPortal } from 'react-dom';
import { AlertTriangle, LogOut, X } from 'lucide-react';

export default function LogoutModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="logout-modal-overlay" onClick={onClose}>
      <div className="logout-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="logout-close-btn" onClick={onClose} aria-label="Cancel">
          <X size={18} />
        </button>

        <div className="logout-modal-body">
          <div className="logout-warning-icon-wrapper">
            <AlertTriangle size={32} className="logout-warning-icon" />
          </div>

          <h3 className="logout-modal-title">Confirm Logout</h3>
          <p className="logout-modal-text">
            Are you sure you want to log out of NexusAI? Your active login session will end, and you will need to sign back in to access your chat workspace.
          </p>

          <div className="logout-modal-actions">
            <button className="logout-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="logout-btn-confirm" onClick={onConfirm}>
              <LogOut size={16} />
              <span>Yes, Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
