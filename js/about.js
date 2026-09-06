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

      var nameEl = document.getElementById('about-name');
      if (nameEl && p.name) nameEl.textContent = p.name;

      var headlineEl = document.getElementById('about-headline');
      if (headlineEl && p.headline) headlineEl.textContent = p.headline;

      var shortBioEl = document.getElementById('about-short-bio');
      if (shortBioEl && p.shortBio) {
        shortBioEl.innerHTML = p.shortBio.split('\n').filter(Boolean).map(function(para) { return '<p>' + esc(para) + '</p>'; }).join('');
      }

      if (p.profileImage) {
        var img = document.getElementById('about-profile-image');
        if (img) { img.src = p.profileImage; img.alt = p.imageAlt || p.name || 'Profile'; img.style.display = ''; }
      }

      var bioEl = document.getElementById('about-biography');
      if (bioEl && p.biography) {
        bioEl.innerHTML = p.biography.split('\n').filter(Boolean).map(function(para) { return '<p>' + esc(para) + '</p>'; }).join('');
      }

      var rolesEl = document.getElementById('about-roles');
      var rolesSec = document.getElementById('section-roles');
      if (rolesEl && p.roles && p.roles.length) {
        rolesEl.innerHTML = p.roles.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('');
        if (rolesSec) rolesSec.style.display = '';
      }

      var interestsEl = document.getElementById('about-interests');
      var interestsSec = document.getElementById('section-interests');
      if (interestsEl && p.interests && p.interests.length) {
        interestsEl.innerHTML = p.interests.map(function(r) { return '<li>' + esc(r) + '</li>'; }).join('');
        if (interestsSec) interestsSec.style.display = '';
      }

      var skillsEl = document.getElementById('about-skills');
      var skillsSec = document.getElementById('section-skills');
      if (skillsEl && p.skills && p.skills.length) {
        skillsEl.innerHTML = p.skills.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('');
        if (skillsSec) skillsSec.style.display = '';
      }

      var projectsEl = document.getElementById('about-projects');
      var projectsSec = document.getElementById('section-projects');
      if (projectsEl && p.projects && p.projects.length) {
        projectsEl.innerHTML = p.projects.map(function(proj) {
          var techHtml = '';
          if (proj.tech) {
            techHtml = '<p class="tech-built">' + esc(proj.tech).replace(/^Built with:/i, '<strong>Built with:</strong>') + '</p>';
          }
          return '<div class="project-item"><h3>' + esc(proj.title) + '</h3><p>' + esc(proj.description) + '</p>' + techHtml + '</div>';
        }).join('');
        if (projectsSec) projectsSec.style.display = '';
      }

      var philEl = document.getElementById('about-philosophy');
      if (philEl && p.philosophy) {
        philEl.innerHTML = p.philosophy.split('\n').filter(Boolean).map(function(para) { return '<p>' + esc(para) + '</p>'; }).join('');
      }

      var currEl = document.getElementById('about-current');
      if (currEl && p.currentFocus) currEl.innerHTML = '<p>' + esc(p.currentFocus) + '</p>';

      var writingEl = document.getElementById('about-writing');
      if (writingEl && p.writingSection) writingEl.innerHTML = '<p>' + esc(p.writingSection) + '</p>';

      var contactEl = document.getElementById('about-contact');
      var contactSec = document.getElementById('section-contact');
      if (contactEl && p.contactLinks && p.contactLinks.length) {
        contactEl.innerHTML = p.contactLinks.map(function(link) {
          var icon = '';
          var lname = (link.name || '').toLowerCase();
          if (lname.indexOf('github') !== -1) {
            icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>';
          } else if (lname.indexOf('facebook') !== -1) {
            icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>';
          } else if (lname.indexOf('instagram') !== -1) {
            icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
          }
          return '<a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' + icon + esc(link.name) + '</a>';
        }).join('');
        if (contactSec) contactSec.style.display = '';
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
      SeoHelper.setTitle('About ' + author + ' | ' + (s.siteName || "Chitron's Archive"));
      SeoHelper.setMeta('description', 'About ' + author + ' — ' + (s.authorTitle || 'AI Developer & Programmer') + '. ' + (s.location || ''));
    } catch (e) {}
  }

  function init() {
    loadSettings();
    loadAbout().then(function() {
      if (window.i18n && window.i18n.getLang() === 'bn') {
        window.i18n.translateDom('bn');
      }
    });

    window.addEventListener('ca-lang-change', function(e) {
      if (e.detail && e.detail.lang === 'bn') {
        if (window.i18n) window.i18n.translateDom('bn');
      } else {
        loadAbout();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
