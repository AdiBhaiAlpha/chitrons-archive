/* =========================================================
   Chitrons Archive — Photo Gallery (Only Photos Gallery)
   ========================================================= */

(function() {
  'use strict';

  var currentCategory = 'all';
  var allPhotos = [];
  var filteredPhotos = [];
  var currentLightboxIndex = 0;
  var isLightboxOpen = false;

  // DOM Elements
  var gridEl = document.getElementById('gallery-grid');
  var chipsContainerEl = document.getElementById('gallery-category-chips');
  var countBadgeEl = document.getElementById('gallery-count');
  var lightboxEl = document.getElementById('gallery-lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var lightboxTitle = document.getElementById('lightbox-title');
  var lightboxCaption = document.getElementById('lightbox-caption');
  var lightboxMeta = document.getElementById('lightbox-meta');
  var lightboxCounter = document.getElementById('lightbox-counter');
  var lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
  var lightboxNextBtn = document.getElementById('lightbox-next-btn');
  var lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  var lightboxFullscreenBtn = document.getElementById('lightbox-fullscreen-btn');

  // Helper translation function
  function translate(key, fallback) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key);
    }
    return fallback || key;
  }

  // Format date safely
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  // Initialize Page
  async function init() {
    // Parse URL params for initial category or photo ID
    var urlParams = new URLSearchParams(window.location.search);
    var categoryParam = urlParams.get('category');
    if (categoryParam) {
      currentCategory = categoryParam;
    }

    setupEventListeners();
    await loadGallery();

    // Check for deep link to photo ID
    var photoParam = urlParams.get('photo');
    if (photoParam) {
      var targetIdx = filteredPhotos.findIndex(function(p) { return p._id === photoParam; });
      if (targetIdx !== -1) {
        openLightbox(targetIdx);
      }
    }
  }

  // Load photos and categories from API
  async function loadGallery() {
    if (!gridEl) return;
    gridEl.innerHTML = '<div class="loading" style="grid-column:1/-1;text-align:center;padding:48px 0;">' + translate('gallery.loading', 'Loading photos...') + '</div>';

    try {
      var api = (typeof window !== 'undefined' && window.API) || (typeof API !== 'undefined' ? API : null);
      var res;
      if (api && typeof api.getGallery === 'function') {
        res = await api.getGallery({ limit: 150 });
      } else {
        // Direct fetch fallback if API client script was delayed
        var raw = await fetch('/api/gallery?limit=150');
        res = await raw.json();
      }

      if (res && res.photos) {
        allPhotos = res.photos;
      } else if (Array.isArray(res)) {
        allPhotos = res;
      } else {
        allPhotos = [];
      }

      renderCategoryChips();
      applyFilter();
    } catch (err) {
      console.error('Failed to load gallery photos:', err);
      gridEl.innerHTML = '<div class="gallery-empty-state"><p>' + translate('gallery.empty', 'No photos found.') + '</p></div>';
    }
  }

  // Render category filter chips
  function renderCategoryChips() {
    if (!chipsContainerEl) return;

    // Collect distinct categories from photos
    var categories = {};
    allPhotos.forEach(function(photo) {
      if (photo.category) {
        var cat = photo.category.trim();
        if (cat) categories[cat] = (categories[cat] || 0) + 1;
      }
    });

    var categoryList = Object.keys(categories).sort();

    var html = '';
    var isAllActive = currentCategory === 'all' || !currentCategory;
    html += '<button type="button" class="gallery-filter-chip ' + (isAllActive ? 'active' : '') + '" data-category="all" role="tab" aria-selected="' + isAllActive + '" data-i18n="gallery.all">' + translate('gallery.all', 'All Photos') + ' (' + allPhotos.length + ')</button>';

    categoryList.forEach(function(cat) {
      var isActive = currentCategory.toLowerCase() === cat.toLowerCase();
      html += '<button type="button" class="gallery-filter-chip ' + (isActive ? 'active' : '') + '" data-category="' + encodeURIComponent(cat) + '" role="tab" aria-selected="' + isActive + '">' + escapeHtml(cat) + ' (' + categories[cat] + ')</button>';
    });

    chipsContainerEl.innerHTML = html;

    // Attach click events to chips
    var chips = chipsContainerEl.querySelectorAll('.gallery-filter-chip');
    chips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        var cat = this.getAttribute('data-category');
        if (cat === 'all') {
          currentCategory = 'all';
        } else {
          currentCategory = decodeURIComponent(cat);
        }

        chips.forEach(function(c) {
          c.classList.remove('active');
          c.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');

        // Update URL search param without reload
        var url = new URL(window.location.href);
        if (currentCategory === 'all') {
          url.searchParams.delete('category');
        } else {
          url.searchParams.set('category', currentCategory);
        }
        window.history.replaceState({}, '', url);

        applyFilter();
      });
    });
  }

  // Apply active category filter
  function applyFilter() {
    if (currentCategory === 'all' || !currentCategory) {
      filteredPhotos = allPhotos.slice();
    } else {
      filteredPhotos = allPhotos.filter(function(photo) {
        return (photo.category || '').toLowerCase() === currentCategory.toLowerCase();
      });
    }

    // Update count badge
    if (countBadgeEl) {
      var countWord = translate('gallery.photosCount', 'photos');
      countBadgeEl.textContent = filteredPhotos.length + ' ' + countWord;
    }

    renderPhotosGrid();
  }

  // Setup Lazy Loading via IntersectionObserver
  var cardObserver = null;
  function initLazyLoading() {
    var cards = gridEl.querySelectorAll('.photo-card');
    if (!cards.length) return;

    if ('IntersectionObserver' in window) {
      if (cardObserver) {
        cardObserver.disconnect();
      }
      cardObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var card = entry.target;
            card.classList.add('is-visible');

            var img = card.querySelector('img[data-src]');
            if (img) {
              var dataSrc = img.getAttribute('data-src');
              if (dataSrc) {
                img.src = dataSrc;
                img.removeAttribute('data-src');
                if (img.complete && img.naturalHeight !== 0) {
                  img.classList.add('loaded');
                }
              }
            }
            observer.unobserve(card);
          }
        });
      }, {
        rootMargin: '180px 0px',
        threshold: 0.05
      });

      cards.forEach(function(card) {
        cardObserver.observe(card);
      });
    } else {
      // Fallback for older browsers without IntersectionObserver
      cards.forEach(function(card) {
        card.classList.add('is-visible');
        var img = card.querySelector('img[data-src]');
        if (img) {
          var dataSrc = img.getAttribute('data-src');
          if (dataSrc) {
            img.src = dataSrc;
            img.removeAttribute('data-src');
            img.classList.add('loaded');
          }
        }
      });
    }
  }

  // Render the pure photo grid
  function renderPhotosGrid() {
    if (!gridEl) return;

    if (!filteredPhotos || filteredPhotos.length === 0) {
      gridEl.innerHTML = '<div class="gallery-empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto;color:var(--text-tertiary)"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p style="margin-top:12px;">' + translate('gallery.empty', 'No photos found in this category.') + '</p></div>';
      return;
    }

    var placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"%3E%3C/svg%3E';
    var html = '';
    filteredPhotos.forEach(function(photo, index) {
      var title = photo.title || 'Untitled';
      var imageUrl = photo.imageUrl || photo.url || '';
      var altText = photo.altText || title;
      var caption = photo.caption || '';
      var category = photo.category || 'Photography';
      var location = photo.location || '';
      var dateStr = formatDate(photo.dateTaken || photo.createdAt);

      html += '<article class="photo-card" data-index="' + index + '" role="button" tabindex="0" aria-label="' + escapeHtml(title) + '">';
      html += '  <div class="photo-card-media">';
      html += '    <img src="' + placeholderSvg + '" data-src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(altText) + '" class="photo-card-img" loading="lazy" onload="if(this.src && !this.src.startsWith(\'data:\')) this.classList.add(\'loaded\')">';
      html += '    <div class="photo-card-expand-badge" title="' + escapeHtml(translate('gallery.viewFullscreen', 'View full-screen')) + '" aria-hidden="true">';
      html += '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
      html += '    </div>';
      html += '  </div>';
      html += '  <div class="photo-card-body">';
      html += '    <div class="photo-card-header-row">';
      html += '      <span class="photo-card-category">' + escapeHtml(category) + '</span>';
      if (dateStr) {
        html += '      <time class="photo-card-date">' + escapeHtml(dateStr) + '</time>';
      }
      html += '    </div>';
      html += '    <h2 class="photo-card-title">' + escapeHtml(title) + '</h2>';
      if (caption) {
        html += '    <p class="photo-card-caption">' + escapeHtml(caption) + '</p>';
      }
      if (location) {
        html += '    <div class="photo-card-location">';
        html += '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
        html += '      <span>' + escapeHtml(location) + '</span>';
        html += '    </div>';
      }
      html += '    <div class="photo-card-footer-cta">';
      html += '      <span>' + escapeHtml(translate('gallery.viewFullscreen', 'View full-screen')) + '</span>';
      html += '      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
      html += '    </div>';
      html += '  </div>';
      html += '</article>';
    });

    gridEl.innerHTML = html;

    // Initialize IntersectionObserver for smooth staggered entrance animations and lazy loading
    initLazyLoading();

    // Attach click and keyboard events to cards
    var cards = gridEl.querySelectorAll('.photo-card');
    cards.forEach(function(card) {
      card.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        openLightbox(idx);
      });

      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var idx = parseInt(this.getAttribute('data-index'), 10);
          openLightbox(idx);
        }
      });
    });
  }

  // Open Lightbox
  function openLightbox(index) {
    if (!filteredPhotos || index < 0 || index >= filteredPhotos.length) return;
    currentLightboxIndex = index;
    isLightboxOpen = true;

    updateLightboxContent();

    if (lightboxEl) {
      lightboxEl.classList.add('active');
      lightboxEl.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      if (lightboxCloseBtn) lightboxCloseBtn.focus();
    }
  }

  // Close Lightbox
  function closeLightbox() {
    isLightboxOpen = false;
    if (lightboxEl) {
      lightboxEl.classList.remove('active');
      lightboxEl.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    if (document.fullscreenElement) {
      try {
        document.exitFullscreen();
      } catch (e) {}
    }
  }

  // Navigate Lightbox
  function nextPhoto() {
    if (!filteredPhotos.length) return;
    if (currentLightboxIndex < filteredPhotos.length - 1) {
      currentLightboxIndex++;
      updateLightboxContent();
    } else {
      // Loop to beginning
      currentLightboxIndex = 0;
      updateLightboxContent();
    }
  }

  function prevPhoto() {
    if (!filteredPhotos.length) return;
    if (currentLightboxIndex > 0) {
      currentLightboxIndex--;
      updateLightboxContent();
    } else {
      // Loop to end
      currentLightboxIndex = filteredPhotos.length - 1;
      updateLightboxContent();
    }
  }

  // Update Lightbox DOM Content
  function updateLightboxContent() {
    var photo = filteredPhotos[currentLightboxIndex];
    if (!photo) return;

    var title = photo.title || 'Untitled';
    var imageUrl = photo.imageUrl || photo.url || '';
    var altText = photo.altText || title;
    var caption = photo.caption || '';
    var category = photo.category || '';
    var location = photo.location || '';
    var dateStr = formatDate(photo.dateTaken || photo.createdAt);

    if (lightboxImg) {
      lightboxImg.style.opacity = '0';
      lightboxImg.src = imageUrl;
      lightboxImg.alt = altText;
      lightboxImg.onload = function() {
        lightboxImg.style.opacity = '1';
      };
    }

    if (lightboxTitle) {
      lightboxTitle.textContent = title;
    }

    if (lightboxCaption) {
      lightboxCaption.textContent = caption;
      lightboxCaption.style.display = caption ? 'block' : 'none';
    }

    if (lightboxMeta) {
      var metaHtml = '';
      if (category) {
        metaHtml += '<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg> ' + escapeHtml(category) + '</span>';
      }
      if (location) {
        metaHtml += '<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + escapeHtml(location) + '</span>';
      }
      if (dateStr) {
        metaHtml += '<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + escapeHtml(dateStr) + '</span>';
      }
      lightboxMeta.innerHTML = metaHtml;
    }

    if (lightboxCounter) {
      lightboxCounter.textContent = (currentLightboxIndex + 1) + ' / ' + filteredPhotos.length;
    }

    // Preload next and prev images
    preloadAdjacent();
  }

  // Preload next and previous images
  function preloadAdjacent() {
    if (filteredPhotos.length <= 1) return;
    var nextIdx = (currentLightboxIndex + 1) % filteredPhotos.length;
    var prevIdx = (currentLightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length;

    if (filteredPhotos[nextIdx] && (filteredPhotos[nextIdx].imageUrl || filteredPhotos[nextIdx].url)) {
      var imgNext = new Image();
      imgNext.src = filteredPhotos[nextIdx].imageUrl || filteredPhotos[nextIdx].url;
    }
    if (filteredPhotos[prevIdx] && (filteredPhotos[prevIdx].imageUrl || filteredPhotos[prevIdx].url)) {
      var imgPrev = new Image();
      imgPrev.src = filteredPhotos[prevIdx].imageUrl || filteredPhotos[prevIdx].url;
    }
  }

  // Toggle Fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (lightboxEl && lightboxEl.requestFullscreen) {
        lightboxEl.requestFullscreen().catch(function(err) {
          console.log('Fullscreen error:', err);
        });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // Escape HTML utility
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Setup Global Event Listeners
  function setupEventListeners() {
    if (lightboxCloseBtn) {
      lightboxCloseBtn.addEventListener('click', closeLightbox);
    }
    if (lightboxNextBtn) {
      lightboxNextBtn.addEventListener('click', nextPhoto);
    }
    if (lightboxPrevBtn) {
      lightboxPrevBtn.addEventListener('click', prevPhoto);
    }
    if (lightboxFullscreenBtn) {
      lightboxFullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Backdrop click to close
    if (lightboxEl) {
      lightboxEl.addEventListener('click', function(e) {
        if (e.target === lightboxEl || e.target.id === 'lightbox-body') {
          closeLightbox();
        }
      });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', function(e) {
      if (!isLightboxOpen) return;

      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        nextPhoto();
      } else if (e.key === 'ArrowLeft') {
        prevPhoto();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    });

    // Mobile Swipe Handling
    var touchStartX = 0;
    var touchStartY = 0;
    if (lightboxEl) {
      lightboxEl.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      lightboxEl.addEventListener('touchend', function(e) {
        if (e.changedTouches.length === 1) {
          var diffX = e.changedTouches[0].clientX - touchStartX;
          var diffY = e.changedTouches[0].clientY - touchStartY;

          // Only trigger if horizontal swipe is dominant and > 50px
          if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            if (diffX < 0) {
              nextPhoto();
            } else {
              prevPhoto();
            }
          }
        }
      }, { passive: true });
    }

    // Listen for language change events
    window.addEventListener('languagechange', function() {
      renderCategoryChips();
      applyFilter();
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
