/* =========================================================
   Chitrons Archive — Admin Panel
   ========================================================= */

(function() {
  'use strict';

  let currentView = 'dashboard';
  let currentFilter = '';
  let editingPostId = null;
  let isDirty = false;
  let autosaveTimer = null;
  let postTags = [];

  /* --- Helpers --- */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function toast(msg, type) {
    const c = $('#toast-container');
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function showModal(title, body, onConfirm) {
    $('#modal-title').textContent = title;
    $('#modal-body').textContent = body;
    $('#modal-overlay').classList.remove('hidden');
    const confirm = $('#modal-confirm');
    const cancel = $('#modal-cancel');
    const close = () => { $('#modal-overlay').classList.add('hidden'); confirm.onclick = null; cancel.onclick = null; };
    cancel.onclick = close;
    confirm.onclick = () => { close(); onConfirm(); };
  }

  function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
  }

  /* --- Auth --- */
  async function checkAuth() {
    try {
      const data = await API.checkAuth();
      if (data.isAdmin) return showAdmin();
    } catch (e) {}
    showLogin();
  }

  function showLogin() {
    $('#login-view').style.display = '';
    $('#admin-app').style.display = 'none';
  }

  function showAdmin() {
    $('#login-view').style.display = 'none';
    $('#admin-app').style.display = 'flex';
    loadDashboard();
  }

  /* --- Sidebar --- */
  function switchView(view, filter) {
    currentView = view;
    currentFilter = filter || '';
    $$('.admin-view').forEach(v => v.style.display = 'none');
    const el = $(`#view-${view}`);
    if (el) el.style.display = '';
    $$('.sidebar-link').forEach(l => l.classList.remove('active'));
    const activeLink = filter !== undefined
      ? $(`.sidebar-link[data-view="${view}"][data-filter="${filter || ''}"]`)
      : $(`.sidebar-link[data-view="${view}"]`);
    if (activeLink) activeLink.classList.add('active');
    const titles = { dashboard: 'Dashboard', posts: filter ? filter.charAt(0).toUpperCase() + filter.slice(1) + ' Posts' : 'All Posts', editor: editingPostId ? 'Edit Post' : 'New Post', labels: 'Labels' };
    $('#topbar-title').textContent = titles[view] || view;
    if (view === 'dashboard') loadDashboard();
    else if (view === 'posts') loadPostsList();
    else if (view === 'labels') loadLabels();
    closeSidebar();
  }

  function openSidebar() { $('#admin-sidebar').classList.add('open'); $('#sidebar-overlay').classList.add('open'); }
  function closeSidebar() { $('#admin-sidebar').classList.remove('open'); $('#sidebar-overlay').classList.remove('open'); }

  /* --- Dashboard --- */
  async function loadDashboard() {
    try {
      const data = await API.adminGetStats();
      $('#stat-total').textContent = data.total || 0;
      $('#stat-published').textContent = data.published || 0;
      $('#stat-drafts').textContent = data.drafts || 0;
      $('#stat-scheduled').textContent = data.scheduled || 0;
    } catch (e) {
      toast('Failed to load stats', 'error');
    }
    try {
      const data = await API.adminGetPosts({ limit: 5 });
      const el = $('#dash-recent');
      if (data.posts && data.posts.length > 0) {
        el.innerHTML = data.posts.map(p => `
          <div class="post-item" style="cursor:pointer" data-id="${p._id}">
            <div class="post-item-meta">
              <span class="status-badge ${p.status}">${p.status}</span>
              <span class="dot" aria-hidden="true">&middot;</span>
              <span>${formatDate(p.updatedAt || p.createdAt)}</span>
            </div>
            <h3 style="cursor:pointer" data-id="${p._id}">${esc(p.title)}</h3>
          </div>
        `).join('');
        el.querySelectorAll('h3[data-id]').forEach(h => {
          h.addEventListener('click', () => editPost(h.dataset.id));
        });
      } else {
        el.innerHTML = '<div class="empty-state"><p>No posts yet. Create your first post.</p></div>';
      }
    } catch (e) {}
  }

  /* --- Posts List --- */
  async function loadPostsList(page) {
    const tbody = $('#posts-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading...</td></tr>';
    try {
      const data = await API.adminGetPosts({ status: currentFilter, page: page || 1, search: $('#admin-search').value || undefined });
      if (!data.posts || data.posts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No posts found.</p></td></tr>';
        return;
      }
      tbody.innerHTML = data.posts.map(p => `
        <tr>
          <td><input type="checkbox" class="admin-checkbox post-check" value="${p._id}"></td>
          <td class="title-cell">
            <a href="#" data-edit="${p._id}">${esc(p.title)}</a>
            <div class="excerpt">${esc(p.excerpt || '').substring(0, 80)}</div>
          </td>
          <td class="hide-mobile"><span class="status-badge ${p.status}">${p.status}</span></td>
          <td class="hide-mobile">${(p.labels || []).map(l => esc(l)).join(', ') || '-'}</td>
          <td class="hide-mobile" style="white-space:nowrap;font-size:13px;color:var(--text-tertiary)">${formatDate(p.publishedAt || p.createdAt)}</td>
          <td class="actions-cell">
            <a href="#" data-edit="${p._id}" title="Edit">Edit</a>
            <button data-dup="${p._id}" title="Duplicate">Duplicate</button>
            ${p.status === 'trashed'
              ? `<button data-restore="${p._id}" title="Restore">Restore</button><button class="delete-btn" data-perm="${p._id}" title="Delete permanently">Delete</button>`
              : `<button data-trash="${p._id}" title="Trash">Trash</button>`
            }
          </td>
        </tr>
      `).join('');

      /* Event listeners */
      tbody.querySelectorAll('[data-edit]').forEach(a => {
        a.addEventListener('click', e => { e.preventDefault(); editPost(a.dataset.edit); });
      });
      tbody.querySelectorAll('[data-trash]').forEach(b => {
        b.addEventListener('click', () => {
          showModal('Move to Trash', 'Move this post to trash?', async () => {
            await API.adminDeletePost(b.dataset.trash);
            toast('Post moved to trash');
            loadPostsList();
          });
        });
      });
      tbody.querySelectorAll('[data-restore]').forEach(b => {
        b.addEventListener('click', async () => {
          await API.adminRestorePost(b.dataset.restore);
          toast('Post restored');
          loadPostsList();
        });
      });
      tbody.querySelectorAll('[data-dup]').forEach(b => {
        b.addEventListener('click', async () => {
          await API.adminDuplicatePost(b.dataset.dup);
          toast('Post duplicated');
          loadPostsList();
        });
      });
      tbody.querySelectorAll('[data-perm]').forEach(b => {
        b.addEventListener('click', () => {
          showModal('Delete Permanently', 'This cannot be undone.', async () => {
            await API.adminPermanentDelete(b.dataset.perm);
            toast('Post deleted');
            loadPostsList();
          });
        });
      });

      renderPostsPagination(data.pagination);
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Failed to load posts.</p></td></tr>';
    }
  }

  function renderPostsPagination(pag) {
    const el = $('#posts-pagination');
    if (!pag || pag.pages <= 1) { el.innerHTML = ''; return; }
    let h = '';
    h += `<button ${pag.page <= 1 ? 'disabled' : ''} data-p="${pag.page - 1}">&larr;</button>`;
    for (let i = 1; i <= pag.pages; i++) {
      if (i === 1 || i === pag.pages || Math.abs(i - pag.page) <= 1) {
        h += `<button data-p="${i}" class="${i === pag.page ? 'active' : ''}">${i}</button>`;
      }
    }
    h += `<button ${pag.page >= pag.pages ? 'disabled' : ''} data-p="${pag.page + 1}">&rarr;</button>`;
    el.innerHTML = h;
    el.querySelectorAll('button:not([disabled])').forEach(b => {
      b.addEventListener('click', () => loadPostsList(parseInt(b.dataset.p)));
    });
  }

  /* --- Editor --- */
  async function newPost() {
    editingPostId = null;
    postTags = [];
    $('#editor-title').value = '';
    $('#editor-slug').value = '';
    $('#editor-excerpt').value = '';
    $('#editor-cover').value = '';
    $('#editor-category').value = '';
    $('#editor-seo-title').value = '';
    $('#editor-seo-desc').value = '';
    $('#editor-schedule-date').value = '';
    $('#editor-content').innerHTML = '';
    renderTags();
    switchView('editor');
    loadRevisionHistory();
  }

  async function editPost(id) {
    try {
      const data = await API.adminGetPost(id);
      const p = data.post;
      editingPostId = id;
      postTags = p.labels || [];
      $('#editor-title').value = p.title || '';
      $('#editor-slug').value = p.slug || '';
      $('#editor-excerpt').value = p.excerpt || '';
      $('#editor-cover').value = p.coverImage || '';
      $('#editor-category').value = p.category || '';
      $('#editor-seo-title').value = p.seoTitle || '';
      $('#editor-seo-desc').value = p.seoDescription || '';
      $('#editor-schedule-date').value = p.scheduledAt ? new Date(p.scheduledAt).toISOString().slice(0, 16) : '';
      $('#editor-content').innerHTML = p.content || '';
      renderTags();
      switchView('editor');
      loadRevisionHistory();
    } catch (e) {
      toast('Failed to load post', 'error');
    }
  }

  function renderTags() {
    const container = $('#tags-input');
    const input = $('#tag-input');
    container.querySelectorAll('.tag-item').forEach(t => t.remove());
    postTags.forEach((tag, i) => {
      const el = document.createElement('span');
      el.className = 'tag-item';
      el.innerHTML = `${esc(tag)} <button data-remove="${i}">&times;</button>`;
      container.insertBefore(el, input);
    });
    container.querySelectorAll('[data-remove]').forEach(b => {
      b.addEventListener('click', () => {
        postTags.splice(parseInt(b.dataset.remove), 1);
        renderTags();
        markDirty();
      });
    });
  }

  async function savePost(publish) {
    const data = {
      title: $('#editor-title').value.trim(),
      excerpt: $('#editor-excerpt').value.trim(),
      content: $('#editor-content').innerHTML,
      coverImage: $('#editor-cover').value.trim(),
      category: $('#editor-category').value.trim() || 'general',
      labels: postTags,
      slug: $('#editor-slug').value.trim() || undefined,
      seoTitle: $('#editor-seo-title').value.trim(),
      seoDescription: $('#editor-seo-desc').value.trim(),
    };

    if (publish) {
      const schedDate = $('#editor-schedule-date').value;
      if (schedDate) {
        data.status = 'scheduled';
        data.scheduledAt = new Date(schedDate).toISOString();
      } else {
        data.status = 'published';
      }
    } else {
      data.status = 'draft';
    }

    if (!data.title) { toast('Title is required', 'error'); return; }
    if (!data.excerpt) { toast('Excerpt is required', 'error'); return; }

    try {
      if (editingPostId) {
        await API.adminUpdatePost(editingPostId, data);
        toast(publish ? 'Post updated and published' : 'Draft saved');
      } else {
        const res = await API.adminCreatePost(data);
        editingPostId = res.post._id;
        toast(publish ? 'Post published' : 'Draft saved');
      }
      isDirty = false;
      updateSaveStatus('saved');
      if (publish) switchView('posts', '');
    } catch (e) {
      toast(e.message || 'Failed to save', 'error');
      updateSaveStatus('');
    }
  }

  function markDirty() {
    isDirty = true;
    updateSaveStatus('dirty');
  }

  function updateSaveStatus(state) {
    const el = $('#autosave-status');
    el.className = 'autosave-status ' + (state === 'saving' ? 'saving' : state === 'saved' ? 'saved' : '');
    const text = el.querySelector('.text');
    if (state === 'saving') text.textContent = 'Saving...';
    else if (state === 'saved') text.textContent = 'Saved';
    else if (state === 'dirty') text.textContent = 'Unsaved changes';
    else text.textContent = 'Ready';
  }

  function startAutosave() {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => {
      if (isDirty && editingPostId) {
        savePost(false);
      }
    }, 30000);
  }

  async function loadRevisionHistory() {
    const el = $('#revisions-list');
    if (!editingPostId) { el.innerHTML = 'No revisions yet.'; return; }
    try {
      const data = await API.adminGetRevisions(editingPostId);
      if (!data.revisions || data.revisions.length === 0) {
        el.innerHTML = 'No revisions yet.';
        return;
      }
      el.innerHTML = data.revisions.map(r => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border-light);font-size:13px">
          <div>${formatDate(r.savedAt)}</div>
          <button class="btn btn-ghost" style="font-size:12px;padding:2px 6px" data-restore-rev="${r._id}">Restore</button>
        </div>
      `).join('');
      el.querySelectorAll('[data-restore-rev]').forEach(b => {
        b.addEventListener('click', async () => {
          try {
            const res = await API.adminRestoreRevision(b.dataset.restoreRev);
            if (res.post) {
              $('#editor-title').value = res.post.title || '';
              $('#editor-content').innerHTML = res.post.content || '';
              $('#editor-excerpt').value = res.post.excerpt || '';
              postTags = res.post.labels || [];
              renderTags();
              toast('Revision restored');
            }
          } catch (e) { toast('Failed to restore', 'error'); }
        });
      });
    } catch (e) { el.innerHTML = 'Could not load revisions.'; }
  }

  /* --- Labels --- */
  let labelsCache = [];

  async function loadLabels() {
    try {
      const data = await API.getLabels();
      labelsCache = data.labels || [];
      renderLabels();
    } catch (e) {}
  }

  function renderLabels() {
    const el = $('#labels-list');
    if (labelsCache.length === 0) { el.innerHTML = '<p style="color:var(--text-tertiary);font-size:14px">No labels yet.</p>'; return; }
    el.innerHTML = '<table class="post-table"><thead><tr><th>Label</th><th>Posts</th><th></th></tr></thead><tbody>' +
      labelsCache.map(l => `<tr><td>${esc(l.name)}</td><td>${l.count || 0}</td><td><button class="delete-btn" data-del-label="${esc(l.name)}">Remove</button></td></tr>`).join('') +
      '</tbody></table>';
    el.querySelectorAll('[data-del-label]').forEach(b => {
      b.addEventListener('click', () => {
        labelsCache = labelsCache.filter(l => l.name !== b.dataset.delLabel);
        renderLabels();
      });
    });
  }

  /* --- Init --- */
  function init() {
    /* Login */
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = $('#pin-input').value.trim();
      const err = $('#login-error');
      err.textContent = '';
      try {
        await API.login(pin);
        showAdmin();
      } catch (e) {
        err.textContent = 'Invalid PIN. Please try again.';
        $('#pin-input').value = '';
        $('#pin-input').focus();
      }
    });

    /* Logout */
    $('#logout-btn').addEventListener('click', async () => {
      await API.logout();
      showLogin();
    });

    /* Sidebar nav */
    $$('.sidebar-link[data-view]').forEach(link => {
      link.addEventListener('click', () => switchView(link.dataset.view, link.dataset.filter));
    });

    /* Mobile sidebar */
    $('#sidebar-toggle').addEventListener('click', openSidebar);
    $('#sidebar-overlay').addEventListener('click', closeSidebar);

    /* New Post */
    $('#new-post-btn').addEventListener('click', newPost);

    /* Search */
    let searchTimer;
    $('#admin-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (currentView === 'posts') loadPostsList();
      }, 300);
    });

    /* Select all */
    $('#select-all').addEventListener('change', function() {
      $$('.post-check').forEach(c => c.checked = this.checked);
      updateBulkBar();
    });
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('post-check')) updateBulkBar();
    });

    /* Bulk actions */
    $('#bulk-apply').addEventListener('click', async () => {
      const action = $('#bulk-action').value;
      if (!action) return;
      const ids = [...$$('.post-check:checked')].map(c => c.value);
      if (ids.length === 0) return;
      for (const id of ids) {
        try {
          if (action === 'publish') await API.adminPublishPost(id);
          else if (action === 'unpublish') await API.adminUnpublishPost(id);
          else if (action === 'trash') await API.adminDeletePost(id);
        } catch (e) {}
      }
      toast(`${ids.length} post(s) updated`);
      loadPostsList();
    });

    /* Editor toolbar */
    $('#editor-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val;
      if (cmd === 'createLink') {
        const url = prompt('Enter URL:');
        if (url) document.execCommand(cmd, false, url);
      } else if (cmd === 'insertImage') {
        const url = prompt('Enter image URL:');
        if (url) document.execCommand(cmd, false, url);
      } else if (cmd === 'formatBlock') {
        document.execCommand(cmd, false, '<' + val + '>');
      } else if (cmd === 'insertHTML') {
        document.execCommand(cmd, false, val);
      } else {
        document.execCommand(cmd, false, val || null);
      }
      markDirty();
    });

    /* Keyboard shortcuts */
    $('#editor-content').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const url = prompt('Enter URL:'); if (url) document.execCommand('createLink', false, url); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { /* browser undo */ }
    });

    /* Editor dirty tracking */
    $('#editor-content').addEventListener('input', markDirty);
    $('#editor-title').addEventListener('input', () => {
      markDirty();
      if (!editingPostId && !$('#editor-slug').value) {
        $('#editor-slug').value = slugify($('#editor-title').value);
      }
    });
    ['editor-excerpt', 'editor-cover', 'editor-category', 'editor-seo-title', 'editor-seo-desc', 'editor-schedule-date'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', markDirty);
    });

    /* Tags input */
    $('#tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().replace(/,/g, '');
        if (val && !postTags.includes(val)) {
          postTags.push(val);
          renderTags();
          markDirty();
        }
        e.target.value = '';
      }
      if (e.key === 'Backspace' && !e.target.value && postTags.length) {
        postTags.pop();
        renderTags();
        markDirty();
      }
    });

    /* Editor buttons */
    $('#editor-save-draft').addEventListener('click', () => savePost(false));
    $('#editor-publish').addEventListener('click', () => savePost(true));
    $('#editor-discard').addEventListener('click', () => {
      if (isDirty) {
        showModal('Discard Changes', 'Unsaved changes will be lost.', () => {
          isDirty = false;
          if (editingPostId) editPost(editingPostId);
          else newPost();
        });
      } else {
        newPost();
      }
    });

    /* Labels */
    $('#add-label-btn').addEventListener('click', () => {
      const input = $('#new-label-input');
      const name = input.value.trim().toLowerCase();
      if (name && !labelsCache.find(l => l.name === name)) {
        labelsCache.push({ name, count: 0 });
        renderLabels();
        input.value = '';
      }
    });

    /* Start autosave */
    startAutosave();

    /* Check auth */
    checkAuth();
  }

  function updateBulkBar() {
    const count = $$('.post-check:checked').length;
    const bar = $('#bulk-bar');
    if (count > 0) {
      bar.classList.add('visible');
      $('#bulk-count').textContent = count + ' selected';
    } else {
      bar.classList.remove('visible');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
