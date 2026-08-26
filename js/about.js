/* =========================================================
   Chitrons Archive — About Page (Dynamic)
   ========================================================= */

(function() {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function loadAbout() {
    try {
      var data = await API.getAbout();
      var p = data.profile;
      if (!p) return;

      if (p.name) document.getElementById('about-name').textContent = p.name;
      if (p.headline) document.getElementById('about-headline').textContent = p.headline;
      if (p.shortBio) document.getElementById('about-short-bio').innerHTML = '<p>' + esc(p.shortBio) + '</p>';

      if (p.profileImage) {
        var img = document.getElementById('about-profile-image');
        if (img) { img.src = p.profileImage; img.alt = p.imageAlt || p.name; img.style.display = ''; }
      }

      if (p.biography) {
        document.getElementById('about-biography').innerHTML = p.biography.split('\n').filter(Boolean).map(function(para) { return '<p>' + esc(para) + '</p>'; }).join('');
      }

      if (p.roles && p.roles.length) {
        document.getElementById('about-roles').innerHTML = p.roles.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('');
        document.getElementById('section-roles').style.display = '';
      }

      if (p.interests && p.interests.length) {
        document.getElementById('about-interests').innerHTML = p.interests.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('');
        document.getElementById('section-interests').style.display = '';
      }

      if (p.skills && p.skills.length) {
        document.getElementById('about-skills').innerHTML = p.skills.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('');
        document.getElementById('section-skills').style.display = '';
      }

      if (p.projects && p.projects.length) {
        document.getElementById('about-projects').innerHTML = p.projects.map(function(proj) {
          return '<div class="project-item"><h3>' + esc(proj.title) + '</h3><p>' + esc(proj.description) + '</p>' + (proj.tech ? '<span class="tech">' + esc(proj.tech) + '</span>' : '') + '</div>';
        }).join('');
        document.getElementById('section-projects').style.display = '';
      }

      if (p.philosophy) document.getElementById('about-philosophy').innerHTML = '<p>' + esc(p.philosophy) + '</p>';
      if (p.currentFocus) document.getElementById('about-current').innerHTML = '<p>' + esc(p.currentFocus) + '</p>';
      if (p.writingSection) document.getElementById('about-writing').innerHTML = '<p>' + esc(p.writingSection) + '</p>';

      if (p.contactLinks && p.contactLinks.length) {
        document.getElementById('about-contact').innerHTML = p.contactLinks.map(function(link) {
          return '<a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' + esc(link.name) + '</a>';
        }).join('');
        document.getElementById('section-contact').style.display = '';
      }
    } catch (e) {}
  }

  async function loadSettings() {
    try {
      var data = await API.getSettings();
      var s = data.settings;
      if (!s) return;
      if (s.siteName) document.querySelectorAll('.site-logo').forEach(function(el) { el.textContent = s.siteName; });
      var author = s.authorName || 'Chitron Bhattacharjee';
      SeoHelper.setTitle('About ' + author + ' | ' + (s.siteName || 'Chitrons Archive'));
      SeoHelper.setMeta('description', 'About ' + author + ' — ' + (s.authorTitle || 'AI Developer & Programmer') + '. ' + (s.location || ''));
    } catch (e) {}
  }

  function init() {
    loadSettings();
    loadAbout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
