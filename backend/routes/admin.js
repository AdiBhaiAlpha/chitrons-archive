const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const BlogPost = require('../models/BlogPost');
const Revision = require('../models/Revision');
const GalleryItem = require('../models/GalleryItem');
const authMiddleware = require('../middleware/auth');
const editorialService = require('../editorialService');

function generateSlug(text, customSlug) {
  const source = (customSlug && customSlug.trim()) ? customSlug.trim() : (text || '');
  if (!source) return 'post-' + Date.now();

  let slug = source
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug || slug.length < 2) {
    slug = 'post-' + Date.now();
  }
  return slug;
}

router.use(authMiddleware);

/* --- Stats --- */
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const [total, published, drafts, scheduled] = await Promise.all([
      BlogPost.countDocuments({ status: { $ne: 'trashed' } }),
      BlogPost.countDocuments({ status: 'published' }),
      BlogPost.countDocuments({ status: 'draft' }),
      BlogPost.countDocuments({ status: 'scheduled', scheduledAt: { $gt: now } })
    ]);
    res.json({ total, published, drafts, scheduled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/* --- List posts (admin) --- */
router.get('/posts', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== '') {
      query.status = status;
    } else {
      query.status = { $ne: 'trashed' };
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [posts, total] = await Promise.all([
      BlogPost.find(query).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit)),
      BlogPost.countDocuments(query)
    ]);

    res.json({
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

/* --- Get single post (admin) --- */
router.get('/posts/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

/* --- Create post --- */
router.post('/posts', async (req, res) => {
  try {
    let {
      title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled,
      autoExcerpt = true, autoTags = true, autoImage = true
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let postSlug = generateSlug(title, slug);
    const rawPost = {
      title: title.trim(),
      excerpt: (excerpt || '').trim(),
      content: content || '',
      coverImage: (coverImage || '').trim(),
      author: 'Chitron Bhattacharjee',
      category: (category || 'general').trim().toLowerCase(),
      labels: Array.isArray(labels) ? labels.map(l => String(l).trim().toLowerCase()).filter(Boolean) : [],
      slug: postSlug
    };

    const enriched = await editorialService.enrichPostData(rawPost, {
      autoExcerpt: autoExcerpt !== false,
      autoTags: autoTags !== false,
      autoImage: autoImage !== false
    });

    let postStatus = status || 'draft';
    const now = new Date();
    let finalPublishedAt = null;
    let finalScheduledAt = null;

    if (postStatus === 'scheduled' && scheduledAt) {
      const parsedSched = new Date(scheduledAt);
      if (isNaN(parsedSched.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduled date/time' });
      }
      if (parsedSched > now) {
        finalScheduledAt = parsedSched;
      } else {
        postStatus = 'published';
        finalPublishedAt = parsedSched;
      }
    } else if (postStatus === 'published') {
      finalPublishedAt = now;
    }

    const existing = await BlogPost.findOne({ slug: postSlug });
    if (existing) {
      postSlug = `${postSlug}-${Date.now().toString(36)}`;
    }

    const postData = {
      title: enriched.title,
      slug: postSlug,
      excerpt: enriched.excerpt,
      content: enriched.content,
      coverImage: enriched.coverImage,
      author: enriched.author,
      category: enriched.category,
      labels: enriched.labels,
      status: postStatus,
      publishedAt: finalPublishedAt,
      scheduledAt: finalScheduledAt,
      seoTitle: (seoTitle || '').trim(),
      seoDescription: (seoDescription || '').trim(),
      canonicalUrl: (canonicalUrl || '').trim(),
      featured: !!featured,
      commentsEnabled: commentsEnabled !== false,
      editorialAutomation: enriched.editorialAutomation
    };

    const post = new BlogPost(postData);
    await post.save();
    res.status(201).json({ post });
  } catch (err) {
    console.error('Error creating post in admin router:', err);
    res.status(500).json({ error: err.message || 'Failed to create post' });
  }
});

/* --- Update post --- */
router.put('/posts/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await new Revision({
      postId: post._id, title: post.title, content: post.content,
      excerpt: post.excerpt, labels: post.labels, category: post.category
    }).save().catch(() => {});

    let {
      title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled,
      autoExcerpt = true, autoTags = true, autoImage = true
    } = req.body;

    const now = new Date();

    if (title) post.title = title.trim();

    if (title || slug) {
      let newSlug = generateSlug(title || post.title, slug || post.slug);
      const dup = await BlogPost.findOne({ slug: newSlug, _id: { $ne: post._id } });
      if (dup) newSlug = `${newSlug}-${Date.now().toString(36)}`;
      post.slug = newSlug;
    }

    if (content !== undefined) post.content = content;
    if (category) post.category = category.trim().toLowerCase();
    if (labels !== undefined) {
      post.labels = Array.isArray(labels) ? labels.map(l => String(l).trim().toLowerCase()).filter(Boolean) : [];
    }

    const rawPost = {
      title: post.title,
      excerpt: excerpt !== undefined ? excerpt.trim() : post.excerpt,
      content: post.content,
      coverImage: coverImage !== undefined ? coverImage.trim() : post.coverImage,
      author: post.author,
      category: post.category,
      labels: post.labels,
      slug: post.slug,
      editorialAutomation: post.editorialAutomation
    };

    const enriched = await editorialService.enrichPostData(rawPost, {
      autoExcerpt: autoExcerpt !== false,
      autoTags: autoTags !== false,
      autoImage: autoImage !== false
    });

    post.excerpt = enriched.excerpt;
    post.labels = enriched.labels;
    post.coverImage = enriched.coverImage;
    post.editorialAutomation = enriched.editorialAutomation;

    if (seoTitle !== undefined) post.seoTitle = seoTitle.trim();
    if (seoDescription !== undefined) post.seoDescription = seoDescription.trim();
    if (canonicalUrl !== undefined) post.canonicalUrl = canonicalUrl.trim();
    if (featured !== undefined) post.featured = !!featured;
    if (commentsEnabled !== undefined) post.commentsEnabled = commentsEnabled !== false;

    let postStatus = status || post.status;
    if (postStatus === 'scheduled' && scheduledAt) {
      const parsedSched = new Date(scheduledAt);
      if (!isNaN(parsedSched.getTime())) {
        if (parsedSched > now) {
          post.status = 'scheduled';
          post.scheduledAt = parsedSched;
        } else {
          post.status = 'published';
          post.publishedAt = parsedSched;
          post.scheduledAt = null;
        }
      }
    } else if (postStatus === 'published') {
      post.status = 'published';
      if (!post.publishedAt) post.publishedAt = now;
      post.scheduledAt = null;
    } else if (postStatus) {
      post.status = postStatus;
    }

    await post.save();
    res.json({ post });
  } catch (err) {
    console.error('Error updating post in admin router:', err);
    res.status(500).json({ error: err.message || 'Failed to update post' });
  }
});
    }

    if (scheduledAt && post.status === 'scheduled') {
      post.scheduledAt = new Date(scheduledAt);
    }

    await post.save();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

/* --- Delete (trash) --- */
router.delete('/posts/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'trashed';
    await post.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

/* --- Publish --- */
router.post('/posts/:id/publish', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'published';
    post.publishedAt = new Date();
    await post.save();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish' });
  }
});

