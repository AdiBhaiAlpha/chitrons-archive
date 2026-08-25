/* =========================================================
   Chitrons Archive — Post Page
   ========================================================= */

(function() {
  'use strict';

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function getSlug() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  function renderNav(data) {
    const el = document.getElementById('post-nav');
    if (!el) return;
    let h = '';
    if (data.previous) {
      h += '<a href="./post.html?slug=' + esc(data.previous.slug) + '"><span class="label">&larr; Previous</span>' + esc(data.previous.title) + '</a>';
    }
    if (data.next) {
      h += '<a href="./post.html?slug=' + esc(data.next.slug) + '" class="next"><span class="label">Next &rarr;</span>' + esc(data.next.title) + '</a>';
    }
    el.innerHTML = h;
  }

  function renderPost(post) {
    var d = post.publishedAt ? new Date(post.publishedAt) : new Date();
    var date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var upd = post.updatedAt && new Date(post.updatedAt) > d
      ? new Date(post.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;
    var labels = post.labels || [];
    var tagsHtml = labels.map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');

    document.getElementById('article-date').innerHTML = '<time datetime="' + d.toISOString() + '">' + date + '</time>';
    document.getElementById('article-category').textContent = post.category || '';
    document.getElementById('article-title').textContent = post.title;
    document.getElementById('article-excerpt').textContent = post.excerpt;
    document.getElementById('article-reading-time').textContent = (post.readingTime || 1) + ' min read';
    if (tagsHtml) document.getElementById('article-tags').innerHTML = tagsHtml;
    document.getElementById('article-body').innerHTML = post.content;

    if (upd) {
      document.getElementById('article-date').innerHTML += ' <span style="color:var(--text-tertiary)">(updated ' + upd + ')</span>';
    }

    /* SEO */
    var siteName = 'Chitrons Archive';
    var author = 'Chitron Bhattacharjee';
    var pageUrl = window.location.href;

    SeoHelper.setTitle(post.title + ' — ' + author + ' | ' + siteName);
    SeoHelper.setMeta('description', post.excerpt);
    SeoHelper.setCanonical(pageUrl);
    SeoHelper.setProperty('og:title', post.title);
    SeoHelper.setProperty('og:description', post.excerpt);
    SeoHelper.setProperty('og:type', 'article');
    SeoHelper.setProperty('og:url', pageUrl);
    SeoHelper.setProperty('og:site_name', siteName);
    if (post.coverImage) SeoHelper.setProperty('og:image', post.coverImage);
    SeoHelper.setProperty('article:published_time', d.toISOString());
    SeoHelper.setProperty('article:author', author);
    if (post.category) SeoHelper.setProperty('article:section', post.category);
    labels.forEach(function(t) { SeoHelper.setProperty('article:tag', t); });
    SeoHelper.setMeta('twitter:card', 'summary_large_image');
    SeoHelper.setMeta('twitter:title', post.title);
    SeoHelper.setMeta('twitter:description', post.excerpt);

    /* JSON-LD: BlogPosting + BreadcrumbList combined */
    var schema = [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": post.excerpt,
        "datePublished": d.toISOString(),
        "dateModified": (post.updatedAt || d).toISOString(),
        "author": {
          "@type": "Person",
          "name": author,
          "url": window.location.origin + '/about.html'
        },
        "publisher": {
          "@type": "Organization",
          "name": siteName,
          "url": window.location.origin
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
        "articleSection": post.category || undefined,
        "keywords": labels.join(', ') || undefined,
        "image": post.coverImage || undefined
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": window.location.origin + '/' },
          { "@type": "ListItem", "position": 2, "name": "Writing", "item": window.location.origin + '/writing.html' },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": pageUrl }
        ]
      }
    ];

    var existing = document.querySelectorAll('script[type="application/ld+json"]');
    existing.forEach(function(el) { el.remove(); });
    schema.forEach(function(s) {
      var el = document.createElement('script');
      el.type = 'application/ld+json';
      el.textContent = JSON.stringify(s);
      document.head.appendChild(el);
    });
  }

  async function load() {
    var slug = getSlug();
    if (!slug) {
      document.getElementById('article-title').textContent = 'Article not found';
      document.getElementById('article-body').innerHTML = '<p>This article could not be found.</p>';
      return;
    }

    try {
      var data = await API.getPost(slug);
      if (!data.post) throw new Error('Not found');
      renderPost(data.post);
      API.getNav(slug).then(renderNav).catch(function() {});
    } catch (e) {
      document.getElementById('article-title').textContent = 'Article not found';
      document.getElementById('article-body').innerHTML = '<p>This article could not be found. <a href="./writing.html">Back to Writing</a></p>';
      document.title = 'Not Found | Chitrons Archive';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
