/* =========================================================
   Chitrons Archive — Writing Page
   ========================================================= */

(function() {
  'use strict';

  let currentPage = 1;
  let currentSearch = '';
  let currentCategory = '';
  let currentSort = 'newest';

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

  function renderPost(p) {
    const d = p.publishedAt ? new Date(p.publishedAt) : new Date();
    const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const tags = (p.labels || []).map(t => `<a href="#" class="tag" data-tag="${esc(t)}">${esc(t)}</a>`).join('');
    return `<article class="post-item">
      <div class="post-item-meta">
        <span class="category">${esc(p.category)}</span>
        <span class="dot" aria-hidden="true">&middot;</span>
        <time datetime="${d.toISOString()}">${date}</time>
        <span class="dot" aria-hidden="true">&middot;</span>
        <span>${p.readingTime || 1} min read</span>
      </div>
      <h3><a href="./post.html?slug=${esc(p.slug)}">${esc(p.title)}</a></h3>
      <p>${esc(p.excerpt)}</p>
      ${tags ? '<div class="post-item-tags">' + tags + '</div>' : ''}
    </article>`;
  }

  function renderPagination(pag) {
    const el = document.getElementById('pagination');
    if (!el || pag.pages <= 1) { if (el) el.innerHTML = ''; return; }
    let h = '';
    h += `<button ${pag.page <= 1 ? 'disabled' : ''} data-page="${pag.page - 1}">&larr; Newer</button>`;
    for (let i = 1; i <= pag.pages; i++) {
      if (i === 1 || i === pag.pages || Math.abs(i - pag.page) <= 1) {
        h += `<button data-page="${i}" class="${i === pag.page ? 'active' : ''}">${i}</button>`;
      } else if (Math.abs(i - pag.page) === 2) {
        h += `<button disabled>&hellip;</button>`;
      }
    }
    h += `<button ${pag.page >= pag.pages ? 'disabled' : ''} data-page="${pag.page + 1}">Older &rarr;</button>`;
    el.innerHTML = h;
    el.querySelectorAll('button:not([disabled])').forEach(b => {
      b.addEventListener('click', function() {
        currentPage = parseInt(this.dataset.page);
        loadPosts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
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

  async function loadPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = skeleton(5);

    try {
      const params = { page: currentPage, limit: 10, sort: currentSort };
      if (currentSearch) params.search = currentSearch;
      if (currentCategory) params.category = currentCategory;

      const data = await API.getPosts(params);
      if (data.posts && data.posts.length > 0) {
        container.innerHTML = data.posts.map(renderPost).join('');
        renderPagination(data.pagination);
      } else {
        container.innerHTML = '<div class="empty-state"><p>No articles found.</p></div>';
        document.getElementById('pagination').innerHTML = '';
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

    let searchTimer;
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          currentSearch = this.value.trim();
          currentPage = 1;
          loadPosts();
        }, 300);
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
