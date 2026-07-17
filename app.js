/* ============================================================
   Main Registration Page — app.js
   ============================================================ */

/* ---- Background Particles ---- */
(function createParticles() {
  const container = document.getElementById('bg-particles');
  const colors = ['rgba(124,58,237,0.6)', 'rgba(6,182,212,0.5)', 'rgba(167,139,250,0.5)', 'rgba(103,232,249,0.4)'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    const left = Math.random() * 100;
    const dur  = Math.random() * 20 + 15;
    const delay = Math.random() * -25;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration:${dur}s;
      animation-delay:${delay}s;
    `;
    container.appendChild(p);
  }
})();

/* ---- Navbar scroll ---- */
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ---- Stat Counters ---- */
function updateStats() {
  const db = getDB();
  const regs = db.registrations;
  const active  = regs.filter(r => r.status === 'active').length;
  const verified = regs.reduce((sum, r) => sum + (r.verifyCount || 0), 0);

  animateCounter(document.getElementById('stat-registered'), regs.length);
  animateCounter(document.getElementById('stat-active'),     active);
  animateCounter(document.getElementById('stat-verified'),   verified);
}
updateStats();

/* ---- Demo ID card animation ---- */
const demoIds = ['GL-ABC12-DEF34-GHI56', 'GL-MXNZP-QRSTU-VWXYZ', 'GL-K9J8H-7G6F5-E4D3C'];
let demoIdx = 0;
const demoDom = document.getElementById('demo-id-display');
setInterval(() => {
  demoIdx = (demoIdx + 1) % demoIds.length;
  demoDom.style.opacity = '0';
  setTimeout(() => {
    demoDom.textContent = demoIds[demoIdx];
    demoDom.style.opacity = '1';
  }, 300);
  demoDom.style.transition = 'opacity 0.3s';
}, 2500);

/* ---- Launch Roblox without ever leaving this page ---- */
function openRobloxLauncher(placeId, registrationId) {
  // Uses Roblox's own roblox:// protocol handler through a hidden
  // iframe. This never navigates or opens a tab — the browser just
  // asks the OS/user whether to hand off to the Roblox app, while
  // our page stays exactly where it is underneath that prompt.
  const protocolUrl = buildRobloxProtocolUrl(placeId, registrationId);

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  iframe.src = protocolUrl;

  // Clean up the iframe shortly after; it's only needed for the
  // instant it takes the browser to hand off to the protocol.
  setTimeout(() => iframe.remove(), 2500);
}

/* ---- Registration Form ---- */
const form       = document.getElementById('registerForm');
const formCard   = document.getElementById('form-card');
const successCard= document.getElementById('success-card');
const submitBtn  = document.getElementById('submitBtn');
const btnText    = submitBtn.querySelector('.btn-text');
const btnSpinner = submitBtn.querySelector('.btn-spinner');

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.hidden = loading;
  btnSpinner.hidden = !loading;
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  document.querySelectorAll('input.has-error').forEach(el => el.classList.remove('has-error'));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const robloxUsername = document.getElementById('robloxUsername').value.trim();
  const discordUsername = document.getElementById('discordUsername').value.trim();
  const accessCode = document.getElementById('accessCode').value.trim();

  // Validation
  let hasError = false;
  if (!robloxUsername || robloxUsername.length < 3) {
    document.getElementById('error-username').textContent = 'Username must be at least 3 characters.';
    document.getElementById('robloxUsername').classList.add('has-error');
    hasError = true;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(robloxUsername) && robloxUsername.length >= 3) {
    document.getElementById('error-username').textContent = 'Username can only contain letters, numbers, and underscores.';
    document.getElementById('robloxUsername').classList.add('has-error');
    hasError = true;
  }
  if (hasError) return;

  setLoading(true);

  // Simulate async processing
  await new Promise(res => setTimeout(res, 800));

  const result = registerPlayer({ robloxUsername, discordUsername, accessCode });
  setLoading(false);

  if (!result.success) {
    document.getElementById('error-username').textContent = result.error;
    document.getElementById('robloxUsername').classList.add('has-error');
    showToast(result.error, 'error');
    return;
  }

  // Show success
  const reg = result.registration;
  document.getElementById('success-username').textContent = reg.robloxUsername;
  document.getElementById('verification-id-display').textContent = reg.id;

  formCard.hidden = true;
  successCard.hidden = false;
  successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

  updateStats();
  showToast('Registration successful! Your ID is ready.', 'success');

  // Launch button
  document.getElementById('launch-btn').onclick = () => {
    const config = getConfig();
    if (!config.placeId) {
      showToast('Place ID not configured. Ask the admin to set it up.', 'error');
      return;
    }
    openRobloxLauncher(config.placeId, reg.id);
    showToast('Opening Roblox...', 'success');
  };
});

/* ---- Copy Button ---- */
document.getElementById('copy-btn').addEventListener('click', () => {
  const id = document.getElementById('verification-id-display').textContent;
  navigator.clipboard.writeText(id).then(() => {
    showToast('Verification ID copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy — please select and copy manually.', 'error');
  });
});

/* ---- Register Another ---- */
document.getElementById('register-another-btn').addEventListener('click', () => {
  formCard.hidden = false;
  successCard.hidden = true;
  form.reset();
  clearErrors();
  formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ---- ID Lookup ---- */
document.getElementById('lookup-btn').addEventListener('click', () => {
  const id = document.getElementById('lookupId').value.trim();
  const resultEl = document.getElementById('lookup-result');

  if (!id) {
    showToast('Please enter a Verification ID to look up.', 'error');
    return;
  }

  const reg = lookupId(id);
  resultEl.hidden = false;

  if (!reg) {
    resultEl.className = 'lookup-result invalid';
    resultEl.innerHTML = `
      <div class="result-name">❌ ID Not Found</div>
      <div class="result-meta">This ID doesn't exist in the database.</div>
    `;
  } else {
    const statusIcons = { active: '✅', used: '🟡', revoked: '🔴' };
    const date = new Date(reg.registeredAt).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    resultEl.className = `lookup-result ${reg.status === 'active' ? 'valid' : 'invalid'}`;
    
    let launchHtml = '';
    if (reg.status === 'active') {
      launchHtml = `
        <button class="btn btn-launch" id="lookup-launch-btn" style="margin-top: 12px; padding: 10px 16px; font-size: 0.9rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          Launch Roblox Game
        </button>
      `;
    }

    resultEl.innerHTML = `
      <div class="result-name">${statusIcons[reg.status] || '❓'} ${reg.robloxUsername}</div>
      <div class="result-meta">Status: ${reg.status.toUpperCase()} · Registered: ${date} · Verified ${reg.verifyCount} times</div>
      ${launchHtml}
    `;

    // Bind event to the new launch button if it exists
    const launchBtn = document.getElementById('lookup-launch-btn');
    if (launchBtn) {
      launchBtn.onclick = () => {
        const config = getConfig();
        if (!config.placeId) {
          showToast('Place ID not configured. Ask the admin to set it up.', 'error');
          return;
        }
        openRobloxLauncher(config.placeId, reg.id);
        showToast('Opening Roblox...', 'success');
      };
    }
  }
});

document.getElementById('lookupId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('lookup-btn').click();
});
