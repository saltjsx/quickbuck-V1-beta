import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { useState, useEffect } from "react";
import type { Id } from "convex/_generated/dataModel";

/**
 * GlobalAlertModal Component
 * Displays unread global alerts to users as a modal dialog
 * Shows one alert at a time; next alert appears after dismissing
 * Auto-marks alerts as read when dismissed
 */
export function GlobalAlertBanner() {
  const unreadAlerts = useQuery(api.alerts.getUnreadAlerts);
  const markAsRead = useMutation(api.alerts.markAlertAsRead);

  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);
  const [displayedAlerts, setDisplayedAlerts] = useState<any[]>([]);

  // Sync with unread alerts
  useEffect(() => {
    if (unreadAlerts) {
      setDisplayedAlerts(unreadAlerts);
      setCurrentAlertIndex(0);
    }
  }, [unreadAlerts]);

  const currentAlert = displayedAlerts[currentAlertIndex];

  const handleDismiss = async () => {
    if (!currentAlert) return;

    try {
      await markAsRead({ alertId: currentAlert._id });
      setDisplayedAlerts((prev) =>
        prev.filter((_, i) => i !== currentAlertIndex)
      );
      // Keep index the same (will show next alert or close if none left)
      if (currentAlertIndex >= displayedAlerts.length - 1) {
        setCurrentAlertIndex(Math.max(0, displayedAlerts.length - 2));
      }
    } catch (err) {
      console.error("Failed to mark alert as read:", err);
    }
  };

  const handleNext = async () => {
    if (!currentAlert) return;

    try {
      await markAsRead({ alertId: currentAlert._id });
      setDisplayedAlerts((prev) =>
        prev.filter((_, i) => i !== currentAlertIndex)
      );
    } catch (err) {
      console.error("Failed to mark alert as read:", err);
    }
  };

  if (displayedAlerts.length === 0 || !currentAlert) {
    return null;
  }

  const getAlertEmoji = (type: string) => {
    switch (type) {
      case "info":
        return "ℹ️";
      case "success":
        return "✓";
      case "warning":
        return "⚠️";
      case "error":
        return "✗";
      default:
        return "📢";
    }
  };

  return (
    <div className="global-alert-modal-overlay">
      <div className={`global-alert-modal alert-${currentAlert.type}`}>
        <div className="alert-modal-header">
          <span className="alert-modal-emoji">
            {getAlertEmoji(currentAlert.type)}
          </span>
          <h2 className="alert-modal-title">{currentAlert.title}</h2>
          <button
            className="alert-modal-close"
            onClick={handleDismiss}
            title="Dismiss"
            aria-label="Close alert"
          >
            ×
          </button>
        </div>

        <div className="alert-modal-body">
          <p className="alert-modal-message">{currentAlert.message}</p>
        </div>

        <div className="alert-modal-footer">
          <span className="alert-count">
            {currentAlertIndex + 1} of {displayedAlerts.length}
          </span>
          <div className="alert-modal-actions">
            <button className="alert-btn-dismiss" onClick={handleDismiss}>
              Dismiss
            </button>
            {displayedAlerts.length > 1 && (
              <button className="alert-btn-next" onClick={handleNext}>
                Next ({displayedAlerts.length - 1})
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .global-alert-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9000;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .global-alert-modal {
          background: #ffffff;
          border: 3px solid;
          border-radius: 8px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          animation: scaleIn 0.3s ease-out;
          overflow: hidden;
        }

        .global-alert-modal.alert-info {
          border-color: #0000ff;
        }

        .global-alert-modal.alert-success {
          border-color: #008000;
        }

        .global-alert-modal.alert-warning {
          border-color: #ff8c00;
        }

        .global-alert-modal.alert-error {
          border-color: #ff0000;
        }

        .alert-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px;
          border-bottom: 2px solid #e0e0e0;
          position: relative;
        }

        .alert-modal-emoji {
          font-size: 24px;
          flex-shrink: 0;
        }

        .alert-modal-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #000000;
          flex: 1;
        }

        .alert-modal-close {
          width: 32px;
          height: 32px;
          padding: 0;
          background: transparent;
          border: none;
          font-size: 24px;
          color: #808080;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: color 0.2s;
        }

        .alert-modal-close:hover {
          color: #000000;
        }

        .alert-modal-body {
          padding: 20px;
          flex: 1;
          overflow-y: auto;
        }

        .alert-modal-message {
          margin: 0;
          color: #333333;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .alert-modal-footer {
          padding: 15px 20px;
          border-top: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8f8f8;
        }

        .alert-count {
          font-size: 12px;
          color: #808080;
          font-weight: 500;
        }

        .alert-modal-actions {
          display: flex;
          gap: 10px;
        }

        .alert-btn-dismiss,
        .alert-btn-next {
          padding: 8px 16px;
          border: 1px solid #c0c0c0;
          background: #f0f0f0;
          color: #000000;
          font-weight: 500;
          font-size: 13px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .alert-btn-dismiss:hover {
          background: #e0e0e0;
          border-color: #a0a0a0;
        }

        .alert-btn-dismiss:active {
          transform: scale(0.98);
        }

        .alert-btn-next {
          background: #0080ff;
          color: #ffffff;
          border-color: #0060df;
        }

        .alert-btn-next:hover {
          background: #0060df;
          border-color: #004aaf;
        }

        .alert-btn-next:active {
          transform: scale(0.98);
        }

        @media (max-width: 600px) {
          .global-alert-modal {
            max-width: 95%;
            max-height: 90vh;
          }

          .alert-modal-header {
            padding: 15px;
          }

          .alert-modal-emoji {
            font-size: 20px;
          }

          .alert-modal-title {
            font-size: 16px;
          }

          .alert-modal-close {
            width: 28px;
            height: 28px;
            font-size: 20px;
          }

          .alert-modal-body {
            padding: 15px;
          }

          .alert-modal-message {
            font-size: 13px;
          }

          .alert-modal-footer {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .alert-modal-actions {
            width: 100%;
            gap: 8px;
          }

          .alert-btn-dismiss,
          .alert-btn-next {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
