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
    if (isNaN(d.getTime())) d = new Date();

    var date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var updDate = post.updatedAt ? new Date(post.updatedAt) : null;
    var upd = updDate && !isNaN(updDate.getTime()) && updDate > d
      ? updDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    var labels = post.labels || [];
    var tagsHtml = labels.map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');

    var dateEl = document.getElementById('article-date');
    if (dateEl) {
      dateEl.innerHTML = '<time datetime="' + d.toISOString() + '">' + date + '</time>';
      if (upd) {
        dateEl.innerHTML += ' <span style="color:var(--text-tertiary)">(updated ' + upd + ')</span>';
      }
    }

    var catEl = document.getElementById('article-category');
    if (catEl) catEl.textContent = post.category || '';

    var titleEl = document.getElementById('article-title');
    if (titleEl) titleEl.textContent = post.title || 'Untitled';

    var excerptEl = document.getElementById('article-excerpt');
    if (excerptEl) excerptEl.textContent = post.excerpt || '';

    var readTimeEl = document.getElementById('article-reading-time');
    if (readTimeEl) readTimeEl.textContent = (post.readingTime || 1) + ' min read';

    var tagsEl = document.getElementById('article-tags');
    if (tagsEl) tagsEl.innerHTML = tagsHtml;

    var bodyEl = document.getElementById('article-body');
    if (bodyEl) bodyEl.innerHTML = post.content || '';

    /* SEO & Metadata */
    try {
      var siteName = 'Chitrons Archive';
      var author = post.author || 'Chitron Bhattacharjee';
      var pageUrl = window.location.href;

      if (window.SeoHelper) {
        SeoHelper.setTitle((post.title || 'Article') + ' — ' + author + ' | ' + siteName);
        SeoHelper.setMeta('description', post.excerpt || '');
        SeoHelper.setCanonical(pageUrl);
        SeoHelper.setProperty('og:title', post.title || '');
        SeoHelper.setProperty('og:description', post.excerpt || '');
        SeoHelper.setProperty('og:type', 'article');
        SeoHelper.setProperty('og:url', pageUrl);
        SeoHelper.setProperty('og:site_name', siteName);
        if (post.coverImage) SeoHelper.setProperty('og:image', post.coverImage);
        SeoHelper.setProperty('article:published_time', d.toISOString());
        SeoHelper.setProperty('article:author', author);
        if (post.category) SeoHelper.setProperty('article:section', post.category);
        labels.forEach(function(t) { SeoHelper.setProperty('article:tag', t); });
        SeoHelper.setMeta('twitter:card', 'summary_large_image');
        SeoHelper.setMeta('twitter:title', post.title || '');
        SeoHelper.setMeta('twitter:description', post.excerpt || '');
      }

      /* JSON-LD: BlogPosting + BreadcrumbList combined */
      var modDate = updDate && !isNaN(updDate.getTime()) ? updDate : d;
      var schema = [
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "headline": post.title || '',
          "description": post.excerpt || '',
          "datePublished": d.toISOString(),
          "dateModified": modDate.toISOString(),
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
            { "@type": "ListItem", "position": 3, "name": post.title || 'Article', "item": pageUrl }
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
    } catch (err) {
      console.warn('SEO/LD-JSON error:', err);
    }
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
