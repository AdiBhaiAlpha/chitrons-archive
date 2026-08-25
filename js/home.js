/* =========================================================
   Chitrons Archive — Home Page
   ========================================================= */

(function() {
  'use strict';

  const SITE_URL = (typeof API_BASE_URL !== 'undefined' ? window.location.origin : window.location.origin);

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
    </article>`;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function load() {
    const container = document.getElementById('latest-posts');
    if (!container) return;
    container.innerHTML = skeleton(3);

    try {
      const data = await API.getPosts({ limit: 5, sort: 'newest' });
      if (data.posts && data.posts.length > 0) {
        container.innerHTML = data.posts.map(renderPost).join('');
      } else {
        container.innerHTML = '<div class="empty-state"><p>No articles yet.</p></div>';
      }
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><p>Unable to load articles right now.</p></div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
