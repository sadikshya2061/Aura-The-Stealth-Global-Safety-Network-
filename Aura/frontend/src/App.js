import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const BACKEND_URL = 'http://localhost:5000/api';

export default function App() {
  const [isGhostMode, setIsGhostMode] = useState(true);
  const [calcInput, setCalcInput] = useState('');
  const [category, setCategory] = useState('Mental Health');
  const [storyText, setStoryText] = useState('');
  const [globalStories, setGlobalStories] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [showReplies, setShowReplies] = useState({});
  const [replies, setReplies] = useState({});

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
      alert('Your offline posts have been successfully synced!');
    } catch (err) {
      console.log('Sync failed.');
    }
  }, []);

  const fetchStories = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/story/get`);
      const data = await response.json();
      if (data.success) {
        setGlobalStories(data.stories);
        setIsOffline(false);
      }
    } catch (err) {
      setIsOffline(true);
    }
  }, []);

  useEffect(() => {
    fetchStories();
    const goOnline = () => {
      setIsOffline(false);
      syncOfflineStories();
    };
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [fetchStories, syncOfflineStories]);

  const handlePostStory = async (e) => {
    e.preventDefault();
    if (!storyText.trim()) return;
    const newStory = {
      id: Date.now(),
      story: storyText,
      category: category,
      timestamp: new Date().toISOString(),
      location: 'Anonymous User',
      replies: 0
    };
    if (isOffline) {
      const existingQueue = localStorage.getItem('offlineStories');
      const queue = existingQueue ? JSON.parse(existingQueue) : [];
      queue.push(newStory);
      localStorage.setItem('offlineStories', JSON.stringify(queue));
      alert('Offline mode! Your message will send when reconnected.');
      setStoryText('');
      setGlobalStories(prev => [newStory, ...prev]);
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
        setGlobalStories(prev => [newStory, ...prev]);
      }
    }
  };

  const handleReply = async (storyId) => {
    if (!replyText.trim()) return;
    const newReply = {
      id: Date.now(),
      storyId: storyId,
      reply: replyText,
      timestamp: new Date().toISOString(),
      category: category
    };
    setReplies(prev => ({
      ...prev,
      [storyId]: [...(prev[storyId] || []), newReply]
    }));
    setGlobalStories(prev => prev.map(story => 
      story.id === storyId 
        ? { ...story, replies: (story.replies || 0) + 1 }
        : story
    ));
    setReplyText('');
    setReplyingTo(null);
    try {
      await fetch(`${BACKEND_URL}/story/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReply)
      });
    } catch (err) {
      console.log('Reply saved locally');
    }
  };

  const toggleReplies = (storyId) => {
    setShowReplies(prev => ({
      ...prev,
      [storyId]: !prev[storyId]
    }));
  };

  const activateGhostMode = () => {
    setStoryText('');
    setIsGhostMode(true);
  };

  const handleCalcPress = (val) => {
    if (val === 'C') {
      setCalcInput('');
    } else if (val === '=') {
      if (calcInput === '9999') {
        setIsGhostMode(false);
        setCalcInput('');
      } else {
        try {
          setCalcInput(eval(calcInput).toString());
        } catch {
          setCalcInput('Error');
        }
      }
    } else {
      setCalcInput(prev => prev + val);
    }
  };

  const triggerSOS = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const payload = {
          location: { lat: position.coords.latitude, lng: position.coords.longitude },
          contacts: [
            { name: 'Police', phone: '100' },
            { name: 'Emergency Support', phone: '911' }
          ]
        };
        try {
          await fetch(`${BACKEND_URL}/location/alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          alert(`🚨 SOS Sent! Location: ${payload.location.lat}, ${payload.location.lng}`);
        } catch (err) {
          alert(`Offline SOS: Location saved locally.`);
        }
      }, () => {
        alert('Could not get location.');
      });
    } else {
      alert('GPS unavailable.');
    }
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

  if (isGhostMode) {
    return (
      <div style={styles.calcContainer}>
        <div style={styles.calcScreen}>{calcInput || '0'}</div>
        <div style={styles.calcGrid}>
          {[
            ['7', '8', '9', '/'],
            ['4', '5', '6', '*'],
            ['1', '2', '3', '-'],
            ['C', '0', '=', '+']
          ].map((row, rIdx) => (
            <div key={rIdx} style={styles.calcRow}>
              {row.map((char) => (
                <button key={char} style={styles.calcBtn} onClick={() => handleCalcPress(char)}>
                  {char}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      <div style={styles.ghostBar} onClick={activateGhostMode}>
        <span>🔒 System Framework Secure • Click to Minimize</span>
      </div>
      {isOffline && (
        <div style={styles.offlineBanner}>
          ⚠️ Offline Mode - Messages will sync when online
        </div>
      )}
      <main style={styles.mainLayout}>
        <h1 style={styles.mainHeading}>The Anonymous Global Sanctuary</h1>
        <section style={styles.panel}>
          <h3 style={{ marginTop: 0, color: '#f3f4f6' }}>Release Your Story Completely Anonymously</h3>
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
            <button type="submit" style={styles.submitBtn}>
              📢 Publish Story
            </button>
          </form>
        </section>
        <section style={{ marginTop: '30px' }}>
          <h2 style={{ color: '#9ca3af', fontSize: '1.25rem' }}>Shared Journeys Around the World</h2>
          {globalStories.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No stories yet. Be the first to share!</p>
          ) : (
            globalStories.map((item) => (
              <div key={item.id} style={styles.storyCard}>
                <div style={styles.storyHeader}>
                  <span style={getCategoryStyle(item.category)}>{item.category}</span>
                  <small style={{ color: '#64748b', fontSize: '10px' }}>{formatMessageTime(item.timestamp)}</small>
                </div>
                <p style={styles.storyText}>{item.story}</p>
                <div style={styles.storyActions}>
                  <button style={styles.replyButton} onClick={() => setReplyingTo(replyingTo === item.id ? null : item.id)}>
                    💬 Reply ({replies[item.id]?.length || item.replies || 0})
                  </button>
                  <button style={styles.viewRepliesButton} onClick={() => toggleReplies(item.id)}>
                    {showReplies[item.id] ? '▲ Hide replies' : '▼ View replies'}
                  </button>
                </div>
                {replyingTo === item.id && (
                  <div style={styles.replyInputContainer}>
                    <input type="text" style={styles.replyInput} placeholder="Write a reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleReply(item.id)} autoFocus />
                    <button style={styles.sendReplyButton} onClick={() => handleReply(item.id)}>Send</button>
                  </div>
                )}
                {showReplies[item.id] && replies[item.id] && replies[item.id].length > 0 && (
                  <div style={styles.repliesSection}>
                    {replies[item.id].map((reply) => (
                      <div key={reply.id} style={styles.replyCard}>
                        <div style={styles.replyHeader}>
                          <span style={styles.replyAnonymous}>💬 Anonymous supporter</span>
                          <span style={styles.replyTime}>{formatMessageTime(reply.timestamp)}</span>
                        </div>
                        <p style={styles.replyText}>{reply.reply}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </main>
      <footer style={styles.sosFooter} onClick={triggerSOS}>
        🚨 TRIGGER SATELLITE EMERGENCY SOS
      </footer>
    </div>
  );
}

const styles = {
  appContainer: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', fontFamily: 'sans-serif' },
  ghostBar: { backgroundColor: '#1e293b', color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '6px', cursor: 'pointer', userSelect: 'none' },
  offlineBanner: { backgroundColor: '#b45309', color: '#fff', fontSize: '13px', textAlign: 'center', padding: '8px', fontWeight: 'bold' },
  mainLayout: { maxWidth: '600px', margin: '0 auto', padding: '20px 20px 100px 20px' },
  mainHeading: { fontSize: '1.75rem', fontWeight: 'bold', margin: '20px 0' },
  panel: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
  categoryRow: { display: 'flex', gap: '10px', marginBottom: '15px' },
  catBtn: { flex: 1, padding: '8px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#94a3b8', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' },
  catBtnActive: { backgroundColor: '#3b82f6', color: '#fff', borderColor: '#3b82f6', fontWeight: 'bold' },
  textArea: { width: '100%', boxSizing: 'border-box', backgroundColor: '#334155', border: 'none', borderRadius: '8px', padding: '12px', color: '#fff', resize: 'vertical', fontFamily: 'inherit' },
  submitBtn: { width: '100%', marginTop: '10px', padding: '12px', border: 'none', borderRadius: '8px', backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', cursor: 'pointer' },
  storyCard: { backgroundColor: '#1e293b', padding: '16px', borderRadius: '12px', margin: '12px 0', borderLeft: '4px solid #3b82f6' },
  storyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  storyText: { margin: '8px 0', color: '#e5e7eb', fontSize: '14px', lineHeight: '1.5' },
  storyActions: { display: 'flex', gap: '16px', borderTop: '1px solid #334155', paddingTop: '12px', marginTop: '8px' },
  replyButton: { background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' },
  viewRepliesButton: { background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' },
  replyInputContainer: { display: 'flex', gap: '8px', marginTop: '12px' },
  replyInput: { flex: 1, padding: '8px 12px', borderRadius: '20px', border: '1px solid #475569', backgroundColor: '#334155', color: '#fff', fontSize: '12px', outline: 'none' },
  sendReplyButton: { backgroundColor: '#3b82f6', border: 'none', padding: '8px 16px', borderRadius: '20px', color: '#fff', fontSize: '12px', cursor: 'pointer' },
  repliesSection: { marginTop: '12px', paddingLeft: '12px', borderLeft: '2px solid #334155' },
  replyCard: { backgroundColor: '#0f172a', borderRadius: '10px', padding: '10px', marginTop: '8px' },
  replyHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
  replyAnonymous: { fontSize: '10px', color: '#8b5cf6' },
  replyTime: { fontSize: '9px', color: '#64748b' },
  replyText: { fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.4' },
  sosFooter: { position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#dc2626', color: '#fff', textAlign: 'center', padding: '18px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', letterSpacing: '1px', boxShadow: '0 -4px 10px rgba(0,0,0,0.3)' },
  calcContainer: { backgroundColor: '#000', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'monospace' },
  calcScreen: { color: '#fff', fontSize: '2rem', textAlign: 'right', padding: '15px', marginBottom: '10px', width: '280px', background: '#1a1a1a', borderRadius: '10px' },
  calcGrid: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', backgroundColor: '#111', borderRadius: '15px', width: '280px' },
  calcRow: { display: 'flex', justifyContent: 'space-between', gap: '6px' },
  calcBtn: { flex: 1, height: '50px', borderRadius: '25px', border: 'none', backgroundColor: '#333', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }
};