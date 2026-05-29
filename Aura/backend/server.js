const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Emergency contacts stored in memory (use database in production)
let emergencyContacts = [
  { name: 'Emergency SOS', phone: '911' },
  { name: 'Police', phone: '100' },
  { name: 'Ambulance', phone: '102' }
];

// Store safety stories (Structured to handle the global sanctuary feature requirements)
let safetyStories = [];

// Store replies for stories
let storyReplies = {};

/**
 * Reusable SMS Dispatcher Module
 * This avoids making bad internal axios loops back to localhost
 */
const dispatchSMS = async (phoneNumber, message, location) => {
  console.log(`[SMS Gateway] Routing distress text to: ${phoneNumber}`);
  console.log(`[SMS Gateway] Content: "${message}"`);
  
  // Production Note: Switch this flag to true once Twilio variables are in your .env file
  const productionSMS = false; 
  
  if (productionSMS) {
    const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    return twilio.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: phoneNumber
    });
  }
  
  // Simulated success block for testing/dev environments
  return Promise.resolve({ dispatched: true });
};


// --- API ROUTES ---

// 1. Send SOS Alert via SMS
app.post('/api/sos/send-sms', async (req, res) => {
  const { phoneNumber, message, location } = req.body;
  
  if (!phoneNumber || !message) {
    return res.status(400).json({ success: false, error: "Missing phone number or message content." });
  }

  try {
    await dispatchSMS(phoneNumber, message, location);
    res.json({ 
      success: true, 
      message: 'SMS composed and simulated successfully',
      phoneNumber,
      location
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Make Emergency Call
app.post('/api/sos/make-call', (req, res) => {
  const { phoneNumber } = req.body;
  
  console.log('🚨 VoIP Interface: Initiating raw native voice path to:', phoneNumber);
  
  res.json({ 
    success: true, 
    message: 'Call initialization packet acknowledged',
    phoneNumber
  });
});

// 3. Save Safety Story (Handles incoming live and bulk offline syncs safely)
app.post('/api/story/save', (req, res) => {
  const { story, category, timestamp, location, id } = req.body;
  
  if (!story) {
    return res.status(400).json({ success: false, error: "Cannot publish an empty sanctuary post." });
  }

  const newStory = {
    // Falls back to a high-precision random token if multiple offline entries arrive simultaneously 
    id: id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    category: category || 'General Support',
    story,
    timestamp: timestamp || new Date().toISOString(),
    location: location || 'Anonymous Location',
    replies: 0,
    createdAt: new Date().toISOString()
  };
  
  safetyStories.unshift(newStory);
  console.log('New Sanctuary Story cataloged safely:', newStory.id);
  
  res.json({ 
    success: true, 
    message: 'Story safely broadcasted globally',
    story: newStory
  });
});

// 4. Get All Saved Stories
app.get('/api/story/get', (req, res) => {
  res.json({ 
    success: true, 
    stories: safetyStories 
  });
});

// 5. Save Reply to a Story
app.post('/api/story/reply', (req, res) => {
  const { storyId, reply, category } = req.body;
  
  if (!storyId || !reply) {
    return res.status(400).json({ success: false, error: "Missing storyId or reply content." });
  }

  // Initialize replies array for this story if not exists
  if (!storyReplies[storyId]) {
    storyReplies[storyId] = [];
  }

  const newReply = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    storyId: storyId,
    reply: reply,
    category: category || 'General Support',
    timestamp: new Date().toISOString(),
    anonymousId: 'anonymous_' + Math.random().toString(36).substr(2, 6)
  };
  
  storyReplies[storyId].unshift(newReply);
  
  // Update reply count in the story
  const storyIndex = safetyStories.findIndex(s => s.id === storyId);
  if (storyIndex !== -1) {
    safetyStories[storyIndex].replies = (safetyStories[storyIndex].replies || 0) + 1;
  }
  
  console.log('New reply added to story:', storyId);
  
  res.json({ 
    success: true, 
    message: 'Reply added successfully',
    reply: newReply
  });
});

// 6. Get All Replies for a Story
app.get('/api/story/replies/:storyId', (req, res) => {
  const { storyId } = req.params;
  
  const replies = storyReplies[storyId] || [];
  
  res.json({ 
    success: true, 
    replies: replies
  });
});

// 7. Delete a Story (Optional - for moderation)
app.delete('/api/story/delete/:storyId', (req, res) => {
  const { storyId } = req.params;
  
  const storyIndex = safetyStories.findIndex(s => s.id === storyId);
  if (storyIndex === -1) {
    return res.status(404).json({ success: false, error: "Story not found." });
  }
  
  safetyStories.splice(storyIndex, 1);
  
  // Also delete associated replies
  delete storyReplies[storyId];
  
  res.json({ 
    success: true, 
    message: 'Story deleted successfully'
  });
});

// 8. Delete a Reply (Optional - for moderation)
app.delete('/api/story/reply/delete/:replyId', (req, res) => {
  const { replyId } = req.params;
  
  let deleted = false;
  for (const storyId in storyReplies) {
    const replyIndex = storyReplies[storyId].findIndex(r => r.id === replyId);
    if (replyIndex !== -1) {
      storyReplies[storyId].splice(replyIndex, 1);
      deleted = true;
      break;
    }
  }
  
  if (!deleted) {
    return res.status(404).json({ success: false, error: "Reply not found." });
  }
  
  res.json({ 
    success: true, 
    message: 'Reply deleted successfully'
  });
});

// 9. Update Emergency Contacts
app.post('/api/contacts/update', (req, res) => {
  const { contacts } = req.body;
  
  if (!Array.isArray(contacts)) {
    return res.status(400).json({ success: false, error: "Contacts payload must be an array." });
  }

  emergencyContacts = contacts;
  res.json({ 
    success: true, 
    message: 'Emergency contact matrix updated successfully',
    contacts: emergencyContacts
  });
});

// 10. Get Emergency Contacts
app.get('/api/contacts', (req, res) => {
  res.json({ 
    success: true, 
    contacts: emergencyContacts
  });
});

// 11. Send Multi-Contact Location Alert
app.post('/api/location/alert', (req, res) => {
  const { location, contacts } = req.body;
  
  if (!location || !contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ success: false, error: "Invalid location blast request parameters." });
  }

  console.log('Broadcasting panic tracking data to contacts:', contacts);
  
  const promises = contacts.map(contact => {
    const message = `🚨 SOS DISTRESS ALERT! I need urgent help. Core location matrix: ${location.lat}, ${location.lng}`;
    return dispatchSMS(contact.phone, message, `${location.lat}, ${location.lng}`);
  });
  
  Promise.all(promises)
    .then(() => res.json({ success: true, message: 'Distress alerts dispatched to all designated contacts' }))
    .catch(error => res.status(500).json({ success: false, error: error.message }));
});

// 12. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Personal Safety Secure Engine running normally.' });
});

// 13. Get reply count for a story
app.get('/api/story/reply-count/:storyId', (req, res) => {
  const { storyId } = req.params;
  const count = storyReplies[storyId] ? storyReplies[storyId].length : 0;
  res.json({ success: true, count: count });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Personal Safety Engine running securely on port ${PORT}`);
  console.log(`📍 Live Diagnostic: http://localhost:${PORT}/api/health`);
  console.log(`📝 Stories API: http://localhost:${PORT}/api/story/get`);
  console.log(`💬 Replies API: http://localhost:${PORT}/api/story/replies/:storyId`);
  console.log(`======================================================\n`);
});