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
  const [replyingToReply, setReplyingToReply] = useState(null); 
  const [showReplies, setShowReplies] = useState({});
  const [replies, setReplies] = useState({});
  const [sosStatus, setSosStatus] = useState('');

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

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
    const goOnline = () => { setIsOffline(false); syncOfflineStories(); };
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
    const newStory = { id: Date.now(), story: storyText, category: category, timestamp: new Date().toISOString(), location: 'Anonymous User', replies: 0 };
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
        if (data.success) { setStoryText(''); fetchStories(); }
      } catch (err) {
        setIsOffline(true);
      }
    }
  };

  const handleReply = async (storyId, parentId = null) => {
    if (!replyText.trim()) return;
    const newReply = { id: Date.now(), storyId: storyId, parentReplyId: parentId, reply: replyText, timestamp: new Date().toISOString(), category: category };
    setReplies(prev => ({ ...prev, [storyId]: [...(prev[storyId] || []), newReply] }));
    setReplyText('');
    setReplyingTo(null);
    setReplyingToReply(null);
    try {
      await fetch(`${BACKEND_URL}/story/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newReply) });
    } catch (err) { console.log('Reply saved locally'); }
  };

  const renderNestedReplies = (storyId, parentId = null, level = 0) => {
    return (replies[String(storyId)] || [])
      .filter(r => r.parentReplyId === parentId)
      .map(reply => (
        <div key={reply.id} style={{ marginLeft: `${level * 15}px`, marginTop: "8px" }}>
          <div style={styles.replyCard}>
            <div style={styles.replyHeader}>
              <span style={styles.replyAnonymous}>💬 Anonymous supporter</span>
              <span style={styles.replyTime}>{formatMessageTime(reply.timestamp)}</span>
            </div>
            <p style={styles.replyText}>{reply.reply}</p>
            <button style={styles.replyButton} onClick={() => setReplyingToReply(reply.id)}>↩ Reply</button>
            {replyingToReply === reply.id && (
              <div style={styles.replyInputContainer}>
                <input style={styles.replyInput} autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleReply(storyId, reply.id)} />
                <button style={styles.sendReplyButton} onClick={() => handleReply(storyId, reply.id)}>Send</button>
              </div>
            )}
            {renderNestedReplies(storyId, reply.id, level + 1)}
          </div>
        </div>
      ));
  };

  const toggleReplies = async (storyId) => {
    const id = String(storyId);
    const opening = !showReplies[id];
    setShowReplies(prev => ({ ...prev, [id]: opening }));
    if (opening) {
      try {
        const response = await fetch(`${BACKEND_URL}/story/replies/${id}`);
        const data = await response.json();
        if (data.success) { setReplies(prev => ({ ...prev, [id]: data.replies })); }
      } catch (err) { console.error("Failed to load replies:", err); }
    }
  };

  const activateGhostMode = () => { setStoryText(''); setIsGhostMode(true); };

  const handleCalcPress = (val) => {
    if (val === 'C') setCalcInput('');
    else if (val === '=') {
      if (calcInput === '9999') { setIsGhostMode(false); setCalcInput(''); }
      else { try { setCalcInput(eval(calcInput).toString()); } catch { setCalcInput('Error'); } }
    } else setCalcInput(prev => prev + val);
  };

  const triggerSOS = () => {
    if (!navigator.geolocation) { alert('GPS not supported.'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      alert(`🚨 SOS Sent! Location: ${pos.coords.latitude}, ${pos.coords.longitude}`);
    }, (err) => alert("Could not get location."));
  };

  const getCategoryStyle = (category) => ({ backgroundColor: category === 'Mental Health' ? '#8b5cf6' : '#ef4444', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', color: '#fff' });

  if (isGhostMode) {
    return (
      <div style={styles.calcContainer}>
        <div style={styles.calcScreen}>{calcInput || '0'}</div>
        <div style={styles.calcGrid}>
          {[['7', '8', '9', '/'], ['4', '5', '6', '*'], ['1', '2', '3', '-'], ['C', '0', '=', '+']].map((row, rIdx) => (
            <div key={rIdx} style={styles.calcRow}>{row.map((char) => <button key={char} style={styles.calcBtn} onClick={() => handleCalcPress(char)}>{char}</button>)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      <div style={styles.ghostBar} onClick={activateGhostMode}><span>🔒 System Framework Secure • Click to Minimize</span></div>
      {isOffline && <div style={styles.offlineBanner}>⚠️ Offline Mode</div>}
      <main style={styles.mainLayout}>
        <h1 style={styles.mainHeading}>The Anonymous Global Sanctuary</h1>
        <section style={styles.panel}>
          <form onSubmit={handlePostStory}>
            <textarea style={styles.textArea} placeholder="What burdens are you holding today?" value={storyText} onChange={(e) => setStoryText(e.target.value)} rows="3" />
            <button type="submit" style={styles.submitBtn}>📢 Publish Story</button>
          </form>
        </section>
        <section style={{ marginTop: '30px' }}>
          {globalStories.map((item) => (
            <div key={item.id} style={styles.storyCard}>
              <div style={styles.storyHeader}><span style={getCategoryStyle(item.category)}>{item.category}</span></div>
              <p style={styles.storyText}>{item.story}</p>
              <div style={styles.storyActions}>
                <button style={styles.replyButton} onClick={() => setReplyingTo(replyingTo === item.id ? null : item.id)}>💬 Reply</button>
                <button style={styles.viewRepliesButton} onClick={() => toggleReplies(item.id)}>{showReplies[item.id] ? '▲ Hide' : '▼ View'}</button>
              </div>
              {replyingTo === item.id && (
                <div style={styles.replyInputContainer}>
                  <input style={styles.replyInput} placeholder="Write a reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                  <button style={styles.sendReplyButton} onClick={() => handleReply(item.id)}>Send</button>
                </div>
              )}
              {showReplies[item.id] && <div style={styles.repliesSection}>{renderNestedReplies(item.id, null, 0)}</div>}
            </div>
          ))}
        </section>
      </main>
      <footer style={styles.sosFooter} onClick={triggerSOS}>🚨 TRIGGER SATELLITE EMERGENCY SOS</footer>
    </div>
  );
}

const styles = {
  appContainer: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', fontFamily: 'sans-serif' },
  ghostBar: { backgroundColor: '#1e293b', color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '6px', cursor: 'pointer' },
  offlineBanner: { backgroundColor: '#b45309', color: '#fff', fontSize: '13px', textAlign: 'center', padding: '8px', fontWeight: 'bold' },
  mainLayout: { maxWidth: '600px', margin: '0 auto', padding: '20px' },
  mainHeading: { fontSize: '1.75rem', fontWeight: 'bold', margin: '20px 0' },
  panel: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '20px' },
  textArea: { width: '100%', backgroundColor: '#334155', border: 'none', borderRadius: '8px', padding: '12px', color: '#fff', resize: 'vertical' },
  submitBtn: { width: '100%', marginTop: '10px', padding: '12px', borderRadius: '8px', backgroundColor: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' },
  storyCard: { backgroundColor: '#1e293b', padding: '16px', borderRadius: '12px', margin: '12px 0' },
  storyHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' },
  storyText: { margin: '8px 0', color: '#e5e7eb', fontSize: '14px' },
  storyActions: { display: 'flex', gap: '16px', borderTop: '1px solid #334155', paddingTop: '12px' },
  replyButton: { background: 'none', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' },
  viewRepliesButton: { background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer' },
  replyInputContainer: { display: 'flex', gap: '8px', marginTop: '12px' },
  replyInput: { flex: 1, padding: '8px 12px', borderRadius: '20px', border: '1px solid #475569', backgroundColor: '#334155', color: '#fff' },
  sendReplyButton: { backgroundColor: '#3b82f6', border: 'none', padding: '8px 16px', borderRadius: '20px', color: '#fff', cursor: 'pointer' },
  repliesSection: { marginTop: '12px', paddingLeft: '12px', borderLeft: '2px solid #334155' },
  replyCard: { backgroundColor: '#0f172a', borderRadius: '10px', padding: '10px', marginTop: '8px' },
  replyHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
  replyAnonymous: { fontSize: '10px', color: '#8b5cf6' },
  replyTime: { fontSize: '9px', color: '#64748b' },
  replyText: { fontSize: '12px', color: '#cbd5e1', margin: 0 },
  sosFooter: { position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#dc2626', color: '#fff', textAlign: 'center', padding: '18px', fontWeight: 'bold', cursor: 'pointer' },
  calcContainer: { backgroundColor: '#000', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
  calcScreen: { color: '#fff', fontSize: '2rem', textAlign: 'right', padding: '15px', width: '280px', background: '#1a1a1a', borderRadius: '10px' },
  calcGrid: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', width: '280px' },
  calcRow: { display: 'flex', justifyContent: 'space-between', gap: '6px' },
  calcBtn: { flex: 1, height: '50px', borderRadius: '25px', border: 'none', backgroundColor: '#333', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }
};