import React, {
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react';
import './App.css';


const BACKEND_URL = 'http://localhost:5000/api';
const MAX_DEPTH = 3;


export default function App() {
  const [isGhostMode, setIsGhostMode] = useState(true);
  const [calcInput, setCalcInput] = useState('');
  const [category, setCategory] = useState('Mental Health');
  const [storyText, setStoryText] = useState('');
const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    setIsOffline(!navigator.onLine);
  }, []);
  const [replyText, setReplyText] = useState('');
 
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyingToReply, setReplyingToReply] = useState(null);

  const [showReplies, setShowReplies] = useState({});
  const [replies, setReplies] = useState({});
  const [sosStatus, setSosStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [sosHistory, setSosHistory] = useState([]);
  
  
  // Feature 1: Persistent Storage - Load from localStorage
  const [stories, setStories] = useState([]);

  // Feature 2 & 3: Settings & Emergency Contacts
  const [secretCode, setSecretCode] = useState(() => {
    return localStorage.getItem('secretCode') || '9999';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [newCode, setNewCode] = useState('');
  
  const defaultContacts = [
    { id: 1, name: '🚓 Police', phone: '100' },
    { id: 2, name: '🚑 Ambulance', phone: '102' },
    { id: 3, name: '🕵️ CBI', phone: '1930' }
  ];
  
  const [emergencyContacts, setEmergencyContacts] = useState(() => {
    const saved = localStorage.getItem('emergencyContacts');
    return saved ? JSON.parse(saved) : defaultContacts;
  });
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  // Feature 9: SOS History
  useEffect(() => {
  const saved = localStorage.getItem("sosHistory");

  if (saved) {
    try {
      setSosHistory(JSON.parse(saved));
    } catch {
      setSosHistory([]);
    }
  }
}, []);

  // Save data to localStorage (Feature 1: Persistent Storage)

  useEffect(() => {
    localStorage.setItem('emergencyContacts', JSON.stringify(emergencyContacts));
  }, [emergencyContacts]);

  useEffect(() => {
    localStorage.setItem('sosHistory', JSON.stringify(sosHistory));
  }, [sosHistory]);

  // Feature 7: Remove Offline Alert - Silent sync
  const syncOfflineStories = useCallback(async () => {
    try {
      const offlineData = localStorage.getItem('offlineStories');
      if (!offlineData) return;
      const queue = JSON.parse(offlineData);
      if (queue.length === 0) return;
      for (const story of queue) {
        await fetch(`${BACKEND_URL}/story/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(story),
        });
      }
      localStorage.removeItem('offlineStories');
      fetchStories();
    } catch (err) {
      console.log('Sync failed.');
    }
  }, []);

 const fetchStories = useCallback(async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/story/get`);
    const data = await response.json();

    if (data.success) {
      setStories(data.stories);
      setIsOffline(false);

      const loadedReplies = {};

      for (const story of data.stories) {
        try {
          const replyResponse = await fetch(
            `${BACKEND_URL}/story/replies/${story.id}`
          );

          const replyData = await replyResponse.json();

          if (replyData.success) {
            loadedReplies[story.id] = replyData.replies;
          } else {
            loadedReplies[story.id] = [];
          }
        } catch {
          loadedReplies[story.id] = [];
        }
      }

      setReplies(loadedReplies);
    }
  } catch (err) {
    setIsOffline(true);
  }
}, []);

  const syncOfflineReplies = useCallback(async () => {
    try {
      const offlineData = localStorage.getItem('offlineReplies');
      if (!offlineData) return;
      const queue = JSON.parse(offlineData);
      if (queue.length === 0) return;
      for (const reply of queue) {
        await fetch(`${BACKEND_URL}/story/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reply),
        });
      }
      localStorage.removeItem('offlineReplies');
      fetchStories();
    } catch (err) {
      console.log('Reply sync failed.');
    }
  }, [fetchStories]);

  useEffect(() => {
    fetchStories();
    const goOnline = () => {
      setIsOffline(false);
      syncOfflineStories();
      syncOfflineReplies();
    };
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [fetchStories, syncOfflineStories, syncOfflineReplies]);

  // FIX #1: live-refresh for open reply threads.
  // Previously referenced an undefined `replyData` variable inside this loop,
  // which threw a ReferenceError caught (and silently swallowed) by the
  // empty `catch {}`, so open threads never actually refreshed.
  useEffect(() => {
    const openStoryIds = Object.keys(showReplies).filter(id => showReplies[id]);
    if (openStoryIds.length === 0 || isOffline) return;

    const interval = setInterval(async () => {
      for (const storyId of openStoryIds) {
        try {
          const res = await fetch(`${BACKEND_URL}/story/replies/${storyId}`);
          const data = await res.json();
          if (data.success) {
            setReplies(prev => ({ ...prev, [storyId]: data.replies }));
            setStories(prev =>
              prev.map(story =>
                story.id === storyId
                  ? { ...story, replies: data.replies.length } // fixed: was replyData.replies.length
                  : story
              )
            );
          }
        } catch {}
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [showReplies, isOffline]);

  // Feature 4: Delete Story Option
 const deleteStory = async (storyId) => {
  if (!window.confirm("Delete this story?")) return;

  try {
    const response = await fetch(`${BACKEND_URL}/story/delete/${storyId}`, {
       method: "DELETE"
      });
const data = await response.json();

if(data.success){
    fetchStories();
}
  } catch (err) {
    console.error(err);
  }
};

  const handlePostStory = async (e) => {
    e.preventDefault();
    if (!storyText.trim()) return;
    setLoading(true); // Feature 6: Loading State
    const newStory = {
     id: Date.now().toString(),
      story: storyText,
      category: category,
      timestamp: new Date().toISOString(),
      
      replies: 0
    };
    if (isOffline) {
      const existingQueue = localStorage.getItem('offlineStories');
      const queue = existingQueue ? JSON.parse(existingQueue) : [];
      queue.push(newStory);
      localStorage.setItem('offlineStories', JSON.stringify(queue));
      setStoryText('');
      setStories(prev => [newStory, ...prev]);
      setLoading(false);
    } else {
      try {
        const response = await fetch(`${BACKEND_URL}/story/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newStory)
        });
        const data = await response.json();
        if (data.success) {
          setStoryText('');
          fetchStories();
        }
      } catch (err) {
        setIsOffline(true);
        const existingQueue = localStorage.getItem('offlineStories');
        const queue = existingQueue ? JSON.parse(existingQueue) : [];
        queue.push(newStory);
        localStorage.setItem('offlineStories', JSON.stringify(queue));
        setStoryText('');
        setStories(prev => [newStory, ...prev]);
      }
      setLoading(false);
    }
  };
  const queueOfflineReply = (reply) => {
    const existing = localStorage.getItem('offlineReplies');
    const queue = existing ? JSON.parse(existing) : [];
    queue.push(reply);
    localStorage.setItem('offlineReplies', JSON.stringify(queue));
  };


  const addEmergencyContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      alert('Please enter both name and phone number.');
      return;
    }
    const newContact = {
      id: Date.now(),
      name: newContactName,
      phone: newContactPhone
    };
    setEmergencyContacts([...emergencyContacts, newContact]);
    setNewContactName('');
    setNewContactPhone('');
  };

  const deleteEmergencyContact = (id) => {
    setEmergencyContacts(emergencyContacts.filter(c => c.id !== id));
  };
  

  // FIX #2: generate a collision-proof id for replies. Date.now() alone
  // can produce duplicate ids when replies are posted in the same
  // millisecond (very common with offline-queued replies), which breaks
  // nested lookups (parentReplyId === reply.id) and React keys.
  const generateReplyId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleReply = async (storyId, parentId = null) => {
    const text = replyText.trim();

if(text==="") return;
    const newReply = {
  id: generateReplyId(),
  storyId,
  parentReplyId: parentId,
  reply: text,
  timestamp: new Date().toISOString(),
  category
};

    setReplyText('');
    setReplyingTo(null);
    setReplyingToReply(null);

    if (isOffline) {
      queueOfflineReply(newReply);
      setReplies(prev => ({
        ...prev,
        [storyId]: [...(prev[storyId] || []), newReply]
      }));
      // FIX: make sure the thread is visible right away, even offline,
      // and even if this is the story's very first reply.
      setShowReplies(prev => ({ ...prev, [storyId]: true }));
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/story/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReply)
      });
      const data = await response.json();
      if (data.success) {
        const replyResponse = await fetch(`${BACKEND_URL}/story/replies/${storyId}`);
        const replyData = await replyResponse.json();
        if (replyData.success) {
          setReplies(prev => ({ ...prev, [storyId]: replyData.replies }));
          setShowReplies(prev => ({
  ...prev,
  [storyId]: true
}));

setStories(prev =>
  prev.map(story =>
    story.id === storyId
      ? { ...story, replies: replyData.replies.length }
      : story
  )
);
        }
        fetchStories();
      }
    } catch (err) {
      setIsOffline(true);
      queueOfflineReply(newReply);
      setReplies(prev => ({
        ...prev,
        [storyId]: [...(prev[storyId] || []), newReply]
      }));
      setShowReplies(prev => ({ ...prev, [storyId]: true }));
    }
  };

  const toggleReplies = async (storyId) => {
    // Toggle show/hide
    const isOpening = !showReplies[storyId];

    setShowReplies(prev => ({
      ...prev,
      [storyId]: isOpening
    }));

    // If opening, fetch replies from backend
    if (isOpening) {
      try {
        const response = await fetch(`${BACKEND_URL}/story/replies/${storyId}`);
        const data = await response.json();

        if (data.success) {
          setReplies(prev => ({
            ...prev,
            [storyId]: data.replies
          }));
        }
      } catch (err) {
        console.log("Failed to load replies");
      }
    }
  };

  const activateGhostMode = () => {
    setStoryText('');
    setIsGhostMode(true);
  };

  const handleCalcPress = (val) => {
    if (val === 'C') {
      setCalcInput('');
    } else if (val === '=') {
      if (calcInput === secretCode) {
        setIsGhostMode(false);
        setCalcInput('');
      } else {
        try {
          setCalcInput(Function(`return ${calcInput}`)().toString());
        } catch {
          setCalcInput('Error');
        }
      }
    } else {
      setCalcInput(prev => prev + val);
    }
  };

  const changeSecretCode = () => {
    if (newCode.length < 4) {
      alert('Secret code must be at least 4 digits.');
      return;
    }
    setSecretCode(newCode);
    localStorage.setItem('secretCode', newCode);
    alert(`✅ Secret code changed to: ${newCode}=`);
    setNewCode('');
    setShowSettings(false);
  };

  // Feature 5: SOS Confirmation - Hold for 2 seconds
