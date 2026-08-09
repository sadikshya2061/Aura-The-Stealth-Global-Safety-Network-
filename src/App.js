import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ============ API SERVICE ============
const api = {
  get: (endpoint) => axios.get(`${API_BASE}${endpoint}`).then(res => res.data),
  post: (endpoint, data) => axios.post(`${API_BASE}${endpoint}`, data).then(res => res.data),
  put: (endpoint, data) => axios.put(`${API_BASE}${endpoint}`, data).then(res => res.data),
  delete: (endpoint) => axios.delete(`${API_BASE}${endpoint}`).then(res => res.data)
};

// ============ OFFLINE QUEUE ============
const QUEUE_KEY = 'aura_offline_queue';

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

function getQueuedItems() {
  return getQueue();
}

// ============ SAFE BIG NUMBER MATH (handles arbitrarily long integers + decimals) ============
// This replaces the old float/BigInt hybrid, which silently lost precision above
// ~15-16 digits and broke on decimals combined with big integers.

function normalizeNum(str) {
  return String(str).replace(/,/g, '');
}

// Converts a decimal string like "-123.456" into { val: BigInt, scale: number }
// where the true value equals val / 10^scale.
function toScaledBigInt(numStr) {
  let neg = false;
  let s = normalizeNum(numStr).trim();
  if (s === '' || s === '-') s = '0';
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  let [intPart, fracPart = ''] = s.split('.');
  intPart = intPart.replace(/^0+(?=\d)/, '') || '0';
  const scale = fracPart.length;
  const combined = (intPart === '0' ? '' : intPart) + fracPart;
  let val = BigInt(combined === '' ? '0' : combined);
  if (neg && val !== 0n) val = -val;
  return { val, scale };
}

function alignScales(a, b) {
  const maxScale = Math.max(a.scale, b.scale);
  const aVal = a.val * (10n ** BigInt(maxScale - a.scale));
  const bVal = b.val * (10n ** BigInt(maxScale - b.scale));
  return { aVal, bVal, scale: maxScale };
}

function fromScaledBigInt(val, scale) {
  const neg = val < 0n;
  let s = (neg ? -val : val).toString();
  if (scale === 0) return (neg && val !== 0n ? '-' : '') + s;
  while (s.length <= scale) s = '0' + s;
  const intPart = s.slice(0, s.length - scale);
  let fracPart = s.slice(s.length - scale);
  fracPart = fracPart.replace(/0+$/, '');
  const sign = (neg && val !== 0n) ? '-' : '';
  return sign + intPart + (fracPart ? '.' + fracPart : '');
}

function bigMath(aStr, bStr, op) {
  const a = toScaledBigInt(aStr);
  const b = toScaledBigInt(bStr);
  const { aVal, bVal, scale } = alignScales(a, b);
  const result = op(aVal, bVal);
  return fromScaledBigInt(result, scale);
}

function bigAdd(a, b) {
  return bigMath(a, b, (x, y) => x + y);
}
function bigSub(a, b) {
  return bigMath(a, b, (x, y) => x - y);
}
function bigMul(aStr, bStr) {
  const a = toScaledBigInt(aStr);
  const b = toScaledBigInt(bStr);
  const resultVal = a.val * b.val;
  const resultScale = a.scale + b.scale;
  return fromScaledBigInt(resultVal, resultScale);
}
function bigDiv(aStr, bStr, precision = 20) {
  const a = toScaledBigInt(aStr);
  const b = toScaledBigInt(bStr);
  if (b.val === 0n) return 'Error';

  const scaleDiff = a.scale - b.scale;
  const extraScale = precision;
  const numerator = a.val * (10n ** BigInt(extraScale));
  const denominator = b.val;

  let quotient = numerator / denominator;
  let resultScale = extraScale - scaleDiff;

  if (resultScale < 0) {
    quotient = quotient * (10n ** BigInt(-resultScale));
    resultScale = 0;
  }

  return fromScaledBigInt(quotient, resultScale);
}
function bigCompute(aStr, bStr, op) {
  try {
    switch (op) {
      case '+': return bigAdd(aStr, bStr);
      case '-': return bigSub(aStr, bStr);
      case '×': return bigMul(aStr, bStr);
      case '÷': {
        if (toScaledBigInt(bStr).val === 0n) return 'Error';
        return bigDiv(aStr, bStr);
      }
      default: return bStr;
    }
  } catch (e) {
    return 'Error';
  }
}

