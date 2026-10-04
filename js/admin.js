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
  const IMGBB_API_KEY = '3601399f318b007db7c3a8fdf499d8d0';
  let editingGalleryId = null;
  let galleryPhotosCache = [];
  let gallerySearchDebounce = null;

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

  function showPreviewModal(post) {
    let overlay = $('#preview-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'preview-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = `
        <div style="background:var(--bg-card, #fff);color:var(--text-primary, #111);width:100%;max-width:800px;max-height:90vh;overflow-y:auto;border-radius:12px;padding:24px;position:relative;box-shadow:0 20px 40px rgba(0,0,0,0.3)">
          <button id="close-preview-modal" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-secondary)">&times;</button>
          <div id="preview-modal-content"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#close-preview-modal').addEventListener('click', () => {
        overlay.style.display = 'none';
      });
    }
    const container = overlay.querySelector('#preview-modal-content');
    container.innerHTML = `
      <div style="font-size:12px;text-transform:uppercase;color:var(--accent, #3b82f6);font-weight:600;margin-bottom:8px">Editorial Preview</div>
      <h1 style="font-size:28px;margin:0 0 12px 0;line-height:1.3">${esc(post.title)}</h1>
      ${post.coverImage ? `<img src="${esc(post.coverImage)}" style="width:100%;max-height:350px;object-fit:cover;border-radius:8px;margin-bottom:16px" alt="Cover Image">` : ''}
      <div style="background:var(--bg-secondary, #f8f9fa);padding:14px;border-left:3px solid var(--accent, #3b82f6);border-radius:4px;margin-bottom:16px;font-style:italic">
        <strong>Excerpt:</strong> ${esc(post.excerpt)}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px">
        ${(post.labels || []).map(t => `<span style="background:var(--bg-tertiary, #e9ecef);padding:3px 8px;border-radius:12px;font-size:12px">#${esc(t)}</span>`).join('')}
      </div>
      <div style="line-height:1.7;font-size:15px;color:var(--text-primary)">
        ${post.content || '<p style="color:var(--text-secondary)">(No article content yet)</p>'}
      </div>
    `;
    overlay.style.display = 'flex';
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
    if (window.AdminChat && typeof window.AdminChat.init === 'function') {
      window.AdminChat.init();
    }
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
    const titles = { dashboard: 'Dashboard', messages: 'Live Messenger', posts: filter ? filter.charAt(0).toUpperCase() + filter.slice(1) + ' Posts' : 'All Posts', editor: editingPostId ? 'Edit Post' : 'New Post', labels: 'Labels', 'content-homepage': 'Homepage Content', 'content-about': 'About Content', 'content-settings': 'Site Settings', gallery: 'Photo Gallery' };
    $('#topbar-title').textContent = titles[view] || view;
    if (view === 'dashboard') loadDashboard();
    else if (view === 'messages') {
      if (window.AdminChat && typeof window.AdminChat.onOpenView === 'function') {
        window.AdminChat.onOpenView();
      }
    }
    else if (view === 'posts') loadPostsList();
    else if (view === 'labels') loadLabels();
    else if (view === 'content-homepage') loadHomepageEditor();
    else if (view === 'content-about') loadAboutEditor();
    else if (view === 'content-settings') loadSettingsEditor();
    else if (view === 'gallery') loadGallery();
    const contentEl = $('.admin-content');
    if (contentEl) contentEl.scrollTop = 0;
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
      const unreadStat = $('#stat-unread-messages');
      if (unreadStat && typeof data.unreadMessages === 'number') {
        unreadStat.textContent = data.unreadMessages;
      }
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        showLogin();
        return;
      }
      console.warn('Could not load stats:', e);
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
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        showLogin();
      }
    }
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
      autoExcerpt: $('#auto-excerpt-toggle') ? $('#auto-excerpt-toggle').checked : true,
      autoTags: $('#auto-tags-toggle') ? $('#auto-tags-toggle').checked : true,
      autoImage: $('#auto-image-toggle') ? $('#auto-image-toggle').checked : true
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

    updateSaveStatus('saving');

    try {
      let res;
      if (editingPostId) {
        res = await API.adminUpdatePost(editingPostId, data);
        toast(publish ? 'Post updated and published' : 'Draft saved');
      } else {
        res = await API.adminCreatePost(data);
        if (res && res.post) {
          editingPostId = res.post._id;
        }
        toast(publish ? 'Post published' : 'Draft saved');
      }

      if (res && res.post) {
        if (res.post.excerpt) $('#editor-excerpt').value = res.post.excerpt;
        if (res.post.coverImage) $('#editor-cover').value = res.post.coverImage;
        if (res.post.labels && Array.isArray(res.post.labels)) {
          postTags = res.post.labels;
          renderTags();
        }
      }

      isDirty = false;
      updateSaveStatus('saved');
      if (publish) switchView('posts', '');
    } catch (e) {
      console.error('Error saving post:', e);
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        toast('Session expired or unauthorized. Please enter your PIN to continue.', 'error');
        showLogin();
      } else {
        toast(e.message || 'Failed to save post', 'error');
      }
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
      const data = await API.adminGetLabels();
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

  /* --- CMS Content Editors --- */
  async function loadHomepageEditor() {
    try {
      const data = await API.adminGetHomepage();
      const p = data.page;
      if (!p) return;
      $('#hp-hero-title').value = p.heroTitle || '';
      $('#hp-hero-desc').value = p.heroDescription || '';
      $('#hp-primary-text').value = p.primaryButtonText || '';
      $('#hp-primary-link').value = p.primaryButtonLink || '';
      $('#hp-secondary-text').value = p.secondaryButtonText || '';
      $('#hp-secondary-link').value = p.secondaryButtonLink || '';
      $('#hp-section-title').value = p.featuredSectionTitle || '';
    } catch (e) { toast('Failed to load homepage', 'error'); }
  }

  async function saveHomepageEditor() {
    try {
      await API.adminSaveHomepage({
        heroTitle: $('#hp-hero-title').value.trim(),
        heroDescription: $('#hp-hero-desc').value.trim(),
        primaryButtonText: $('#hp-primary-text').value.trim(),
        primaryButtonLink: $('#hp-primary-link').value.trim(),
        secondaryButtonText: $('#hp-secondary-text').value.trim(),
        secondaryButtonLink: $('#hp-secondary-link').value.trim(),
        featuredSectionTitle: $('#hp-section-title').value.trim()
      });
      toast('Homepage saved', 'success');
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        toast('Session expired. Please log in again.', 'error');
        showLogin();
      } else {
        toast('Failed to save homepage: ' + (e.message || ''), 'error');
      }
    }
  }

  async function loadAboutEditor() {
    try {
      const data = await API.adminGetAbout();
      const p = data.profile;
      if (!p) return;
      $('#about-name').value = p.name || '';
      $('#about-headline').value = p.headline || '';
      $('#about-short-bio').value = p.shortBio || '';
      $('#about-profile-img').value = p.profileImage || '';
      $('#about-biography').value = p.biography || '';
      $('#about-roles').value = (p.roles || []).join('\n');
      $('#about-skills').value = (p.skills || []).join('\n');
      $('#about-interests').value = (p.interests || []).join('\n');
      $('#about-philosophy').value = p.philosophy || '';
      $('#about-current').value = p.currentFocus || '';
      $('#about-writing-text').value = p.writingSection || '';
      $('#about-contact-links').value = (p.contactLinks || []).map(l => l.name + ' - ' + l.url).join('\n');
      $('#about-image-alt').value = p.imageAlt || '';
      $('#about-projects').value = (p.projects || []).map(p => p.title + ' - ' + p.description + (p.tech ? ' - ' + p.tech : '')).join('\n');
    } catch (e) { toast('Failed to load about', 'error'); }
  }

  async function saveAboutEditor() {
    try {
      const contactLines = $('#about-contact-links').value.trim().split('\n').filter(Boolean);
      const contactLinks = contactLines.map(line => {
        const parts = line.split(' - ');
        return { name: (parts[0] || '').trim(), url: (parts[1] || '').trim() };
      });
      const projectLines = $('#about-projects').value.trim().split('\n').filter(Boolean);
      const projects = projectLines.map(line => {
        const parts = line.split(' - ');
        return { title: (parts[0] || '').trim(), description: (parts[1] || '').trim(), tech: (parts[2] || '').trim() };
      });
      await API.adminSaveAbout({
        name: $('#about-name').value.trim(),
        headline: $('#about-headline').value.trim(),
        shortBio: $('#about-short-bio').value.trim(),
        profileImage: $('#about-profile-img').value.trim(),
        imageAlt: $('#about-image-alt').value.trim(),
        biography: $('#about-biography').value.trim(),
        roles: $('#about-roles').value.trim().split('\n').filter(Boolean),
        skills: $('#about-skills').value.trim().split('\n').filter(Boolean),
        interests: $('#about-interests').value.trim().split('\n').filter(Boolean),
        philosophy: $('#about-philosophy').value.trim(),
        currentFocus: $('#about-current').value.trim(),
        writingSection: $('#about-writing-text').value.trim(),
        contactLinks,
        projects
      });
      toast('About page saved', 'success');
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        toast('Session expired. Please log in again.', 'error');
        showLogin();
      } else {
        toast('Failed to save about: ' + (e.message || ''), 'error');
      }
    }
  }

  async function loadSettingsEditor() {
    try {
      const data = await API.adminGetSettings();
      const s = data.settings;
      if (!s) return;
      $('#set-site-name').value = s.siteName || '';
      $('#set-tagline').value = s.tagline || '';
      $('#set-author-name').value = s.authorName || '';
      $('#set-author-title').value = s.authorTitle || '';
      $('#set-location').value = s.location || '';
      $('#set-email').value = s.contactEmail || '';
      $('#set-profile-img').value = s.profileImage || '';
      $('#set-seo-title').value = s.seoTitle || '';
      $('#set-seo-desc').value = s.seoDescription || '';
      $('#set-social-links').value = (s.socialLinks || []).map(l => l.name + ' - ' + l.url).join('\n');
    } catch (e) { toast('Failed to load settings', 'error'); }
  }

  async function saveSettingsEditor() {
    try {
      const socialLines = $('#set-social-links').value.trim().split('\n').filter(Boolean);
      const socialLinks = socialLines.map(line => {
        const parts = line.split(' - ');
        return { name: (parts[0] || '').trim(), url: (parts[1] || '').trim() };
      });
      await API.adminSaveSettings({
        siteName: $('#set-site-name').value.trim(),
        tagline: $('#set-tagline').value.trim(),
        authorName: $('#set-author-name').value.trim(),
        authorTitle: $('#set-author-title').value.trim(),
        location: $('#set-location').value.trim(),
        contactEmail: $('#set-email').value.trim(),
        profileImage: $('#set-profile-img').value.trim(),
        seoTitle: $('#set-seo-title').value.trim(),
        seoDescription: $('#set-seo-desc').value.trim(),
        socialLinks
      });
      toast('Settings saved', 'success');
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        toast('Session expired. Please log in again.', 'error');
        showLogin();
      } else {
        toast('Failed to save settings: ' + (e.message || ''), 'error');
      }
    }
  }

  /* --- Gallery Management (ImgBB Integration & Photo CRUD) --- */
  async function loadGallery() {
    const grid = $('#admin-gallery-grid') || $('#gallery-grid');
    if (!grid) return;

    try {
      const search = $('#gallery-search-input')?.value.trim() || '';
      const status = $('#gallery-filter-status')?.value || 'all';
      const category = $('#gallery-filter-category')?.value || 'all';

      const data = await API.adminGetGallery({ search, status, category });
      galleryPhotosCache = data.photos || [];

      // Update Category Dropdown while preserving selection
      updateGalleryCategoryOptions(data.categories || [], category);

      // Update Top Stats
      const total = data.total || galleryPhotosCache.length;
      const published = galleryPhotosCache.filter(p => p.status === 'published').length;
      const drafts = galleryPhotosCache.filter(p => p.status === 'draft').length;
      const statsEl = $('#gallery-stat-counts');
      if (statsEl) {
        statsEl.textContent = `${total} photo${total === 1 ? '' : 's'} in database (${published} published, ${drafts} drafts)`;
      }

      renderGalleryGrid(galleryPhotosCache);
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('unauthorized')) {
        toast('Session expired. Please log in again.', 'error');
        showLogin();
      } else {
        grid.innerHTML = `<div class="gallery-empty-state"><p style="color:#c0392b">Failed to load gallery photos: ${esc(e.message)}</p><button class="btn btn-sm btn-ghost" onclick="loadGallery()">Retry</button></div>`;
      }
    }
  }

  function updateGalleryCategoryOptions(categories, selectedCategory) {
    const select = $('#gallery-filter-category');
    if (!select) return;
    
    // Extract unique categories from current photos cache as well
    const allCategories = Array.from(new Set([
      ...categories,
      ...galleryPhotosCache.map(p => p.category).filter(Boolean)
    ])).sort();

    let html = '<option value="all">All Categories</option>';
    allCategories.forEach(cat => {
      const isSelected = selectedCategory === cat ? ' selected' : '';
      html += `<option value="${esc(cat)}"${isSelected}>${esc(cat)}</option>`;
    });
    select.innerHTML = html;
  }

  let adminLightboxIndex = 0;

  function openAdminLightbox(index) {
    if (!galleryPhotosCache || galleryPhotosCache.length === 0) return;
    adminLightboxIndex = Math.max(0, Math.min(index, galleryPhotosCache.length - 1));
    const photo = galleryPhotosCache[adminLightboxIndex];
    if (!photo) return;

    const modal = $('#admin-gallery-lightbox');
    const img = $('#admin-lightbox-img');
    const title = $('#admin-lightbox-title');
    const meta = $('#admin-lightbox-meta');
    const caption = $('#admin-lightbox-caption');
    const openLink = $('#admin-lightbox-open-link');

    if (modal) modal.style.display = 'flex';
    if (img) {
      img.style.opacity = '0';
      img.src = photo.url;
      img.onload = () => {
        img.style.opacity = '1';
        if (meta && img.naturalWidth && img.naturalHeight) {
          const dateStr = photo.date ? formatDate(photo.date) : '';
          meta.textContent = `${photo.category || 'Photography'} • ${photo.status.toUpperCase()} • ${img.naturalWidth}×${img.naturalHeight}px${dateStr ? ' • ' + dateStr : ''}`;
        }
      };
    }
    if (title) title.textContent = photo.title || 'Untitled Photo';
    if (meta) {
      const dateStr = photo.date ? formatDate(photo.date) : '';
      meta.textContent = `${photo.category || 'Photography'} • ${photo.status.toUpperCase()}${dateStr ? ' • ' + dateStr : ''}`;
    }
    if (caption) {
      caption.textContent = photo.caption || (photo.location ? `Location: ${photo.location}` : '');
    }
    if (openLink) {
      openLink.href = photo.url;
    }
  }

  function closeAdminLightbox() {
    const modal = $('#admin-gallery-lightbox');
    if (modal) modal.style.display = 'none';
    const img = $('#admin-lightbox-img');
    if (img) img.src = '';
  }

  function navAdminLightbox(direction) {
    if (!galleryPhotosCache || galleryPhotosCache.length === 0) return;
    const newIndex = (adminLightboxIndex + direction + galleryPhotosCache.length) % galleryPhotosCache.length;
    openAdminLightbox(newIndex);
  }

  function updateGalleryBulkBar() {
    const checked = $$('.admin-gallery-check:checked');
    const count = checked.length;
    const bar = $('#gallery-bulk-bar');
    const countLabel = $('#gallery-bulk-count');
    const selectAll = $('#gallery-select-all');

    if (countLabel) countLabel.textContent = `${count} selected`;

    if (bar) {
      if (count > 0) {
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }

    if (selectAll) {
      const allChecks = $$('.admin-gallery-check');
      selectAll.checked = allChecks.length > 0 && count === allChecks.length;
      selectAll.indeterminate = count > 0 && count < allChecks.length;
    }
  }

  function renderGalleryGrid(photos) {
    const grid = $('#admin-gallery-grid') || $('#gallery-grid');
    if (!grid) return;

    if (!photos || photos.length === 0) {
      grid.innerHTML = `
        <div class="admin-gallery-empty-state">
          <svg style="width:40px;height:40px;margin:0 auto 10px;color:var(--text-tertiary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <div style="font-weight:600;font-size:14px">No photos found</div>
          <p>There are no photos matching your criteria. Upload a new image to get started.</p>
          <button class="btn btn-primary btn-sm" id="empty-state-upload-btn">+ Upload New Photo</button>
        </div>
      `;
      const emptyBtn = $('#empty-state-upload-btn');
      if (emptyBtn) emptyBtn.addEventListener('click', () => openGalleryUploadForm());
      updateGalleryBulkBar();
      return;
    }

    grid.innerHTML = photos.map((photo, index) => {
      const statusClass = photo.status === 'published' ? 'published' : 'draft';
      const isFeatured = photo.featured;
      const dateStr = photo.date ? formatDate(photo.date) : '';
      const tagsList = Array.isArray(photo.tags) ? photo.tags.join(', ') : (photo.tags || '');

      return `
        <div class="admin-gallery-card" data-id="${photo._id}" id="admin-gallery-card-${photo._id}">
          <div class="admin-gallery-select-wrap" title="Select photo">
            <input type="checkbox" class="admin-checkbox admin-gallery-check" value="${photo._id}" data-id="${photo._id}" aria-label="Select ${esc(photo.title)}">
          </div>
          <div class="admin-gallery-thumb" data-index="${index}" title="Click to view high-resolution photo in Lightbox">
            <img class="admin-gallery-img" src="${esc(photo.url)}" alt="${esc(photo.alt || photo.title)}" loading="lazy" onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 fill=%22%23999%22 dy=%22.3em%22>Image Error</text></svg>'">
            <div class="admin-gallery-badges">
              <span class="status-badge ${statusClass}">${photo.status}</span>
              ${isFeatured ? '<span class="admin-gallery-badge featured">★ Featured</span>' : ''}
              ${photo.category ? `<span class="admin-gallery-badge category">${esc(photo.category)}</span>` : ''}
            </div>
            <button type="button" class="admin-gallery-zoom-btn" data-index="${index}" title="Preview in Lightbox">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              <span>Preview HD</span>
            </button>
          </div>
          <div class="admin-gallery-body">
            <div class="admin-gallery-title" title="${esc(photo.title)}">${esc(photo.title)}</div>
            <div class="admin-gallery-meta">
              ${dateStr ? `<span>${dateStr}</span>` : ''}
              ${photo.location ? `<span>• ${esc(photo.location)}</span>` : ''}
            </div>
            ${photo.caption ? `<div class="admin-gallery-caption">${esc(photo.caption)}</div>` : '<div class="admin-gallery-caption" style="color:var(--text-tertiary);font-style:italic">No caption</div>'}
            ${tagsList ? `<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Tags: ${esc(tagsList)}</div>` : ''}
            <div class="admin-gallery-actions">
              <button type="button" class="gallery-action-edit" data-id="${photo._id}">Edit</button>
              <button type="button" class="gallery-action-toggle" data-id="${photo._id}" data-status="${photo.status}">
                ${photo.status === 'published' ? 'Unpublish' : 'Publish'}
              </button>
              <button type="button" class="gallery-action-copy" data-url="${esc(photo.url)}">Copy URL</button>
              <span style="flex:1"></span>
              <button type="button" class="delete-btn gallery-action-delete" data-id="${photo._id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Action Listeners
    $$('.admin-gallery-thumb, .admin-gallery-zoom-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.admin-gallery-select-wrap')) return;
        const idx = parseInt(el.dataset.index, 10);
        if (!isNaN(idx)) openAdminLightbox(idx);
      });
    });

    $$('.admin-gallery-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const card = e.target.closest('.admin-gallery-card');
        if (card) card.classList.toggle('selected', e.target.checked);
        updateGalleryBulkBar();
      });
    });

    $$('.gallery-action-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const photo = galleryPhotosCache.find(p => p._id === id);
        if (photo) openGalleryUploadForm(photo);
      });
    });

    $$('.gallery-action-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const currentStatus = e.currentTarget.dataset.status;
        await toggleGalleryPhotoStatus(id, currentStatus);
      });
    });

    $$('.gallery-action-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.currentTarget.dataset.url;
        if (url) {
          navigator.clipboard.writeText(url).then(() => {
            toast('Image URL copied to clipboard', 'success');
          }).catch(() => {
            toast('Failed to copy URL', 'error');
          });
        }
      });
    });

    $$('.gallery-action-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        deleteGalleryPhoto(id);
      });
    });

    updateGalleryBulkBar();
  }

  function openGalleryUploadForm(photoToEdit = null) {
    const card = $('#gallery-upload-card');
    const heading = $('#gallery-form-heading');
    const form = $('#gallery-upload-form');
    const previewImg = $('#gallery-preview-img');
    const previewEmpty = $('#gallery-preview-empty');

    if (!card || !form) return;

    if (photoToEdit) {
      editingGalleryId = photoToEdit._id;
      if (heading) heading.textContent = `Edit Photo: ${photoToEdit.title || ''}`;
      $('#gallery-photo-title').value = photoToEdit.title || '';
      $('#gallery-photo-url').value = photoToEdit.url || '';
      $('#gallery-photo-caption').value = photoToEdit.caption || '';
      $('#gallery-photo-category').value = photoToEdit.category || 'Photography';
      $('#gallery-photo-location').value = photoToEdit.location || '';
      $('#gallery-photo-tags').value = Array.isArray(photoToEdit.tags) ? photoToEdit.tags.join(', ') : (photoToEdit.tags || '');
      $('#gallery-photo-alt').value = photoToEdit.alt || '';
      $('#gallery-photo-status').value = photoToEdit.status || 'published';
      $('#gallery-photo-order').value = photoToEdit.order !== undefined ? photoToEdit.order : 0;
      $('#gallery-photo-featured').checked = !!photoToEdit.featured;
      $('#gallery-form-submit').textContent = 'Update Photo';

      if (photoToEdit.url) {
        previewImg.src = photoToEdit.url;
        previewImg.style.display = 'block';
        previewEmpty.style.display = 'none';
      } else {
        previewImg.style.display = 'none';
        previewEmpty.style.display = 'block';
      }
    } else {
      resetGalleryForm();
      if (heading) heading.textContent = 'Upload New Photo';
      $('#gallery-form-submit').textContent = 'Save Photo to Database';
    }

    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetGalleryForm() {
    editingGalleryId = null;
    const form = $('#gallery-upload-form');
    if (form) form.reset();
    $('#gallery-photo-status').value = 'published';
    $('#gallery-photo-order').value = 0;
    $('#gallery-photo-category').value = 'Photography';
    $('#gallery-photo-featured').checked = false;
    const previewImg = $('#gallery-preview-img');
    const previewEmpty = $('#gallery-preview-empty');
    if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
    if (previewEmpty) previewEmpty.style.display = 'block';
    const progress = $('#gallery-upload-progress');
    if (progress) progress.style.display = 'none';
    const heading = $('#gallery-form-heading');
    if (heading) heading.textContent = 'Upload New Photo';
    const submitBtn = $('#gallery-form-submit');
    if (submitBtn) submitBtn.textContent = 'Save Photo to Database';
  }

  // Client-side automatic image compression using HTML5 Canvas
  async function compressImageWithCanvas(file, maxWidth = 2048, maxHeight = 2048, quality = 0.85) {
    if (!file || !file.type.startsWith('image/')) return file;
    // Don't re-compress animated GIFs or SVGs
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Use PNG if smaller transparent PNG, otherwise JPEG for optimal web compression
          const isSmallPng = file.type === 'image/png' && file.size < 500 * 1024;
          const outputType = isSmallPng ? 'image/png' : 'image/jpeg';
          
          canvas.toBlob((blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
            } else {
              const ext = outputType === 'image/jpeg' ? '.jpg' : '.png';
              const cleanBase = file.name.replace(/\.[^/.]+$/, '');
              const compressedFile = new File([blob], cleanBase + ext, {
                type: outputType,
                lastModified: Date.now()
              });
              resolve(compressedFile);
            }
          }, outputType, quality);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageToImgBB(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('Please select a valid image file (JPG, PNG, WEBP, GIF)', 'error');
      return;
    }

    // Max 32MB limit for ImgBB
    if (file.size > 32 * 1024 * 1024) {
      toast('Image file exceeds the 32MB limit', 'error');
      return;
    }

    const progressContainer = $('#gallery-upload-progress');
    const progressBar = $('#gallery-progress-fill');
    const progressText = $('#gallery-progress-text');
    const previewImg = $('#gallery-preview-img');
    const previewEmpty = $('#gallery-preview-empty');

    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) progressBar.style.width = '15%';
    if (progressText) progressText.textContent = `Optimizing & compressing ${file.name} with Canvas...`;

    let fileToUpload = file;
    try {
      fileToUpload = await compressImageWithCanvas(file, 2048, 2048, 0.85);
    } catch (err) {
      console.warn('Canvas compression error:', err);
      fileToUpload = file;
    }

    const origKb = Math.round(file.size / 1024);
    const compKb = Math.round(fileToUpload.size / 1024);
    const savedMsg = fileToUpload !== file ? ` (${compKb}KB from ${origKb}KB)` : ` (${origKb}KB)`;

    if (progressBar) progressBar.style.width = '45%';
    if (progressText) progressText.textContent = `Uploading ${fileToUpload.name}${savedMsg} to ImgBB...`;

    try {
      const formData = new FormData();
      formData.append('image', fileToUpload);

      if (progressBar) progressBar.style.width = '75%';

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
      });

      const json = await res.json();

      if (res.ok && json.success) {
        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'Upload complete!';

        const imageUrl = json.data.url;
        $('#gallery-photo-url').value = imageUrl;

        // Auto-generate title if empty
        const titleInput = $('#gallery-photo-title');
        if (titleInput && !titleInput.value.trim()) {
          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        }

        // Set preview
        if (previewImg) {
          previewImg.src = imageUrl;
          previewImg.style.display = 'block';
        }
        if (previewEmpty) previewEmpty.style.display = 'none';

        // Auto-fill Alt text if empty
        const altInput = $('#gallery-photo-alt');
        if (altInput && !altInput.value.trim()) {
          altInput.value = titleInput.value || 'Gallery photo';
        }

        setTimeout(() => {
          if (progressContainer) progressContainer.style.display = 'none';
        }, 1200);

        toast('Image uploaded to ImgBB successfully!', 'success');
      } else {
        const errMsg = json.error?.message || 'ImgBB upload failed';
        if (progressContainer) progressContainer.style.display = 'none';
        toast('ImgBB upload error: ' + errMsg, 'error');
      }
    } catch (err) {
      if (progressContainer) progressContainer.style.display = 'none';
      toast('Failed to upload image: ' + (err.message || 'Network error'), 'error');
    }
  }

  async function handleGalleryFormSubmit(e) {
    e.preventDefault();

    const title = $('#gallery-photo-title').value.trim();
    const url = $('#gallery-photo-url').value.trim();
    const caption = $('#gallery-photo-caption').value.trim();
    const category = $('#gallery-photo-category').value.trim() || 'Photography';
    const location = $('#gallery-photo-location').value.trim();
    const tagsRaw = $('#gallery-photo-tags').value.trim();
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
    const alt = $('#gallery-photo-alt').value.trim() || title;
    const status = $('#gallery-photo-status').value || 'published';
    const order = parseInt($('#gallery-photo-order').value, 10) || 0;
    const featured = $('#gallery-photo-featured').checked;

    if (!title) {
      toast('Please enter a photo title', 'error');
      $('#gallery-photo-title').focus();
      return;
    }

    if (!url) {
      toast('Please upload an image or enter an image URL', 'error');
      $('#gallery-photo-url').focus();
      return;
    }

    const payload = {
      title,
      url,
      caption,
      category,
      tags,
      location,
      alt,
      status,
      order,
      featured
    };

    try {
      if (editingGalleryId) {
        await API.adminUpdateGalleryPhoto(editingGalleryId, payload);
        toast('Photo updated successfully', 'success');
      } else {
        await API.adminCreateGalleryPhoto(payload);
        toast('Photo added to gallery', 'success');
      }

      resetGalleryForm();
      $('#gallery-upload-card').style.display = 'none';
      await loadGallery();
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('unauthorized')) {
        toast('Session expired. Please log in again.', 'error');
        showLogin();
      } else {
        toast('Failed to save photo: ' + (err.message || ''), 'error');
      }
    }
  }

  async function toggleGalleryPhotoStatus(id, currentStatus) {
    try {
      if (currentStatus === 'published') {
        await API.adminUnpublishGalleryPhoto(id);
        toast('Photo moved to drafts', 'success');
      } else {
        await API.adminPublishGalleryPhoto(id);
        toast('Photo published to gallery', 'success');
      }
      await loadGallery();
    } catch (err) {
      toast('Failed to change status: ' + (err.message || ''), 'error');
    }
  }

  function deleteGalleryPhoto(id) {
    showModal(
      'Delete Gallery Photo',
      'Are you sure you want to permanently delete this photo from the database? This action cannot be undone.',
      async () => {
        try {
          await API.adminDeleteGalleryPhoto(id);
          toast('Photo deleted from gallery', 'success');
          await loadGallery();
        } catch (err) {
          toast('Failed to delete photo: ' + (err.message || ''), 'error');
        }
      }
    );
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

    /* Editorial Automation Regeneration Handlers */
    const btnRegenExcerpt = $('#btn-regen-excerpt');
    if (btnRegenExcerpt) {
      btnRegenExcerpt.addEventListener('click', async () => {
        const title = $('#editor-title').value.trim();
        const content = $('#editor-content').innerHTML;
        if (!title) { toast('Enter a title first', 'error'); return; }
        btnRegenExcerpt.disabled = true;
        btnRegenExcerpt.textContent = 'Generating...';
        try {
          const res = await API.adminRegenerateField({ field: 'excerpt', title, content });
          if (res && res.value) {
            $('#editor-excerpt').value = res.value;
            markDirty();
            toast('Excerpt generated');
          }
        } catch (e) {
          toast(e.message || 'Failed to generate excerpt', 'error');
        } finally {
          btnRegenExcerpt.disabled = false;
          btnRegenExcerpt.textContent = 'Auto-Generate';
        }
      });
    }

    const btnRegenTags = $('#btn-regen-tags');
    if (btnRegenTags) {
      btnRegenTags.addEventListener('click', async () => {
        const title = $('#editor-title').value.trim();
        const content = $('#editor-content').innerHTML;
        const category = $('#editor-category').value.trim();
        const excerpt = $('#editor-excerpt').value.trim();
        if (!title) { toast('Enter a title first', 'error'); return; }
        btnRegenTags.disabled = true;
        btnRegenTags.textContent = 'Generating...';
        try {
          const res = await API.adminRegenerateField({ field: 'tags', title, content, category, excerpt });
          if (res && res.value && Array.isArray(res.value)) {
            postTags = res.value;
            renderTags();
            markDirty();
            toast('Tags generated');
          }
        } catch (e) {
          toast(e.message || 'Failed to generate tags', 'error');
        } finally {
          btnRegenTags.disabled = false;
          btnRegenTags.textContent = 'Auto-Generate';
        }
      });
    }

    const btnRegenImage = $('#btn-regen-image');
    if (btnRegenImage) {
      btnRegenImage.addEventListener('click', async () => {
        const title = $('#editor-title').value.trim();
        const content = $('#editor-content').innerHTML;
        const category = $('#editor-category').value.trim();
        if (!title) { toast('Enter a title first', 'error'); return; }
        btnRegenImage.disabled = true;
        btnRegenImage.textContent = 'Searching...';
        try {
          const res = await API.adminRegenerateField({ field: 'featuredImage', title, content, category });
          if (res && res.value) {
            $('#editor-cover').value = res.value;
            markDirty();
            toast('Stock photo & cover image created!');
          }
        } catch (e) {
          toast(e.message || 'No stock photo found', 'error');
        } finally {
          btnRegenImage.disabled = false;
          btnRegenImage.textContent = 'Find Stock Image';
        }
      });
    }

    const editorPreview = $('#editor-preview');
    if (editorPreview) {
      editorPreview.addEventListener('click', async () => {
        const data = {
          title: $('#editor-title').value.trim(),
          excerpt: $('#editor-excerpt').value.trim(),
          content: $('#editor-content').innerHTML,
          coverImage: $('#editor-cover').value.trim(),
          category: $('#editor-category').value.trim() || 'general',
          labels: postTags,
          autoExcerpt: $('#auto-excerpt-toggle') ? $('#auto-excerpt-toggle').checked : true,
          autoTags: $('#auto-tags-toggle') ? $('#auto-tags-toggle').checked : true,
          autoImage: $('#auto-image-toggle') ? $('#auto-image-toggle').checked : true
        };
        if (!data.title) { toast('Title is required to preview', 'error'); return; }
        editorPreview.disabled = true;
        editorPreview.textContent = 'Loading...';
        try {
          const res = await API.adminPreviewPost(data);
          if (res && res.post) {
            showPreviewModal(res.post);
          }
        } catch (e) {
          toast(e.message || 'Failed to preview post', 'error');
        } finally {
          editorPreview.disabled = false;
          editorPreview.textContent = 'Preview';
        }
      });
    }

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

    /* CMS Save buttons */
    const hpSave = $('#hp-save');
    if (hpSave) hpSave.addEventListener('click', saveHomepageEditor);
    const aboutSave = $('#about-save');
    if (aboutSave) aboutSave.addEventListener('click', saveAboutEditor);
    const settingsSave = $('#settings-save');
    if (settingsSave) settingsSave.addEventListener('click', saveSettingsEditor);

    /* Gallery Listeners (ImgBB Upload & CRUD) */
    const btnToggleUpload = $('#btn-toggle-gallery-upload');
    if (btnToggleUpload) {
      btnToggleUpload.addEventListener('click', () => {
        const card = $('#gallery-upload-card');
        if (card.style.display === 'none' || !card.style.display) {
          openGalleryUploadForm();
        } else {
          card.style.display = 'none';
          resetGalleryForm();
        }
      });
    }

    const uploadCloseBtn = $('#gallery-upload-close');
    if (uploadCloseBtn) {
      uploadCloseBtn.addEventListener('click', () => {
        $('#gallery-upload-card').style.display = 'none';
        resetGalleryForm();
      });
    }

    const formCancelBtn = $('#gallery-form-cancel');
    if (formCancelBtn) {
      formCancelBtn.addEventListener('click', () => {
        $('#gallery-upload-card').style.display = 'none';
        resetGalleryForm();
      });
    }

    const galleryDropzone = $('#gallery-dropzone');
    const galleryFileInput = $('#gallery-file-input');

    if (galleryDropzone && galleryFileInput) {
      galleryDropzone.addEventListener('click', () => {
        galleryFileInput.click();
      });

      galleryFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          uploadImageToImgBB(e.target.files[0]);
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        galleryDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          galleryDropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        galleryDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          galleryDropzone.classList.remove('dragover');
        });
      });

      galleryDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) {
          uploadImageToImgBB(dt.files[0]);
        }
      });
    }

    const galleryUrlInput = $('#gallery-photo-url');
    if (galleryUrlInput) {
      const updateUrlPreview = () => {
        const val = galleryUrlInput.value.trim();
        const previewImg = $('#gallery-preview-img');
        const previewEmpty = $('#gallery-preview-empty');
        if (val) {
          if (previewImg) { previewImg.src = val; previewImg.style.display = 'block'; }
          if (previewEmpty) previewEmpty.style.display = 'none';
        } else {
          if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
          if (previewEmpty) previewEmpty.style.display = 'block';
        }
      };
      galleryUrlInput.addEventListener('input', updateUrlPreview);
      galleryUrlInput.addEventListener('change', updateUrlPreview);
    }

    const galleryUploadForm = $('#gallery-upload-form');
    if (galleryUploadForm) {
      galleryUploadForm.addEventListener('submit', handleGalleryFormSubmit);
    }

    const gallerySearchInput = $('#gallery-search-input');
    if (gallerySearchInput) {
      gallerySearchInput.addEventListener('input', () => {
        clearTimeout(gallerySearchDebounce);
        gallerySearchDebounce = setTimeout(() => {
          loadGallery();
        }, 300);
      });
    }

    const galleryFilterCategory = $('#gallery-filter-category');
    if (galleryFilterCategory) {
      galleryFilterCategory.addEventListener('change', () => loadGallery());
    }

    const galleryFilterStatus = $('#gallery-filter-status');
    if (galleryFilterStatus) {
      galleryFilterStatus.addEventListener('change', () => loadGallery());
    }

    /* Gallery Bulk Actions */
    const gallerySelectAll = $('#gallery-select-all');
    if (gallerySelectAll) {
      gallerySelectAll.addEventListener('change', function() {
        const isChecked = this.checked;
        $$('.admin-gallery-check').forEach(c => {
          c.checked = isChecked;
          const card = c.closest('.admin-gallery-card');
          if (card) card.classList.toggle('selected', isChecked);
        });
        updateGalleryBulkBar();
      });
    }

    const galleryBulkApply = $('#gallery-bulk-apply');
    if (galleryBulkApply) {
      galleryBulkApply.addEventListener('click', async () => {
        const action = $('#gallery-bulk-action').value;
        if (!action) {
          toast('Please select a bulk action', 'error');
          return;
        }
        const ids = [...$$('.admin-gallery-check:checked')].map(c => c.value);
        if (ids.length === 0) {
          toast('No photos selected', 'error');
          return;
        }

        if (action === 'delete') {
          showModal(
            'Batch Delete Photos',
            `Are you sure you want to permanently delete ${ids.length} selected photos? This action cannot be undone.`,
            async () => {
              try {
                let deletedCount = 0;
                for (const id of ids) {
                  try {
                    await API.adminDeleteGalleryPhoto(id);
                    deletedCount++;
                  } catch (e) {
                    console.error('Failed to delete photo ' + id, e);
                  }
                }
                toast(`Successfully deleted ${deletedCount} photo${deletedCount === 1 ? '' : 's'}`, 'success');
                await loadGallery();
              } catch (err) {
                toast('Batch delete failed: ' + (err.message || ''), 'error');
              }
            }
          );
        } else if (action === 'publish') {
          for (const id of ids) {
            try { await API.adminPublishGalleryPhoto(id); } catch(e) {}
          }
          toast(`Updated ${ids.length} photo${ids.length === 1 ? '' : 's'} to published`, 'success');
          await loadGallery();
        } else if (action === 'unpublish') {
          for (const id of ids) {
            try { await API.adminUnpublishGalleryPhoto(id); } catch(e) {}
          }
          toast(`Moved ${ids.length} photo${ids.length === 1 ? '' : 's'} to drafts`, 'success');
          await loadGallery();
        }
      });
    }

    /* Admin Gallery Lightbox Event Listeners */
    const adminLightboxClose = $('#admin-lightbox-close');
    if (adminLightboxClose) adminLightboxClose.addEventListener('click', closeAdminLightbox);

    const adminLightboxBackdrop = $('#admin-lightbox-backdrop');
    if (adminLightboxBackdrop) adminLightboxBackdrop.addEventListener('click', closeAdminLightbox);

    const adminLightboxPrev = $('#admin-lightbox-prev');
    if (adminLightboxPrev) adminLightboxPrev.addEventListener('click', () => navAdminLightbox(-1));

    const adminLightboxNext = $('#admin-lightbox-next');
    if (adminLightboxNext) adminLightboxNext.addEventListener('click', () => navAdminLightbox(1));

    document.addEventListener('keydown', (e) => {
      const modal = $('#admin-gallery-lightbox');
      if (!modal || modal.style.display === 'none') return;
      if (e.key === 'Escape') {
        closeAdminLightbox();
      } else if (e.key === 'ArrowLeft') {
        navAdminLightbox(-1);
      } else if (e.key === 'ArrowRight') {
        navAdminLightbox(1);
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
