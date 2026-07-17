/* ============================================================
   Shared Database & Utilities
   Stored in localStorage as 'SHT StudiosDB'
   ============================================================ */

const DB_KEY     = 'shtStudiosDB';
const CFG_KEY    = 'shtStudiosConfig';

/* Default config */
const DEFAULT_CONFIG = {
  placeId:        '',         // Roblox Place ID of your main game
  redirectPlaceId:'',         // Place ID to redirect to if no valid ID
  requireCode:    false,      // Whether an access code is needed
  accessCodes:    [],         // List of valid access codes
  apiKey:         generateToken(32),  // Secret key for your server→website API
  version:        '1.0.0'
};

/* ============================================================ Helpers */

function generateToken(length = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  arr.forEach(b => result += chars[b % chars.length]);
  return result;
}

function generateRegistrationId(robloxUsername) {
  // Format: SHT-XXXXX-XXXXX-XXXXX  (SHT = SHT Studios)
  const part = () => generateToken(5).toUpperCase();
  return `SHT-${part()}-${part()}-${part()}`;
}

function getDB() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || { registrations: [] };
  } catch { return { registrations: [] }; }
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  syncToServer();
}

function getConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(CFG_KEY));
    return { ...DEFAULT_CONFIG, ...stored };
  } catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  syncToServer();
}

// Synchronisiert Daten im Hintergrund zum Python Server für Roblox-Abfragen
function syncToServer() {
  const db = getDB();
  const config = getConfig();
  
  fetch('/sync-db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db, config })
  }).catch(err => console.warn("Sync failed (normal if not running via server.py):", err));
}

// Holt Datenbank und Config vom Server und aktualisiert localStorage
function loadFromServer() {
  fetch('/get-db')
    .then(res => res.json())
    .then(data => {
      if (data.db) {
        localStorage.setItem(DB_KEY, JSON.stringify(data.db));
      }
      if (data.config) {
        localStorage.setItem(CFG_KEY, JSON.stringify(data.config));
      }
      // UI-Elemente aktualisieren, falls wir auf index.html oder admin.html sind
      if (typeof updateStats === 'function') updateStats();
      if (typeof loadConfig === 'function') loadConfig();
    })
    .catch(err => console.warn("Could not load data from server:", err));
}

// Beim Starten laden wir zuerst die Daten vom Server herunter
loadFromServer();
// Nach 1 Sekunde synchronisieren wir einmalig zur Sicherheit
setTimeout(syncToServer, 1000);

/* ============================================================ Registration API */

function registerPlayer({ robloxUsername, discordUsername = '', accessCode = '' }) {
  const config = getConfig();

  // Check access code if required
  if (config.requireCode && config.accessCodes.length > 0) {
    if (!config.accessCodes.includes(accessCode.trim())) {
      return { success: false, error: 'Invalid access code.' };
    }
  }

  const db = getDB();
  const existing = db.registrations.find(
    r => r.robloxUsername.toLowerCase() === robloxUsername.trim().toLowerCase()
  );

  if (existing && existing.status !== 'revoked') {
    return {
      success: false,
      error: `That Roblox username is already registered. Your ID: ${existing.id}`
    };
  }

  const newReg = {
    id:              generateRegistrationId(robloxUsername),
    robloxUsername:  robloxUsername.trim(),
    discordUsername: discordUsername.trim(),
    status:          'active',     // active | used | revoked
    registeredAt:    Date.now(),
    lastVerifiedAt:  null,
    verifyCount:     0
  };

  db.registrations.push(newReg);
  saveDB(db);

  return { success: true, registration: newReg };
}

function lookupId(id) {
  const db = getDB();
  return db.registrations.find(r => r.id === id.trim()) || null;
}

function verifyId(id) {
  /* Called by the Roblox server via fetch() to your API page.
     Returns JSON: { valid: true/false, username: '...' } */
  const db = getDB();
  const reg = db.registrations.find(r => r.id === id.trim());
  if (!reg || reg.status === 'revoked') return { valid: false };
  reg.lastVerifiedAt = Date.now();
  reg.verifyCount++;
  saveDB(db);
  return { valid: true, robloxUsername: reg.robloxUsername, registeredAt: reg.registeredAt };
}

function revokeId(id) {
  const db = getDB();
  const reg = db.registrations.find(r => r.id === id);
  if (!reg) return false;
  reg.status = 'revoked';
  saveDB(db);
  return true;
}

function deleteRegistration(id) {
  const db = getDB();
  const idx = db.registrations.findIndex(r => r.id === id);
  if (idx === -1) return false;
  db.registrations.splice(idx, 1);
  saveDB(db);
  return true;
}

/* ============================================================ Roblox Launch URL */

function buildLaunchUrl(placeId, registrationId) {
  const encoded = encodeURIComponent(registrationId);
  return `https://www.roblox.com/games/start?placeId=${placeId}&launchData=${encoded}`;
}

function buildRobloxProtocolUrl(placeId, registrationId) {
  // Roblox's own client-side protocol handler. Triggering this does
  // NOT navigate the browser tab — the browser just asks the OS to
  // hand off to the Roblox app, so our website stays open underneath.
  const encoded = encodeURIComponent(registrationId);
  return `roblox://experiences/start?placeId=${placeId}&launchData=${encoded}`;
}

/* ============================================================ Toast */

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/* ============================================================ Number animation */

function animateCounter(el, target, duration = 1200) {
  const start = performance.now();
  const from = parseInt(el.textContent) || 0;
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