// ============ APP ============
function App() {
  // State
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('9999');
  const [view, setView] = useState('feed');
  const [posts, setPosts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [sosLog, setSosLog] = useState([]);
  const [category, setCategory] = useState('all');
  const [anonId, setAnonId] = useState('Anon-' + Math.random().toString(36).substr(2, 8));
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postCategory, setPostCategory] = useState('mental');
  const [postText, setPostText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmData, setConfirmData] = useState({ title: '', sub: '', onConfirm: null });
  const [sosLocation, setSosLocation] = useState(null);
  const [sosStatus, setSosStatus] = useState('Tap the button — I\'ll grab your GPS location and prepare it to send to your emergency contacts.');
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [sosInterval, setSosInterval] = useState(null);
  const [sosTrackingId, setSosTrackingId] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState('');
  const [showScientific, setShowScientific] = useState(false);

  // ========== IN-APP NOTIFICATIONS ==========
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Calculator state
  // calcPrev is now always kept as a STRING so large/decimal values never pass through Number().
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState(null);
  const [calcOp, setCalcOp] = useState(null);
  const [calcWaiting, setCalcWaiting] = useState(false);
  const [calcSecret, setCalcSecret] = useState('');
  const [calcExpression, setCalcExpression] = useState('');

  // PIN Change State
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Nested reply state
  const [replyTarget, setReplyTarget] = useState({});
  const [replyDrafts, setReplyDrafts] = useState({});

  const mapRef = useRef(null);
  const notificationCheckInterval = useRef(null);

  // ============ TOAST ============
  const toast = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  // ============ LOAD DATA ============
  const loadData = useCallback(async () => {
    if (!isOnline) {
      try {
        const cachedPosts = localStorage.getItem('aura_cached_posts');
        const cachedContacts = localStorage.getItem('aura_cached_contacts');
        const cachedLogs = localStorage.getItem('aura_cached_soslogs');
        
        if (cachedPosts) setPosts(JSON.parse(cachedPosts));
        if (cachedContacts) setContacts(JSON.parse(cachedContacts));
        if (cachedLogs) setSosLog(JSON.parse(cachedLogs));
      } catch (error) {
        console.error('Failed to load cache:', error);
      }
      return;
    }

    try {
      const [postsData, contactsData, logsData] = await Promise.all([
        api.get('/posts'),
        api.get('/contacts'),
        api.get('/soslogs')
      ]);
      
      setPosts(postsData);
      setContacts(contactsData);
      setSosLog(logsData);
      
      localStorage.setItem('aura_cached_posts', JSON.stringify(postsData));
      localStorage.setItem('aura_cached_contacts', JSON.stringify(contactsData));
      localStorage.setItem('aura_cached_soslogs', JSON.stringify(logsData));
    } catch (err) {
      console.error('Failed to load data:', err);
      toast('Failed to load data. Is the server running?');
    }
  }, [isOnline]);

  // ============ ADD TO QUEUE ============
  const addToQueue = (action) => {
    const queue = getQueue();
    queue.push({
      ...action,
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: Date.now()
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  };

  // ============ NOTIFICATION FUNCTIONS ============
  const NOTIFICATIONS_KEY = 'aura_notifications';

  const loadNotifications = () => {
    try {
      const saved = localStorage.getItem(NOTIFICATIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setNotifications(parsed);
        const unread = parsed.filter(n => !n.read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const saveNotifications = (notifs) => {
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifs));
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  };

  const addNotification = (title, message, type = 'info') => {
    const newNotif = {
      id: Date.now(),
      title,
      message,
      type,
      timestamp: new Date().toLocaleString(),
      read: false
    };
    
    const updated = [newNotif, ...notifications];
    setNotifications(updated);
    setUnreadCount(prev => prev + 1);
    saveNotifications(updated);
  };

  const markAllAsRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    setUnreadCount(0);
    saveNotifications(updated);
  };

  const deleteNotification = (id) => {
    const updated = notifications.filter(n => n.id !== id);
    setNotifications(updated);
    const unread = updated.filter(n => !n.read).length;
    setUnreadCount(unread);
    saveNotifications(updated);
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
    saveNotifications([]);
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      markAllAsRead();
    }
  };

  // ============ SYNC OFFLINE QUEUE ============
  const syncOfflineQueue = useCallback(async () => {
    const queue = getQueuedItems();
    if (queue.length === 0) return;

    setSyncStatus(`Syncing ${queue.length} items...`);
    
    const failedItems = [];
    
    for (const item of queue) {
      try {
        switch (item.action) {
          case 'createPost':
            await api.post('/posts', item.data);
            break;
          case 'createReply':
            await api.post(`/posts/${item.postId}/replies`, item.data);
            break;
          case 'deletePost':
            await api.delete(`/posts/${item.postId}`);
            break;
          case 'deleteReply':
            await api.delete(`/posts/${item.postId}/replies/${item.replyId}`);
            break;
          case 'createContact':
            await api.post('/contacts', item.data);
            break;
          case 'deleteContact':
            await api.delete(`/contacts/${item.id}`);
            break;
          case 'sos':
            await api.post('/soslogs', item.data);
            break;
          case 'updatePin':
            await api.put('/config/pin', item.data);
            break;
          default:
            console.warn('Unknown action:', item.action);
        }
      } catch (error) {
        console.error('Sync failed for item:', item, error);
        failedItems.push(item);
      }
    }

    if (failedItems.length === 0) {
      clearQueue();
      setSyncStatus('✅ All items synced');
      setTimeout(() => setSyncStatus(''), 3000);
      toast('All offline changes synced successfully');
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(failedItems));
      setSyncStatus(`⚠️ ${failedItems.length} items failed to sync`);
    }

    loadData();
  }, [loadData]);

  // ============ ONLINE/OFFLINE HANDLING ============
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      window._offlineToastShown = false;
      window._errorToastShown = false;
      toast('🔄 Back online - syncing...');
      syncOfflineQueue();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      window._offlineToastShown = false;
      toast('📴 You are offline - changes will be queued');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  // ============ CHECK FOR UPDATES ============
  const checkForUpdates = useCallback(async () => {
    if (!unlocked || !isOnline) return;
    
    try {
      const latestPosts = await api.get('/posts');
      const currentPosts = posts;
      
      if (latestPosts.length > currentPosts.length) {
        const newPosts = latestPosts.filter(
          lp => !currentPosts.some(cp => cp.id === lp.id)
        );
        
        if (newPosts.length > 0) {
          newPosts.forEach(post => {
            if (post.anonId !== anonId) {
              const catEmojis = { mental: '🧠', abuse: '🛡', bully: '🕊' };
              const catNames = { mental: 'Mental Health', abuse: 'Abuse Support', bully: 'Bullying' };
              const shortText = post.text.substring(0, 50) + (post.text.length > 50 ? '...' : '');
              addNotification(
                `${catEmojis[post.category]} New Story`,
                `${catNames[post.category]}: ${shortText}`,
                'post'
              );
            }
          });
        }
        setPosts(latestPosts);
      }
      
      for (const post of latestPosts) {
        const existingPost = currentPosts.find(p => p.id === post.id);
        if (existingPost && post.replies.length > existingPost.replies.length) {
          const newReplies = post.replies.filter(
            r => !existingPost.replies.some(er => er.id === r.id)
          );
          
          newReplies.forEach(reply => {
            if (reply.anonId !== anonId) {
              const shortReply = reply.text.substring(0, 50) + (reply.text.length > 50 ? '...' : '');
              addNotification(
                '💬 New Reply',
                `Someone replied: ${shortReply}`,
                'reply'
              );
            }
          });
        }
      }
      
      const latestLogs = await api.get('/soslogs');
      if (latestLogs.length > sosLog.length) {
        const newLogs = latestLogs.filter(
          ll => !sosLog.some(sl => sl.id === ll.id)
        );
        if (newLogs.length > 0) {
          addNotification(
            '🚨 SOS Alert',
            'New emergency alert received!',
            'sos'
          );
        }
        setSosLog(latestLogs);
      }
      
    } catch (error) {
      console.error('Update check failed:', error);
    }
  }, [unlocked, isOnline, posts, sosLog, anonId]);

  // ============ START PERIODIC CHECK ============
  useEffect(() => {
    if (unlocked && isOnline) {
      notificationCheckInterval.current = setInterval(() => {
        checkForUpdates();
      }, 15000);
      
      setTimeout(checkForUpdates, 3000);
    } else {
      if (notificationCheckInterval.current) {
        clearInterval(notificationCheckInterval.current);
        notificationCheckInterval.current = null;
      }
    }
    
    return () => {
      if (notificationCheckInterval.current) {
        clearInterval(notificationCheckInterval.current);
        notificationCheckInterval.current = null;
      }
    };
  }, [unlocked, isOnline, checkForUpdates]);

  // Load PIN and Notifications
  useEffect(() => {
    api.get('/config').then(data => setPin(data.pin)).catch(console.error);
    loadNotifications();
  }, []);

  // ============ CALCULATOR - FIXED WITH SAFE BIG-NUMBER MATH ============
  const calcPress = (key) => {
    // Toggle scientific functions
    if (key === 'sciToggle') {
      setShowScientific(!showScientific);
      return;
    }

    // AC - Clear everything
    if (key === 'AC') {
      setCalcDisplay('0');
      setCalcPrev(null);
      setCalcOp(null);
      setCalcWaiting(false);
      setCalcSecret('');
      setCalcExpression('');
      return;
    }

    // DEL - Delete last character
    if (key === 'DEL') {
      if (calcDisplay.length > 1) {
        setCalcDisplay(calcDisplay.slice(0, -1));
        setCalcSecret(calcSecret.slice(0, -1));
      } else {
        setCalcDisplay('0');
        setCalcSecret('');
      }
      return;
    }

    // Scientific functions (these remain float-based — trig/log are inherently
    // floating point operations and not meaningful as exact big-number math)
    const sciKeys = ['sin', 'cos', 'tan', 'log', '√', 'π', 'e'];
    if (sciKeys.includes(key)) {
      const num = parseFloat(calcDisplay);
      let result;
      switch (key) {
        case 'sin': result = Math.sin((num * Math.PI) / 180); break;
        case 'cos': result = Math.cos((num * Math.PI) / 180); break;
        case 'tan': result = Math.tan((num * Math.PI) / 180); break;
        case 'log': result = Math.log10(num); break;
        case '√': result = Math.sqrt(num); break;
        case 'π': result = Math.PI; break;
        case 'e': result = Math.E; break;
        default: result = num;
      }
      setCalcDisplay(isNaN(result) ? 'Error' : String(result));
      setCalcExpression(key + '(' + num + ')');
      setCalcWaiting(true);
      return;
    }

    // ========== EQUALS ==========
    if (key === '=') {
      // Check unlock
      if (calcSecret === pin) {
        setUnlocked(true);
        setCalcDisplay('0');
        setCalcSecret('');
        setCalcPrev(null);
        setCalcOp(null);
        setCalcWaiting(false);
        setCalcExpression('');
        loadData();
        toast('🔓 Welcome to AURA');
        return;
      }
      
      // If there's a pending operation, calculate it using exact big-number math
      if (calcOp && !calcWaiting) {
        const prevStr = String(calcPrev);
        const currStr = calcDisplay;

        if (calcOp === '÷' && toScaledBigInt(currStr).val === 0n) {
          setCalcDisplay('Error');
          setCalcPrev(null);
          setCalcOp(null);
          setCalcWaiting(false);
          setCalcSecret('');
          return;
        }

        const result = bigCompute(prevStr, currStr, calcOp);

        const fullExpression = calcExpression || (prevStr + ' ' + calcOp + ' ' + calcDisplay);
        setCalcDisplay(result);
        setCalcExpression(fullExpression + ' = ' + result);
        setCalcPrev(null);
        setCalcOp(null);
        setCalcWaiting(false);
        setCalcSecret('');
        return;
      }
      setCalcSecret('');
      return;
    }

    // Numbers
    if (/^[0-9]$/.test(key)) {
      setCalcSecret(calcSecret + key);
      if (calcWaiting) {
        setCalcDisplay(key);
        setCalcWaiting(false);
        setCalcExpression((calcExpression || '') + key);
        return;
      }
      const newDisplay = calcDisplay === '0' ? key : calcDisplay + key;
      setCalcDisplay(newDisplay);
      setCalcExpression(prev => prev + key);
      return;
    }

    // Decimal
    if (key === '.') {
      if (calcWaiting) {
        setCalcDisplay('0.');
        setCalcWaiting(false);
        setCalcExpression((calcExpression || '') + '0.');
        return;
      }
      if (!calcDisplay.includes('.')) {
        setCalcDisplay(calcDisplay + '.');
        setCalcExpression(prev => prev + '.');
      }
      return;
    }

    // Operators
    if (['+', '-', '×', '÷'].includes(key)) {
      const expr = calcExpression || calcDisplay;
      if (calcOp && !calcWaiting) {
        const prevStr = String(calcPrev);
        const result = bigCompute(prevStr, calcDisplay, calcOp);
        setCalcDisplay(result);
        setCalcPrev(result);
        setCalcExpression(result + key);
        setCalcOp(key);
        setCalcWaiting(true);
      } else {
        setCalcExpression(expr + key);
        setCalcPrev(calcDisplay);
        setCalcOp(key);
        setCalcWaiting(true);
      }
      return;
    }

    // +/- toggle
    if (key === '±') {
      if (calcDisplay !== '0' && calcDisplay !== 'Error') {
        const newDisplay = calcDisplay.startsWith('-') ? calcDisplay.slice(1) : '-' + calcDisplay;
        setCalcDisplay(newDisplay);
        const expr = calcExpression || calcDisplay;
        if (expr.startsWith('-')) {
          setCalcExpression(expr.slice(1));
        } else {
          setCalcExpression('-' + expr);
        }
      }
      return;
    }
    // Percentage
    if (key === '%') {
      const result = bigDiv(calcDisplay, '100');
      setCalcDisplay(result);
      setCalcExpression(result);
      return;
    }
  };
  // ============ POSTS ============
  const fetchPosts = useCallback(async (cat) => {
    if (!isOnline) {
      try {
        const cached = localStorage.getItem('aura_cached_posts');
        if (cached) setPosts(JSON.parse(cached));
      } catch (error) {
        console.error('Failed to load cached posts:', error);
      }
      return;
    }

    try {
      const data = await api.get(cat === 'all' ? '/posts' : `/posts/category/${cat}`);
      setPosts(data);
      localStorage.setItem('aura_cached_posts', JSON.stringify(data));
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  }, [isOnline]);

  useEffect(() => {
    if (unlocked) fetchPosts(category);
  }, [category, unlocked, fetchPosts]);

  const createPost = async () => {
    if (postText.trim().length < 3) return;
    const data = { category: postCategory, text: postText.trim(), anonId };
    if (!isOnline) {
      addToQueue({ action: 'createPost', data });
      toast('📴 Post queued for sync');
      setShowPostModal(false);
      setPostText('');
      const tempPost = {
        id: 'temp_' + Date.now(),
        ...data,
        ts: Date.now(),
        edited: false,
        replies: [],
        _temp: true
      };
      setPosts(prev => [tempPost, ...prev]);
      return;
    }
    try {
      const newPost = await api.post('/posts', data);
      setPosts(prev => [newPost, ...prev]);
      setShowPostModal(false);
      setPostText('');
      toast('Posted anonymously');
      localStorage.setItem('aura_cached_posts', JSON.stringify([newPost, ...posts]));
    } catch (err) {
      console.error('Failed to create post:', err);
      toast('Failed to create post');
    }
  };

  const deletePost = async (id) => {
    if (!isOnline) {
      addToQueue({ action: 'deletePost', postId: id });
      setPosts(prev => prev.filter(p => p.id !== id));
      toast('📴 Delete queued');
      return;
    }
    try {
      await api.delete(`/posts/${id}`);
      setPosts(prev => prev.filter(p => p.id !== id));
      toast('Post deleted');
    } catch (err) {
      console.error('Failed to delete post:', err);
      toast('Failed to delete post');
    }
  };

  const updatePost = async (id, text) => {
    if (!isOnline) {
      addToQueue({ action: 'updatePost', postId: id, data: { text } });
      setPosts(prev => prev.map(p => p.id === id ? { ...p, text, edited: true, _temp: true } : p));
      toast('📴 Update queued');
      return;
    }
    try {
      const updated = await api.put(`/posts/${id}`, { text });
      setPosts(prev => prev.map(p => p.id === id ? updated : p));
      toast('Post updated');
    } catch (err) {
      console.error('Failed to update post:', err);
      toast('Failed to update post');
    }
  };

  const addReply = async (postId, text, parentId = null) => {
    const data = { text, anonId, parentId };
    if (!isOnline) {
      addToQueue({ action: 'createReply', postId, data });
      toast('📴 Reply queued for sync');
      const tempReply = {
        id: 'temp_r_' + Date.now(),
        ...data,
        ts: Date.now(),
        edited: false,
        _temp: true
      };
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, replies: [...p.replies, tempReply] };
        }
        return p;
      }));
      return;
    }
    try {
      const reply = await api.post(`/posts/${postId}/replies`, data);
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, replies: [...p.replies, reply] };
        }
        return p;
      }));
    } catch (err) {
      console.error('Failed to add reply:', err);
      toast('Failed to add reply');
    }
  };

  const deleteReply = async (postId, replyId) => {
    if (!isOnline) {
      addToQueue({ action: 'deleteReply', postId, replyId });
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, replies: p.replies.filter(r => r.id !== replyId && r.parentId !== replyId) };
        }
        return p;
      }));
      toast('📴 Delete queued');
      return;
    }
    try {
      await api.delete(`/posts/${postId}/replies/${replyId}`);
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, replies: p.replies.filter(r => r.id !== replyId && r.parentId !== replyId) };
        }
        return p;
      }));
      toast('Reply deleted');
    } catch (err) {
      console.error('Failed to delete reply:', err);
      toast('Failed to delete reply');
    }
  };

  const updateReply = async (postId, replyId, text) => {
    if (!isOnline) {
      addToQueue({ action: 'updateReply', postId, replyId, data: { text } });
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, replies: p.replies.map(r => r.id === replyId ? { ...r, text, edited: true, _temp: true } : r) };
        }
        return p;
      }));
      toast('📴 Update queued');
      return;
    }
    try {
      const updated = await api.put(`/posts/${postId}/replies/${replyId}`, { text });
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, replies: p.replies.map(r => r.id === replyId ? { ...r, ...updated } : r) };
        }
        return p;
      }));
      toast('Reply updated');
    } catch (err) {
      console.error('Failed to update reply:', err);
      toast('Failed to update reply');
    }
  };

  // ============ NESTED REPLY HELPERS ============
  const buildReplyTree = (replies) => {
    const byId = {};
    replies.forEach(r => { byId[r.id] = { ...r, children: [] }; });
    const roots = [];
    replies.forEach(r => {
      if (r.parentId && byId[r.parentId]) {
        byId[r.parentId].children.push(byId[r.id]);
      } else {
        roots.push(byId[r.id]);
      }
    });
    return roots;
  };

  const submitReplyDraft = (postId, parentId, draftKey) => {
    const text = (replyDrafts[draftKey] || '').trim();
    if (!text) return;
    addReply(postId, text, parentId);
    setReplyDrafts(prev => ({ ...prev, [draftKey]: '' }));
    setReplyTarget(prev => ({ ...prev, [postId]: null }));
  };

  const renderReplyNode = (post, node, depth = 0) => {
    const isMineReply = node.anonId === anonId;
    const isReplyingHere = replyTarget[post.id] === node.id;
    const draftKey = `reply-${node.id}`;

    return (
      <div key={node.id} style={{ marginLeft: depth > 0 ? '18px' : 0 }}>
        <div className="reply">
          <div className="reply-top">
            <span className="reply-meta" style={{ color: '#c0c3e0' }}>
              🕶 {node.anonId}{isMineReply && ' · you'} · {timeAgo(node.ts)}{node.edited && ' · edited'}
              {node._temp && ' ⏳'}
            </span>
          </div>
          <div className="reply-text" style={{ color: '#f3f2fb' }}>{escapeHtml(node.text)}</div>
          <div className="reply-actions">
            <button style={{ color: '#c0c3e0' }} onClick={() => setReplyTarget(prev => ({ ...prev, [post.id]: isReplyingHere ? null : node.id }))}>
              {isReplyingHere ? 'Cancel' : 'Reply'}
            </button>
            {isMineReply && (
              <>
                <button style={{ color: '#c0c3e0' }} onClick={() => {
                  const newText = prompt('Edit reply:', node.text);
                  if (newText && newText.trim()) updateReply(post.id, node.id, newText.trim());
                }}>Edit</button>
                <button className="danger-txt" onClick={() => deleteReply(post.id, node.id)}>Delete</button>
              </>
            )}
          </div>
          {isReplyingHere && (
            <div className="reply-input-row">
              <input
                type="text"
                placeholder="Write a reply…"
                className="reply-input"
                maxLength="500"
                value={replyDrafts[draftKey] || ''}
                onChange={(e) => setReplyDrafts(prev => ({ ...prev, [draftKey]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitReplyDraft(post.id, node.id, draftKey); }}
                autoFocus
              />
              <button onClick={() => submitReplyDraft(post.id, node.id, draftKey)}>Send</button>
            </div>
          )}
        </div>
        {node.children && node.children.length > 0 && (
          <div className="nested-children">
            {node.children.map(child => renderReplyNode(post, child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ============ CONTACTS ============
  const createContact = async (name, phone, type) => {
    const data = { name, phone, type };
    if (!isOnline) {
      addToQueue({ action: 'createContact', data });
      const tempContact = { id: 'temp_c_' + Date.now(), ...data, _temp: true };
      setContacts(prev => [...prev, tempContact]);
      toast('📴 Contact queued');
      return;
    }
    try {
      const newContact = await api.post('/contacts', data);
      setContacts(prev => [...prev, newContact]);
      toast('Contact added');
    } catch (err) {
      console.error('Failed to create contact:', err);
      toast('Failed to add contact');
    }
  };

  const deleteContact = async (id) => {
    if (!isOnline) {
      addToQueue({ action: 'deleteContact', id });
      setContacts(prev => prev.filter(c => c.id !== id));
      toast('📴 Delete queued');
      return;
    }
    try {
      await api.delete(`/contacts/${id}`);
      setContacts(prev => prev.filter(c => c.id !== id));
      toast('Contact removed');
    } catch (err) {
      console.error('Failed to delete contact:', err);
      toast('Failed to delete contact');
    }
  };

  // ============ SOS ============
  const triggerSOS = () => {
    if (!navigator.geolocation) {
      setSosStatus("❌ This browser doesn't support GPS.");
      return;
    }

    if (isSOSActive) {
      if (sosInterval) {
        clearInterval(sosInterval);
        setSosInterval(null);
      }
      setIsSOSActive(false);
      setSosStatus('🛑 SOS stopped');
      toast('SOS stopped');
      return;
    }

    setSosStatus('📡 Getting your location...');
    toast('📍 Please wait...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        
        // Use coordinates directly
        const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        
        const locationData = { lat, lng, address };
        setSosLocation(locationData);
        setSosStatus(`📍 LIVE: ${address}`);
        
        await sendLiveSOS(locationData);
        setIsSOSActive(true);
        
        if (sosInterval) clearInterval(sosInterval);
        
        const interval = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            async (pos2) => {
              const { latitude: lat2, longitude: lng2 } = pos2.coords;
              const address2 = `${lat2.toFixed(6)}, ${lng2.toFixed(6)}`;
              
              const newLocation = { lat: lat2, lng: lng2, address: address2 };
              setSosLocation(newLocation);
              setSosStatus(`📍 LIVE: ${address2}`);
              
              if (mapRef.current) {
                mapRef.current.setView([lat2, lng2], 16);
              }
              
              await sendLiveSOS(newLocation);
            },
            (err) => {
              console.log('Live update failed:', err.message);
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        }, 10000);
        
        setSosInterval(interval);
      },
      (err) => {
        console.error('GPS Error:', err);
        let errorMsg = 'GPS error: ';
        switch(err.code) {
          case 1:
            errorMsg = '❌ Permission denied. Please allow location access in browser settings.';
            break;
          case 2:
            errorMsg = '❌ GPS unavailable. Please enable location services and go outside.';
            break;
          case 3:
            errorMsg = '⏳ GPS timeout. Please try again or move to an open area.';
            break;
          default:
            errorMsg = `❌ GPS error: ${err.message}`;
        }
        setSosStatus(errorMsg);
        toast('❌ GPS failed. Please try again.');
      },
      { 
        enableHighAccuracy: false,
        timeout: 25000,
        maximumAge: 60000
      }
    );
  };

  const buildLocationMsg = () => {
    if (!sosLocation) return null;
    const osm = `https://www.openstreetmap.org/?mlat=${sosLocation.lat}&mlon=${sosLocation.lng}#map=17/${sosLocation.lat}/${sosLocation.lng}`;
    const address = sosLocation.address || (sosLocation.lat.toFixed(5) + ', ' + sosLocation.lng.toFixed(5));
    return `🚨 SOS — I need help! But please keep it confidential.\n\n📍 My location: ${address}\n🗺️ Open map: ${osm}`;
  };

  // ============ SEND LIVE SOS ============
  const sendLiveSOS = async (locationData) => {
    const { lat, lng, address } = locationData;
    
    const sosData = { 
      lat, 
      lng, 
      address,
      timestamp: Date.now(),
      isLive: isSOSActive,
      trackingId: sosTrackingId || 'manual_' + Date.now(),
      offline: !isOnline
    };
    
    // Save to localStorage
    const logs = JSON.parse(localStorage.getItem('aura_sos_logs') || '[]');
    logs.unshift(sosData);
    if (logs.length > 100) logs.pop();
    localStorage.setItem('aura_sos_logs', JSON.stringify(logs));
    
    // Add to queue for offline sync
    addToQueue({ action: 'sos', data: sosData });
    
    // If offline, save and return
    if (!isOnline) {
      setSosStatus(`📴 SOS saved offline. Will send when online.`);
      if (!window._offlineToastShown) {
        toast('📴 SOS saved offline');
        window._offlineToastShown = true;
      }
      return;
    }
    
    window._offlineToastShown = false;
    
    try {
      await api.post('/soslogs', sosData);
      const updatedLogs = await api.get('/soslogs');
      setSosLog(updatedLogs);
      
      const queue = getQueue();
      const filteredQueue = queue.filter(item => 
        !(item.action === 'sos' && item.data.timestamp === sosData.timestamp)
      );
      localStorage.setItem(QUEUE_KEY, JSON.stringify(filteredQueue));
      
      setSosStatus(`📍 LIVE: ${address} (real-time)`);
    } catch (err) {
      console.error('Failed to send SOS:', err);
      setSosStatus(`⚠️ Server error. SOS saved locally.`);
      if (!window._errorToastShown) {
        toast('⚠️ Could not reach server');
        window._errorToastShown = true;
      }
    }
  };

  // ============ EXPORT / WIPE ============
  const exportData = async () => {
    try {
      const data = await api.get('/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aura-export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Export downloaded');
    } catch (err) {
      console.error('Export failed:', err);
      toast('Export failed');
    }
  };

  const wipeData = async () => {
    try {
      await api.delete('/wipe');
      setPosts([]);
      setContacts([]);
      setSosLog([]);
      toast('All data wiped');
    } catch (err) {
      console.error('Wipe failed:', err);
      toast('Wipe failed');
    }
  };

  // ============ CHANGE PIN ============
  const changePin = async () => {
    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }
    if (!isOnline) {
      addToQueue({ action: 'updatePin', data: { pin: newPin } });
      setPin(newPin);
      setShowPinModal(false);
      setNewPin('');
      setConfirmPin('');
      setPinError('');
      toast('📴 PIN change queued');
      return;
    }
    try {
      await api.put('/config/pin', { pin: newPin });
      setPin(newPin);
      setShowPinModal(false);
      setNewPin('');
      setConfirmPin('');
      setPinError('');
      toast('✅ PIN changed successfully!');
    } catch (err) {
      setPinError('Failed to change PIN');
    }
  };

  // ============ HELPERS ============
  const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  const escapeHtml = (str) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, m => map[m]);
  };

  // ============ RENDER ============

  // Calculator
  if (!unlocked) {
    return (
      <div id="stage">
        <div id="phone">
          <div className="calc-screen">
            <div className="calc-clock">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="calc-display-wrap">
              <div className="calc-expression">{calcExpression}</div>
              <div className="calc-display">{calcDisplay}</div>
            </div>
            <div className="calc-pad">
              <button className="calc-btn sci-toggle" onClick={() => calcPress('sciToggle')}>
                {showScientific ? '▼' : '▶'}
              </button>
              <button className="calc-btn fn" onClick={() => calcPress('AC')}>AC</button>
              <button className="calc-btn fn" onClick={() => calcPress('DEL')}>DEL</button>
              <button className="calc-btn fn" onClick={() => calcPress('%')}>%</button>
              <button className="calc-btn op" onClick={() => calcPress('÷')}>÷</button>

              {showScientific && (
                <>
                  <button className="calc-btn sci" onClick={() => calcPress('sin')}>sin</button>
                  <button className="calc-btn sci" onClick={() => calcPress('cos')}>cos</button>
                  <button className="calc-btn sci" onClick={() => calcPress('tan')}>tan</button>
                  <button className="calc-btn sci" onClick={() => calcPress('log')}>log</button>
                  <button className="calc-btn sci" onClick={() => calcPress('√')}>√</button>
                  <button className="calc-btn sci" onClick={() => calcPress('π')}>π</button>
                  <button className="calc-btn sci" onClick={() => calcPress('e')}>e</button>
                </>
              )}

              <button className="calc-btn" onClick={() => calcPress('7')}>7</button>
              <button className="calc-btn" onClick={() => calcPress('8')}>8</button>
              <button className="calc-btn" onClick={() => calcPress('9')}>9</button>
              <button className="calc-btn op" onClick={() => calcPress('×')}>×</button>

              <button className="calc-btn" onClick={() => calcPress('4')}>4</button>
              <button className="calc-btn" onClick={() => calcPress('5')}>5</button>
              <button className="calc-btn" onClick={() => calcPress('6')}>6</button>
              <button className="calc-btn op" onClick={() => calcPress('-')}>-</button>

              <button className="calc-btn" onClick={() => calcPress('1')}>1</button>
              <button className="calc-btn" onClick={() => calcPress('2')}>2</button>
              <button className="calc-btn" onClick={() => calcPress('3')}>3</button>
              <button className="calc-btn op" onClick={() => calcPress('+')}>+</button>

              <button className="calc-btn zero" onClick={() => calcPress('0')}>0</button>
              <button className="calc-btn" onClick={() => calcPress('.')}>.</button>
              <button className="calc-btn op" onClick={() => calcPress('=')}>=</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ SANCTUARY ============
  return (
    <div id="stage">
      <div id="phone">
        <div id="sanctuary">
          <div className="aura-glow">
            <span></span><span></span><span></span>
          </div>

          <div className="topbar">
            <div className="brand"><span className="dot"></span> AURA</div>
            <div className="topbar-actions">
              <span className="status-indicator" style={{ 
                display: 'inline-block', 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: isOnline ? '#49e3c4' : '#ff4d5e',
                marginRight: '4px',
                boxShadow: isOnline ? '0 0 8px #49e3c4' : '0 0 8px #ff4d5e'
              }}></span>
              <button className="icon-btn" onClick={toggleNotifications} title="Notifications" style={{ position: 'relative' }}>
                🔔
                {unreadCount > 0 && (
                  <span className="notif-badge" style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    background: '#ff4d5e',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 15px rgba(255,77,94,0.6)'
                  }}>{unreadCount}</span>
                )}
              </button>
              <button className="icon-btn" onClick={() => syncOfflineQueue()} title="Sync">🔄</button>
              <button className="icon-btn" onClick={() => setView('settings')}>⚙</button>
              <button className="icon-btn" onClick={() => setUnlocked(false)}>–</button>
            </div>
          </div>

          {syncStatus && (
            <div style={{ 
              padding: '6px 16px', 
              fontSize: '12px', 
              color: 'var(--muted)',
              background: 'var(--card)',
              borderBottom: '1px solid var(--card-bd)',
              textAlign: 'center'
            }}>
              {syncStatus}
            </div>
          )}

          {showNotifications && (
            <div className="notifications-panel" style={{
              position: 'absolute',
              top: '60px',
              right: '10px',
              width: '320px',
              maxHeight: '400px',
              background: '#1a1d3a',
              border: '2px solid #8b7cf6',
              borderRadius: '12px',
              overflow: 'hidden',
              zIndex: 50,
              boxShadow: '0 8px 32px rgba(0,0,0,0.9), 0 0 30px rgba(139,124,246,0.3)'
            }}>
              <div className="notifications-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: '2px solid #8b7cf6',
                fontWeight: 700,
                fontSize: '15px',
                color: '#ffffff',
                background: 'rgba(139,124,246,0.15)'
              }}>
                <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 700 }}>📬 Notifications</span>
                {notifications.length > 0 && (
                  <button className="clear-notif-btn" onClick={clearAllNotifications} style={{
                    background: '#ff4d5e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '5px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}>Clear All</button>
                )}
              </div>
              <div className="notifications-list" style={{
                maxHeight: '340px',
                overflowY: 'auto',
                padding: '4px 0'
              }}>
                {notifications.length === 0 ? (
                  <div className="empty-notif" style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#c0c3e0',
                    fontSize: '15px'
                  }}>No notifications yet</div>
                ) : (
                  notifications.map(notif => (
                    <div key={notif.id} className={`notif-item ${notif.read ? 'read' : 'unread'}`} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      background: notif.read ? 'rgba(255,255,255,0.06)' : 'rgba(139,124,246,0.2)',
                      borderLeft: notif.read ? 'none' : '4px solid #8b7cf6',
                      opacity: notif.read ? '0.8' : '1'
                    }}>
                      <div className="notif-icon" style={{
                        fontSize: '22px',
                        flexShrink: 0,
                        marginTop: '2px',
                        color: '#ffffff'
                      }}>
                        {notif.type === 'post' && '📝'}
                        {notif.type === 'reply' && '💬'}
                        {notif.type === 'sos' && '🚨'}
                        {!notif.type && '📌'}
                      </div>
                      <div className="notif-content" style={{ flex: 1, minWidth: 0 }}>
                        <div className="notif-title" style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: '#ffffff'
                        }}>{notif.title}</div>
                        <div className="notif-message" style={{
                          fontSize: '14px',
                          color: '#ffffff',
                          wordBreak: 'break-word',
                          marginTop: '4px',
                          fontWeight: 400
                        }}>{notif.message}</div>
                        <div className="notif-time" style={{
                          fontSize: '12px',
                          color: '#c0c3e0',
                          marginTop: '5px'
                        }}>{notif.timestamp}</div>
                      </div>
                      <button className="notif-delete" onClick={() => deleteNotification(notif.id)} style={{
                        color: '#c0c3e0',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: '50%',
                        width: '30px',
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        padding: '0',
                        cursor: 'pointer',
                        border: 'none',
                        flexShrink: 0
                      }}>✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="content">
            {/* FEED */}
            <div className={`view ${view === 'feed' ? 'active' : ''}`}>
              <div className="hero">
                <h1 style={{ color: '#ffffff', fontWeight: 700 }}>You're safe here.</h1>
                <p style={{ color: '#e8e8ff' }}>Share anything, anonymously. No names, no accounts — just people who understand.</p>
              </div>
              <div className="pills">
                {['all', 'mental', 'abuse', 'bully'].map(c => (
                  <button 
                    key={c} 
                    className={`pill ${category === c ? 'active' : ''}`} 
                    onClick={() => setCategory(c)}
                    style={{ color: category === c ? '#0a0c16' : '#ffffff' }}
                  >
                    {c === 'all' ? '🌐 All' : c === 'mental' ? '🧠 Mental Health' : c === 'abuse' ? '🛡 Abuse Support' : '🕊 Bullying'}
                  </button>
                ))}
              </div>
              <div className="compose-bar" onClick={() => setShowPostModal(true)}>
                <span style={{ color: '#c0c3e0' }}>Share your story anonymously…</span>
                <button>Post</button>
              </div>
              <div className="section-label" style={{ color: '#8a8db0' }}>Community feed {!isOnline && '📴 (Offline)'}</div>
              <div className="feed-list">
                {posts.length === 0 ? (
                  <div className="empty-state"><div className="glyph">🌙</div>No posts yet.<br />Be the first to share.</div>
                ) : (
                  posts.map(post => {
                    const catColors = { mental: 'tag-mental', abuse: 'tag-abuse', bully: 'tag-bully' };
                    const catIcons = { mental: '🧠', abuse: '🛡', bully: '🕊' };
                    const catNames = { mental: 'Mental Health', abuse: 'Abuse Support', bully: 'Bullying' };
                    const isMine = post.anonId === anonId;
                    const replyTree = buildReplyTree(post.replies || []);
                    const rootDraftKey = `reply-root-${post.id}`;

                    return (
                      <div key={post.id} className="post-card">
                        <div className="post-top">
                          <span className={`post-tag ${catColors[post.category]}`}>
                            {catIcons[post.category]} {catNames[post.category]}
                          </span>
                          <span className="post-meta" style={{ color: '#c0c3e0' }}>
                            <span className="anon-avatar">🕶</span>
                            {post.anonId}{isMine && ' · you'} · {timeAgo(post.ts)}{post.edited && ' · edited'}
                            {post._temp && ' ⏳'}
                          </span>
                        </div>
                        <div className="post-text">{escapeHtml(post.text)}</div>
                        <div className="post-actions">
                          <button style={{ color: '#c0c3e0' }} className="reply-toggle" onClick={(e) => {
                            const repliesEl = e.target.closest('.post-card').querySelector('.replies');
                            repliesEl.classList.toggle('hidden');
                          }}>💬 {post.replies.length} {post.replies.length === 1 ? 'reply' : 'replies'}</button>
                          <button style={{ color: '#c0c3e0' }} onClick={() => {
                            const text = `"${post.text}" — shared via AURA Sanctuary`;
                            if (navigator.share) navigator.share({ title: 'AURA', text }).catch(() => {});
                            else { navigator.clipboard?.writeText(text); toast('Copied'); }
                          }}>📤 Share</button>
                          <span className="spacer"></span>
                          {isMine && (
                            <>
                              <button style={{ color: '#c0c3e0' }} onClick={() => {
                                const newText = prompt('Edit your post:', post.text);
                                if (newText && newText.trim()) updatePost(post.id, newText.trim());
                              }}>✏️ Edit</button>
                              <button className="danger-txt" onClick={() => {
                                setConfirmData({ title: 'Delete this post?', sub: 'This will remove your post and all replies.', onConfirm: () => deletePost(post.id) });
                                setShowConfirm(true);
                              }}>🗑</button>
                            </>
                          )}
                        </div>
                        <div className="replies hidden">
                          {replyTree.map(node => renderReplyNode(post, node, 0))}
                          <div className="reply-input-row">
                            <input
                              type="text"
                              placeholder="Write a reply…"
                              className="reply-input"
                              maxLength="500"
                              value={replyDrafts[rootDraftKey] || ''}
                              onChange={(e) => setReplyDrafts(prev => ({ ...prev, [rootDraftKey]: e.target.value }))}
                              onFocus={() => setReplyTarget(prev => ({ ...prev, [post.id]: 'root' }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') submitReplyDraft(post.id, null, rootDraftKey); }}
                            />
                            <button onClick={() => submitReplyDraft(post.id, null, rootDraftKey)}>Send</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* CONTACTS */}
            <div className={`view ${view === 'contacts' ? 'active' : ''}`}>
              <div className="hero">
                <h1>Trusted contacts</h1>
                <p>Add people or authorities you want to reach in an emergency.</p>
              </div>
              <div className="add-contact-form">
                <div className="row">
                  <input type="text" id="cName" placeholder="Name (e.g. Sister, Police)" />
                </div>
                <div className="row">
                  <input type="tel" id="cPhone" placeholder="Phone number" />
                  <select id="cType">
                    <option value="trusted">Trusted person</option>
                    <option value="authority">Authority</option>
                  </select>
                </div>
                <button onClick={() => {
                  const name = document.getElementById('cName').value.trim();
                  const phone = document.getElementById('cPhone').value.trim();
                  const type = document.getElementById('cType').value;
                  if (!name || !phone) { toast('Add a name and phone number'); return; }
                  createContact(name, phone, type);
                  document.getElementById('cName').value = '';
                  document.getElementById('cPhone').value = '';
                }}>+ Add contact</button>
              </div>
              <div className="contacts-list">
                {contacts.length === 0 ? (
                  <div className="empty-state"><div className="glyph">📇</div>No contacts yet.</div>
                ) : (
                  contacts.map(c => (
                    <div key={c.id} className="contact-row">
                      <div className="contact-avatar">{c.type === 'authority' ? '🏛' : '💛'}</div>
                      <div className="contact-info">
                        <div className="cn">{escapeHtml(c.name)}</div>
                        <div className="cp">{escapeHtml(c.phone)}</div>
                      </div>
                      <div className="contact-btns">
                        <button className="round-btn call" onClick={() => window.location.href = `tel:${c.phone.replace(/\s+/g, '')}`}>📞</button>
                        <button className="round-btn sms" onClick={() => window.location.href = `sms:${c.phone.replace(/\s+/g, '')}`}>💬</button>
                        <button className="round-btn del" onClick={() => {
                          setConfirmData({ title: `Remove ${c.name}?`, sub: '', onConfirm: () => deleteContact(c.id) });
                          setShowConfirm(true);
                        }}>✕</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SOS */}
            <div className={`view ${view === 'sos' ? 'active' : ''}`}>
              <div className="sos-hero">
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', marginBottom: '6px' }}>Emergency SOS</h1>
                <p style={{ color: 'var(--muted)', fontSize: '12.5px' }}>Captures your location and gets it to the people who can help.</p>
              </div>
              
              <div className="sos-orb-wrap">
                <button 
                  className={`sos-orb ${isSOSActive ? 'active' : ''}`} 
                  onClick={triggerSOS}
                >
                  {isSOSActive ? '🛑' : 'SOS'}
                  <small>{isSOSActive ? 'STOP TRACKING' : 'PRESS TO ALERT'}</small>
                </button>
              </div>
              
              <div className="sos-status">{sosStatus}</div>
              
              {sosLocation && (
                <div id="sosMap" ref={el => {
                  if (el && !mapRef.current && sosLocation) {
                    const map = L.map(el).setView([sosLocation.lat, sosLocation.lng], 16);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
                    L.marker([sosLocation.lat, sosLocation.lng]).addTo(map);
                    mapRef.current = map;
                    setTimeout(() => map.invalidateSize(), 200);
                  }
                }} style={{ height: '180px', borderRadius: '12px', overflow: 'hidden', marginBottom: '14px', border: '1px solid var(--card-bd)' }} />
              )}
              
              {sosLocation && (
                <button className="big-action share" onClick={() => {
                  const msg = buildLocationMsg();
                  if (!msg) { toast('Trigger SOS first'); return; }
                  if (navigator.share) {
                    navigator.share({
                      title: 'Emergency location',
                      text: msg,
                    }).catch(() => {});
                  } else {
                    navigator.clipboard?.writeText(msg);
                    toast('📍 Location copied to clipboard');
                  }
                }}>📤 Share location to any app</button>
              )}
              
              <div className="section-label">📱 Send SOS to your contacts</div>
              <div className="sos-contact-list">
                {contacts.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px' }}>Add a contact first, from the Contacts tab.</div>
                ) : (
                  contacts.map(c => (
                    <div key={c.id} className="contact-row">
                      <div className="contact-avatar">{c.type === 'authority' ? '🏛' : '💛'}</div>
                      <div className="contact-info">
                        <div className="cn">{escapeHtml(c.name)}</div>
                        <div className="cp">{escapeHtml(c.phone)}</div>
                      </div>
                      <div className="contact-btns">
                        <button className="round-btn call" onClick={() => window.location.href = `tel:${c.phone.replace(/\s+/g, '')}`}>📞</button>
                        <button className="round-btn sms" onClick={() => {
                          const msg = buildLocationMsg();
                          if (!msg) { toast('Trigger SOS first'); return; }
                          const phone = c.phone.replace(/\s+/g, '');
                          window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
                        }}>💬</button>
                        <button className="round-btn share-sos" onClick={() => {
                          const msg = buildLocationMsg();
                          if (!msg) { toast('Trigger SOS first'); return; }
                          if (navigator.share) {
                            navigator.share({
                              title: `SOS - ${c.name}`,
                              text: msg,
                            }).catch(() => {});
                          } else {
                            navigator.clipboard?.writeText(msg);
                            toast('📍 Location copied to clipboard');
                          }
                        }}>📤</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="section-label">Recent SOS activity</div>
              <div className="sos-log-list">
                {sosLog.length === 0 ? (
                  <div className="empty-state" style={{ padding: '18px' }}>No SOS activity yet.</div>
                ) : (
                  sosLog.slice(0, 8).map(log => (
                    <div key={log.id} className="contact-row">
                      <div className="contact-avatar">🚨</div>
                      <div className="contact-info">
                        <div className="cn">{new Date(log.ts).toLocaleString()}</div>
                        <div className="cp">{escapeHtml(log.address || `${log.lat.toFixed(5)}, ${log.lng.toFixed(5)}`)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SETTINGS */}
            <div className={`view ${view === 'settings' ? 'active' : ''}`}>
              <div className="hero">
                <h1>Settings</h1>
                <p>Everything here lives on the server.</p>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <div className="st-label">Secret unlock code</div>
                    <div className="st-sub">Current PIN: {pin}</div>
                  </div>
                  <button className="mini-btn primary" onClick={() => setShowPinModal(true)}>Change</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="st-label">Your anonymous ID</div>
                    <div className="st-sub">{anonId}</div>
                  </div>
                  <button className="mini-btn" style={{ background: 'rgba(255,255,255,.08)', color: 'var(--paper)' }} onClick={() => {
                    const newId = 'Anon-' + Math.random().toString(36).substr(2, 8);
                    setAnonId(newId);
                    toast('New ID generated');
                  }}>Rotate</button>
                </div>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div>
                    <div className="st-label">Export my data</div>
                    <div className="st-sub">Download posts, replies & contacts as a file</div>
                  </div>
                  <button className="mini-btn" style={{ background: 'rgba(255,255,255,.08)', color: 'var(--paper)' }} onClick={exportData}>Export</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="st-label">Panic wipe</div>
                    <div className="st-sub">Erase every trace from the server instantly</div>
                  </div>
                  <button className="mini-btn danger" onClick={() => {
                    setConfirmData({ title: 'Wipe all data?', sub: 'This erases everything permanently.', onConfirm: wipeData });
                    setShowConfirm(true);
                  }}>Wipe</button>
                </div>
              </div>
              <div className="section-label">About AURA</div>
              <div className="about-block">
                AURA hides a private support space behind an ordinary-looking calculator. Once unlocked, you can post anonymously under Mental Health, Abuse Support or Bullying, read and reply to others, and trigger an SOS that captures your GPS location — using OpenStreetMap — and prepares it to reach your trusted contacts.
                <br /><br />
                This build uses MongoDB to store posts, contacts and SOS logs persistently. In-app notifications keep you informed of new activity.
                <br /><br />
                If you or someone you know is in immediate danger, please contact local emergency services directly.
              </div>
            </div>
          </div>

          {/* Bottom Nav */}
          <div className="bottomnav">
            {['feed', 'contacts', 'sos', 'settings'].map(v => (
              <button 
                key={v} 
                className={`navbtn ${view === v ? 'active' : ''} ${v === 'sos' ? 'sosnav' : ''}`} 
                onClick={() => setView(v)}
                style={{ color: view === v ? '#ffffff' : '#8a8db0' }}
              >
                <span className="ni">
                  {v === 'feed' && '🏠'}
                  {v === 'contacts' && '📇'}
                  {v === 'sos' && '🚨'}
                  {v === 'settings' && '⚙'}
                </span>
                {v === 'feed' && 'Sanctuary'}
                {v === 'contacts' && 'Contacts'}
                {v === 'sos' && 'SOS'}
                {v === 'settings' && 'Settings'}
              </button>
            ))}
          </div>
        </div>

        {/* Post Modal */}
        {showPostModal && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowPostModal(false); setPostText(''); } }}>
            <div className="modal-sheet">
              <div className="modal-handle"></div>
              <h3 className="modal-title">Share anonymously</h3>
              <p className="modal-sub">No name, no login — just your words.</p>
              <div className="cat-choice">
                {['mental', 'abuse', 'bully'].map(c => (
                  <button key={c} className={postCategory === c ? 'sel' : ''} onClick={() => setPostCategory(c)}>
                    <span className="ci">{c === 'mental' ? '🧠' : c === 'abuse' ? '🛡' : '🕊'}</span>
                    {c === 'mental' ? 'Mental' : c === 'abuse' ? 'Abuse' : 'Bully'}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="What's on your mind? You're safe to say it here…"
                maxLength="1200"
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
              />
              <div className="char-count"><span>{postText.length}</span>/1200</div>
              <div className="anon-preview">👤 Will post as <b style={{ color: 'var(--paper)', marginLeft: '3px' }}>Anonymous</b></div>
              <button className="submit-btn" disabled={postText.trim().length < 3} onClick={createPost}>
                Post anonymously
              </button>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {showConfirm && (
          <div className="modal-overlay center" onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}>
            <div className="modal-sheet">
              <h3 className="modal-title">{confirmData.title}</h3>
              <p className="modal-sub">{confirmData.sub}</p>
              <div className="confirm-actions">
                <button className="no" onClick={() => setShowConfirm(false)}>Cancel</button>
                <button className="yes" onClick={() => {
                  if (confirmData.onConfirm) confirmData.onConfirm();
                  setShowConfirm(false);
                }}>Yes, continue</button>
              </div>
            </div>
          </div>
        )}

        {/* PIN Change Modal */}
        {showPinModal && (
          <div className="modal-overlay center" onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPinModal(false);
              setNewPin('');
              setConfirmPin('');
              setPinError('');
            }
          }}>
            <div className="modal-sheet">
              <h3 className="modal-title">Change Unlock Code</h3>
              <p className="modal-sub">Enter a new 4+ digit PIN</p>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ color: 'var(--muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>New PIN</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Enter new PIN"
                  maxLength="6"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--card-bd)',
                    borderRadius: '10px',
                    color: 'var(--paper)',
                    fontSize: '16px',
                    outline: 'none',
                    textAlign: 'center',
                    letterSpacing: '8px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: 'var(--muted)', fontSize: '13px', display: 'block', marginBottom: '4px' }}>Confirm PIN</label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Confirm new PIN"
                  maxLength="6"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--card-bd)',
                    borderRadius: '10px',
                    color: 'var(--paper)',
                    fontSize: '16px',
                    outline: 'none',
                    textAlign: 'center',
                    letterSpacing: '8px'
                  }}
                />
              </div>

              {pinError && (
                <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
                  ❌ {pinError}
                </div>
              )}

              <div className="confirm-actions">
                <button
                  className="no"
                  onClick={() => {
                    setShowPinModal(false);
                    setNewPin('');
                    setConfirmPin('');
                    setPinError('');
                  }}
                >
                  Cancel
                </button>
                <button
                  className="yes"
                  onClick={changePin}
                  style={{ background: 'var(--violet)', color: '#fff' }}
                >
                  Save PIN
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`toast ${showToast ? 'show' : ''}`}>{toastMsg}</div>
      </div>
    </div>
  );
}

export default App;