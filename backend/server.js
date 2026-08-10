const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Proper CORS configuration for Vercel and Local testing
const allowedOrigins = [
  'https://aura-the-stealth-global-safety-network-ljfs32bha-sheshield23.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1 && !origin.endsWith('.vercel.app')) {
      return callback(new Error('Blocked by CORS'), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aura')
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ============ SCHEMAS ============

const postSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  category: { type: String, enum: ['mental', 'abuse', 'bully'], required: true },
  text: { type: String, required: true, minlength: 3, maxlength: 1200 },
  ts: { type: Number, default: Date.now },
  anonId: { type: String, required: true },
  edited: { type: Boolean, default: false },
  replies: [{
    id: { type: String, required: true },
    text: { type: String, required: true },
    ts: { type: Number, default: Date.now },
    anonId: { type: String, required: true },
    edited: { type: Boolean, default: false },
    parentId: { type: String, default: null }
  }]
});

const Post = mongoose.model('Post', postSchema);

const contactSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  type: { type: String, enum: ['trusted', 'authority'], default: 'trusted' }
});

const Contact = mongoose.model('Contact', contactSchema);

const sosLogSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  ts: { type: Number, default: Date.now },
  address: { type: String, default: null }
});

const SosLog = mongoose.model('SosLog', sosLogSchema);

const configSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: { type: String, required: true }
});

const Config = mongoose.model('Config', configSchema);

// ============ INITIALIZE ============

async function initializeDatabase() {
  const pinConfig = await Config.findOne({ key: 'pin' });
  if (!pinConfig) {
    await Config.create({ key: 'pin', value: '9999' });
    console.log('✅ Default PIN created');
  }

  const postCount = await Post.countDocuments();
  if (postCount === 0) {
    const seedPosts = [
      {
        id: 'p_seed_1',
        category: 'mental',
        text: "Some nights the anxiety makes it hard to breathe. Today I just want to say I made it through, and if you're struggling too — you're not alone in this.",
        ts: Date.now() - 1000 * 60 * 60 * 5,
        anonId: 'Anon-Seed-104',
        edited: false,
        replies: [
          {
            id: 'r_seed_1',
            text: "Reading this at 2am and it helped more than you know. Sending strength.",
            ts: Date.now() - 1000 * 60 * 60 * 4,
            anonId: 'Anon-Seed-221',
            edited: false,
            parentId: null
          }
        ]
      },
      {
        id: 'p_seed_2',
        category: 'abuse',
        text: "It took me two years to admit what was happening to me was abuse, not 'a difficult relationship.' Writing it here, anonymously, is the first time I've said it out loud.",
        ts: Date.now() - 1000 * 60 * 60 * 22,
        anonId: 'Anon-Seed-330',
        edited: false,
        replies: []
      },
      {
        id: 'p_seed_3',
        category: 'bully',
        text: "Group chats at school turned into something I dreaded opening every morning. I finally muted it and told a teacher. It's a start.",
        ts: Date.now() - 1000 * 60 * 60 * 30,
        anonId: 'Anon-Seed-458',
        edited: false,
        replies: []
      }
    ];
    await Post.insertMany(seedPosts);
    console.log('✅ Seed posts created');
  }

  const contactCount = await Contact.countDocuments();
  if (contactCount === 0) {
    const seedContacts = [
      { id: 'c_seed_1', name: 'Nepal Police', phone: '100', type: 'authority' },
      { id: 'c_seed_2', name: 'Ambulance', phone: '102', type: 'authority' },
      { id: 'c_seed_3', name: 'GBV / Women\'s Helpline (Khabar Garaun)', phone: '1145', type: 'authority' }
    ];
    await Contact.insertMany(seedContacts);
    console.log('✅ Seed contacts created');
  }
}

initializeDatabase();

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ============ API ROUTES ============

app.get('/api/config', async (req, res) => {
  try {
    const pinConfig = await Config.findOne({ key: 'pin' });
    res.json({ pin: pinConfig ? pinConfig.value : '9999' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.put('/api/config/pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 digits' });
  }
  try {
    await Config.findOneAndUpdate(
      { key: 'pin' },
      { value: pin },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update PIN' });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find().sort({ ts: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/api/posts/category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const filter = category === 'all' ? {} : { category };
    const posts = await Post.find(filter).sort({ ts: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', async (req, res) => {
  const { category, text, anonId } = req.body;
  if (!category || !text || !anonId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newPost = new Post({
      id: generateId('p'),
      category,
      text,
      ts: Date.now(),
      anonId,
      edited: false,
      replies: []
    });

    await newPost.save();
    res.status(201).json(newPost);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.put('/api/posts/:id', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const post = await Post.findOne({ id: req.params.id });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    post.text = text;
    post.edited = true;
    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const result = await Post.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.post('/api/posts/:id/replies', async (req, res) => {
  const { text, anonId, parentId } = req.body;
  if (!text || !anonId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const post = await Post.findOne({ id: req.params.id });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const reply = {
      id: generateId('r'),
      text,
      ts: Date.now(),
      anonId,
      edited: false,
      parentId: parentId || null
    };

    post.replies.push(reply);
    await post.save();
    res.status(201).json(reply);
  } catch (error) {
    console.error('Create reply error:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

app.put('/api/posts/:postId/replies/:replyId', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const reply = post.replies.find(r => r.id === req.params.replyId);
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    reply.text = text;
    reply.edited = true;
    await post.save();
    res.json(reply);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reply' });
  }
});

app.delete('/api/posts/:postId/replies/:replyId', async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    post.replies = post.replies.filter(r => r.id !== req.params.replyId && r.parentId !== req.params.replyId);
    await post.save();
    res.json({ message: 'Reply deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reply' });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ type: 1, name: 1 });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

app.post('/api/contacts', async (req, res) => {
  const { name, phone, type } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  try {
    const newContact = new Contact({
      id: generateId('c'),
      name,
      phone,
      type: type || 'trusted'
    });
    await newContact.save();
    res.status(201).json(newContact);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const result = await Contact.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

app.get('/api/soslogs', async (req, res) => {
  try {
    const logs = await SosLog.find().sort({ ts: -1 }).limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SOS logs' });
  }
});

app.post('/api/soslogs', async (req, res) => {
  const { lat, lng, address } = req.body;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    const log = new SosLog({
      id: generateId('sos'),
      lat,
      lng,
      ts: Date.now(),
      address: address || null
    });
    await log.save();
    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save SOS log' });
  }
});

app.get('/api/export', async (req, res) => {
  try {
    const [posts, contacts, sosLogs, config] = await Promise.all([
      Post.find(),
      Contact.find(),
      SosLog.find(),
      Config.findOne({ key: 'pin' })
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      posts,
      contacts,
      sosLogs,
      config: { pin: config ? config.value : '9999' }
    });
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

app.delete('/api/wipe', async (req, res) => {
  try {
    await Post.deleteMany({});
    await Contact.deleteMany({});
    await SosLog.deleteMany({});
    res.json({ message: 'All data wiped' });
  } catch (error) {
    res.status(500).json({ error: 'Wipe failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AURA Server running on http://localhost:${PORT}`);
  console.log(`📱 Default PIN: 9999`);
});