const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');

router.get('/', async (req, res) => {
  try {
    const { search, category, tag, sort = 'newest', page = 1, limit = 10 } = req.query;
    const now = new Date();
    const query = {
      $or: [
        { status: 'published', publishedAt: { $lte: now } },
        { status: 'scheduled', scheduledAt: { $lte: now } }
      ]
    };

    if (search) {
      query.$text = { $search: search };
    }
    if (category) {
      query.category = category.toLowerCase();
    }
    if (tag) {
      query.labels = tag.toLowerCase();
    }

    const sortOption = sort === 'oldest' ? { publishedAt: 1 } : { publishedAt: -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [posts, total] = await Promise.all([
      BlogPost.find(query).sort(sortOption).skip(skip).limit(parseInt(limit)).select('-content'),
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

router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogPost.distinct('category', { status: 'published' });
    res.json({ categories: categories.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/labels', async (req, res) => {
  try {
    const pipeline = [
      { $match: { status: 'published' } },
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

router.get('/nav/:currentSlug', async (req, res) => {
  try {
    const { currentSlug } = req.params;
    const current = await BlogPost.findOne({ slug: currentSlug, status: 'published' });
    if (!current) return res.status(404).json({ error: 'Post not found' });

    const [prev, nextPost] = await Promise.all([
      BlogPost.findOne({ status: 'published', publishedAt: { $lt: current.publishedAt } })
        .sort({ publishedAt: -1 }).select('slug title'),
      BlogPost.findOne({ status: 'published', publishedAt: { $gt: current.publishedAt } })
        .sort({ publishedAt: 1 }).select('slug title')
    ]);

    res.json({ previous: prev, next: nextPost });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch navigation' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.viewCount = (post.viewCount || 0) + 1;
    await post.save();

    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

module.exports = router;
