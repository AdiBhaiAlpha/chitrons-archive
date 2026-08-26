/* =========================================================
   Chitrons Archive — Home Page (Dynamic)
   ========================================================= */

(function() {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function skeleton(n) {
    var h = '';
    for (var i = 0; i < n; i++) {
      h += '<div class="post-item"><div class="skeleton skeleton-line--title"></div><div class="skeleton skeleton-line" style="width:80%"></div><div class="skeleton skeleton-line--short"></div></div>';
    }
    return h;
  }

  function renderPost(p) {
    var d = p.publishedAt ? new Date(p.publishedAt) : new Date();
    var date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    var coverHtml = p.coverImage ? '<img src="' + esc(p.coverImage) + '" alt="' + esc(p.title) + '" class="post-item-cover" loading="lazy">' : '';
    return '<article class="post-item">' +
      coverHtml +
      '<div class="post-item-meta">' +
        '<span class="category">' + esc(p.category) + '</span>' +
        '<span class="dot" aria-hidden="true">&middot;</span>' +
        '<time datetime="' + d.toISOString() + '">' + date + '</time>' +
        '<span class="dot" aria-hidden="true">&middot;</span>' +
        '<span>' + (p.readingTime || 1) + ' min read</span>' +
      '</div>' +
      '<h3><a href="./post.html?slug=' + esc(p.slug) + '">' + esc(p.title) + '</a></h3>' +
      '<p>' + esc(p.excerpt) + '</p>' +
    '</article>';
  }

  async function loadHomepage() {
    try {
      var data = await API.getHomepage();
      var p = data.page;
      if (!p) return;
      if (p.heroTitle) document.getElementById('hero-title').textContent = p.heroTitle;
      if (p.heroDescription) document.getElementById('hero-description').textContent = p.heroDescription;
      if (p.primaryButtonText) document.getElementById('cta-primary').textContent = p.primaryButtonText;
      if (p.primaryButtonLink) document.getElementById('cta-primary').href = p.primaryButtonLink;
      if (p.secondaryButtonText) document.getElementById('cta-secondary').textContent = p.secondaryButtonText;
      if (p.secondaryButtonLink) document.getElementById('cta-secondary').href = p.secondaryButtonLink;
      if (p.featuredSectionTitle) document.getElementById('section-title').textContent = p.featuredSectionTitle;
    } catch (e) {}
  }

  async function loadSettings() {
    try {
      var data = await API.getSettings();
      var s = data.settings;
      if (!s) return;
      if (s.siteName) {
        document.querySelectorAll('.site-logo').forEach(function(el) { el.textContent = s.siteName; });
        document.title = s.siteName + (s.tagline ? ' — ' + s.tagline : '');
      }
    } catch (e) {}
  }

  async function loadPosts() {
    var container = document.getElementById('latest-posts');
    if (!container) return;
    container.innerHTML = skeleton(3);

    try {
      var data = await API.getPosts({ limit: 5, sort: 'newest' });
      if (data.posts && data.posts.length > 0) {
        container.innerHTML = data.posts.map(renderPost).join('');
      } else {
        container.innerHTML = '<div class="empty-state"><p>No articles yet.</p></div>';
      }
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><p>Unable to load articles right now.</p></div>';
    }
  }

  function init() {
    loadSettings();
    loadHomepage();
    loadPosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
