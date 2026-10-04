// ============================================
// Chitron's Archive — Admin Real-Time Messenger Controller
// Supports Admin Panel (/admin/) and Dedicated Admin Messenger App (/admin/messages.html)
// Real-Time WebSocket + Firebase (Firestore & Google Auth) + Push/Local Notifications
// ============================================

(function () {
  'use strict';

  var state = {
    initialized: false,
    conversations: [],
    activeVisitorId: '',
    activeConversation: null,
    filter: 'all',
    searchQuery: '',
    totalUnread: 0,
    visitorTypingMap: {},
    ws: null,
    wsReconnectTimer: null,
    pollTimer: null,
    fbApp: null,
    fbAuth: null,
    fbDb: null,
    fbUser: null,
    sending: false
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  function formatMessageText(raw) {
    var escaped = escapeHtml(raw);
    return escaped.replace(
      /(https?:\/\/[^\s<>"']+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="ca-chat-link">$1</a>'
    );
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 45) return 'Just now';
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + ' min ago';
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + (diffHr === 1 ? ' hour ago' : ' hours ago');
    var diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return diffDays + ' days ago';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatClockTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function FriendlyVisitorName(conv) {
    if (conv && conv.visitorName && conv.visitorName.trim()) {
      return conv.visitorName.trim();
    }
    var vid = (conv && conv.visitorId) || '';
    var shortCode = vid.replace('visitor_', '').slice(-4).toUpperCase() || '001';
    return 'Visitor #' + shortCode;
  }

  // ---- Web Audio Chime for Incoming Visitor Message ----
  function playNotificationChime() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.11); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch (e) {}
  }

  // ---- Browser / Local Push Notification ----
  function triggerAdminNotification(conv, msg) {
    playNotificationChime();
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        var title = 'New message from ' + FriendlyVisitorName(conv);
        var n = new Notification(title, {
          body: (msg && msg.text) ? String(msg.text).slice(0, 140) : 'Sent an attachment',
          icon: 'https://i.ibb.co.com/Pv931317/20251110-124406.jpg',
          tag: 'ca-chat-' + (conv ? conv.visitorId : 'msg')
        });
        n.onclick = function () {
          window.focus();
          if (conv && conv.visitorId) {
            var msgSidebarBtn = $('#sidebar-messages-btn');
            if (msgSidebarBtn) msgSidebarBtn.click();
            selectConversation(conv.visitorId);
          }
          n.close();
        };
      } catch (e) {}
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      alertToast('Browser notifications are not supported in this browser.');
      return;
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm === 'granted') {
        alertToast('Real-time message notifications enabled!');
      } else {
        alertToast('Notification permission was not granted.');
      }
    } catch (e) {}
  }

  function alertToast(message) {
    var container = $('#toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 3200);
  }

  // ---- Badge Updates ----
  function updateUnreadBadges(totalUnread) {
    state.totalUnread = typeof totalUnread === 'number' ? totalUnread : 0;
    var sidebarBadge = $('#sidebar-unread-badge');
    if (sidebarBadge) {
      if (state.totalUnread > 0) {
        sidebarBadge.textContent = state.totalUnread > 99 ? '99+' : String(state.totalUnread);
        sidebarBadge.style.display = 'inline-flex';
      } else {
        sidebarBadge.style.display = 'none';
      }
    }
    var dashStat = $('#stat-unread-messages');
    if (dashStat) {
      dashStat.textContent = String(state.totalUnread);
    }
  }

  // ---- Load Conversations List ----
  async function loadConversations() {
    try {
      var data = await window.api.adminGetConversations({
        status: state.filter,
        search: state.searchQuery
      });
      if (data && Array.isArray(data.conversations)) {
        state.conversations = data.conversations;
        var unreadTotal = typeof data.totalUnreadForAdmin === 'number'
          ? data.totalUnreadForAdmin
          : (data.totalUnread || 0);
        updateUnreadBadges(unreadTotal);
        renderConversationList();
      }
    } catch (e) {}
  }

  function renderConversationList() {
    var listEl = $('#admin-conv-list');
    if (!listEl) return;

    if (!state.conversations || state.conversations.length === 0) {
      listEl.innerHTML =
        '<div class="admin-conv-empty">' +
          'No conversations match the current filter.' +
        '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < state.conversations.length; i++) {
      var c = state.conversations[i];
      var isActive = c.visitorId === state.activeVisitorId;
      var unreadCount = c.unreadForAdmin || 0;
      var displayName = FriendlyVisitorName(c);
      var avatarInitial = displayName.replace(/^Visitor #/i, '').charAt(0).toUpperCase() || 'V';
      var lastMsgPrefix = c.lastSender === 'admin' ? 'You: ' : '';
      var previewText = c.lastMessage ? (lastMsgPrefix + c.lastMessage) : 'Started a conversation';

      html +=
        '<button type="button" class="admin-conv-item' +
          (isActive ? ' active' : '') +
          (unreadCount > 0 ? ' is-unread' : '') +
        '" data-visitor-id="' + escapeHtml(c.visitorId) + '">' +
          '<div class="admin-conv-avatar">' + escapeHtml(avatarInitial) + '</div>' +
          '<div class="admin-conv-body">' +
            '<div class="admin-conv-top">' +
              '<span class="admin-conv-name">' + escapeHtml(displayName) + '</span>' +
              '<span class="admin-conv-time">' + escapeHtml(formatRelativeTime(c.lastMessageAt || c.createdAt)) + '</span>' +
            '</div>' +
            '<div class="admin-conv-preview">' + escapeHtml(previewText) + '</div>' +
            '<div class="admin-conv-foot">' +
              (unreadCount > 0
                ? '<span class="admin-conv-unread-dot">' + unreadCount + ' unread</span>'
                : '<span class="admin-conv-status-tag">' + escapeHtml(c.status || 'active') + '</span>') +
              '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary)">' +
                escapeHtml(c.visitorId.slice(-8)) +
              '</span>' +
            '</div>' +
          '</div>' +
        '</button>';
    }

    listEl.innerHTML = html;
  }

  // ---- Select & Load Full Conversation Thread ----
  async function selectConversation(visitorId) {
    if (!visitorId) return;
    state.activeVisitorId = visitorId;
    var shell = $('#admin-messenger-shell');
    if (shell) shell.classList.add('thread-open');

    renderConversationList();

    var placeholder = $('#admin-conv-placeholder');
    var threadWrap = $('#admin-conv-thread-wrap');
    if (placeholder) placeholder.style.display = 'none';
    if (threadWrap) threadWrap.style.display = 'flex';

    try {
      var data = await window.api.adminGetConversation(visitorId);
      if (data && data.conversation) {
        state.activeConversation = data.conversation;
        renderActiveThread();
        if ((data.conversation.unreadForAdmin || 0) > 0) {
          await window.api.adminMarkConversationRead(visitorId);
          loadConversations();
        }
      }
    } catch (err) {
      alertToast(err.message || 'Could not load conversation');
    }
  }

  function renderActiveThread() {
    var conv = state.activeConversation;
    if (!conv) return;

    var nameEl = $('#admin-active-visitor-name');
    var statusEl = $('#admin-active-visitor-status');
    var metaEl = $('#admin-active-visitor-meta');
    var avatarEl = $('#admin-active-visitor-avatar');
    var archiveBtn = $('#admin-archive-visitor-btn');
    var blockBtn = $('#admin-block-visitor-btn');

    var friendly = FriendlyVisitorName(conv);
    if (nameEl) nameEl.textContent = friendly;
    if (statusEl) statusEl.textContent = conv.status || 'active';
    if (avatarEl) avatarEl.textContent = friendly.replace(/^Visitor #/i, '').charAt(0).toUpperCase() || 'V';
    if (metaEl) {
      var metaParts = ['ID: ' + conv.visitorId];
      if (conv.pageUrl) metaParts.push('Page: ' + conv.pageUrl);
      metaEl.textContent = metaParts.join(' • ');
    }
    if (archiveBtn) {
      archiveBtn.textContent = conv.status === 'archived' ? 'Unarchive' : 'Archive';
    }
    if (blockBtn) {
      blockBtn.textContent = conv.status === 'blocked' ? 'Unblock' : 'Block';
    }

    var msgsContainer = $('#admin-thread-messages');
    if (!msgsContainer) return;

    var msgs = Array.isArray(conv.messages) ? conv.messages : [];
    if (msgs.length === 0) {
      msgsContainer.innerHTML = '<div class="admin-conv-empty">No messages in this conversation yet.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var isAdmin = m.sender === 'admin';
      // In Admin view: Admin messages align right (like visitor bubble color), Visitor messages align left
      var rowClass = 'ca-chat-msg-row ' + (isAdmin ? 'visitor' : 'admin');

      var mediaHtml = '';
      if (m.type === 'image' && m.mediaUrl) {
        mediaHtml =
          '<a href="' + escapeHtml(m.mediaUrl) + '" target="_blank" rel="noopener noreferrer" class="ca-chat-msg-image-wrap">' +
            '<img src="' + escapeHtml(m.mediaUrl) + '" alt="Attachment" class="ca-chat-msg-image" loading="lazy">' +
          '</a>';
      }

      var textHtml = '';
      if (m.text && !(m.type === 'image' && m.text === '[Image]')) {
        textHtml = '<div class="ca-chat-msg-text">' + formatMessageText(m.text) + '</div>';
      }

      var statusHtml = '';
      if (isAdmin) {
        statusHtml = m.read
          ? '<span class="ca-chat-msg-status seen">Seen by visitor</span>'
          : '<span class="ca-chat-msg-status">Delivered</span>';
      }

      html +=
        '<div class="' + rowClass + '" data-msg-id="' + escapeHtml(m.messageId) + '">' +
          '<div class="ca-chat-msg-bubble-wrap">' +
            '<div class="ca-chat-msg-bubble">' +
              mediaHtml +
              textHtml +
            '</div>' +
            '<div class="ca-chat-msg-meta">' +
              '<span>' + escapeHtml(isAdmin ? 'You' : friendly) + '</span>' +
              '<span>•</span>' +
              '<span>' + escapeHtml(formatClockTime(m.timestamp)) + '</span>' +
              (statusHtml ? '<span>•</span>' + statusHtml : '') +
            '</div>' +
          '</div>' +
        '</div>';
    }

    msgsContainer.innerHTML = html;
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
  }

  // ---- Send Admin Reply ----
  async function handleSendReply(payload) {
    if (!state.activeVisitorId || state.sending) return;
    state.sending = true;
    var sendBtn = $('#admin-chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      var messageId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      var res = await window.api.adminSendReply(state.activeVisitorId, {
        messageId: messageId,
        text: payload.text,
        type: payload.type || 'text',
        mediaUrl: payload.mediaUrl || '',
        fileName: payload.fileName || ''
      });

      if (res && res.conversation) {
        state.activeConversation = res.conversation;
        renderActiveThread();
        loadConversations();
      }

      // Also write to Firestore directly if admin is signed in with Firebase Auth
      writeAdminReplyToFirebase(state.activeVisitorId, {
        messageId: messageId,
        text: payload.text,
        type: payload.type || 'text',
        mediaUrl: payload.mediaUrl || '',
        fileName: payload.fileName || ''
      });
    } catch (err) {
      alertToast(err.message || 'Failed to send reply');
    } finally {
      state.sending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // ---- WebSocket Live Stream for Admin ----
  function connectAdminWebSocket() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = protocol + '//' + window.location.host + '/ws/chat?role=admin';
      var ws = new WebSocket(wsUrl);
      state.ws = ws;

      ws.onopen = function () {
        try {
          var token = (window.api && typeof window.api.getAdminToken === 'function')
            ? window.api.getAdminToken()
            : '';
          ws.send(JSON.stringify({ type: 'admin:join', token: token }));
        } catch (e) {}
      };

      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(ev.data);
          handleAdminRealtimeEvent(data);
        } catch (e) {}
      };

      ws.onclose = function () {
        clearTimeout(state.wsReconnectTimer);
        state.wsReconnectTimer = setTimeout(connectAdminWebSocket, 3500);
      };

      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    } catch (e) {}
  }

  function notifyAdminTyping(isTyping) {
    if (!state.activeVisitorId) return;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      try {
        state.ws.send(JSON.stringify({
          type: 'typing:set',
          visitorId: state.activeVisitorId,
          typing: Boolean(isTyping)
        }));
      } catch (e) {}
    }
  }

  function handleAdminRealtimeEvent(payload) {
    if (!payload || !payload.type) return;

    if (payload.type === 'message:created' || payload.type === 'message') {
      var vId = payload.visitorId;
      var msg = payload.message;
      var conv = payload.conversation;

      if (msg && msg.sender === 'visitor') {
        triggerAdminNotification(conv || { visitorId: vId }, msg);
      }

      if (vId === state.activeVisitorId) {
        selectConversation(vId);
      } else {
        loadConversations();
      }
    } else if (payload.type === 'messages:read' || payload.type === 'read_receipt') {
      if (payload.visitorId === state.activeVisitorId && state.activeConversation) {
        var msgs = state.activeConversation.messages || [];
        for (var i = 0; i < msgs.length; i++) {
          if (msgs[i].sender === 'admin') msgs[i].read = true;
        }
        renderActiveThread();
      }
      loadConversations();
    } else if ((payload.type === 'typing:update' || payload.type === 'typing') && payload.sender === 'visitor') {
      var typingEl = $('#admin-thread-typing');
      if (payload.visitorId === state.activeVisitorId && typingEl) {
        var isTyp = payload.typing !== undefined ? payload.typing : payload.isTyping;
        typingEl.style.display = isTyp ? 'block' : 'none';
      }
    } else if (
      payload.type === 'conversation:updated' ||
      payload.type === 'conversation:deleted' ||
      payload.type === 'conversation_updated' ||
      payload.type === 'conversation_deleted'
    ) {
      loadConversations();
    }
  }

  // ---- Firebase Auth & Direct Firestore Admin Sync ----
  async function initFirebaseAdminModule() {
    try {
      var cfg = await window.api.getFirebaseConfig();
      if (!cfg || !cfg.apiKey || !cfg.projectId) return;

      var fbAppMod = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js');
      var fbAuthMod = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js');
      var fbFirestoreMod = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js');

      var app = fbAppMod.getApps().length ? fbAppMod.getApp() : fbAppMod.initializeApp(cfg);
      var auth = fbAuthMod.getAuth(app);
      var db = cfg.firestoreDatabaseId
        ? fbFirestoreMod.getFirestore(app, cfg.firestoreDatabaseId)
        : fbFirestoreMod.getFirestore(app);

      state.fbApp = app;
      state.fbAuth = { auth: auth, mod: fbAuthMod };
      state.fbDb = { db: db, mod: fbFirestoreMod };

      fbAuthMod.onAuthStateChanged(auth, async function (user) {
        state.fbUser = user || null;
        var authBtn = $('#admin-chat-firebase-auth-btn');
        if (user) {
          if (authBtn) {
            authBtn.style.color = '#16a34a';
            authBtn.title = 'Firebase Admin Connected: ' + (user.email || user.uid);
          }
          // Provision /admins/{uid} document if owner email matches
          try {
            var adminRef = fbFirestoreMod.doc(db, 'admins', user.uid);
            await fbFirestoreMod.setDoc(adminRef, {
              uid: user.uid,
              email: user.email || '',
              role: 'admin',
              createdAt: fbFirestoreMod.serverTimestamp()
            }, { merge: true });
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  async function signInFirebaseAdminWithGoogle() {
    if (!state.fbAuth) {
      await initFirebaseAdminModule();
    }
    if (!state.fbAuth || !state.fbAuth.auth) {
      alertToast('Firebase SDK could not be initialized.');
      return;
    }
    try {
      var provider = new state.fbAuth.mod.GoogleAuthProvider();
      var result = await state.fbAuth.mod.signInWithPopup(state.fbAuth.auth, provider);
      if (result && result.user) {
        alertToast('Connected Firebase Admin (' + result.user.email + ')');
      }
    } catch (err) {
      alertToast(err.message || 'Firebase Google sign-in cancelled');
    }
  }

  async function writeAdminReplyToFirebase(visitorId, msg) {
    if (!state.fbDb || !state.fbDb.db || !state.fbDb.mod) return;
    try {
      var db = state.fbDb.db;
      var mod = state.fbDb.mod;
      var convRef = mod.doc(db, 'conversations', visitorId);
      var msgRef = mod.doc(db, 'conversations', visitorId, 'messages', msg.messageId);
      await mod.setDoc(convRef, {
        visitorId: visitorId,
        lastMessage: msg.text.slice(0, 500),
        lastTimestamp: Date.now(),
        lastSender: 'admin',
        unreadForAdmin: 0,
        adminTyping: false,
        updatedAt: Date.now()
      }, { merge: true });
      await mod.setDoc(msgRef, {
        messageId: msg.messageId,
        visitorId: visitorId,
        sender: 'admin',
        text: msg.text,
        type: msg.type || 'text',
        mediaUrl: msg.mediaUrl || '',
        fileName: msg.fileName || '',
        read: false,
        timestamp: Date.now()
      }, { merge: true });
    } catch (e) {}
  }

  // ---- Bind DOM Events ----
  function bindEvents() {
    var dashCard = $('#dash-stat-messages-card');
    if (dashCard) {
      dashCard.addEventListener('click', function () {
        var btn = $('#sidebar-messages-btn');
        if (btn) btn.click();
      });
    }

    var notifBtn = $('#admin-chat-notif-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', requestNotificationPermission);
    }

    var fbAuthBtn = $('#admin-chat-firebase-auth-btn');
    if (fbAuthBtn) {
      fbAuthBtn.addEventListener('click', signInFirebaseAdminWithGoogle);
    }

    var searchInput = $('#admin-chat-search');
    if (searchInput) {
      var debounceTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          state.searchQuery = searchInput.value.trim();
          loadConversations();
        }, 220);
      });
    }

    var filtersWrap = $('#admin-conv-filters');
    if (filtersWrap) {
      filtersWrap.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-chat-filter]');
        if (!btn) return;
        state.filter = btn.getAttribute('data-chat-filter') || 'all';
        filtersWrap.querySelectorAll('.admin-conv-filter').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        loadConversations();
      });
    }

    var convList = $('#admin-conv-list');
    if (convList) {
      convList.addEventListener('click', function (e) {
        var item = e.target.closest('[data-visitor-id]');
        if (!item) return;
        selectConversation(item.getAttribute('data-visitor-id'));
      });
    }

    var backBtn = $('#admin-thread-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        var shell = $('#admin-messenger-shell');
        if (shell) shell.classList.remove('thread-open');
      });
    }

    // Rename visitor inline
    var renameBtn = $('#admin-rename-visitor-btn');
    if (renameBtn) {
      renameBtn.addEventListener('click', async function () {
        if (!state.activeConversation) return;
        var currentName = FriendlyVisitorName(state.activeConversation);
        var nameInput = $('#admin-active-visitor-name');
        if (!nameInput) return;

        var currentText = state.activeConversation.visitorName || '';
        var inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.value = currentText || currentName;
        inputEl.style.cssText = 'padding:3px 8px;font-size:13px;border:1px solid var(--accent);border-radius:4px;background:var(--bg);color:var(--text);';
        nameInput.replaceWith(inputEl);
        inputEl.focus();
        inputEl.select();

        var finishRename = async function () {
          var nextName = inputEl.value.trim().slice(0, 60);
          var span = document.createElement('span');
          span.className = 'admin-visitor-name';
          span.id = 'admin-active-visitor-name';
          span.textContent = nextName || currentName;
          inputEl.replaceWith(span);
          if (nextName && nextName !== currentText) {
            try {
              var res = await window.api.adminUpdateConversationStatus(state.activeVisitorId, {
                visitorName: nextName
              });
              if (res && res.conversation) {
                state.activeConversation = res.conversation;
                renderActiveThread();
                loadConversations();
                alertToast('Visitor renamed');
              }
            } catch (e) {}
          }
        };

        inputEl.addEventListener('blur', finishRename, { once: true });
        inputEl.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            inputEl.blur();
          }
        });
      });
    }

    // Archive / Unarchive
    var archiveBtn = $('#admin-archive-visitor-btn');
    if (archiveBtn) {
      archiveBtn.addEventListener('click', async function () {
        if (!state.activeConversation) return;
        var nextStatus = state.activeConversation.status === 'archived' ? 'active' : 'archived';
        try {
          var res = await window.api.adminUpdateConversationStatus(state.activeVisitorId, { status: nextStatus });
          if (res && res.conversation) {
            state.activeConversation = res.conversation;
            renderActiveThread();
            loadConversations();
            alertToast('Conversation marked as ' + nextStatus);
          }
        } catch (err) {
          alertToast(err.message || 'Could not update status');
        }
      });
    }

    // Block / Unblock
    var blockBtn = $('#admin-block-visitor-btn');
    if (blockBtn) {
      blockBtn.addEventListener('click', async function () {
        if (!state.activeConversation) return;
        var nextStatus = state.activeConversation.status === 'blocked' ? 'active' : 'blocked';
        try {
          var res = await window.api.adminUpdateConversationStatus(state.activeVisitorId, { status: nextStatus });
          if (res && res.conversation) {
            state.activeConversation = res.conversation;
            renderActiveThread();
            loadConversations();
            alertToast('Visitor ' + (nextStatus === 'blocked' ? 'blocked' : 'unblocked'));
          }
        } catch (err) {
          alertToast(err.message || 'Could not update status');
        }
      });
    }

    // Delete Conversation
    var deleteBtn = $('#admin-delete-visitor-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        if (!state.activeVisitorId) return;
        try {
          await window.api.adminDeleteConversation(state.activeVisitorId);
          alertToast('Conversation permanently deleted');
          state.activeVisitorId = '';
          state.activeConversation = null;
          var placeholder = $('#admin-conv-placeholder');
          var threadWrap = $('#admin-conv-thread-wrap');
          if (placeholder) placeholder.style.display = '';
          if (threadWrap) threadWrap.style.display = 'none';
          var shell = $('#admin-messenger-shell');
          if (shell) shell.classList.remove('thread-open');
          loadConversations();
        } catch (err) {
          alertToast(err.message || 'Failed to delete conversation');
        }
      });
    }

    // Reply Composer
    var replyInput = $('#admin-chat-reply-input');
    var composerForm = $('#admin-thread-composer');
    if (replyInput) {
      replyInput.addEventListener('input', function () {
        replyInput.style.height = 'auto';
        replyInput.style.height = Math.min(replyInput.scrollHeight, 120) + 'px';
        notifyAdminTyping(replyInput.value.trim().length > 0);
      });

      replyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          var text = replyInput.value.trim();
          if (text) {
            replyInput.value = '';
            replyInput.style.height = 'auto';
            handleSendReply({ text: text, type: 'text' });
          }
        }
      });
    }

    if (composerForm) {
      composerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!replyInput) return;
        var text = replyInput.value.trim();
        if (!text) return;
        replyInput.value = '';
        replyInput.style.height = 'auto';
        handleSendReply({ text: text, type: 'text' });
      });
    }

    // Image attachment in Admin Reply
    var attachBtn = $('#admin-chat-attach-btn');
    var fileInput = $('#admin-chat-file-input');
    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function () {
        fileInput.click();
      });

      fileInput.addEventListener('change', async function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file || !state.activeVisitorId) return;
        fileInput.value = '';
        try {
          alertToast('Uploading image...');
          var formData = new FormData();
          formData.append('file', file);
          var upRes = await fetch('/api/chat/upload', { method: 'POST', body: formData });
          var upData = await upRes.json();
          if (upRes.ok && upData && upData.url) {
            await handleSendReply({
              text: (replyInput && replyInput.value.trim()) || '[Image]',
              type: 'image',
              mediaUrl: upData.url,
              fileName: file.name
            });
            if (replyInput) replyInput.value = '';
          } else {
            throw new Error((upData && upData.error) || 'Image upload failed');
          }
        } catch (err) {
          alertToast(err.message || 'Image upload failed');
        }
      });
    }
  }

  function init() {
    if (state.initialized) {
      loadConversations();
      return;
    }
    state.initialized = true;
    bindEvents();
    loadConversations();
    connectAdminWebSocket();
    initFirebaseAdminModule();

    state.pollTimer = setInterval(function () {
      if (document.visibilityState === 'visible') {
        loadConversations();
        if (state.activeVisitorId) {
          window.api.adminGetConversation(state.activeVisitorId).then(function (data) {
            if (data && data.conversation) {
              var prevLen = (state.activeConversation && state.activeConversation.messages) ? state.activeConversation.messages.length : 0;
              var nextLen = (data.conversation.messages || []).length;
              if (nextLen !== prevLen) {
                state.activeConversation = data.conversation;
                renderActiveThread();
              }
            }
          }).catch(function () {});
        }
      }
    }, 8000);
  }

  function onOpenView() {
    init();
    loadConversations();
  }

  window.AdminChat = {
    init: init,
    onOpenView: onOpenView,
    selectConversation: selectConversation,
    refresh: loadConversations
  };
})();
