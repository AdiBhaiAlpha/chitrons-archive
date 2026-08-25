/* =========================================================
   Chitrons Archive — Main (header, nav, theme, footer, SEO helpers)
   ========================================================= */

(function() {
  'use strict';

  /* --- Theme --- */
  function getPreferredTheme() {
    const stored = localStorage.getItem('ca-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ca-theme', theme);
    updateThemeIcon(theme);
  }

  function updateThemeIcon(theme) {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', function() {
    const themeBtn = document.querySelector('.theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', function() {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    }

    /* --- Mobile nav --- */
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const mobileNav = document.querySelector('.mobile-nav');
    const closeBtn = document.querySelector('.mobile-nav-close');

    if (menuBtn && mobileNav) {
      menuBtn.addEventListener('click', function() {
        mobileNav.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    }
    if (closeBtn && mobileNav) {
      closeBtn.addEventListener('click', function() {
        mobileNav.classList.remove('open');
        document.body.style.overflow = '';
      });
    }
    if (mobileNav) {
      mobileNav.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function() {
          mobileNav.classList.remove('open');
          document.body.style.overflow = '';
        });
      });
    }

    /* --- Active nav link --- */
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-nav a, .mobile-nav a').forEach(function(a) {
      const href = a.getAttribute('href').split('/').pop();
      if (href === path || (path === '' && href === 'index.html')) {
        a.classList.add('active');
      }
    });
  });

  /* --- SEO Helpers --- */
  window.SeoHelper = {
    setTitle(title) {
      document.title = title;
    },
    setMeta(name, content) {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
      el.setAttribute('content', content);
    },
    setProperty(prop, content) {
      let el = document.querySelector(`meta[property="${prop}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
      el.setAttribute('content', content);
    },
    setCanonical(url) {
      let el = document.querySelector('link[rel="canonical"]');
      if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el); }
      el.setAttribute('href', url);
    },
    setJsonLd(data) {
      const existing = document.querySelector('script[type="application/ld+json"]');
      if (existing) existing.remove();
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(data);
      document.head.appendChild(s);
    }
  };
})();
