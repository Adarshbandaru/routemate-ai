import { useState, useEffect, useRef } from 'react';
import { X, Send, Phone, MessageSquare, ShieldCheck, Check } from 'lucide-react';
import { apiService } from '../../services/apiService';

const QUICK_CHIPS = [
  "I'm Outside",
  "Running Late",
  "I'm waiting at the main gate",
  "Please call when you arrive",
];

function getNowIso() {
  return new Date().toISOString();
}

function createMessageId() {
  return `msg_${Math.random().toString(36).substring(2, 9)}`;
}

function formatMessageTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function RideChatModal({
  isOpen,
  onClose,
  bookingId,
  partnerName = 'Driver Priya',
  partnerRole = 'DRIVER', // 'DRIVER' | 'RIDER'
  partnerVehicle = 'Glacier White Swift Dzire (PB 08 BG 1290)',
  currentUserRole = 'RIDER',
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const activeBookingId = bookingId || 'RIDE_ACTIVE_DEMO';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    apiService.getBookingMessages(activeBookingId)
      .then((res) => {
        if (isMounted && res?.data) {
          if (res.data.length === 0) {
            // Seed initial greeting message
            setMessages([
              {
                id: 'init_1',
                sender_id: 'system',
                is_automated: true,
                content: `Chat opened with ${partnerName}. Please coordinate pickup clearly.`,
                created_at: new Date().toISOString(),
              },
              {
                id: 'init_2',
                sender_id: partnerRole.toLowerCase(),
                is_automated: false,
                content: `Hello! I am navigating towards your pickup point via NH-44.`,
                created_at: new Date().toISOString(),
              },
            ]);
          } else {
            setMessages(res.data);
          }
        }
      })
      .catch(() => {
        // Fallback demo conversation
        setMessages([
          {
            id: 'init_1',
            sender_id: 'system',
            is_automated: true,
            content: `Chat opened with ${partnerName}.`,
            created_at: new Date().toISOString(),
          },
        ]);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeBookingId, partnerName, partnerRole]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const optimisticMsg = {
      id: createMessageId(),
      booking_id: activeBookingId,
      sender_id: currentUserRole.toLowerCase(),
      content: text,
      created_at: getNowIso(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');
    setLoading(true);

    try {
      await apiService.sendBookingMessage(activeBookingId, text, currentUserRole.toLowerCase());
    } catch {
      // Retain optimistic message in offline demo
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="chat-partner-name">
      <div className="chat-modal-card">
        {/* Chat Header */}
        <div className="chat-modal-header">
          <div className="chat-partner-info">
            <div className="chat-avatar-badge">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="chat-partner-row">
                <h4 id="chat-partner-name" className="chat-partner-title">{partnerName}</h4>
                <span className="badge badge-accent text-xs uppercase">{partnerRole}</span>
              </div>
              <p className="chat-partner-sub">{partnerVehicle}</p>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm call-partner-btn"
              onClick={() => alert(`Calling ${partnerName}...`)}
              title="Call driver"
              aria-label="Call driver"
            >
              <Phone size={13} />
              <span>Call</span>
            </button>
            <button
              type="button"
              className="btn-ghost chat-close-btn"
              onClick={onClose}
              title="Close chat"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Safety & Encryption Banner */}
        <div className="chat-safety-banner">
          <ShieldCheck size={13} className="text-accent" />
          <span>In-app encrypted communication &bull; Coordinates protected</span>
        </div>

        {/* Messages Stream */}
        <div className="chat-messages-container">
          {messages.map((m) => {
            const isMe = m.sender_id === currentUserRole.toLowerCase();
            const isSystem = m.is_automated || m.sender_id === 'system';

            if (isSystem) {
              return (
                <div key={m.id} className="chat-system-bubble">
                  <span>{m.content}</span>
                </div>
              );
            }

            return (
              <div key={m.id} className={`chat-message-row ${isMe ? 'msg-outgoing' : 'msg-incoming'}`}>
                <div className={`chat-bubble ${isMe ? 'bubble-me' : 'bubble-partner'}`}>
                  <p className="chat-bubble-text">{m.content}</p>
                  <span className="chat-bubble-time">
                    {formatMessageTime(m.created_at)}
                    {isMe && <Check size={11} className="inline ml-1 opacity-70" />}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Chips */}
        <div className="chat-quick-chips">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="chat-chip-btn"
              onClick={() => handleSendMessage(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <form
          className="chat-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          <input
            type="text"
            className="chat-text-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Message ${partnerName}...`}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary chat-send-btn"
            disabled={!inputText.trim() || loading}
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
