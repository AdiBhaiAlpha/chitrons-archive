// ============================================
// Chitron's Archive — Real-Time Persistent Live Chat & Messenger
// Zero-login anonymous visitor identity + Firebase + WebSocket + REST
// Self-contained responsive floating widget (Desktop window + Mobile full-screen sheet)
// ============================================

(function () {
  'use strict';

  // Do not mount visitor widget inside admin panel
  if (window.location.pathname.indexOf('/admin') === 0) return;

  var STORAGE_KEY_ID = 'ca_visitor_id';
  var STORAGE_KEY_NAME = 'ca_visitor_name';
  var STORAGE_KEY_CACHE = 'ca_chat_history_cache_v1';
  var STORAGE_KEY_OPEN = 'ca_chat_is_open';

  var MAX_MESSAGE_LENGTH = 2000;
  var COOLDOWN_MS = 900;

  var state = {
    visitorId: '',
    visitorName: '',
    isOpen: false,
    isLoading: true,
    initialHistoryLoaded: false,
    notifiedMsgIds: {},
    connectionState: 'online', // 'online' | 'reconnecting' | 'offline'
    conversation: null,
    messages: [],
    unreadForVisitor: 0,
    adminTyping: false,
    adminOnline: false,
    adminLastSeen: Date.now() - 12 * 60 * 1000,
    sending: false,
    lastSentAt: 0,
    isAtBottom: true,
    hasNewBelowFold: false,
    ws: null,
    wsReconnectTimer: null,
    fbDb: null,
    fbRtdb: null,
    fbUnsubConv: null,
    fbUnsubMsgs: null,
    fbUnsubRtdb: null,
    typingTimeout: null,
    visitorTypingStopTimer: null,
    lastVisitorTypingSentAt: 0,
    visitorCurrentlyTyping: false,
    pollTimer: null
  };

  // ---- Web Audio Chime for Incoming Admin Reply (Matches Admin Notification Sound) ----
  var sharedAudioCtx = null;
  function unlockAudioContext() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!sharedAudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx.state === 'suspended' && typeof sharedAudioCtx.resume === 'function') {
        sharedAudioCtx.resume().catch(function () {});
      }
    } catch (e) {}
  }

  function playMessageReceivedBeep() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = sharedAudioCtx || new AudioCtx();
      sharedAudioCtx = ctx;
      var playChime = function () {
        try {
          var now = ctx.currentTime;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.11); // A5
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.37);
        } catch (err) {}
      };
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().then(playChime).catch(playChime);
      } else {
        playChime();
      }
    } catch (e) {}
  }

  function setAdminTypingState(isTyping) {
    var active = Boolean(isTyping);
    state.adminTyping = active;
    clearTimeout(state.typingTimeout);
    if (active) {
      state.typingTimeout = setTimeout(function () {
        state.adminTyping = false;
        renderTypingIndicator();
      }, 3800);
    }
    renderTypingIndicator();
  }

  function tr(key, fallback) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatMessageText(rawText) {
    var escaped = escapeHtml(rawText);
    return escaped.replace(
      /(https?:\/\/[^\s<>"']+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="ca-chat-link">$1</a>'
    );
  }

  function getApiClient() {
    if (window.api) return window.api;
    if (window.API) return window.API;
    return {
      getFirebaseConfig: function () {
        return fetch('/api/chat/config').then(function (r) { return r.json(); }).then(function (d) { return (d && d.firebaseConfig) ? d.firebaseConfig : d; });
      },
      getVisitorConversation: function (vid) {
        return fetch('/api/chat/conversation/' + encodeURIComponent(vid)).then(function (r) { return r.json(); });
      },
      sendVisitorMessage: function (vid, payload) {
        return fetch('/api/chat/conversation/' + encodeURIComponent(vid) + '/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.json(); });
      },
      markVisitorChatRead: function (vid) {
        return fetch('/api/chat/conversation/' + encodeURIComponent(vid) + '/read', { method: 'POST' }).then(function (r) { return r.json(); });
      }
    };
  }

  // ---- Persistent Anonymous Visitor Identity ----
  function generateSecureVisitorId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var randomPart = '';
    if (window.crypto && window.crypto.getRandomValues) {
      var array = new Uint8Array(20);
      window.crypto.getRandomValues(array);
      for (var i = 0; i < array.length; i++) {
        randomPart += chars[array[i] % chars.length];
      }
    } else {
      for (var j = 0; j < 20; j++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    return 'visitor_' + Date.now().toString(36) + '_' + randomPart;
  }

  function isValidVisitorId(id) {
    return typeof id === 'string' && /^visitor_[a-zA-Z0-9_-]{12,64}$/.test(id);
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  function setCookie(name, value, days) {
    var expires = '';
    if (days) {
      var date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = '; expires=' + date.toUTCString();
    }
    document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
  }

  function initVisitorIdentity() {
    var id = '';
    try {
      id = localStorage.getItem(STORAGE_KEY_ID) || '';
    } catch (e) {}

    if (!isValidVisitorId(id)) {
      id = getCookie(STORAGE_KEY_ID);
    }

    if (!isValidVisitorId(id)) {
      id = generateSecureVisitorId();
    }

    try {
      localStorage.setItem(STORAGE_KEY_ID, id);
    } catch (e) {}
    try {
      setCookie(STORAGE_KEY_ID, id, 365);
    } catch (e) {}

    state.visitorId = id;

    try {
      state.visitorName = localStorage.getItem(STORAGE_KEY_NAME) || '';
    } catch (e) {}

    try {
      var cachedRaw = localStorage.getItem(STORAGE_KEY_CACHE + '_' + id);
      if (cachedRaw) {
        var parsed = JSON.parse(cachedRaw);
        if (parsed && Array.isArray(parsed.messages)) {
          state.messages = parsed.messages;
          for (var k = 0; k < state.messages.length; k++) {
            if (state.messages[k] && state.messages[k].messageId) {
              state.notifiedMsgIds[state.messages[k].messageId] = true;
            }
          }
          state.unreadForVisitor = parsed.unreadForVisitor || 0;
          state.isLoading = false;
        }
      }
    } catch (e) {}
  }

  function saveLocalCache() {
    try {
      localStorage.setItem(
        STORAGE_KEY_CACHE + '_' + state.visitorId,
        JSON.stringify({
          messages: state.messages.slice(-200),
          unreadForVisitor: state.unreadForVisitor,
          updatedAt: Date.now()
        })
      );
    } catch (e) {}
  }

  function formatTime(isoOrDate) {
    if (!isoOrDate) return '';
    var d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateHeading(isoOrDate) {
    if (!isoOrDate) return '';
    var d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) return 'Today';

    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    var isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return 'Yesterday';

    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function mergeMessages(incomingList, options) {
    if (!Array.isArray(incomingList)) return false;
    var opts = options || {};
    var isInitialSeed = Boolean(opts.isInitialSeed);
    var map = {};
    for (var i = 0; i < state.messages.length; i++) {
      var existing = state.messages[i];
      if (existing && existing.messageId) {
        map[existing.messageId] = existing;
      }
    }
    var changed = false;
    var hasNewAdminReply = false;
    for (var j = 0; j < incomingList.length; j++) {
      var msg = incomingList[j];
      if (!msg || !msg.messageId) continue;
      var ts = msg.timestamp;
      if (ts && typeof ts.toDate === 'function') {
        ts = ts.toDate().toISOString();
      } else if (ts instanceof Date) {
        ts = ts.toISOString();
      } else if (typeof ts === 'number') {
        ts = new Date(ts).toISOString();
      }
      var normalized = {
        messageId: String(msg.messageId),
        visitorId: String(msg.visitorId || state.visitorId),
        sender: msg.sender === 'admin' ? 'admin' : 'visitor',
        text: String(msg.text || ''),
        type: msg.type || 'text',
        mediaUrl: msg.mediaUrl || '',
        fileName: msg.fileName || '',
        read: Boolean(msg.read),
        timestamp: ts || new Date().toISOString(),
        pending: Boolean(msg.pending),
        failed: Boolean(msg.failed)
      };

      var prev = map[normalized.messageId];
      var isBrandNew = !prev && !state.notifiedMsgIds[normalized.messageId];

      if (isBrandNew) {
        state.notifiedMsgIds[normalized.messageId] = true;
        if (!isInitialSeed && state.initialHistoryLoaded && normalized.sender === 'admin') {
          hasNewAdminReply = true;
        }
      }

      if (
        !prev ||
        prev.read !== normalized.read ||
        prev.pending !== normalized.pending ||
        prev.failed !== normalized.failed ||
        prev.text !== normalized.text
      ) {
        map[normalized.messageId] = normalized;
        changed = true;
      }
    }

    if (changed) {
      var merged = Object.keys(map).map(function (k) {
        return map[k];
      });
      merged.sort(function (a, b) {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      state.messages = merged;
      saveLocalCache();
    }

    if (hasNewAdminReply) {
      setAdminTypingState(false);
      playMessageReceivedBeep();
    }

    return changed;
  }

  // ---- Inject Self-Contained Widget Styles ----
  function injectCriticalMessengerStyles() {
    if (document.getElementById('ca-messenger-critical-css')) return;
    var style = document.createElement('style');
    style.id = 'ca-messenger-critical-css';
    style.textContent =
      '.ca-messenger-root{position:fixed!important;right:20px!important;bottom:20px!important;z-index:9990!important;font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif)!important;pointer-events:none!important;}' +
      '.ca-chat-fab{pointer-events:auto!important;position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;height:48px!important;padding:0 18px!important;border-radius:999px!important;background:var(--text,#18181b)!important;color:var(--bg,#fafaf9)!important;border:1px solid rgba(128,128,128,0.22)!important;box-shadow:0 8px 24px rgba(0,0,0,0.2)!important;cursor:pointer!important;font-size:13.5px!important;font-weight:600!important;line-height:1!important;transition:transform 0.18s ease,box-shadow 0.18s ease!important;}' +
      '.ca-chat-fab:hover{transform:translateY(-2px)!important;box-shadow:0 12px 28px rgba(0,0,0,0.26)!important;}' +
      '.ca-chat-fab svg{width:19px!important;height:19px!important;min-width:19px!important;max-width:19px!important;min-height:19px!important;max-height:19px!important;flex-shrink:0!important;display:block!important;}' +
      '.ca-chat-fab-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:20px!important;height:20px!important;flex-shrink:0!important;}' +
      '.ca-chat-fab-icon-close{display:none!important;}' +
      '.ca-messenger-root.is-open .ca-chat-fab-icon-chat{display:none!important;}' +
      '.ca-messenger-root.is-open .ca-chat-fab-icon-close{display:inline-flex!important;}' +
      '.ca-messenger-root.is-open .ca-chat-fab-label{display:none!important;}' +
      '.ca-messenger-root.is-open .ca-chat-fab{width:46px!important;height:46px!important;padding:0!important;}' +
      '.ca-chat-unread-badge{position:absolute!important;top:-5px!important;right:-5px!important;min-width:20px!important;height:20px!important;padding:0 6px!important;border-radius:999px!important;background:#dc2626!important;color:#fff!important;font-size:11px!important;font-weight:700!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border:2px solid var(--bg,#fff)!important;}' +
      '.ca-chat-window{pointer-events:none!important;position:fixed!important;right:20px!important;bottom:78px!important;width:368px!important;max-width:calc(100vw - 32px)!important;height:520px!important;max-height:calc(100vh - 110px)!important;background:var(--bg,#ffffff)!important;color:var(--text,#18181b)!important;border:1px solid var(--border,#e4e4e7)!important;border-radius:16px!important;box-shadow:0 20px 50px rgba(0,0,0,0.22)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;opacity:0!important;visibility:hidden!important;transform:translateY(12px) scale(0.98)!important;transform-origin:bottom right!important;transition:opacity 0.2s ease,transform 0.2s ease,visibility 0.2s!important;z-index:9992!important;}' +
      '.ca-messenger-root.is-open .ca-chat-window{pointer-events:auto!important;opacity:1!important;visibility:visible!important;transform:translateY(0) scale(1)!important;}' +
      '.ca-chat-header{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:12px 14px!important;background:var(--bg-secondary,#f4f4f5)!important;border-bottom:1px solid var(--border,#e4e4e7)!important;flex-shrink:0!important;}' +
      '.ca-chat-header-author{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important;}' +
      '.ca-chat-avatar-wrap{position:relative!important;width:36px!important;height:36px!important;flex-shrink:0!important;}' +
      '.ca-chat-avatar{width:36px!important;height:36px!important;border-radius:50%!important;object-fit:cover!important;border:1px solid var(--border,#e4e4e7)!important;display:block!important;background:var(--bg,#fff)!important;}' +
      '.ca-chat-presence-dot{position:absolute!important;bottom:0!important;right:0!important;width:10px!important;height:10px!important;border-radius:50%!important;border:2px solid var(--bg-secondary,#f4f4f5)!important;background:#16a34a!important;}' +
      '.ca-chat-presence-dot.reconnecting{background:#eab308!important;}' +
      '.ca-chat-presence-dot.offline{background:#dc2626!important;}' +
      '.ca-chat-header-meta{min-width:0!important;}' +
      '.ca-chat-header-title{font-size:14px!important;font-weight:700!important;color:var(--text,#18181b)!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}' +
      '.ca-chat-header-status{font-size:11.5px!important;color:var(--text-secondary,#52525b)!important;line-height:1.25!important;margin-top:2px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}' +
      '.ca-chat-header-actions{display:flex!important;align-items:center!important;gap:4px!important;flex-shrink:0!important;}' +
      '.ca-chat-icon-btn{width:30px!important;height:30px!important;border-radius:8px!important;border:none!important;background:transparent!important;color:var(--text-secondary,#52525b)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;padding:0!important;}' +
      '.ca-chat-icon-btn:hover{background:var(--bg-hover,rgba(0,0,0,0.06))!important;color:var(--text,#18181b)!important;}' +
      '.ca-chat-icon-btn svg{width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;display:block!important;}' +
      '.ca-chat-identity-bar{background:var(--bg-secondary,#f4f4f5)!important;border-bottom:1px solid var(--border,#e4e4e7)!important;padding:10px 14px!important;flex-shrink:0!important;}' +
      '.ca-chat-identity-row{display:flex!important;align-items:center!important;justify-content:space-between!important;margin-bottom:6px!important;}' +
      '.ca-chat-identity-label{font-size:11px!important;font-weight:600!important;text-transform:uppercase!important;letter-spacing:0.04em!important;color:var(--text-secondary,#52525b)!important;}' +
      '.ca-chat-session-tag{font-size:10.5px!important;font-family:var(--font-mono,monospace)!important;color:var(--text-tertiary,#71717a)!important;}' +
      '.ca-chat-identity-controls{display:flex!important;gap:6px!important;}' +
      '.ca-chat-name-input{flex:1!important;height:32px!important;padding:0 10px!important;border:1px solid var(--border,#d4d4d8)!important;border-radius:6px!important;background:var(--bg,#fff)!important;color:var(--text,#18181b)!important;font-size:12.5px!important;}' +
      '.ca-chat-save-name-btn{height:32px!important;padding:0 12px!important;border-radius:6px!important;border:none!important;background:var(--text,#18181b)!important;color:var(--bg,#fff)!important;font-size:12px!important;font-weight:600!important;cursor:pointer!important;}' +
      '.ca-chat-identity-note{font-size:11px!important;color:var(--text-tertiary,#71717a)!important;margin:6px 0 0!important;line-height:1.35!important;}' +
      '.ca-chat-banner{padding:7px 12px!important;font-size:11.5px!important;line-height:1.35!important;border-bottom:1px solid var(--border,#e4e4e7)!important;flex-shrink:0!important;}' +
      '.ca-chat-banner.error{background:rgba(220,38,38,0.12)!important;color:#dc2626!important;}' +
      '.ca-chat-banner.warning{background:rgba(234,179,8,0.14)!important;color:#b45309!important;}' +
      '.ca-chat-banner.info{background:var(--bg-secondary,#f4f4f5)!important;color:var(--text-secondary,#52525b)!important;}' +
      '.ca-chat-messages{flex:1!important;overflow-y:auto!important;padding:14px!important;display:flex!important;flex-direction:column!important;gap:10px!important;background:var(--bg,#fff)!important;}' +
      '.ca-chat-empty{margin:auto 0!important;padding:10px 4px!important;}' +
      '.ca-chat-empty-card{background:var(--bg-secondary,#f4f4f5)!important;border:1px solid var(--border,#e4e4e7)!important;border-radius:12px!important;padding:14px!important;}' +
      '.ca-chat-empty-title{font-size:13.5px!important;font-weight:700!important;color:var(--text,#18181b)!important;margin-bottom:4px!important;}' +
      '.ca-chat-empty-desc{font-size:12.5px!important;color:var(--text-secondary,#52525b)!important;line-height:1.5!important;margin:0 0 12px!important;}' +
      '.ca-chat-starters{display:flex!important;flex-direction:column!important;gap:6px!important;}' +
      '.ca-chat-starter-btn{text-align:left!important;padding:8px 11px!important;border-radius:8px!important;border:1px solid var(--border,#e4e4e7)!important;background:var(--bg,#fff)!important;color:var(--text,#18181b)!important;font-size:12.5px!important;cursor:pointer!important;transition:border-color 0.15s ease,background 0.15s ease!important;}' +
      '.ca-chat-starter-btn:hover{border-color:var(--text,#18181b)!important;}' +
      '.ca-chat-date-divider{text-align:center!important;margin:6px 0!important;}' +
      '.ca-chat-date-divider span{display:inline-block!important;padding:2px 9px!important;border-radius:999px!important;background:var(--bg-secondary,#f4f4f5)!important;color:var(--text-tertiary,#71717a)!important;font-size:10.5px!important;font-weight:600!important;}' +
      '.ca-chat-msg-row{display:flex!important;align-items:flex-end!important;gap:8px!important;max-width:85%!important;}' +
      '.ca-chat-msg-row.visitor{align-self:flex-end!important;flex-direction:row-reverse!important;}' +
      '.ca-chat-msg-row.admin{align-self:flex-start!important;}' +
      '.ca-chat-msg-avatar{width:26px!important;height:26px!important;min-width:26px!important;max-width:26px!important;border-radius:50%!important;object-fit:cover!important;flex-shrink:0!important;border:1px solid var(--border,#e4e4e7)!important;margin-bottom:16px!important;}' +
      '.ca-chat-msg-bubble-wrap{display:flex!important;flex-direction:column!important;min-width:0!important;}' +
      '.ca-chat-msg-row.visitor .ca-chat-msg-bubble-wrap{align-items:flex-end!important;}' +
      '.ca-chat-msg-row.admin .ca-chat-msg-bubble-wrap{align-items:flex-start!important;}' +
      '.ca-chat-msg-bubble{padding:9px 13px!important;border-radius:14px!important;font-size:13.5px!important;line-height:1.45!important;word-break:break-word!important;}' +
      '.ca-chat-msg-row.visitor .ca-chat-msg-bubble{background:var(--text,#18181b)!important;color:var(--bg,#ffffff)!important;border-bottom-right-radius:4px!important;}' +
      '.ca-chat-msg-row.admin .ca-chat-msg-bubble{background:var(--bg-secondary,#f4f4f5)!important;color:var(--text,#18181b)!important;border:1px solid var(--border,#e4e4e7)!important;border-bottom-left-radius:4px!important;}' +
      '.ca-chat-msg-image{max-width:210px!important;max-height:200px!important;border-radius:8px!important;display:block!important;margin-bottom:4px!important;}' +
      '.ca-chat-msg-meta{display:flex!important;align-items:center!important;gap:5px!important;margin-top:3px!important;font-size:10.5px!important;color:var(--text-tertiary,#71717a)!important;}' +
      '.ca-chat-msg-meta svg{width:12px!important;height:12px!important;display:inline-block!important;}' +
      '.ca-chat-typing{display:none!important;align-items:center!important;gap:8px!important;padding:6px 14px!important;font-size:11.5px!important;color:var(--text-secondary,#52525b)!important;background:var(--bg-secondary,#f4f4f5)!important;border-top:1px solid var(--border,#e4e4e7)!important;flex-shrink:0!important;}' +
      '.ca-chat-typing.is-typing{display:flex!important;}' +
      '.ca-typing-dots{display:inline-flex!important;align-items:center!important;gap:3px!important;}' +
      '.ca-typing-dots span{width:5px!important;height:5px!important;border-radius:50%!important;background:var(--text-secondary,#52525b)!important;display:inline-block!important;animation:caTypingBounce 1.2s infinite ease-in-out!important;}' +
      '.ca-typing-dots span:nth-child(2){animation-delay:0.15s!important;}' +
      '.ca-typing-dots span:nth-child(3){animation-delay:0.3s!important;}' +
      '@keyframes caTypingBounce{0%,80%,100%{transform:scale(0.7);opacity:0.45;}40%{transform:scale(1.1);opacity:1;}}' +
      '.ca-chat-composer{display:flex!important;align-items:flex-end!important;gap:8px!important;padding:10px 12px!important;background:var(--bg-secondary,#f4f4f5)!important;border-top:1px solid var(--border,#e4e4e7)!important;flex-shrink:0!important;}' +
      '.ca-chat-attach-btn,.ca-chat-send-btn{width:34px!important;height:34px!important;min-width:34px!important;max-width:34px!important;border-radius:50%!important;border:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;padding:0!important;flex-shrink:0!important;}' +
      '.ca-chat-attach-btn{background:transparent!important;color:var(--text-secondary,#52525b)!important;}' +
      '.ca-chat-attach-btn:hover{background:var(--bg-hover,rgba(0,0,0,0.06))!important;color:var(--text,#18181b)!important;}' +
      '.ca-chat-attach-btn svg,.ca-chat-send-btn svg{width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;display:block!important;}' +
      '.ca-chat-send-btn{background:var(--text,#18181b)!important;color:var(--bg,#ffffff)!important;}' +
      '.ca-chat-send-btn:disabled{opacity:0.4!important;cursor:not-allowed!important;}' +
      '.ca-chat-input{flex:1!important;min-height:34px!important;max-height:100px!important;padding:7px 11px!important;border:1px solid var(--border,#d4d4d8)!important;border-radius:16px!important;background:var(--bg,#ffffff)!important;color:var(--text,#18181b)!important;font-family:inherit!important;font-size:13.5px!important;line-height:1.4!important;resize:none!important;outline:none!important;}' +
      '@media (max-width:640px){' +
        '.ca-messenger-root{right:16px!important;bottom:16px!important;}' +
        '.ca-chat-fab-label{display:none!important;}' +
        '.ca-chat-fab{width:50px!important;height:50px!important;padding:0!important;border-radius:50%!important;}' +
        '.ca-messenger-root.is-open .ca-chat-fab{display:none!important;}' +
        '.ca-chat-window{top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;border-radius:0!important;border:none!important;}' +
      '}';
    document.head.appendChild(style);
  }

  // ---- Build DOM Structure ----
  var dom = {};

  function buildChatWidgetDOM() {
    injectCriticalMessengerStyles();
    if (document.getElementById('ca-messenger-root')) return;

    var root = document.createElement('div');
    root.id = 'ca-messenger-root';
    root.className = 'ca-messenger-root';

    var shortId = state.visitorId.replace('visitor_', '').slice(-6).toUpperCase();

    root.innerHTML =
      '<button type="button" id="ca-chat-fab" class="ca-chat-fab" aria-label="Message Chitron Bhattacharjee" aria-expanded="false">' +
        '<span class="ca-chat-fab-icon ca-chat-fab-icon-chat" aria-hidden="true">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>' +
          '</svg>' +
        '</span>' +
        '<span class="ca-chat-fab-icon ca-chat-fab-icon-close" aria-hidden="true">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line>' +
            '<line x1="6" y1="6" x2="18" y2="18"></line>' +
          '</svg>' +
        '</span>' +
        '<span class="ca-chat-fab-label" data-i18n="chat.fabLabel">' + escapeHtml(tr('chat.fabLabel', 'Message Me')) + '</span>' +
        '<span id="ca-chat-unread-badge" class="ca-chat-unread-badge" style="display:none">0</span>' +
      '</button>' +

      '<section id="ca-chat-window" class="ca-chat-window" role="dialog" aria-label="Live Chat with Chitron Bhattacharjee" aria-hidden="true">' +
        '<header class="ca-chat-header">' +
          '<div class="ca-chat-header-author">' +
            '<div class="ca-chat-avatar-wrap">' +
              '<img src="/images/chitron-bhattacharjee.webp" alt="Chitron Bhattacharjee" class="ca-chat-avatar" loading="lazy">' +
              '<span id="ca-chat-presence-dot" class="ca-chat-presence-dot online"></span>' +
            '</div>' +
            '<div class="ca-chat-header-meta">' +
              '<div class="ca-chat-header-title" data-i18n="chat.title">' + escapeHtml(tr('chat.title', 'Chitron Bhattacharjee')) + '</div>' +
              '<div id="ca-chat-header-status" class="ca-chat-header-status">' + escapeHtml(formatAdminPresenceStatus()) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ca-chat-header-actions">' +
            '<button type="button" id="ca-chat-profile-btn" class="ca-chat-icon-btn" title="Set your display name (optional)" aria-label="Visitor settings">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>' +
                '<circle cx="12" cy="7" r="4"></circle>' +
              '</svg>' +
            '</button>' +
            '<button type="button" id="ca-chat-minimize-btn" class="ca-chat-icon-btn" title="Close chat" aria-label="Close chat">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<line x1="18" y1="6" x2="6" y2="18"></line>' +
                '<line x1="6" y1="6" x2="18" y2="18"></line>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</header>' +

        '<div id="ca-chat-identity-bar" class="ca-chat-identity-bar" style="display:none">' +
          '<div class="ca-chat-identity-inner">' +
            '<div class="ca-chat-identity-row">' +
              '<label for="ca-chat-visitor-name-input" class="ca-chat-identity-label" data-i18n="chat.visitorNameLabel">' + escapeHtml(tr('chat.visitorNameLabel', 'Your Name (Optional)')) + '</label>' +
              '<span class="ca-chat-session-tag">ID #' + escapeHtml(shortId) + '</span>' +
            '</div>' +
            '<div class="ca-chat-identity-controls">' +
              '<input type="text" id="ca-chat-visitor-name-input" class="ca-chat-name-input" maxlength="60" placeholder="Anonymous Visitor" value="' + escapeHtml(state.visitorName) + '">' +
              '<button type="button" id="ca-chat-save-name-btn" class="ca-chat-save-name-btn" data-i18n="chat.saveName">' + escapeHtml(tr('chat.saveName', 'Save')) + '</button>' +
            '</div>' +
            '<p class="ca-chat-identity-note" data-i18n="chat.persistenceNote">' + escapeHtml(tr('chat.persistenceNote', 'Session ID is saved locally in this browser. Clearing browser data resets your anonymous session.')) + '</p>' +
          '</div>' +
        '</div>' +

        '<div id="ca-chat-banner" class="ca-chat-banner" style="display:none"></div>' +

        '<div id="ca-chat-messages" class="ca-chat-messages" role="log" aria-live="polite">' +
          '<div class="ca-chat-loading">Loading conversation...</div>' +
        '</div>' +

        '<button type="button" id="ca-chat-new-pill" class="ca-chat-new-pill" style="display:none">' +
          '<span data-i18n="chat.newMessages">' + escapeHtml(tr('chat.newMessages', 'New message ↓')) + '</span>' +
        '</button>' +

        '<div id="ca-chat-typing" class="ca-chat-typing" style="display:none">' +
          '<span class="ca-typing-dots"><span></span><span></span><span></span></span>' +
          '<span class="ca-typing-text" data-i18n="chat.typing">' + escapeHtml(tr('chat.typing', 'Chitron is typing...')) + '</span>' +
        '</div>' +

        '<form id="ca-chat-form" class="ca-chat-composer">' +
          '<input type="file" id="ca-chat-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">' +
          '<button type="button" id="ca-chat-attach-btn" class="ca-chat-attach-btn" title="Attach image" aria-label="Attach image">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
              '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
              '<polyline points="21 15 16 10 5 21"></polyline>' +
            '</svg>' +
          '</button>' +
          '<textarea id="ca-chat-input" class="ca-chat-input" rows="1" maxlength="2000" placeholder="' + escapeHtml(tr('chat.placeholder', 'Type a message...')) + '" data-i18n-placeholder="chat.placeholder" aria-label="Message text"></textarea>' +
          '<button type="submit" id="ca-chat-send-btn" class="ca-chat-send-btn" aria-label="Send message" disabled>' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="22" y1="2" x2="11" y2="13"></line>' +
              '<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>' +
            '</svg>' +
          '</button>' +
        '</form>' +
      '</section>';

    document.body.appendChild(root);

    dom.root = root;
    dom.fab = document.getElementById('ca-chat-fab');
    dom.unreadBadge = document.getElementById('ca-chat-unread-badge');
    dom.window = document.getElementById('ca-chat-window');
    dom.presenceDot = document.getElementById('ca-chat-presence-dot');
    dom.headerStatus = document.getElementById('ca-chat-header-status');
    dom.profileBtn = document.getElementById('ca-chat-profile-btn');
    dom.minimizeBtn = document.getElementById('ca-chat-minimize-btn');
    dom.identityBar = document.getElementById('ca-chat-identity-bar');
    dom.nameInput = document.getElementById('ca-chat-visitor-name-input');
    dom.saveNameBtn = document.getElementById('ca-chat-save-name-btn');
    dom.banner = document.getElementById('ca-chat-banner');
    dom.messages = document.getElementById('ca-chat-messages');
    dom.newPill = document.getElementById('ca-chat-new-pill');
    dom.typing = document.getElementById('ca-chat-typing');
    dom.form = document.getElementById('ca-chat-form');
    dom.fileInput = document.getElementById('ca-chat-file-input');
    dom.attachBtn = document.getElementById('ca-chat-attach-btn');
    dom.input = document.getElementById('ca-chat-input');
    dom.sendBtn = document.getElementById('ca-chat-send-btn');

    bindEvents();
    renderAll();
  }

  function bindEvents() {
    dom.fab.addEventListener('click', function () {
      unlockAudioContext();
      if (state.isOpen) {
        closeChat();
      } else {
        openChat();
      }
    });

    dom.minimizeBtn.addEventListener('click', function () {
      closeChat();
    });

    dom.profileBtn.addEventListener('click', function () {
      var isHidden = dom.identityBar.style.display === 'none';
      dom.identityBar.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        dom.nameInput.value = state.visitorName;
        dom.nameInput.focus();
      }
    });

    dom.saveNameBtn.addEventListener('click', function () {
      var newName = (dom.nameInput.value || '').trim().slice(0, 60);
      state.visitorName = newName;
      try {
        localStorage.setItem(STORAGE_KEY_NAME, newName);
      } catch (e) {}
      dom.identityBar.style.display = 'none';
    });

    dom.nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        dom.saveNameBtn.click();
      }
    });

    dom.input.addEventListener('input', function () {
      unlockAudioContext();
      dom.input.style.height = 'auto';
      var nextHeight = Math.min(dom.input.scrollHeight, 100);
      dom.input.style.height = nextHeight + 'px';
      var hasText = dom.input.value.trim().length > 0;
      dom.sendBtn.disabled = !hasText || state.sending;
      notifyVisitorTyping(hasText);
    });

    dom.input.addEventListener('blur', function () {
      notifyVisitorTyping(false);
    });

    dom.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!dom.sendBtn.disabled) {
          handleSendText();
        }
      }
    });

    dom.form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSendText();
    });

    dom.attachBtn.addEventListener('click', function () {
      dom.fileInput.click();
    });

    dom.fileInput.addEventListener('change', function () {
      var file = dom.fileInput.files && dom.fileInput.files[0];
      if (!file) return;
      handleImageUpload(file);
      dom.fileInput.value = '';
    });

    dom.messages.addEventListener('scroll', function () {
      var el = dom.messages;
      var distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      state.isAtBottom = distanceFromBottom < 48;
      if (state.isAtBottom && state.hasNewBelowFold) {
        state.hasNewBelowFold = false;
        dom.newPill.style.display = 'none';
      }
    });

    dom.newPill.addEventListener('click', function () {
      scrollToBottom(true);
      state.hasNewBelowFold = false;
      dom.newPill.style.display = 'none';
    });

    dom.messages.addEventListener('click', function (e) {
      var starterBtn = e.target.closest('[data-chat-starter]');
      if (starterBtn) {
        var text = starterBtn.getAttribute('data-chat-starter');
        if (text) {
          dom.input.value = text;
          dom.sendBtn.disabled = false;
          handleSendText();
        }
        return;
      }

      var retryBtn = e.target.closest('[data-retry-msg]');
      if (retryBtn) {
        var msgId = retryBtn.getAttribute('data-retry-msg');
        retryFailedMessage(msgId);
      }
    });

    // Global trigger support for any element with [data-open-live-chat]
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-open-live-chat]');
      if (trigger) {
        e.preventDefault();
        openChat();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.isOpen) {
        closeChat();
      }
    });

    window.addEventListener('online', function () {
      setConnectionState('online');
      loadConversationFromServer();
      connectWebSocket();
    });

    window.addEventListener('offline', function () {
      setConnectionState('offline');
    });

    window.addEventListener('ca-lang-change', function () {
      setConnectionState(state.connectionState);
      renderMessages();
    });
  }

  function openChat() {
    state.isOpen = true;
    try {
      sessionStorage.setItem(STORAGE_KEY_OPEN, '1');
    } catch (e) {}

    dom.root.classList.add('is-open');
    dom.fab.setAttribute('aria-expanded', 'true');
    dom.window.setAttribute('aria-hidden', 'false');

    if (state.unreadForVisitor > 0 || hasUnreadAdminMessages()) {
      markVisitorMessagesRead();
    }

    setTimeout(function () {
      scrollToBottom(false);
      if (window.innerWidth > 640) {
        dom.input.focus();
      }
    }, 60);
  }

  function closeChat() {
    state.isOpen = false;
    try {
      sessionStorage.removeItem(STORAGE_KEY_OPEN);
    } catch (e) {}

    dom.root.classList.remove('is-open');
    dom.fab.setAttribute('aria-expanded', 'false');
    dom.window.setAttribute('aria-hidden', 'true');
    dom.identityBar.style.display = 'none';
  }

  function hasUnreadAdminMessages() {
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].sender === 'admin' && !state.messages[i].read) {
        return true;
      }
    }
    return false;
  }

  function scrollToBottom(smooth) {
    if (!dom.messages) return;
    if (smooth && typeof dom.messages.scrollTo === 'function') {
      dom.messages.scrollTo({ top: dom.messages.scrollHeight, behavior: 'smooth' });
    } else {
      dom.messages.scrollTop = dom.messages.scrollHeight;
    }
    state.isAtBottom = true;
    state.hasNewBelowFold = false;
    if (dom.newPill) dom.newPill.style.display = 'none';
  }

  function formatAdminPresenceStatus() {
    if (state.connectionState === 'offline') {
      return tr('chat.subtitleOffline', 'Offline • Messages saved locally');
    }
    var now = Date.now();
    var lastSeen = Number(state.adminLastSeen) || 0;
    var isOnlineNow = Boolean(state.adminOnline) && (!lastSeen || (now - lastSeen < 65000));
    if (isOnlineNow) {
      return 'Active now';
    }
    if (lastSeen > 0) {
      var diffSec = Math.max(1, Math.floor((now - lastSeen) / 1000));
      if (diffSec < 60) {
        return 'Active 1 min ago';
      }
      var diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) {
        return 'Active ' + diffMin + ' min ago';
      }
      var diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) {
        return 'Active ' + diffHr + (diffHr === 1 ? ' hour ago' : ' hours ago');
      }
      var diffDays = Math.floor(diffHr / 24);
      return 'Active ' + diffDays + (diffDays === 1 ? ' day ago' : ' days ago');
    }
    return 'Active recently';
  }

  function updateAdminPresenceState(presence) {
    if (!presence || typeof presence !== 'object') return;
    if (presence.adminLastSeen) {
      state.adminLastSeen = Number(presence.adminLastSeen) || state.adminLastSeen;
    }
    if (presence.adminOnline !== undefined) {
      state.adminOnline = Boolean(presence.adminOnline);
    }
    renderPresenceStatus();
  }

  function renderPresenceStatus() {
    if (!dom.presenceDot || !dom.headerStatus) return;
    if (state.connectionState === 'offline') {
      dom.presenceDot.className = 'ca-chat-presence-dot offline';
      dom.headerStatus.textContent = tr('chat.subtitleOffline', 'Offline • Messages saved locally');
      return;
    }
    var now = Date.now();
    var lastSeen = Number(state.adminLastSeen) || 0;
    var isOnlineNow = Boolean(state.adminOnline) && (!lastSeen || (now - lastSeen < 65000));
    dom.presenceDot.className = 'ca-chat-presence-dot ' + (isOnlineNow ? 'online' : 'reconnecting');
    dom.headerStatus.textContent = formatAdminPresenceStatus();
  }

  function setConnectionState(conn) {
    state.connectionState = conn;
    if (!dom.presenceDot || !dom.headerStatus) return;

    if (conn === 'offline') {
      showBanner('You are currently offline. Messages will be sent once connection restores.', 'warning');
    } else {
      hideBanner();
    }
    renderPresenceStatus();
  }

  function showBanner(msg, type) {
    if (!dom.banner) return;
    dom.banner.textContent = msg;
    dom.banner.className = 'ca-chat-banner ' + (type || 'info');
    dom.banner.style.display = 'block';
  }

  function hideBanner() {
    if (!dom.banner) return;
    dom.banner.style.display = 'none';
    dom.banner.textContent = '';
  }

  function renderUnreadBadge() {
    if (!dom.unreadBadge) return;
    var count = state.unreadForVisitor || 0;
    if (count > 0 && !state.isOpen) {
      dom.unreadBadge.textContent = count > 99 ? '99+' : String(count);
      dom.unreadBadge.style.display = 'inline-flex';
      dom.fab.classList.add('has-unread');
    } else {
      dom.unreadBadge.style.display = 'none';
      dom.fab.classList.remove('has-unread');
    }
  }

  function renderTypingIndicator() {
    if (!dom.typing) return;
    if (state.adminTyping) {
      dom.typing.classList.add('is-typing');
      dom.typing.style.setProperty('display', 'flex', 'important');
      if (state.isAtBottom) {
        scrollToBottom(true);
      }
    } else {
      dom.typing.classList.remove('is-typing');
      dom.typing.style.setProperty('display', 'none', 'important');
    }
  }

  function renderMessages() {
    if (!dom.messages) return;

    if (state.isLoading && state.messages.length === 0) {
      dom.messages.innerHTML =
        '<div class="ca-chat-loading">' +
          '<span>Loading conversation...</span>' +
        '</div>';
      return;
    }

    if (state.messages.length === 0) {
      dom.messages.innerHTML =
        '<div class="ca-chat-empty">' +
          '<div class="ca-chat-empty-card">' +
            '<div class="ca-chat-empty-title" data-i18n="chat.welcomeTitle">' + escapeHtml(tr('chat.welcomeTitle', 'Hi! How can I help you?')) + '</div>' +
            '<p class="ca-chat-empty-desc" data-i18n="chat.welcomeDesc">' +
              escapeHtml(tr('chat.welcomeDesc', 'Send a message anytime — no login needed. Your conversation stays saved in this browser so you can check back for replies later.')) +
            '</p>' +
            '<div class="ca-chat-starters">' +
              '<button type="button" class="ca-chat-starter-btn" data-chat-starter="' + escapeHtml(tr('chat.starter1', 'Hi, I need a website or web app.')) + '">' +
                escapeHtml(tr('chat.starter1', 'Hi, I need a website or web app.')) +
              '</button>' +
              '<button type="button" class="ca-chat-starter-btn" data-chat-starter="' + escapeHtml(tr('chat.starter2', 'I would like to discuss an AI project.')) + '">' +
                escapeHtml(tr('chat.starter2', 'I would like to discuss an AI project.')) +
              '</button>' +
              '<button type="button" class="ca-chat-starter-btn" data-chat-starter="' + escapeHtml(tr('chat.starter3', 'Hello! Just wanted to connect.')) + '">' +
                escapeHtml(tr('chat.starter3', 'Hello! Just wanted to connect.')) +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      return;
    }

    var html = '';
    var lastDateLabel = '';

    for (var i = 0; i < state.messages.length; i++) {
      var m = state.messages[i];
      var dateLabel = formatDateHeading(m.timestamp);
      if (dateLabel && dateLabel !== lastDateLabel) {
        html += '<div class="ca-chat-date-divider"><span>' + escapeHtml(dateLabel) + '</span></div>';
        lastDateLabel = dateLabel;
      }

      var isVisitor = m.sender === 'visitor';
      var rowClass = 'ca-chat-msg-row ' + (isVisitor ? 'visitor' : 'admin');
      if (m.pending) rowClass += ' is-pending';
      if (m.failed) rowClass += ' is-failed';

      var mediaHtml = '';
      if (m.type === 'image' && m.mediaUrl) {
        mediaHtml =
          '<a href="' + escapeHtml(m.mediaUrl) + '" target="_blank" rel="noopener noreferrer" class="ca-chat-msg-image-wrap">' +
            '<img src="' + escapeHtml(m.mediaUrl) + '" alt="Attached image" class="ca-chat-msg-image" loading="lazy">' +
          '</a>';
      }

      var textHtml = '';
      if (m.text && !(m.type === 'image' && m.text === '[Image]')) {
        textHtml = '<div class="ca-chat-msg-text">' + formatMessageText(m.text) + '</div>';
      }

      var statusHtml = '';
      if (isVisitor) {
        if (m.failed) {
          statusHtml =
            '<button type="button" class="ca-chat-retry-btn" data-retry-msg="' + escapeHtml(m.messageId) + '">Failed • Tap to retry</button>';
        } else if (m.pending) {
          statusHtml = '<span class="ca-chat-msg-status">' + escapeHtml(tr('chat.sending', 'Sending...')) + '</span>';
        } else if (m.read) {
          statusHtml =
            '<span class="ca-chat-msg-status seen" title="Seen by Chitron">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ' +
              escapeHtml(tr('chat.seen', 'Seen')) +
            '</span>';
        } else {
          statusHtml = '<span class="ca-chat-msg-status">' + escapeHtml(tr('chat.sent', 'Delivered')) + '</span>';
        }
      }

      html +=
        '<div class="' + rowClass + '" data-msg-id="' + escapeHtml(m.messageId) + '">' +
          (!isVisitor
            ? '<img src="/images/chitron-bhattacharjee.webp" alt="Chitron" class="ca-chat-msg-avatar">'
            : '') +
          '<div class="ca-chat-msg-bubble-wrap">' +
            '<div class="ca-chat-msg-bubble">' +
              mediaHtml +
              textHtml +
            '</div>' +
            '<div class="ca-chat-msg-meta">' +
              '<span class="ca-chat-msg-time">' + escapeHtml(formatTime(m.timestamp)) + '</span>' +
              statusHtml +
            '</div>' +
          '</div>' +
        '</div>';
    }

    var wasAtBottom = state.isAtBottom;
    dom.messages.innerHTML = html;

    if (wasAtBottom) {
      scrollToBottom(false);
    } else {
      state.hasNewBelowFold = true;
      if (dom.newPill) dom.newPill.style.display = 'inline-flex';
    }
  }

  function renderAll() {
    renderPresenceStatus();
    renderUnreadBadge();
    renderMessages();
    renderTypingIndicator();
  }

  async function handleSendText() {
    var rawText = (dom.input.value || '').trim();
    if (!rawText || state.sending) return;

    if (rawText.length > MAX_MESSAGE_LENGTH) {
      showBanner('Message is too long (maximum ' + MAX_MESSAGE_LENGTH + ' characters).', 'error');
      return;
    }

    var now = Date.now();
    if (now - state.lastSentAt < COOLDOWN_MS) {
      return;
    }

    dom.input.value = '';
    dom.input.style.height = 'auto';
    dom.sendBtn.disabled = true;
    notifyVisitorTyping(false);
    hideBanner();

    await dispatchVisitorMessage({
      text: rawText,
      type: 'text',
      mediaUrl: '',
      fileName: ''
    });
  }

  async function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
      showBanner('Only image files (PNG, JPG, WEBP, GIF) are supported.', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showBanner('Image must be smaller than 8 MB.', 'error');
      return;
    }

    showBanner('Uploading image...', 'info');
    try {
      var formData = new FormData();
      formData.append('file', file);

      var res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData
      });
      var data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Image upload failed');
      }
      hideBanner();
      await dispatchVisitorMessage({
        text: dom.input.value.trim() || '[Image]',
        type: 'image',
        mediaUrl: data.url,
        fileName: file.name
      });
      dom.input.value = '';
      dom.input.style.height = 'auto';
    } catch (err) {
      showBanner(err.message || 'Could not upload image.', 'error');
    }
  }

  async function dispatchVisitorMessage(payload) {
    var messageId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    var timestamp = new Date().toISOString();

    var optimisticMsg = {
      messageId: messageId,
      visitorId: state.visitorId,
      sender: 'visitor',
      text: payload.text,
      type: payload.type || 'text',
      mediaUrl: payload.mediaUrl || '',
      fileName: payload.fileName || '',
      read: false,
      timestamp: timestamp,
      pending: true,
      failed: false
    };

    state.lastSentAt = Date.now();
    state.isAtBottom = true;
    mergeMessages([optimisticMsg]);
    renderMessages();
    scrollToBottom(true);

    try {
      var apiClient = getApiClient();
      var res = await apiClient.sendVisitorMessage(state.visitorId, {
        messageId: messageId,
        text: payload.text,
        type: payload.type || 'text',
        mediaUrl: payload.mediaUrl || '',
        fileName: payload.fileName || '',
        visitorName: state.visitorName,
        pageUrl: window.location.pathname
      });

      if (res && res.message) {
        res.message.pending = false;
        res.message.failed = false;
        mergeMessages([res.message]);
      } else {
        optimisticMsg.pending = false;
        mergeMessages([optimisticMsg]);
      }

      writeVisitorMessageToFirebaseClient(optimisticMsg);
      renderMessages();
    } catch (err) {
      optimisticMsg.pending = false;
      optimisticMsg.failed = true;
      mergeMessages([optimisticMsg]);
      renderMessages();
      showBanner(err.message || 'Failed to send message. Tap retry on the message.', 'error');
    }
  }

  async function retryFailedMessage(messageId) {
    var target = null;
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].messageId === messageId) {
        target = state.messages[i];
        break;
      }
    }
    if (!target) return;

    target.failed = false;
    target.pending = true;
    renderMessages();

    try {
      var apiClient = getApiClient();
      var res = await apiClient.sendVisitorMessage(state.visitorId, {
        messageId: target.messageId,
        text: target.text,
        type: target.type,
        mediaUrl: target.mediaUrl,
        fileName: target.fileName,
        visitorName: state.visitorName,
        pageUrl: window.location.pathname
      });
      target.pending = false;
      target.failed = false;
      if (res && res.message) {
        mergeMessages([res.message]);
      }
      hideBanner();
      renderMessages();
    } catch (err) {
      target.pending = false;
      target.failed = true;
      renderMessages();
      showBanner(err.message || 'Retry failed.', 'error');
    }
  }

  async function markVisitorMessagesRead() {
    state.unreadForVisitor = 0;
    var updated = false;
    for (var i = 0; i < state.messages.length; i++) {
      if (state.messages[i].sender === 'admin' && !state.messages[i].read) {
        state.messages[i].read = true;
        updated = true;
      }
    }
    if (updated) {
      saveLocalCache();
      renderMessages();
    }
    renderUnreadBadge();

    try {
      await getApiClient().markVisitorChatRead(state.visitorId);
    } catch (e) {}
  }

  async function loadConversationFromServer() {
    var isFirstLoad = !state.initialHistoryLoaded;
    try {
      var data = await getApiClient().getVisitorConversation(state.visitorId);
      state.isLoading = false;
      if (data && data.adminPresence) {
        updateAdminPresenceState(data.adminPresence);
      }
      if (data && data.conversation) {
        state.conversation = data.conversation;
        if (data.conversation.visitorName && !state.visitorName) {
          state.visitorName = data.conversation.visitorName;
        }
        state.unreadForVisitor = data.conversation.unreadForVisitor || 0;
        mergeMessages(data.conversation.messages || [], { isInitialSeed: isFirstLoad });
        var isFreshTyping = Boolean(
          data.conversation.adminTyping &&
          data.conversation.adminTypingAt &&
          (Date.now() - Number(data.conversation.adminTypingAt) < 4200)
        );
        if (isFreshTyping) {
          setAdminTypingState(true);
        } else if (!data.conversation.adminTyping) {
          setAdminTypingState(false);
        }
      }
      state.initialHistoryLoaded = true;
      if (state.isOpen && (state.unreadForVisitor > 0 || hasUnreadAdminMessages())) {
        markVisitorMessagesRead();
      }
      setConnectionState('online');
      renderAll();
    } catch (err) {
      state.isLoading = false;
      state.initialHistoryLoaded = true;
      renderAll();
    }
  }

  function connectWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = protocol + '//' + window.location.host + '/ws/chat?role=visitor&visitorId=' + encodeURIComponent(state.visitorId);
      var ws = new WebSocket(wsUrl);
      state.ws = ws;

      ws.onopen = function () {
        setConnectionState('online');
        try {
          ws.send(JSON.stringify({
            type: 'visitor:join',
            visitorId: state.visitorId,
            pageUrl: window.location.pathname
          }));
        } catch (e) {}
      };

      ws.onmessage = function (event) {
        try {
          var payload = JSON.parse(event.data);
          handleRealtimeEvent(payload);
        } catch (e) {}
      };

      ws.onclose = function () {
        if (navigator.onLine === false) {
          setConnectionState('offline');
        }
        clearTimeout(state.wsReconnectTimer);
        state.wsReconnectTimer = setTimeout(connectWebSocket, 3500);
      };

      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    } catch (e) {}
  }

  function sendVisitorTypingSignal(isTyping) {
    var active = Boolean(isTyping);
    state.visitorCurrentlyTyping = active;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.send(JSON.stringify({ type: 'typing:set', typing: active }));
      } catch (e) {}
    }
    try {
      fetch('/api/chat/conversation/' + encodeURIComponent(state.visitorId) + '/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typing: active,
          visitorName: state.visitorName,
          pageUrl: window.location.pathname
        })
      }).catch(function () {});
    } catch (e) {}
  }

  function notifyVisitorTyping(isTyping) {
    clearTimeout(state.visitorTypingStopTimer);
    if (!isTyping) {
      if (state.visitorCurrentlyTyping) {
        sendVisitorTypingSignal(false);
      }
      return;
    }
    var now = Date.now();
    if (!state.visitorCurrentlyTyping || now - state.lastVisitorTypingSentAt > 1500) {
      state.lastVisitorTypingSentAt = now;
      sendVisitorTypingSignal(true);
    }
    state.visitorTypingStopTimer = setTimeout(function () {
      sendVisitorTypingSignal(false);
    }, 2500);
  }

  function handleRealtimeEvent(payload) {
    if (!payload || !payload.type) return;

    if (payload.type === 'conversation:init' && payload.conversation) {
      var isFirstInit = !state.initialHistoryLoaded;
      state.isLoading = false;
      if (payload.adminPresence) {
        updateAdminPresenceState(payload.adminPresence);
      }
      mergeMessages(payload.conversation.messages || [], { isInitialSeed: isFirstInit });
      state.initialHistoryLoaded = true;
      state.unreadForVisitor = payload.conversation.unreadForVisitor || 0;
      renderAll();
      return;
    }

    if (payload.type === 'admin:presence') {
      updateAdminPresenceState({
        adminOnline: payload.adminOnline,
        adminLastSeen: payload.adminLastSeen
      });
      return;
    }

    if ((payload.type === 'message:created' || payload.type === 'message') && payload.message) {
      var msg = payload.message;
      var wasAlreadyNotified = Boolean(state.notifiedMsgIds[msg.messageId]);
      var changed = mergeMessages([msg], { isInitialSeed: false });
      if (msg.sender === 'admin') {
        updateAdminPresenceState({ adminOnline: true, adminLastSeen: Date.now() });
        setAdminTypingState(false);
        if (!wasAlreadyNotified) {
          state.notifiedMsgIds[msg.messageId] = true;
          playMessageReceivedBeep();
        }
        if (state.isOpen) {
          markVisitorMessagesRead();
        } else {
          state.unreadForVisitor = (payload.conversation && payload.conversation.unreadForVisitor) || (state.unreadForVisitor + 1);
          saveLocalCache();
        }
      }
      if (changed) {
        renderAll();
      }
    } else if (payload.type === 'messages:read' || payload.type === 'read_receipt') {
      if (payload.reader === 'admin') {
        var anyRead = false;
        for (var i = 0; i < state.messages.length; i++) {
          if (state.messages[i].sender === 'visitor' && !state.messages[i].read) {
            state.messages[i].read = true;
            anyRead = true;
          }
        }
        if (anyRead) {
          saveLocalCache();
          renderMessages();
        }
      }
    } else if ((payload.type === 'typing:update' || payload.type === 'typing') && payload.sender === 'admin') {
      var isTyp = Boolean(payload.typing !== undefined ? payload.typing : payload.isTyping);
      if (isTyp) {
        updateAdminPresenceState({ adminOnline: true, adminLastSeen: Date.now() });
      }
      setAdminTypingState(isTyp);
    }
  }

  async function initFirebaseRealtimeListeners() {
    try {
      var cfg = await getApiClient().getFirebaseConfig();
      if (!cfg || !cfg.apiKey || !cfg.projectId) return;

      var fbAppMod = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js');
      var app = fbAppMod.getApps().length ? fbAppMod.getApp() : fbAppMod.initializeApp(cfg);

      // 1. Firebase Realtime Database Listener (Primary low-latency live typing + messages)
      if (cfg.databaseURL) {
        try {
          var fbRtdbMod = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js');
          var rtdb = fbRtdbMod.getDatabase(app, cfg.databaseURL);
          state.fbRtdb = { db: rtdb, mod: fbRtdbMod };

          // Listen to Admin Presence in RTDB
          var rtdbPresenceRef = fbRtdbMod.ref(rtdb, 'presence/admin');
          fbRtdbMod.onValue(
            rtdbPresenceRef,
            function (pSnap) {
              var pData = pSnap.val();
              if (pData && typeof pData === 'object') {
                updateAdminPresenceState(pData);
              }
            },
            function () {}
          );

          var rtdbConvRef = fbRtdbMod.ref(rtdb, 'conversations/' + state.visitorId);
          var firstRtdbSnap = true;
          state.fbUnsubRtdb = fbRtdbMod.onValue(
            rtdbConvRef,
            function (snap) {
              var data = snap.val();
              if (!data) {
                firstRtdbSnap = false;
                return;
              }
              var isTypingNow = Boolean(
                data.adminTyping &&
                data.adminTypingAt &&
                (Date.now() - Number(data.adminTypingAt) < 4200)
              );
              setAdminTypingState(isTypingNow);

              if (!state.isOpen && typeof data.unreadForVisitor === 'number') {
                state.unreadForVisitor = data.unreadForVisitor;
                renderUnreadBadge();
              }

              if (Array.isArray(data.messages) && data.messages.length > 0) {
                var changed = mergeMessages(data.messages, { isInitialSeed: firstRtdbSnap && !state.initialHistoryLoaded });
                state.initialHistoryLoaded = true;
                if (changed) {
                  if (state.isOpen && hasUnreadAdminMessages()) {
                    markVisitorMessagesRead();
                  }
                  renderAll();
                }
              }
              firstRtdbSnap = false;
            },
            function () {}
          );
        } catch (rtdbErr) {}
      }

      // 2. Firestore Listener (Secondary sync)
      var fbFirestoreMod = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js');
      var db = cfg.firestoreDatabaseId
        ? fbFirestoreMod.getFirestore(app, cfg.firestoreDatabaseId)
        : fbFirestoreMod.getFirestore(app);
      state.fbDb = { db: db, mod: fbFirestoreMod };

      var convRef = fbFirestoreMod.doc(db, 'conversations', state.visitorId);
      state.fbUnsubConv = fbFirestoreMod.onSnapshot(
        convRef,
        function (snap) {
          if (!snap.exists()) return;
          var data = snap.data();
          if (!data) return;
          var isTypingNow = Boolean(
            data.adminTyping &&
            data.adminTypingAt &&
            (Date.now() - Number(data.adminTypingAt) < 4200)
          );
          if (isTypingNow) {
            setAdminTypingState(true);
          } else if (data.adminTyping === false) {
            setAdminTypingState(false);
          }
          if (!state.isOpen && typeof data.unreadForVisitor === 'number') {
            state.unreadForVisitor = data.unreadForVisitor;
          }
          renderUnreadBadge();
        },
        function () {}
      );

      var msgsRef = fbFirestoreMod.collection(db, 'conversations', state.visitorId, 'messages');
      var firstFsSnap = true;
      state.fbUnsubMsgs = fbFirestoreMod.onSnapshot(
        msgsRef,
        function (querySnap) {
          var incoming = [];
          querySnap.forEach(function (docSnap) {
            incoming.push(docSnap.data());
          });
          if (incoming.length > 0) {
            var changed = mergeMessages(incoming, { isInitialSeed: firstFsSnap && !state.initialHistoryLoaded });
            state.initialHistoryLoaded = true;
            if (changed) {
              if (state.isOpen && hasUnreadAdminMessages()) {
                markVisitorMessagesRead();
              }
              renderAll();
            }
          }
          firstFsSnap = false;
        },
        function () {}
      );
    } catch (e) {}
  }

  async function writeVisitorMessageToFirebaseClient(msg) {
    if (!state.fbDb || !state.fbDb.db || !state.fbDb.mod) return;
    try {
      var db = state.fbDb.db;
      var mod = state.fbDb.mod;
      var convRef = mod.doc(db, 'conversations', state.visitorId);
      var msgRef = mod.doc(db, 'conversations', state.visitorId, 'messages', msg.messageId);
      await mod.setDoc(convRef, {
        visitorId: state.visitorId,
        visitorName: state.visitorName || 'Visitor #' + state.visitorId.slice(-4).toUpperCase(),
        lastMessage: msg.text.slice(0, 500),
        lastTimestamp: Date.now(),
        lastSender: 'visitor',
        status: 'active',
        visitorOnline: true,
        visitorTyping: false,
        pageUrl: window.location.pathname,
        updatedAt: Date.now()
      }, { merge: true });
      await mod.setDoc(msgRef, {
        messageId: msg.messageId,
        visitorId: state.visitorId,
        sender: 'visitor',
        text: msg.text,
        type: msg.type || 'text',
        mediaUrl: msg.mediaUrl || '',
        fileName: msg.fileName || '',
        read: false,
        timestamp: Date.now()
      }, { merge: true });
    } catch (e) {}
  }

  function init() {
    initVisitorIdentity();
    buildChatWidgetDOM();
    loadConversationFromServer();
    connectWebSocket();
    initFirebaseRealtimeListeners();

    try {
      if (sessionStorage.getItem(STORAGE_KEY_OPEN) === '1') {
        openChat();
      }
    } catch (e) {}

    state.pollTimer = setInterval(function () {
      renderPresenceStatus();
      if (document.visibilityState === 'visible') {
        loadConversationFromServer();
      }
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ChitronMessenger = {
    open: openChat,
    close: closeChat,
    getVisitorId: function () { return state.visitorId; }
  };
})();
