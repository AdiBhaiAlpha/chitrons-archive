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

  var cachedPosts = [];

  function toBnDigits(str) {
    var bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, function(d) { return bnDigits[+d]; });
  }

  function renderPost(p) {
    var isBn = window.i18n && window.i18n.getLang() === 'bn';
    var d = p.publishedAt ? new Date(p.publishedAt) : new Date();
    var date = d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    var readMins = p.readingTime || 1;
    var readText = isBn ? toBnDigits(readMins) + ' মিনিট পড়ার সময়' : readMins + ' min read';
    var coverHtml = p.coverImage ? '<img src="' + esc(p.coverImage) + '" alt="' + esc(p.title) + '" class="post-item-cover" loading="lazy">' : '';
    return '<article class="post-item">' +
      coverHtml +
      '<div class="post-item-meta">' +
        '<span class="category">' + esc(p.category) + '</span>' +
        '<span class="dot" aria-hidden="true">&middot;</span>' +
        '<time datetime="' + d.toISOString() + '">' + date + '</time>' +
        '<span class="dot" aria-hidden="true">&middot;</span>' +
        '<span>' + readText + '</span>' +
      '</div>' +
      '<h3><a href="./post.html?slug=' + esc(p.slug) + '">' + esc(p.title) + '</a></h3>' +
      '<p>' + esc(p.excerpt) + '</p>' +
    '</article>';
  }

  async function loadHomepage() {
    try {
      var isBn = window.i18n && window.i18n.getLang() === 'bn';
      if (isBn) return; // let i18n handle static text
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
      cachedPosts = data.posts || [];
      if (cachedPosts.length > 0) {
        container.innerHTML = cachedPosts.map(renderPost).join('');
      } else {
        var emptyMsg = window.i18n && window.i18n.getLang() === 'bn' ? 'কোনো নিবন্ধ নেই।' : 'No articles yet.';
        container.innerHTML = '<div class="empty-state"><p>' + emptyMsg + '</p></div>';
      }
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><p>Unable to load articles right now.</p></div>';
    }
  }

  function renderTrendingItem(p) {
    var isBn = window.i18n && window.i18n.getLang() === 'bn';
    var readMins = p.readingTime || 1;
    var readText = isBn ? toBnDigits(readMins) + ' মিনিট' : readMins + ' min read';
    return '<a href="./post.html?slug=' + esc(p.slug) + '" class="trending-item">' +
      '<div class="trending-item-meta">' +
        '<span class="category">' + esc(p.category) + '</span> &middot; ' +
        '<span>' + readText + '</span>' +
      '</div>' +
      '<h4 class="trending-item-title">' + esc(p.title) + '</h4>' +
    '</a>';
  }

  async function loadSidebars() {
    var trendingContainer = document.getElementById('trending-posts');
    var catContainer = document.getElementById('sidebar-categories');

    if (trendingContainer) {
      try {
        var data = await API.getPosts({ limit: 4, sort: 'newest' });
        var posts = data.posts || [];
        if (posts.length > 0) {
          trendingContainer.innerHTML = posts.map(renderTrendingItem).join('');
        } else {
          trendingContainer.innerHTML = '<p class="text-muted" style="font-size:12px">No trending posts yet.</p>';
        }
      } catch (e) {
        trendingContainer.innerHTML = '<p class="text-muted" style="font-size:12px">Unable to load trending posts.</p>';
      }
    }

    if (catContainer) {
      try {
        var res = await API.getCategories();
        var cats = res.categories || ['AI & Tech', 'Programming', 'Personal', 'Software'];
        if (cats.length > 0) {
          catContainer.innerHTML = cats.slice(0, 8).map(function(c) {
            return '<a href="./writing.html?category=' + encodeURIComponent(c) + '" class="category-chip">' + esc(c) + '</a>';
          }).join('');
        } else {
          catContainer.innerHTML = '<a href="./writing.html" class="category-chip">Writing</a>';
        }
      } catch (e) {
        catContainer.innerHTML = '<a href="./writing.html?category=AI" class="category-chip">AI</a><a href="./writing.html?category=Programming" class="category-chip">Programming</a>';
      }
    }
  }

  function init() {
    loadSettings();
    loadHomepage();
    loadPosts();
    loadSidebars();

    window.addEventListener('ca-lang-change', function() {
      var container = document.getElementById('latest-posts');
      if (container && cachedPosts.length > 0) {
        container.innerHTML = cachedPosts.map(renderPost).join('');
      }
      loadSidebars();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
