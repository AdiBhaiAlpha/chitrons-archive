/* =========================================================
   Chitrons Archive — API Client
   ========================================================= */

const API = (() => {
  const BASE = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '').replace(/\/+$/, '');
  const TIMEOUT = 10000;

  function getToken() {
    try {
      return localStorage.getItem('chitron_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(tok) {
    try {
      if (tok) {
        localStorage.setItem('chitron_admin_token', tok);
      } else {
        localStorage.removeItem('chitron_admin_token');
      }
    } catch (e) {}
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Admin-Token'] = token;
    }

    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        headers
      });
      clearTimeout(timer);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Request timed out');
      throw e;
    }
  }

  return {
    async getPosts({ search, category, tag, sort, page, limit } = {}) {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (category) p.set('category', category);
      if (tag) p.set('tag', tag);
      if (sort) p.set('sort', sort);
      if (page) p.set('page', page);
      if (limit) p.set('limit', limit);
      const q = p.toString();
      return request('/api/posts' + (q ? '?' + q : ''));
    },

    async getPost(slug) {
      return request('/api/posts/' + encodeURIComponent(slug));
    },

    async getNav(slug) {
      return request('/api/posts/nav/' + encodeURIComponent(slug));
    },

    async getCategories() {
      return request('/api/posts/categories');
    },

    async getLabels() {
      return request('/api/posts/labels');
    },

    async getSettings() {
      return request('/api/content/settings');
    },

    async getHomepage() {
      return request('/api/content/homepage');
    },

    async getAbout() {
      return request('/api/content/about');
    },

    async getGallery({ category, search, page, limit, sort } = {}) {
      const p = new URLSearchParams();
      if (category) p.set('category', category);
      if (search) p.set('search', search);
      if (page) p.set('page', page);
      if (limit) p.set('limit', limit);
      if (sort) p.set('sort', sort);
      const q = p.toString();
      return request('/api/gallery' + (q ? '?' + q : ''));
    },

    async getGalleryPhoto(id) {
      return request('/api/gallery/' + encodeURIComponent(id));
    },

    async getGalleryCategories() {
      return request('/api/gallery/categories');
    },

    async login(pin) {
      const res = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ pin }) });
      if (res && res.token) {
        setToken(res.token);
      }
      return res;
    },

    async logout() {
      try {
        await request('/api/auth/logout', { method: 'POST' });
      } finally {
        setToken('');
      }
    },

    async checkAuth() {
      try {
        const res = await request('/api/auth/me');
        if (!res.isAdmin) {
          setToken('');
        }
        return res;
      } catch (e) {
        setToken('');
        throw e;
      }
    },

    async adminGetPosts({ search, status, page, limit } = {}) {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (status) p.set('status', status);
      if (page) p.set('page', page);
      if (limit) p.set('limit', limit);
      const q = p.toString();
      return request('/api/admin/posts' + (q ? '?' + q : ''));
    },

    async adminGetPost(id) {
      return request('/api/admin/posts/' + id);
    },

    async adminCreatePost(data) {
      return request('/api/admin/posts', { method: 'POST', body: JSON.stringify(data) });
    },

    async adminPreviewPost(data) {
      return request('/api/admin/posts/preview', { method: 'POST', body: JSON.stringify(data) });
    },

    async adminRegenerateField(data) {
      return request('/api/admin/posts/regenerate-field', { method: 'POST', body: JSON.stringify(data) });
    },

    async adminUpdatePost(id, data) {
      return request('/api/admin/posts/' + id, { method: 'PUT', body: JSON.stringify(data) });
    },

    async adminDeletePost(id) {
      return request('/api/admin/posts/' + id, { method: 'DELETE' });
    },

    async adminPublishPost(id) {
      return request('/api/admin/posts/' + id + '/publish', { method: 'POST' });
    },

    async adminUnpublishPost(id) {
      return request('/api/admin/posts/' + id + '/unpublish', { method: 'POST' });
    },

    async adminRestorePost(id) {
      return request('/api/admin/posts/' + id + '/restore', { method: 'POST' });
    },

    async adminPermanentDelete(id) {
      return request('/api/admin/posts/' + id + '/permanent', { method: 'DELETE' });
    },

    async adminDuplicatePost(id) {
      return request('/api/admin/posts/' + id + '/duplicate', { method: 'POST' });
    },

    async adminGetRevisions(postId) {
      return request('/api/admin/revisions/' + postId);
    },

    async adminRestoreRevision(revisionId) {
      return request('/api/admin/revisions/' + revisionId + '/restore', { method: 'POST' });
    },

    async adminGetLabels() {
      return request('/api/admin/labels');
    },

    async adminGetCategories() {
      return request('/api/admin/categories');
    },

    async adminGetStats() {
      return request('/api/admin/stats');
    },

    async adminGetSettings() {
      return request('/api/admin/content/settings');
    },

    async adminSaveSettings(data) {
      return request('/api/admin/content/settings', { method: 'PUT', body: JSON.stringify(data) });
    },

    async adminGetHomepage() {
      return request('/api/admin/content/homepage');
    },

    async adminSaveHomepage(data) {
      return request('/api/admin/content/homepage', { method: 'PUT', body: JSON.stringify(data) });
    },

    async adminGetAbout() {
      return request('/api/admin/content/about');
    },

    async adminSaveAbout(data) {
      return request('/api/admin/content/about', { method: 'PUT', body: JSON.stringify(data) });
    },

    /* --- Admin Gallery --- */
    async adminGetGallery({ search, status, category, page, limit } = {}) {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (status && status !== 'all') p.set('status', status);
      if (category && category !== 'all') p.set('category', category);
      if (page) p.set('page', page);
      if (limit) p.set('limit', limit);
      const q = p.toString();
      return request('/api/admin/gallery' + (q ? '?' + q : ''));
    },

    async adminGetGalleryPhoto(id) {
      return request('/api/admin/gallery/' + id);
    },

    async adminCreateGalleryPhoto(data) {
      return request('/api/admin/gallery', { method: 'POST', body: JSON.stringify(data) });
    },

    async adminUpdateGalleryPhoto(id, data) {
      return request('/api/admin/gallery/' + id, { method: 'PUT', body: JSON.stringify(data) });
    },

    async adminDeleteGalleryPhoto(id) {
      return request('/api/admin/gallery/' + id, { method: 'DELETE' });
    },

    async adminPublishGalleryPhoto(id) {
      return request('/api/admin/gallery/' + id + '/publish', { method: 'POST' });
    },

    async adminUnpublishGalleryPhoto(id) {
      return request('/api/admin/gallery/' + id + '/unpublish', { method: 'POST' });
    }
  };
})();

if (typeof window !== 'undefined') {
  window.API = API;
}
if (typeof globalThis !== 'undefined') {
  globalThis.API = API;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