/* --- Unpublish --- */
router.post('/posts/:id/unpublish', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'draft';
    await post.save();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpublish' });
  }
});

/* --- Restore from trash --- */
router.post('/posts/:id/restore', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'draft';
    await post.save();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore' });
  }
});

/* --- Permanent delete --- */
router.delete('/posts/:id/permanent', async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    await Revision.deleteMany({ postId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

/* --- Duplicate --- */
router.post('/posts/:id/duplicate', async (req, res) => {
  try {
    const original = await BlogPost.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Post not found' });

    let newSlug = original.slug + '-copy-' + Date.now();
    const dup = new BlogPost({
      title: original.title + ' (Copy)',
      slug: newSlug,
      excerpt: original.excerpt,
      content: original.content,
      coverImage: original.coverImage,
      category: original.category,
      labels: [...original.labels],
      status: 'draft',
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription
    });
    await dup.save();
    res.status(201).json({ post: dup });
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate' });
  }
});

/* --- Revisions --- */
router.get('/revisions/:postId', async (req, res) => {
  try {
    const revisions = await Revision.find({ postId: req.params.postId })
      .sort({ savedAt: -1 }).limit(20);
    res.json({ revisions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

router.post('/revisions/:revisionId/restore', async (req, res) => {
  try {
    const revision = await Revision.findById(req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });
    const post = await BlogPost.findById(revision.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await new Revision({
      postId: post._id, title: post.title, content: post.content,
      excerpt: post.excerpt, labels: post.labels, category: post.category
    }).save();

    post.title = revision.title;
    post.content = revision.content;
    post.excerpt = revision.excerpt;
    if (revision.labels) post.labels = revision.labels;
    if (revision.category) post.category = revision.category;
    await post.save();

    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore revision' });
  }
});

/* --- Labels --- */
router.get('/labels', async (req, res) => {
  try {
    const pipeline = [
      { $unwind: '$labels' },
      { $group: { _id: '$labels', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];
    const results = await BlogPost.aggregate(pipeline);
    res.json({ labels: results.map(r => ({ name: r._id, count: r.count })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

/* --- Categories --- */
router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogPost.distinct('category');
    res.json({ categories: categories.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/* --- Admin Gallery Endpoints --- */
router.get('/gallery', async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 50 } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 50);

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (category && category !== 'all') query.category = new RegExp('^' + category.trim() + '$', 'i');
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { caption: searchRegex },
        { location: searchRegex },
        { tags: searchRegex }
      ];
    }

    const total = await GalleryItem.countDocuments(query);
    const photos = await GalleryItem.find(query)
      .sort({ order: 1, date: -1, createdAt: -1 })
      .skip((pNum - 1) * lNum)
      .limit(lNum);

    const categories = await GalleryItem.distinct('category');

    res.json({
      photos,
      total,
      page: pNum,
      totalPages: Math.ceil(total / lNum) || 1,
      categories: categories.filter(Boolean)
    });
  } catch (err) {
    console.error('Error fetching admin gallery:', err);
    res.status(500).json({ error: 'Failed to fetch admin gallery' });
  }
});

router.get('/gallery/:id', async (req, res) => {
  try {
    const photo = await GalleryItem.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

router.post('/gallery', async (req, res) => {
  try {
    const { title, caption, url, category, tags, location, alt, date, featured, status, order } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!url || !url.trim()) return res.status(400).json({ error: 'Image URL is required' });

    let parsedTags = [];
    if (Array.isArray(tags)) parsedTags = tags.map(t => String(t).trim()).filter(Boolean);
    else if (typeof tags === 'string') parsedTags = tags.split(/[,#\s]+/).map(t => t.trim()).filter(Boolean);

    const photo = await GalleryItem.create({
      title: title.trim(),
      caption: (caption || '').trim(),
      url: url.trim(),
      category: (category || 'Photography').trim(),
      tags: parsedTags,
      location: (location || '').trim(),
      alt: (alt || title).trim(),
      date: date ? new Date(date) : new Date(),
      featured: featured === true || featured === 'true',
      status: status === 'draft' ? 'draft' : 'published',
      order: parseInt(order) || 0
    });

    res.status(201).json({ success: true, photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create gallery photo' });
  }
});

router.put('/gallery/:id', async (req, res) => {
  try {
    const { title, caption, url, category, tags, location, alt, date, featured, status, order } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (caption !== undefined) updates.caption = caption.trim();
    if (url !== undefined) updates.url = url.trim();
    if (category !== undefined) updates.category = category.trim();
    if (tags !== undefined) {
      if (Array.isArray(tags)) updates.tags = tags.map(t => String(t).trim()).filter(Boolean);
      else if (typeof tags === 'string') updates.tags = tags.split(/[,#\s]+/).map(t => t.trim()).filter(Boolean);
    }
    if (location !== undefined) updates.location = location.trim();
    if (alt !== undefined) updates.alt = alt.trim();
    if (date !== undefined) updates.date = new Date(date);
    if (featured !== undefined) updates.featured = featured === true || featured === 'true';
    if (status !== undefined) updates.status = status === 'draft' ? 'draft' : 'published';
    if (order !== undefined) updates.order = parseInt(order) || 0;

    const photo = await GalleryItem.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ success: true, photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update gallery photo' });
  }
});

router.delete('/gallery/:id', async (req, res) => {
  try {
    const photo = await GalleryItem.findByIdAndDelete(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ success: true, message: 'Photo deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

router.post('/gallery/:id/publish', async (req, res) => {
  try {
    const photo = await GalleryItem.findByIdAndUpdate(req.params.id, { status: 'published' }, { new: true });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ success: true, photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish photo' });
  }
});

router.post('/gallery/:id/unpublish', async (req, res) => {
  try {
    const photo = await GalleryItem.findByIdAndUpdate(req.params.id, { status: 'draft' }, { new: true });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ success: true, photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpublish photo' });
  }
});

module.exports = router;
