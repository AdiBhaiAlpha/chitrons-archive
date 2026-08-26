/* =========================================================
   Chitrons Archive — API Client
   ========================================================= */

const API = (() => {
  const BASE = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '').replace(/\/+$/, '');
  const TIMEOUT = 10000;

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers }
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

    async login(pin) {
      return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ pin }) });
    },

    async logout() {
      return request('/api/auth/logout', { method: 'POST' });
    },

    async checkAuth() {
      return request('/api/auth/me');
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
    }
  };
})();
