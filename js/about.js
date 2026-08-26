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
      if (shortBioEl && p.shortBio) shortBioEl.innerHTML = '<p>' + esc(p.shortBio) + '</p>';

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
          return '<div class="project-item"><h3>' + esc(proj.title) + '</h3><p>' + esc(proj.description) + '</p>' + (proj.tech ? '<span class="tech">' + esc(proj.tech) + '</span>' : '') + '</div>';
        }).join('');
        if (projectsSec) projectsSec.style.display = '';
      }

      var philEl = document.getElementById('about-philosophy');
      if (philEl && p.philosophy) philEl.innerHTML = '<p>' + esc(p.philosophy) + '</p>';

      var currEl = document.getElementById('about-current');
      if (currEl && p.currentFocus) currEl.innerHTML = '<p>' + esc(p.currentFocus) + '</p>';

      var writingEl = document.getElementById('about-writing');
      if (writingEl && p.writingSection) writingEl.innerHTML = '<p>' + esc(p.writingSection) + '</p>';

      var contactEl = document.getElementById('about-contact');
      var contactSec = document.getElementById('section-contact');
      if (contactEl && p.contactLinks && p.contactLinks.length) {
        contactEl.innerHTML = p.contactLinks.map(function(link) {
          return '<a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' + esc(link.name) + '</a>';
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
