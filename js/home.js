/* =========================================================
   Chitrons Archive — Home Page (Optimized for Lighthouse 95+)
   ========================================================= */

(function() {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function getOptimizedImageUrl(url, width) {
    if (!url) return '';
    if (url.startsWith('/uploads/') || url.startsWith('http://') || url.startsWith('https://')) {
      return '/api/images/optimize?url=' + encodeURIComponent(url) + '&w=' + width;
    }
    return url;
  }

  var cachedPosts = [];

  function toBnDigits(str) {
    var bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return String(str).replace(/[0-9]/g, function(d) { return bnDigits[+d]; });
  }

  function renderPost(p, index) {
    var isBn = window.i18n && window.i18n.getLang() === 'bn';
    var d = p.publishedAt ? new Date(p.publishedAt) : new Date();
    var date = d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    var readMins = p.readingTime || 1;
    var readText = isBn ? toBnDigits(readMins) + ' মিনিট পড়ার সময়' : readMins + ' min read';

    var coverHtml = '';
    if (p.coverImage) {
      var isLcp = (index === 0);
      var src480 = getOptimizedImageUrl(p.coverImage, 480);
      var src768 = getOptimizedImageUrl(p.coverImage, 768);
      var src1200 = getOptimizedImageUrl(p.coverImage, 1200);
      var srcset = src480 + ' 480w, ' + src768 + ' 768w, ' + src1200 + ' 1200w';
      var sizes = '(max-width: 768px) 100vw, 658px';

      var extraAttrs = isLcp
        ? 'fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async"';

      coverHtml = '<img src="' + esc(src768) + '" ' +
        'srcset="' + esc(srcset) + '" ' +
        'sizes="' + esc(sizes) + '" ' +
        'alt="' + esc(p.title) + '" ' +
        'width="658" height="345" ' +
        'class="post-item-cover" ' +
        extraAttrs + '>';
    }

    return '<article class="post-item">' +
      coverHtml +
      '<div class="post-item-meta">' +
        '<span class="category">' + esc(p.category) + '</span>' +
        '<span class="dot" aria-hidden="true">&middot;</span>' +
        '<time datetime="' + d.toISOString() + '">' + date + '</time>' +
        '<span class="dot" aria-hidden="true">&middot;</span>' +
        '<span>' + readText + '</span>' +
      '</div>' +
      '<h3><a href="/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a></h3>' +
      '<p>' + esc(p.excerpt) + '</p>' +
    '</article>';
  }

  function renderTrendingItem(p) {
    var isBn = window.i18n && window.i18n.getLang() === 'bn';
    var readMins = p.readingTime || 1;
    var readText = isBn ? toBnDigits(readMins) + ' মিনিট' : readMins + ' min read';
    return '<a href="/post/' + encodeURIComponent(p.slug) + '" class="trending-item">' +
      '<div class="trending-item-meta">' +
        '<span class="category">' + esc(p.category) + '</span> &middot; ' +
        '<span>' + readText + '</span>' +
      '</div>' +
      '<h4 class="trending-item-title">' + esc(p.title) + '</h4>' +
    '</a>';
  }

  async function loadHome() {
    var isBn = window.i18n && window.i18n.getLang() === 'bn';
    var postContainer = document.getElementById('latest-posts');
    var trendingContainer = document.getElementById('trending-posts');
    var catContainer = document.getElementById('sidebar-categories');

    try {
      // Fetch consolidated home bundle in a single fast roundtrip
      var bundle;
      if (API.getHomeBundle) {
        try {
          bundle = await API.getHomeBundle();
        } catch (e) {
          bundle = null;
        }
      }

      var settings = bundle ? bundle.settings : null;
      var page = bundle ? bundle.page : null;
      var posts = bundle ? bundle.posts : null;
      var categories = bundle ? bundle.categories : null;

      // Fallback if bundle wasn't available
      if (!bundle) {
        var results = await Promise.all([
          API.getSettings().catch(function() { return { settings: null }; }),
          API.getHomepage().catch(function() { return { page: null }; }),
          API.getPosts({ limit: 5, sort: 'newest' }).catch(function() { return { posts: [] }; }),
          API.getCategories().catch(function() { return { categories: [] }; })
        ]);
        settings = results[0].settings;
        page = results[1].page;
        posts = results[2].posts || [];
        categories = results[3].categories || [];
      }

      // 1. Settings
      if (settings && settings.siteName) {
        document.querySelectorAll('.site-logo').forEach(function(el) { el.textContent = settings.siteName; });
        if (settings.tagline) {
          document.title = settings.siteName + ' — ' + settings.tagline;
        }
      }

      // 2. Homepage Content
      if (page && !isBn) {
        if (page.heroTitle) document.getElementById('hero-title').textContent = page.heroTitle;
        if (page.heroDescription) document.getElementById('hero-description').textContent = page.heroDescription;
        if (page.primaryButtonText) document.getElementById('cta-primary').textContent = page.primaryButtonText;
        if (page.primaryButtonLink) document.getElementById('cta-primary').href = page.primaryButtonLink;
        if (page.secondaryButtonText) document.getElementById('cta-secondary').textContent = page.secondaryButtonText;
        if (page.secondaryButtonLink) document.getElementById('cta-secondary').href = page.secondaryButtonLink;
        if (page.featuredSectionTitle) document.getElementById('section-title').textContent = page.featuredSectionTitle;
      }

      // 3. Posts (Primary articles & LCP)
      cachedPosts = posts || [];
      if (postContainer) {
        if (cachedPosts.length > 0) {
          postContainer.innerHTML = cachedPosts.map(renderPost).join('');
        } else {
          var emptyMsg = isBn ? 'কোনো নিবন্ধ নেই।' : 'No articles yet.';
          postContainer.innerHTML = '<div class="empty-state"><p>' + emptyMsg + '</p></div>';
        }
      }

      // 4. Trending Posts (Reuse top posts without second network request)
      if (trendingContainer) {
        var trending = cachedPosts.slice(0, 4);
        if (trending.length > 0) {
          trendingContainer.innerHTML = trending.map(renderTrendingItem).join('');
        } else {
          trendingContainer.innerHTML = '<p class="text-muted" style="font-size:12px">No trending posts yet.</p>';
        }
      }

      // 5. Categories Cloud
      if (catContainer) {
        var cats = (categories && categories.length > 0)
          ? categories
          : ['AI & Tech', 'Programming', 'Personal', 'Software'];
        catContainer.innerHTML = cats.slice(0, 8).map(function(c) {
          return '<a href="/writing?category=' + encodeURIComponent(c) + '" class="category-chip">' + esc(c) + '</a>';
        }).join('');
      }

    } catch (err) {
      if (postContainer && !cachedPosts.length) {
        postContainer.innerHTML = '<div class="empty-state"><p>Unable to load articles right now.</p></div>';
      }
    }
  }

  function init() {
    loadHome();

    window.addEventListener('ca-lang-change', function() {
      var container = document.getElementById('latest-posts');
      if (container && cachedPosts.length > 0) {
        container.innerHTML = cachedPosts.map(renderPost).join('');
      }
      var trendingContainer = document.getElementById('trending-posts');
      if (trendingContainer && cachedPosts.length > 0) {
        trendingContainer.innerHTML = cachedPosts.slice(0, 4).map(renderTrendingItem).join('');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
