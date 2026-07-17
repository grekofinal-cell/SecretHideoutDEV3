/* ============================================================
   Admin Panel — admin.js
   ============================================================ */

/* ---- Logout ---- */
function logout() {
  sessionStorage.removeItem('shtAdminAuth');
  window.location.replace('login.html');
}

/* ---- Tab Switching ---- */
function switchTab(tab) {
  ['registrations', 'config', 'api'].forEach(t => {
    document.getElementById(`view-${t}`).hidden = (t !== tab);
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'registrations') renderTable();
  if (tab === 'config')        loadConfig();
  if (tab === 'api')           renderApiGuide();
}

/* ---- Render Registrations Table ---- */
let searchQuery = '';

function renderTable() {
  const db    = getDB();
  const regs  = db.registrations;
  const tbody = document.getElementById('registrations-tbody');
  const empty = document.getElementById('empty-state');

  // Stats
  const active  = regs.filter(r => r.status === 'active').length;
  const revoked = regs.filter(r => r.status === 'revoked').length;
  const verifs  = regs.reduce((s, r) => s + (r.verifyCount || 0), 0);
  animateCounter(document.getElementById('admin-stat-total'), regs.length);
  animateCounter(document.getElementById('admin-stat-active'), active);
  animateCounter(document.getElementById('admin-stat-verifications'), verifs);
  animateCounter(document.getElementById('admin-stat-revoked'), revoked);

  // Filter
  const filtered = regs.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.robloxUsername.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = filtered.slice().reverse().map(r => {
    const date = new Date(r.registeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const statusClass = r.status === 'active' ? 'active' : (r.status === 'revoked' ? 'revoked' : 'used');
    const canRevoke = r.status === 'active';
    return `
      <tr>
        <td><strong>${escHtml(r.robloxUsername)}</strong></td>
        <td><span class="mono">${escHtml(r.id)}</span></td>
        <td>${r.discordUsername ? escHtml(r.discordUsername) : '<span style="color:var(--text-faint)">—</span>'}</td>
        <td><span class="badge ${statusClass}"><span class="badge-dot-sm"></span>${r.status.toUpperCase()}</span></td>
        <td style="color:var(--text-muted);font-size:0.82rem">${date}</td>
        <td style="text-align:center">${r.verifyCount || 0}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="action-btn copy-action" onclick="adminCopyId('${escHtml(r.id)}')">Copy ID</button>
            ${canRevoke ? `<button class="action-btn" onclick="adminRevoke('${escHtml(r.id)}')">Revoke</button>` : ''}
            <button class="action-btn" onclick="adminDelete('${escHtml(r.id)}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---- Search ---- */
document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderTable();
});

/* ---- Actions ---- */
function adminCopyId(id) {
  navigator.clipboard.writeText(id).then(() => showToast('ID copied!', 'success'));
}

function adminRevoke(id) {
  if (!confirm(`Revoke ID: ${id}?\n\nThe player will no longer be able to join with this ID.`)) return;
  revokeId(id);
  renderTable();
  showToast('ID revoked.', 'success');
}

function adminDelete(id) {
  if (!confirm(`Permanently delete this registration?\n${id}\n\nThis cannot be undone.`)) return;
  deleteRegistration(id);
  renderTable();
  showToast('Registration deleted.', 'success');
}

document.getElementById('clear-all-btn').addEventListener('click', () => {
  dangerClearAll();
});

function dangerClearAll() {
  if (!confirm('Delete ALL registrations? This is permanent and cannot be undone.')) return;
  const db = getDB();
  db.registrations = [];
  saveDB(db);
  renderTable();
  showToast('All registrations cleared.', 'success');
}

/* ---- Config ---- */
function loadConfig() {
  const cfg = getConfig();
  document.getElementById('cfg-placeId').value        = cfg.placeId || '';
  document.getElementById('cfg-redirectPlaceId').value= cfg.redirectPlaceId || '';
  document.getElementById('cfg-requireCode').checked  = !!cfg.requireCode;
  document.getElementById('cfg-accessCodes').value    = (cfg.accessCodes || []).join(', ');
  document.getElementById('cfg-apiKey').value         = cfg.apiKey || '';
}

function saveField(key, inputId) {
  const cfg = getConfig();
  cfg[key] = document.getElementById(inputId).value.trim();
  saveConfig(cfg);
  showToast(`${key} saved!`, 'success');
}

function saveToggle(key, value) {
  const cfg = getConfig();
  cfg[key] = value;
  saveConfig(cfg);
  showToast(`${key} ${value ? 'enabled' : 'disabled'}.`, 'success');
}

function saveAccessCodes() {
  const cfg = getConfig();
  const raw = document.getElementById('cfg-accessCodes').value;
  cfg.accessCodes = raw.split(',').map(c => c.trim()).filter(Boolean);
  saveConfig(cfg);
  showToast(`${cfg.accessCodes.length} access code(s) saved.`, 'success');
}

function regenerateApiKey() {
  if (!confirm('Regenerate the API key? Your current Roblox Lua script will stop working until you update it.')) return;
  const cfg = getConfig();
  cfg.apiKey = generateToken(32);
  saveConfig(cfg);
  document.getElementById('cfg-apiKey').value = cfg.apiKey;
  showToast('API key regenerated!', 'success');
}

/* ---- API Guide ---- */
function renderApiGuide() {
  const cfg = getConfig();
  const siteUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
  document.getElementById('site-url-display').textContent = siteUrl + 'index.html';

  const placeId  = cfg.placeId         || 'YOUR_PLACE_ID';
  const rPlaceId = cfg.redirectPlaceId || 'REDIRECT_PLACE_ID';
  const apiKey   = cfg.apiKey          || 'YOUR_API_KEY';
  const apiUrl   = siteUrl + 'api.html';

  const lua = `-- =====================================================
-- SHT Studios Verification Script
-- Place in ServerScriptService in Roblox Studio
-- =====================================================

local Players        = game:GetService("Players")
local TeleportService= game:GetService("TeleportService")
local HttpService    = game:GetService("HttpService")

-- 🔧 CONFIGURE THESE:
local MAIN_PLACE_ID     = ${placeId}  -- Your private game
local REDIRECT_PLACE_ID = ${rPlaceId} -- Public lobby / redirect game
local API_URL           = "${apiUrl}?action=verify&id="
local API_KEY           = "${apiKey}"  -- Keep secret!

-- 🔒 Verify the player's registration ID with your website
local function isValidRegistrationId(id)
    if not id or id == "" then
        return false
    end

    local ok, response = pcall(function()
        return HttpService:GetAsync(
            API_URL .. HttpService:UrlEncode(id) .. "&key=" .. API_KEY,
            false -- no cache
        )
    end)

    if ok and response then
        local success, data = pcall(HttpService.JSONDecode, HttpService, response)
        if success and data and data.valid then
            print("[SHT Studios] Verified: " .. (data.robloxUsername or "?"))
            return true
        end
    end

    warn("[SHT Studios] Verification failed for ID: " .. tostring(id))
    return false
end

-- 👤 Handle each player when they join
Players.PlayerAdded:Connect(function(player)
    local joinData   = player:GetJoinData()
    local launchData = joinData.LaunchData

    print("[SHT Studios] " .. player.Name .. " joined. ID: " .. tostring(launchData))

    if isValidRegistrationId(launchData) then
        -- ✅ Verified — let them play!
        print("[SHT Studios] " .. player.Name .. " is verified. Access granted.")
    else
        -- ❌ No valid ID — redirect to public game
        print("[SHT Studios] " .. player.Name .. " failed verification. Redirecting...")
        
        task.wait(1) -- brief delay so player loads in
        
        local teleportOk, err = pcall(function()
            TeleportService:TeleportAsync(REDIRECT_PLACE_ID, {player})
        end)

        if not teleportOk then
            -- Teleport failed — kick as fallback
            player:Kick("\\n\\n🔒 Access Denied\\n\\nPlease register at our website to join this game.\\n\\nSHT Studios.example.com")
            warn("[SHT Studios] Teleport failed for " .. player.Name .. ": " .. tostring(err))
        end
    end
end)

print("[SHT Studios] Verification system loaded!")`;

  document.getElementById('lua-code-block').textContent = lua;
}

function copyLuaCode() {
  const code = document.getElementById('lua-code-block').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Lua script copied!', 'success');
  });
}

/* ---- Init ---- */
renderTable();
