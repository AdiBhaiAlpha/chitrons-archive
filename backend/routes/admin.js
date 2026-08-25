const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const BlogPost = require('../models/BlogPost');
const Revision = require('../models/Revision');
const authMiddleware = require('../middleware/auth');

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
    const { title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled } = req.body;

    if (!title || !excerpt) {
      return res.status(400).json({ error: 'Title and excerpt are required' });
    }

    let postSlug = slug || slugify(title, { lower: true, strict: true });
    const existing = await BlogPost.findOne({ slug: postSlug });
    if (existing) postSlug = postSlug + '-' + Date.now();

    const postData = {
      title, slug: postSlug, excerpt, content: content || '',
      coverImage: coverImage || '', category: category || 'general',
      labels: labels || [], status: status || 'draft',
      seoTitle: seoTitle || '', seoDescription: seoDescription || '',
      canonicalUrl: canonicalUrl || '', featured: featured || false,
      commentsEnabled: commentsEnabled !== false
    };

    if (postData.status === 'published') {
      postData.publishedAt = new Date();
    } else if (postData.status === 'scheduled' && scheduledAt) {
      postData.scheduledAt = new Date(scheduledAt);
    }

    const post = new BlogPost(postData);
    await post.save();
    res.status(201).json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post' });
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
    }).save();

    const { title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled } = req.body;

    if (title && title !== post.title) {
      let newSlug = slug || slugify(title, { lower: true, strict: true });
      const dup = await BlogPost.findOne({ slug: newSlug, _id: { $ne: post._id } });
      if (dup) newSlug = newSlug + '-' + Date.now();
      post.slug = newSlug;
    }

    if (title) post.title = title;
    if (excerpt) post.excerpt = excerpt;
    if (content !== undefined) post.content = content;
    if (coverImage !== undefined) post.coverImage = coverImage;
    if (category) post.category = category;
    if (labels) post.labels = labels;
    if (seoTitle !== undefined) post.seoTitle = seoTitle;
    if (seoDescription !== undefined) post.seoDescription = seoDescription;
    if (canonicalUrl !== undefined) post.canonicalUrl = canonicalUrl;
    if (featured !== undefined) post.featured = featured;
    if (commentsEnabled !== undefined) post.commentsEnabled = commentsEnabled;

    if (status && status !== post.status) {
      post.status = status;
      if (status === 'published' && !post.publishedAt) {
        post.publishedAt = new Date();
      } else if (status === 'scheduled' && scheduledAt) {
        post.scheduledAt = new Date(scheduledAt);
      }
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

module.exports = router;
