/* =========================================================
   Chitrons Archive — Writing Page
   ========================================================= */

(function() {
  'use strict';

  let currentPage = 1;
  let currentSearch = '';
  let currentCategory = '';
  let currentSort = 'newest';
  let allLoadedPosts = [];

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function skeleton(n) {
    let h = '';
    for (let i = 0; i < n; i++) {
      h += '<div class="post-item"><div class="skeleton skeleton-line--title"></div><div class="skeleton skeleton-line" style="width:80%"></div><div class="skeleton skeleton-line--short"></div></div>';
    }
    return h;
  }

  function toBnDigits(str) {
    var bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, function(d) { return bnDigits[+d]; });
  }

  function renderPost(p) {
    const isBn = window.i18n && window.i18n.getLang() === 'bn';
    const d = p.publishedAt ? new Date(p.publishedAt) : new Date();
    const date = d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const readMins = p.readingTime || 1;
    const readText = isBn ? toBnDigits(readMins) + ' মিনিট পড়ার সময়' : readMins + ' min read';
    const tags = (p.labels || []).map(t => `<a href="#" class="tag" data-tag="${esc(t)}">${esc(t)}</a>`).join('');
    return `<article class="post-item">
      <div class="post-item-meta">
        <span class="category">${esc(p.category)}</span>
        <span class="dot" aria-hidden="true">&middot;</span>
        <time datetime="${d.toISOString()}">${date}</time>
        <span class="dot" aria-hidden="true">&middot;</span>
        <span>${readText}</span>
      </div>
      <h3><a href="./post.html?slug=${esc(p.slug)}">${esc(p.title)}</a></h3>
      <p>${esc(p.excerpt)}</p>
      ${tags ? '<div class="post-item-tags">' + tags + '</div>' : ''}
    </article>`;
  }

  function renderPagination(pag) {
    const el = document.getElementById('pagination');
    if (!el || !pag || pag.pages <= 1) {
      if (el) el.innerHTML = '';
      return;
    }
    const isBn = window.i18n && window.i18n.getLang() === 'bn';
    const prevText = isBn ? '&larr; নতুন' : '&larr; Newer';
    const nextText = isBn ? 'পুরোনো &rarr;' : 'Older &rarr;';
    let h = '';
    h += `<button ${pag.page <= 1 ? 'disabled' : ''} data-page="${pag.page - 1}">${prevText}</button>`;
    for (let i = 1; i <= pag.pages; i++) {
      const pageLabel = isBn ? toBnDigits(i) : i;
      if (i === 1 || i === pag.pages || Math.abs(i - pag.page) <= 1) {
        h += `<button data-page="${i}" class="${i === pag.page ? 'active' : ''}">${pageLabel}</button>`;
      } else if (Math.abs(i - pag.page) === 2) {
        h += `<button disabled>&hellip;</button>`;
      }
    }
    h += `<button ${pag.page >= pag.pages ? 'disabled' : ''} data-page="${pag.page + 1}">${nextText}</button>`;
    el.innerHTML = h;
    el.querySelectorAll('button:not([disabled])').forEach(b => {
      b.addEventListener('click', function() {
        currentPage = parseInt(this.dataset.page, 10) || 1;
        loadPosts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  /* --- Admin Popup Modal Logic --- */
  const adminModal = document.getElementById('admin-modal');
  const adminCloseBtn = document.getElementById('admin-modal-close');
  const adminCancelBtn = document.getElementById('admin-modal-cancel');
  const adminConfirmBtn = document.getElementById('admin-modal-confirm');

  function showAdminModal() {
    if (!adminModal) return;
    adminModal.classList.remove('hidden');
    adminModal.setAttribute('aria-hidden', 'false');
    if (adminConfirmBtn) adminConfirmBtn.focus();
  }

  function hideAdminModal() {
    if (!adminModal) return;
    adminModal.classList.add('hidden');
    adminModal.setAttribute('aria-hidden', 'true');
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.focus();
  }

  function checkAdminTrigger(val) {
    if (!val) return false;
    const clean = val.trim().toLowerCase();
    if (clean === 'admin') {
      showAdminModal();
      return true;
    }
    return false;
  }

  async function loadCategories() {
    try {
      const data = await API.getCategories();
      const sel = document.getElementById('category-filter');
      if (!sel || !data.categories) return;
      sel.innerHTML = '<option value="">All categories</option>' +
        data.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    } catch (e) {}
  }

  /* --- Real-Time Client Filter by Title --- */
  function filterAndRenderLocal(query) {
    const container = document.getElementById('posts-container');
    const pagEl = document.getElementById('pagination');
    if (!container || !allLoadedPosts.length) return false;

    const q = (query || '').toLowerCase().trim();
    let filtered = allLoadedPosts;

    if (currentCategory) {
      filtered = filtered.filter(p => (p.category || '').toLowerCase() === currentCategory.toLowerCase());
    }

    if (q) {
      filtered = filtered.filter(p => (p.title || '').toLowerCase().includes(q));
    }

    if (filtered.length > 0) {
      container.innerHTML = filtered.map(renderPost).join('');
      if (q && pagEl) {
        pagEl.innerHTML = '';
      }
    } else {
      container.innerHTML = `<div class="empty-state"><p>No articles found matching &ldquo;${esc(query)}&rdquo;.</p></div>`;
      if (pagEl) pagEl.innerHTML = '';
    }
    return true;
  }

  async function loadPosts(isRealtimeSearch = false) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    if (!isRealtimeSearch) {
      container.innerHTML = skeleton(5);
    }

    try {
      const params = { page: currentPage, limit: currentSearch ? 50 : 10, sort: currentSort };
      if (currentSearch) params.search = currentSearch;
      if (currentCategory) params.category = currentCategory;

      const data = await API.getPosts(params);
      if (data.posts && data.posts.length > 0) {
        // Cache posts for fast real-time client-side title filtering
        if (!currentSearch && !currentCategory) {
          allLoadedPosts = data.posts;
        }

        // If searching, filter specifically by title if requested or show all matches
        let displayPosts = data.posts;
        if (currentSearch) {
          const q = currentSearch.toLowerCase();
          // Filter matching title
          const titleMatches = displayPosts.filter(p => (p.title || '').toLowerCase().includes(q));
          if (titleMatches.length > 0) {
            displayPosts = titleMatches;
          }
        }

        container.innerHTML = displayPosts.map(renderPost).join('');
        if (currentSearch) {
          const pagEl = document.getElementById('pagination');
          if (pagEl) pagEl.innerHTML = '';
        } else {
          renderPagination(data.pagination);
        }
      } else {
        const msg = currentSearch ? `No articles found matching &ldquo;${esc(currentSearch)}&rdquo;.` : 'No articles found.';
        container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
        const pagEl = document.getElementById('pagination');
        if (pagEl) pagEl.innerHTML = '';
      }
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><p>Unable to load articles right now.</p></div>';
    }
  }

  function init() {
    loadCategories();

    const searchInput = document.getElementById('search-input');
    const catSelect = document.getElementById('category-filter');
    const sortSelect = document.getElementById('sort-select');

    // Modal listeners
    if (adminCloseBtn) adminCloseBtn.addEventListener('click', hideAdminModal);
    if (adminCancelBtn) adminCancelBtn.addEventListener('click', hideAdminModal);
    if (adminModal) {
      adminModal.addEventListener('click', function(e) {
        if (e.target === adminModal) hideAdminModal();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && adminModal && !adminModal.classList.contains('hidden')) {
        hideAdminModal();
      }
    });

    let searchTimer;
    if (searchInput) {
      // Real-time instant title filtering on every keystroke
      searchInput.addEventListener('input', function() {
        const val = this.value;
        const trimmed = val.trim();

        // 1. Check if user typed "admin"
        if (checkAdminTrigger(trimmed)) {
          // Admin modal is shown
        }

        currentSearch = trimmed;
        currentPage = 1;

        // 2. Instant real-time UI filter from cached items if available
        if (allLoadedPosts.length > 0) {
          filterAndRenderLocal(currentSearch);
        }

        // 3. Debounced API fetch to synchronize with server database
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          loadPosts(true);
        }, 250);
      });

      // Handle Enter keypress in search input
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = this.value.trim();
          if (val.toLowerCase() === 'admin') {
            showAdminModal();
          } else {
            clearTimeout(searchTimer);
            currentSearch = val;
            currentPage = 1;
            loadPosts();
          }
        }
      });
    }

    if (catSelect) {
      catSelect.addEventListener('change', function() {
        currentCategory = this.value;
        currentPage = 1;
        loadPosts();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function() {
        currentSort = this.value;
        currentPage = 1;
        loadPosts();
      });
    }

    loadPosts();

    window.addEventListener('ca-lang-change', function() {
      loadPosts();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