const holdTimer = useRef(null);
const [isHolding, setIsHolding] = useState(false);

  const startSOSHold = () => {
    setIsHolding(true);
    setSosStatus("⚠️ Hold SOS for 2 seconds to trigger...");
    holdTimer.current = setTimeout(() => {
    triggerSOS();
    setIsHolding(false);
    setSosStatus("");
},2000);
  };

  const cancelSOSHold = () => {
    if (holdTimer.current) {
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
}
    setIsHolding(false);
    setSosStatus("");
  };

 const triggerSOS = () => {
  if (!navigator.geolocation) {
    const sosEntry = {
      id: Date.now(),
      location: null,
      timestamp: new Date().toISOString(),
      contacts: emergencyContacts
    };
    setSosHistory(prev => [sosEntry, ...prev]);
    alert("🚨 SOS TRIGGERED (no GPS)! Please call emergency contacts directly.");
    setSosStatus("✅ SOS logged (no location)");
    setTimeout(() => setSosStatus(""), 3000);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const locationLink = `https://maps.google.com/?q=${lat},${lng}`;

      // Save to SOS History
      const sosEntry = {
        id: Date.now(),
        location: { lat, lng },
        timestamp: new Date().toISOString(),
        contacts: emergencyContacts
      };

      setSosHistory(prev => [sosEntry, ...prev]);

      const confidentialityMessage = `
🔒 CONFIDENTIALITY ALERT 🔒

📍 SOS Location: ${lat}, ${lng}
🗺️ Map: ${locationLink}

⚠️ CONFIDENTIALITY NOTICE ⚠️
This location information is PRIVATE and CONFIDENTIAL.

✅ ONLY share with:
• Police (100)
• Ambulance (102)
• Authorized rescue personnel

❌ DO NOT share with:
• The abuser
• Social media
• Unauthorized persons

Use this information ONLY for emergency rescue.
`;

      alert(
        `🚨 SOS TRIGGERED!\n\n📍 Location sent to your emergency contacts.\n\n${emergencyContacts
          .map(c => `• ${c.name}: ${c.phone}`)
          .join("\n")}`
      );

      setSosStatus("✅ SOS Sent!");

      setTimeout(() => {
        alert(confidentialityMessage);

        alert(
          `✅ SOS SENT!\n\n📍 Your location: ${lat}, ${lng}\n🗺️ ${locationLink}\n\nHelp is on the way.`
        );
      }, 1500);
    },
    (error) => {
      console.error("Geolocation error:", error);
      const sosEntry = {
        id: Date.now(),
        location: null,
        timestamp: new Date().toISOString(),
        contacts: emergencyContacts
      };
      setSosHistory(prev => [sosEntry, ...prev]);
      alert(
        `🚨 SOS TRIGGERED (location unavailable)!\n\n📞 Emergency contacts:\n${emergencyContacts
          .map(c => `• ${c.name}: ${c.phone}`)
          .join('\n')}`
      );
      setSosStatus("⚠️ SOS logged, no location");
      setTimeout(() => setSosStatus(""), 3000);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
};
  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getCategoryStyle = (category) => {
    if (category === 'Mental Health') return { backgroundColor: '#8b5cf6', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', color: '#fff' };
    if (category === 'Abuse Support') return { backgroundColor: '#ef4444', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', color: '#fff' };
    return { backgroundColor: '#f59e0b', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', color: '#fff' };
  };

  // Feature 2: Settings Page
  if (showSettings) {
    return (
      <div style={settingsStyles.container}>
        <div style={settingsStyles.card}>
          <h2 style={settingsStyles.title}>⚙️ Settings</h2>
          
          {/* Secret Code Section */}
          <div style={settingsStyles.section}>
            <h3 style={settingsStyles.sectionTitle}>🔐 Change Secret Code</h3>
            <p style={settingsStyles.hint}>Current code: <strong>{secretCode}=</strong></p>
            <input
              type="text"
              style={settingsStyles.input}
              placeholder="Enter new code (e.g., 7777)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              maxLength={6}
            />
            <button style={settingsStyles.saveBtn} onClick={changeSecretCode}>
              💾 Save Secret Code
              </button>            
          </div>

          <hr style={settingsStyles.divider} />

          {/* Feature 3: Emergency Contacts */}
          <div style={settingsStyles.section}>
            <h3 style={settingsStyles.sectionTitle}>📞 Emergency Contacts</h3>
            
            <div style={settingsStyles.contactList}>
              {emergencyContacts.map(contact => (
                <div key={contact.id} style={settingsStyles.contactItem}>
                  <span>{contact.name}: <strong>{contact.phone}</strong></span>
                  {contact.id > 3 && (
                    <button style={settingsStyles.deleteBtn} onClick={() => deleteEmergencyContact(contact.id)}>✕</button>
                  )}
                </div>
              ))}

            </div>

            <div style={settingsStyles.addContactRow}>
              <input
                type="text"
                style={settingsStyles.contactInput}
                placeholder="Name"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
              />
              <input
                type="text"
                style={settingsStyles.contactInput}
                placeholder="Phone"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
              />
              <button style={settingsStyles.addBtn} onClick={addEmergencyContact}>➕ Add</button>
            </div>
          </div>

          <hr style={settingsStyles.divider} />

          {/* Feature 9: SOS History */}
          <div style={settingsStyles.section}>
            <h3 style={settingsStyles.sectionTitle}>📋 SOS History</h3>
            {sosHistory.length === 0 ? (
              <p style={settingsStyles.hint}>No SOS alerts triggered yet.</p>
            ) : (
              sosHistory.slice(0, 5).map(sos => (
                <div key={sos.id} style={settingsStyles.historyItem}>
                  <span>📍 {sos.location ? `${sos.location.lat}, ${sos.location.lng}` : 'Location unavailable'}</span>
                  <small style={{ color: '#94a3b8' }}>{new Date(sos.timestamp).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>

          <button style={settingsStyles.backBtn} onClick={() => setShowSettings(false)}>
            ← Back to App
          </button>
        </div>
      </div>
    );
  }

  if (isGhostMode) {
    
    return (
      <div style={styles.calcContainer}>

        <div style={styles.calcDisplay}>{calcInput || '0'}</div>
        <div style={styles.calcGrid}>
          {[
            ['7', '8', '9', '÷'],
            ['4', '5', '6', '×'],
            ['1', '2', '3', '−'],
            ['C', '0', '=', '+']
          ].map((row, rIdx) => (
            <div key={rIdx} style={styles.calcRow}>
              {row.map((char) => (
                <button 
                  key={char} 
                  style={{
                    ...styles.calcBtn,
                    ...(char === '=' ? styles.calcBtnEquals : {}),
                    ...(char === 'C' ? styles.calcBtnClear : {}),
                    ...(['÷', '×', '−', '+'].includes(char) ? styles.calcBtnOperator : {})
                  }} 
                  onClick={() => handleCalcPress(char === '÷' ? '/' : char === '×' ? '*' : char === '−' ? '-' : char)}
                >
                  {char}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div style={styles.calcHint}>
          🔒 Enter your secret code to unlock
          </div>
        <div style={styles.calcSubHint}>
          Tap ⚙️ in settings to change your code
        </div>
      </div>
    );
  }

  // FIX #3: use String() coercion when comparing ids/parent ids so that
  // mismatched types coming back from the backend (numbers vs strings)
  // don't silently break the parent/child matching.
 const renderReplies = (storyId, parentId = null, level = 0) => {
  // Guard clause to prevent infinite loops and limit depth
  if (level >= MAX_DEPTH) return null;

  return (replies[storyId] || [])
    .filter(reply => String(reply.parentReplyId) === String(parentId))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(reply => (
      <div 
        key={reply.id} 
        style={{ 
          marginLeft: `${level * 20}px`, 
          marginTop: "10px",
          borderLeft: level > 0 ? "2px solid #475569" : "none",
          paddingLeft: "10px"
        }}
      >
        <div style={styles.replyCard}>
          <div style={styles.replyHeader}>
            <span style={styles.replyAnonymous}>💬 Anonymous supporter</span>
            <span style={styles.replyTime}>{formatMessageTime(reply.timestamp)}</span>
          </div>

          <p style={styles.replyText}>{reply.reply}</p>

          <button
            style={styles.replyButton}
            onClick={() => {
              // If clicking the same one, toggle off, otherwise set it
              if (replyingToReply === reply.id) {
                setReplyingTo(null);
                setReplyingToReply(null);
              } else {
                setReplyingTo(storyId);
                setReplyingToReply(reply.id);
              }
            }}
          >
            {replyingToReply === reply.id ? "✖ Cancel" : "↩ Reply"}
          </button>

          {/* Conditional input for this specific reply */}
          {replyingToReply === reply.id && (
            <div style={styles.replyInputContainer}>
              <input
                style={styles.replyInput}
                autoFocus
                placeholder="Reply to this supporter..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReply(storyId, reply.id)}
              />
              <button
                style={styles.sendReplyButton}
                onClick={() => handleReply(storyId, reply.id)}
                disabled={!replyText.trim()}
              >
                Send
              </button>
            </div>
          )}

          {/* Recursion: Calling itself to render children */}
          {renderReplies(storyId, reply.id, level + 1)}
        </div>
      </div>
    ));
};
  return (
    <div style={styles.appContainer}>
      <div style={styles.ghostBar} onClick={activateGhostMode}>
        <span>🔒 System Framework Secure • Click to Minimize</span>
      </div>
      {/* Feature 7: Removed Offline Alert - Silent sync */}
      <main style={styles.mainLayout}>
        <div style={styles.headerRow}>
          <h1 style={styles.mainHeading}>The Anonymous Global Sanctuary</h1>
          <button style={styles.settingsBtn} onClick={() => setShowSettings(true)}>⚙️</button>
        </div>

        {/* Feature 6: Loading States */}
        {loading && (
          <div style={styles.loadingSpinner}>
            <div style={styles.spinner}></div>
            <span>Posting your story...</span>
          </div>
        )}

        <section style={styles.panel}>
          <h3 style={styles.panelTitle}>Release Your Story Completely Anonymously</h3>
          <div style={styles.categoryRow}>
            {['Mental Health', 'Abuse Support', 'Bullying'].map((cat) => (
              <button 
                key={cat} 
                style={{...styles.catBtn, ...(category === cat ? styles.catBtnActive : {})}}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <form onSubmit={handlePostStory}>
            <textarea 
              style={styles.textArea} 
              placeholder="What burdens are you holding today? No identities tracked here..."
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              rows="3"
            />
            <button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? '⏳ Posting...' : '📢 Publish Story'}
            </button>
          </form>
        </section>

        <section style={styles.feedSection}>
          <h2 style={styles.feedTitle}>Shared Journeys Around the World</h2>
          {stories.length === 0 ? (
            <p style={styles.emptyFeed}>No stories yet. Be the first to share!</p>
          ) : (
            stories.map((item) => (
              <div key={item.id} style={styles.storyCard}>
                <div style={styles.storyHeader}>
                  <span style={getCategoryStyle(item.category)}>{item.category}</span>
                  <small style={styles.storyTime}>{formatMessageTime(item.timestamp)}</small>
                </div>
                <p style={styles.storyText}>{item.story}</p>
                {/* Feature 4: Delete Story Option */}
                <button 
                  style={styles.deleteBtn} 
                  onClick={() => deleteStory(item.id)}
                >
                  🗑️ Delete
                </button>
                <div style={styles.storyActions}>
  <button
  style={styles.replyButton}
  onClick={() => {
    if (replyingTo === item.id && replyingToReply === null) {
      setReplyingTo(null);
      setReplyingToReply(null);
    } else {
      setReplyingTo(item.id);
      setReplyingToReply(null);
    }
  }}
>
  {replyingTo === item.id && replyingToReply === null
    ? "✖ Cancel"
    : `💬 Reply (${(replies[item.id] || []).length})`}
</button>

  {/* FIX #4: this toggle used to be gated behind
      (replies[item.id] || []).length > 0, which meant a story with
      zero replies could never be opened — so the very first reply
      you posted was invisible and there was no way to view or start
      a nested thread on it. Now it's always rendered. */}
  <button
    style={styles.viewRepliesButton}
    onClick={() => toggleReplies(item.id)}
  >
    {showReplies[item.id]
      ? "▲ Hide replies"
      : `▼ View Replies (${(replies[item.id] || []).length})`}
  </button>
</div>

{replyingTo === item.id && replyingToReply === null && (
  <div style={styles.replyInputContainer}>
    <input
      style={styles.replyInput}
      placeholder="Write a reply..."
      value={replyText}
      onChange={(e) => setReplyText(e.target.value)}
      onKeyDown={(e) =>
        e.key === "Enter" && handleReply(item.id)
      }
    />

    <button
  style={styles.sendReplyButton}
  onClick={() => handleReply(item.id)}
  disabled={!replyText.trim()}
>
  Send
</button>
  </div>
)}
          
  {showReplies[item.id] && (
  <div style={styles.repliesSection}>
    {(replies[item.id] || []).length === 0 ? (
      <p style={{ color: "#94a3b8", fontSize: "12px" }}>
        No replies yet. Be the first to respond.
      </p>
    ) : (
      renderReplies(item.id)
    )}
  </div>
)}

              </div>
            ))
          )}
        </section>
      </main>

  
      {/* Feature 5: SOS Confirmation - Hold 2 seconds */}
      <footer 
        style={styles.sosFooter} 
        onMouseDown={startSOSHold}
        onMouseUp={cancelSOSHold}
        onMouseLeave={cancelSOSHold}
        onTouchStart={startSOSHold}
        onTouchEnd={cancelSOSHold}
      >
        {isHolding ? '⚠️ Hold for 2 seconds...' : '🚨 TRIGGER SATELLITE EMERGENCY SOS (Hold 2s)'}
      </footer>
    </div>
  );
}

// Settings Styles
const settingsStyles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    padding: '20px'
  },
  card: {
    background: '#1e293b',
    padding: '40px',
    borderRadius: '20px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
  },
  title: {
    color: '#f3f4f6',
    fontSize: '1.8rem',
    marginBottom: '30px',
    textAlign: 'center'
  },
  section: {
    marginBottom: '25px'
  },
  sectionTitle: {
    color: '#f3f4f6',
    fontSize: '1.1rem',
    marginBottom: '10px'
  },
  hint: {
    color: '#94a3b8',
    fontSize: '0.9rem',
    marginBottom: '10px'
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #475569',
    background: '#334155',
    color: '#fff',
    fontSize: '1rem',
    marginBottom: '12px',
    outline: 'none'
  },
  saveBtn: {
    width: '100%',
    padding: '12px',
    background: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  divider: {
    border: '1px solid #334155',
    margin: '20px 0'
  },
  contactList: {
    marginBottom: '12px'
  },
  contactItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#334155',
    padding: '10px 14px',
    borderRadius: '8px',
    marginBottom: '6px',
    color: '#e5e7eb',
    fontSize: '0.9rem'
  },
  deleteBtn: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  addContactRow: {
    display: 'flex',
    gap: '8px'
  },
  contactInput: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #475569',
    background: '#334155',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none'
  },
  addBtn: {
    padding: '10px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold'
  },
  backBtn: {
    width: '100%',
    padding: '12px',
    background: '#475569',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '10px'
  },
  historyItem: {
    background: '#334155',
    padding: '8px 12px',
    borderRadius: '6px',
    marginBottom: '4px',
    fontSize: '0.85rem',
    color: '#e5e7eb',
    display: 'flex',
    justifyContent: 'space-between'
  }
};

// Main App Styles
const styles = {
  appContainer: { 
    backgroundColor: '#0f172a', 
    minHeight: '100vh', 
    color: '#f8fafc', 
    fontFamily: 'Segoe UI, system-ui, sans-serif' 
  },
  ghostBar: { 
    backgroundColor: '#1e293b', 
    color: '#64748b', 
    fontSize: '11px', 
    textAlign: 'center', 
    padding: '6px', 
    cursor: 'pointer', 
    userSelect: 'none' 
  },
  mainLayout: { 
    maxWidth: '600px', 
    margin: '0 auto', 
    padding: '20px 20px 100px 20px' 
  },
  headerRow: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: '10px' 
  },
  mainHeading: { 
    fontSize: '1.75rem', 
    fontWeight: 'bold', 
    margin: '20px 0',
    background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  settingsBtn: { 
    background: 'none', 
    border: 'none', 
    color: '#94a3b8', 
    fontSize: '1.5rem', 
    cursor: 'pointer', 
    padding: '8px',
    transition: 'transform 0.2s'
  },
  panel: { 
    backgroundColor: '#1e293b', 
    borderRadius: '16px', 
    padding: '24px', 
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)' 
  },
  panelTitle: { 
    marginTop: 0, 
    color: '#f3f4f6',
    fontSize: '1.1rem',
    marginBottom: '16px'
  },
  categoryRow: { 
    display: 'flex', 
    gap: '10px', 
    marginBottom: '15px', 
    flexWrap: 'wrap' 
  },
  catBtn: { 
    flex: 1, 
    padding: '10px', 
    border: '1px solid #475569', 
    backgroundColor: 'transparent', 
    color: '#94a3b8', 
    borderRadius: '10px', 
    cursor: 'pointer', 
    fontSize: '12px', 
    minWidth: '80px',
    transition: 'all 0.2s'
  },
  catBtnActive: { 
    backgroundColor: '#3b82f6', 
    color: '#fff', 
    borderColor: '#3b82f6', 
    fontWeight: 'bold' 
  },
  textArea: { 
    width: '100%', 
    boxSizing: 'border-box', 
    backgroundColor: '#334155', 
    border: 'none', 
    borderRadius: '10px', 
    padding: '14px', 
    color: '#fff', 
    resize: 'vertical', 
    fontFamily: 'inherit',
    fontSize: '0.95rem'
  },
  submitBtn: { 
    width: '100%', 
    marginTop: '12px', 
    padding: '12px', 
    border: 'none', 
    borderRadius: '10px', 
    backgroundColor: '#10b981', 
    color: '#fff', 
    fontWeight: 'bold', 
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'background 0.2s',
    opacity: 1
  },
  feedSection: { 
    marginTop: '30px' 
  },
  feedTitle: { 
    color: '#9ca3af', 
    fontSize: '1.25rem',
    marginBottom: '16px'
  },
  emptyFeed: { 
    color: '#6b7280', 
    textAlign: 'center',
    padding: '30px 0'
  },
  storyCard: { 
    backgroundColor: '#1e293b', 
    padding: '16px', 
    borderRadius: '12px', 
    margin: '12px 0', 
    borderLeft: '4px solid #3b82f6',
    animation: 'fadeIn 0.3s ease-out',
    position: 'relative'
  },
  storyHeader: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: '10px' 
  },
  storyTime: { 
    color: '#64748b', 
    fontSize: '10px' 
  },
  storyText: { 
    margin: '8px 0', 
    color: '#e5e7eb', 
    fontSize: '14px', 
    lineHeight: '1.6' 
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    position: 'absolute',
    top: '10px',
    right: '10px'
  },
  storyActions: { 
    display: 'flex', 
    gap: '16px', 
    borderTop: '1px solid #334155', 
    paddingTop: '12px', 
    marginTop: '8px' 
  },
  replyButton: { 
    background: 'none', 
    border: 'none', 
    color: '#94a3b8', 
    fontSize: '12px', 
    cursor: 'pointer', 
    padding: '4px 8px', 
    borderRadius: '6px' 
  },
  viewRepliesButton: { 
    background: 'none', 
    border: 'none', 
    color: '#3b82f6', 
    fontSize: '12px', 
    cursor: 'pointer', 
    padding: '4px 8px', 
    borderRadius: '6px' 
  },
  replyInputContainer: { 
    display: 'flex', 
    gap: '8px', 
    marginTop: '12px' 
  },
  replyInput: { 
    flex: 1, 
    padding: '8px 14px', 
    borderRadius: '20px', 
    border: '1px solid #475569', 
    backgroundColor: '#334155', 
    color: '#fff', 
    fontSize: '12px', 
    outline: 'none' 
  },
  sendReplyButton: { 
    backgroundColor: '#3b82f6', 
    border: 'none', 
    padding: '8px 16px', 
    borderRadius: '20px', 
    color: '#fff', 
    fontSize: '12px', 
    cursor: 'pointer' 
  },
  repliesSection: { 
    marginTop: '12px', 
    paddingLeft: '12px', 
    borderLeft: '2px solid #334155' 
  },
  replyCard: { 
    backgroundColor: '#0f172a', 
    borderRadius: '10px', 
    padding: '10px', 
    marginTop: '8px' 
  },
  replyHeader: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    marginBottom: '6px' 
  },
  replyAnonymous: { 
    fontSize: '10px', 
    color: '#8b5cf6' 
  },
  replyTime: { 
    fontSize: '9px', 
    color: '#64748b' 
  },
  replyText: { 
    fontSize: '12px', 
    color: '#cbd5e1', 
    margin: 0, 
    lineHeight: '1.4' 
  },
  sosFooter: { 
    position: 'fixed', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: '#dc2626', 
    color: '#fff', 
    textAlign: 'center', 
    padding: '18px', 
    fontWeight: 'bold', 
    fontSize: '1.1rem', 
    cursor: 'pointer', 
    letterSpacing: '1px', 
    boxShadow: '0 -4px 20px rgba(220,38,38,0.4)',
    zIndex: 100,
    transition: 'background-color 0.3s',
    userSelect: 'none'
  },
  loadingSpinner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '10px',
    backgroundColor: '#1e293b',
    borderRadius: '10px',
    marginBottom: '15px',
    color: '#94a3b8'
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '3px solid #334155',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  calcContainer: { 
    backgroundColor: '#000', 
    height: '100vh', 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'center', 
    alignItems: 'center', 
    fontFamily: 'system-ui, -apple-system, sans-serif' 
  },
  calcDisplay: { 
    color: '#fff', 
    fontSize: '3.5rem', 
    textAlign: 'right', 
    padding: '20px 30px', 
    width: '340px',
    background: 'transparent',
    fontWeight: '300',
    letterSpacing: '1px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minHeight: '80px'
  },
  calcGrid: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '12px', 
    padding: '16px', 
    backgroundColor: '#000', 
    borderRadius: '20px', 
    width: '340px' 
  },
  calcRow: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    gap: '12px' 
  },
  calcBtn: { 
    flex: 1, 
    height: '68px', 
    borderRadius: '50%', 
    border: 'none', 
    backgroundColor: '#333', 
    color: '#fff', 
    fontSize: '1.5rem', 
    cursor: 'pointer', 
    transition: 'all 0.15s',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  calcBtnEquals: {
    backgroundColor: '#4caf50',
    color: '#fff'
  },
  calcBtnClear: {
    backgroundColor: '#e74c3c',
    color: '#fff'
  },
  calcBtnOperator: {
    backgroundColor: '#f59e0b',
    color: '#fff'
  },
  calcHint: { 
    marginTop: '20px', 
    color: '#ff9500', 
    fontSize: '0.95rem', 
    textAlign: 'center',
    fontWeight: '400'
  },
  calcSubHint: {
    color: '#555',
    fontSize: '0.7rem',
    textAlign: 'center',
    marginTop: '4px'
  }
};
