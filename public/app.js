// --- THEME TOGGLE LOGIC ---
function initTheme() {
  document.body.classList.add('dark-theme');
  localStorage.setItem('theme', 'dark');
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeButtonUI(isDark ? 'dark' : 'light');
}

function updateThemeButtonUI(theme) {
  const btn = document.getElementById('floating-theme-btn');
  if (!btn) return;
  if (theme === 'dark') {
    btn.innerHTML = '<i class="fa-solid fa-sun"></i> Modo claro';
  } else {
    btn.innerHTML = '<i class="fa-solid fa-moon"></i> Modo oscuro';
  }
}

function truncateName(name, maxLength = 10) {
  if (!name) return '';
  return name.length > maxLength ? name.substring(0, maxLength) + '...' : name;
}

// Initialize theme immediately
initTheme();

// APPLICATION STATE
let state = {
  currentUser: null,
  matches: [],
  predictions: {}, // Key: matchId, Value: prediction string ('L', 'E', 'V')
  leaderboard: [],
  activeTab: 'leaderboard',
  authTab: 'login'
};

// STATE FOR PHASE 2 (Fase Final)
let statePhase2 = {
  matches: [],
  predictions: {}, // Key: matchId, Value: prediction object { team1Score, team2Score, winner }
  config: { predictionsPaused: false },
  leaderboard: []
};

// API BASE PATH
const API_URL = '/api';

// --- PWA LÓGICA DE INSTALACIÓN ---
let deferredPrompt = null;

// Helper para verificar si ya está instalado / modo standalone
const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

// Helper para detectar iOS (Safari)
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
};

// Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registrado con éxito.', reg.scope))
      .catch(err => console.error('Error al registrar el Service Worker:', err));
  });
}

// Capturar evento de instalación
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Mostrar modal si no ha sido rechazado en esta sesión y no está instalado
  const dismissed = sessionStorage.getItem('pwa_dismissed');
  if (!dismissed && !isStandalone()) {
    showPwaModal();
  }
});

function showPwaModal() {
  const modal = document.getElementById('pwa-install-modal');
  if (!modal) return;

  const dismissed = sessionStorage.getItem('pwa_dismissed');
  if (dismissed || isStandalone()) return;

  // Si es iOS, personalizamos el modal con instrucciones manuales
  if (isIOS()) {
    const titleEl = modal.querySelector('h3');
    const descEl = modal.querySelector('p');
    const buttonContainer = modal.querySelector('div[style*="display: flex; flex-direction: column; gap: 0.75rem"]');
    
    if (titleEl) titleEl.textContent = 'Instalar en tu iPhone/iPad';
    if (descEl) {
      descEl.innerHTML = `
        Para instalar la Quiniela 2026 en tu dispositivo iOS:<br><br>
        1. Presiona el botón de <strong>Compartir</strong> <i class="fa-solid fa-arrow-up-from-bracket" style="color: var(--gold);"></i> en la barra de Safari.<br>
        2. Desplázate hacia abajo y selecciona <strong>Agregar a Inicio</strong> <i class="fa-regular fa-square-plus" style="color: var(--gold);"></i>.
      `;
      descEl.style.textAlign = 'left';
    }
    
    if (buttonContainer) {
      buttonContainer.innerHTML = `
        <button class="btn btn-success" onclick="closePwaModal()" style="width: 100%; padding: 0.9rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; border-radius: 12px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);">
          ¡Entendido!
        </button>
      `;
    }
  }
  
  modal.style.display = 'flex';
}

function closePwaModal() {
  const modal = document.getElementById('pwa-install-modal');
  if (modal) modal.style.display = 'none';
  sessionStorage.setItem('pwa_dismissed', 'true');
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  // Check if session exists in localStorage
  const storedUser = localStorage.getItem('quiniela_user');
  if (storedUser) {
    try {
      state.currentUser = JSON.parse(storedUser);
      showAppDashboard();
    } catch (e) {
      localStorage.removeItem('quiniela_user');
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }

  // Mostrar modal de instalación de iOS de forma automática tras unos segundos
  if (isIOS() && !isStandalone() && !sessionStorage.getItem('pwa_dismissed')) {
    setTimeout(showPwaModal, 1500);
  }

  // Listener para el botón de instalar PWA (Android / Chrome)
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      closePwaModal();
      if (!deferredPrompt) {
        showToast("La aplicación ya está instalada o tu navegador no soporta instalación directa.", "info");
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Usuario eligió instalar: ${outcome}`);
      deferredPrompt = null;
    });
  }
});

// --- AUTH LÓGICA & VISTAS ---

function showAuthScreen() {
  document.getElementById('auth-section').style.display = 'flex';
  document.getElementById('app-section').style.display = 'none';
  switchAuthTab('login');
}

// Public Password Reset
function openPublicResetModal() {
  document.getElementById('public-reset-modal').style.display = 'flex';
  document.getElementById('public-reset-username').value = '';
  document.getElementById('public-reset-new-pwd-input').value = '';
  document.getElementById('public-reset-btn').style.display = 'block';
  document.getElementById('public-reset-btn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Nueva Contraseña';
}

function closePublicResetModal() {
  document.getElementById('public-reset-modal').style.display = 'none';
}

async function submitPublicReset() {
  const username = document.getElementById('public-reset-username').value.trim();
  const newPassword = document.getElementById('public-reset-new-pwd-input').value;
  
  if (!username) {
    showToast("Debes ingresar tu nombre de usuario", "error");
    return;
  }
  
  if (newPassword.length < 6) {
    showToast("La contraseña debe tener al menos 6 caracteres", "error");
    return;
  }

  const btn = document.getElementById('public-reset-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...';

  try {
    const response = await fetch(`${API_URL}/auth/reset-password-public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newPassword })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al restaurar contraseña", "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Nueva Contraseña';
      return;
    }

    showToast("Contraseña actualizada con éxito", "success");
    
    // Fill the login form with this new password to make it easier
    document.getElementById('login-username').value = username;
    document.getElementById('login-password').value = newPassword;
    
    closePublicResetModal();
  } catch (error) {
    console.error("Reset error:", error);
    showToast("Error de conexión", "error");
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Nueva Contraseña';
  }
}

function showAppDashboard() {
  document.getElementById('auth-section').style.display = 'none';
  
  // Safeguard: explicitly remove active states from groups to avoid flashing cached HTML views
  const predView = document.getElementById('view-groups');
  if (predView) predView.classList.remove('active');
  const predTab = document.getElementById('tab-groups');
  if (predTab) predTab.classList.remove('active');
  
  document.getElementById('app-section').style.display = 'flex';
  
  // Set UI user info
  const displayUsername = state.currentUser.username === 'invitado' ? 'Phantom User' : state.currentUser.username;
  document.getElementById('user-display-name').textContent = displayUsername;
  document.getElementById('welcome-username').textContent = displayUsername;
  document.getElementById('user-display-points').textContent = `${state.currentUser.points} pts`;
  
  // Set header avatar
  const headerAvatar = document.getElementById('user-header-avatar');
  if (headerAvatar) {
    headerAvatar.src = state.currentUser.profilePic || 'avatar.png';
  }
  
  // Show admin tab/badge if admin
  if (state.currentUser.isAdmin) {
    document.getElementById('admin-badge').style.display = 'inline-flex';
    document.getElementById('tab-admin').style.display = 'flex';
    const tabAdmin2 = document.getElementById('tab-admin-2');
    if (tabAdmin2) tabAdmin2.style.display = 'flex';
  } else {
    document.getElementById('admin-badge').style.display = 'none';
    document.getElementById('tab-admin').style.display = 'none';
    const tabAdmin2 = document.getElementById('tab-admin-2');
    if (tabAdmin2) tabAdmin2.style.display = 'none';
  }
  const tabGroups = document.getElementById('tab-groups');
  if (tabGroups) tabGroups.style.display = 'flex';



  // Initial data fetch
  switchTab('leaderboard');
  checkAnnouncementModal();

  // Notifications init
  refreshUnreadNotificationCount();
  if (notificationsInterval) clearInterval(notificationsInterval);
  notificationsInterval = setInterval(refreshUnreadNotificationCount, 120000);
}

function switchAuthTab(tab) {
  state.authTab = tab;
  
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginBtn = document.getElementById('tab-login-btn');
  const registerBtn = document.getElementById('tab-register-btn');
  const authCard = document.querySelector('.auth-card');

  if (tab === 'login') {
    if (loginForm) loginForm.classList.add('active');
    if (registerForm) registerForm.classList.remove('active');
    if (loginBtn) loginBtn.classList.add('active');
    if (registerBtn) registerBtn.classList.remove('active');
    if (authCard) authCard.classList.remove('register-mode');
  } else {
    if (loginForm) loginForm.classList.remove('active');
    if (registerForm) registerForm.classList.add('active');
    if (loginBtn) loginBtn.classList.remove('active');
    if (registerBtn) registerBtn.classList.add('active');
    if (authCard) authCard.classList.add('register-mode');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('login-username').value;
  const passwordInput = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al iniciar sesión", "error");
      return;
    }

    state.currentUser = data.user;
    localStorage.setItem('quiniela_user', JSON.stringify(data.user));
    showToast("¡Inicio de sesión exitoso!", "success");
    showAppDashboard();
    
    // Clear inputs
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
  } catch (error) {
    console.error("Login error:", error);
    showToast("Error de conexión con el servidor", "error");
  }
}

async function loginAsGuest() {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'invitado', password: 'mundial' })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al iniciar sesión como invitado", "error");
      return;
    }

    state.currentUser = data.user;
    localStorage.setItem('quiniela_user', JSON.stringify(data.user));
    showToast("¡Ingresaste como invitado!", "success");
    showAppDashboard();
  } catch (error) {
    console.error("Guest login error:", error);
    showToast("Error de conexión al ingresar como invitado", "error");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('reg-username').value;
  const passwordInput = document.getElementById('reg-password').value;

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al registrarse", "error");
      return;
    }

    showToast("¡Cuenta creada! Por favor ingresa.", "success");
    
    // Switch to login tab and prefill username
    switchAuthTab('login');
    document.getElementById('login-username').value = usernameInput;
    
    // Clear login password and remove its placeholder to make it intuitive to type
    const loginPass = document.getElementById('login-password');
    loginPass.value = '';
    loginPass.placeholder = '';
    loginPass.focus();
    
    // Clear registration fields
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-password').value = '';
  } catch (error) {
    console.error("Registration error:", error);
    showToast("Error de conexión con el servidor", "error");
  }
}

function handleLogout() {
  if (notificationsInterval) {
    clearInterval(notificationsInterval);
    notificationsInterval = null;
  }
  localStorage.removeItem('quiniela_user');
  state.currentUser = null;
  state.matches = [];
  state.predictions = {};
  state.leaderboard = [];
  showToast("Sesión cerrada", "info");
  showAuthScreen();
}

// --- DASHBOARD ROUTING & TABS ---

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Update Tab buttons styling
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // Update views visibility
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  const targetView = document.getElementById(`view-${tabId}`);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Toggle floating trends button visibility (show on leaderboard or new-panel)
  const trendsBtn = document.getElementById('floating-trends-btn');
  if (trendsBtn) {
    trendsBtn.style.display = (tabId === 'leaderboard' || tabId === 'new-panel') ? 'flex' : 'none';
  }

  // Fetch data depending on tab
  if (tabId === 'leaderboard') {
    loadLeaderboard();
  } else if (tabId === 'new-panel') {
    loadPhase2Leaderboard();
  } else if (tabId === 'probability') {
    loadProbabilityDashboard();
  } else if (tabId === 'admin') {
    loadAdminDashboard();
  } else if (tabId === 'final-predictions') {
    loadFinalPredictionsDashboard();
  } else if (tabId === 'admin-2') {
    loadAdmin2Dashboard();
  } else if (tabId === 'profile') {
    loadProfileDashboard();
  }
}

// --- DATA FETCHING & UI RENDERING ---

async function loadGroupsDashboard() {
  const grid = document.getElementById('groups-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando grupos del mundial...</div>`;

  try {
    if (state.matches.length === 0) {
      const response = await fetch(`${API_URL}/matches`, {
        headers: { 'x-user-id': state.currentUser.id }
      });
      state.matches = await response.json();
    }

    renderGroupsTables();
  } catch (error) {
    console.error("Error loading groups:", error);
    grid.innerHTML = `<div style="text-align: center; color: var(--red); padding: 2rem;">Error de conexión al cargar los grupos.</div>`;
  }
}

function renderGroupsTables() {
  const grid = document.getElementById('groups-grid');
  if (!grid) return;

  // 1. Group matches by their group field
  const groupsData = {}; // groupName -> { teamName -> { pg, pe, pp, pj, pts } }

  state.matches.forEach(match => {
    const groupName = match.group;
    if (!groupsData[groupName]) {
      groupsData[groupName] = {};
    }
    
    // Initialize stats for both teams
    [match.team1, match.team2].forEach(team => {
      if (!groupsData[groupName][team]) {
        groupsData[groupName][team] = { name: team, pj: 0, pg: 0, pe: 0, pp: 0, pts: 0 };
      }
    });

    // Update stats if match has a result
    if (match.result !== null) {
      const t1 = groupsData[groupName][match.team1];
      const t2 = groupsData[groupName][match.team2];

      t1.pj++;
      t2.pj++;

      if (match.result === 'L') {
        t1.pg++;
        t1.pts += 3;
        t2.pp++;
      } else if (match.result === 'E') {
        t1.pe++;
        t1.pts += 1;
        t2.pe++;
        t2.pts += 1;
      } else if (match.result === 'V') {
        t2.pg++;
        t2.pts += 3;
        t1.pp++;
      }
    }
  });

  // 2. Render each group table card
  const groupNames = Object.keys(groupsData).sort((a, b) => a.localeCompare(b));
  
  grid.innerHTML = groupNames.map(groupName => {
    const teamsList = Object.values(groupsData[groupName]).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.pg !== a.pg) return b.pg - a.pg;
      return a.name.localeCompare(b.name);
    });

    return `
      <div class="table-card glass-panel" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
        <h3 style="margin: 0; font-size: 1rem; font-family: var(--font-title); font-weight: 700; color: var(--gold); display: flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-list-ol"></i> ${groupName}
        </h3>
        <table class="leaderboard-table" style="font-size: 0.8rem; width: 100%;">
          <thead>
            <tr>
              <th style="width: 25px; text-align: center; font-size: 0.75rem;">Pos</th>
              <th style="text-align: left; font-size: 0.75rem;">Equipo</th>
              <th style="width: 30px; text-align: center; font-size: 0.75rem;" title="Partidos Jugados">PJ</th>
              <th style="width: 30px; text-align: center; font-size: 0.75rem;" title="Ganados">G</th>
              <th style="width: 30px; text-align: center; font-size: 0.75rem;" title="Empatados">E</th>
              <th style="width: 30px; text-align: center; font-size: 0.75rem;" title="Perdidos">P</th>
              <th style="width: 40px; text-align: center; font-size: 0.75rem; font-weight: 700; color: var(--gold);">Pts</th>
            </tr>
          </thead>
          <tbody>
            ${teamsList.map((team, idx) => {
              const pos = idx + 1;
              const isQualified = pos <= 2;
              const rankStyle = isQualified ? 'color: var(--success); font-weight: bold;' : 'color: var(--color-text-muted);';
              return `
                <tr>
                  <td style="text-align: center; ${rankStyle}">${pos}</td>
                  <td style="text-align: left; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${team.name}">${team.name}</td>
                  <td style="text-align: center;">${team.pj}</td>
                  <td style="text-align: center;">${team.pg}</td>
                  <td style="text-align: center;">${team.pe}</td>
                  <td style="text-align: center;">${team.pp}</td>
                  <td style="text-align: center; font-weight: 700; color: var(--gold);">${team.pts}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

function updateStatsBar() {
  // Update user score from backend data (we can find ourselves in the leaderboard later, or just fetch user details.
  // To keep it simple, we fetch the leaderboard, locate ourselves, and update points!
  fetch(`${API_URL}/leaderboard`, {
    headers: { 'x-user-id': state.currentUser.id }
  })
  .then(res => res.json())
  .then(leaderboard => {
    state.leaderboard = leaderboard;
    const me = leaderboard.find(u => u.id === state.currentUser.id);
    if (me) {
      state.currentUser.points = me.points;
      document.getElementById('user-display-points').textContent = `${me.points} pts`;
      localStorage.setItem('quiniela_user', JSON.stringify(state.currentUser));
    }
    // Render the leaderboard side and main tables
    renderLeaderboardTables();
  })
  .catch(err => console.error("Error refreshing points:", err));

  // Calculate prediction progress
  const totalMatches = 72;
  const predictedCount = Object.keys(state.predictions).length;
  const percentage = Math.round((predictedCount / totalMatches) * 100);

  // Update navbar mini-bar
  document.getElementById('mini-progress-bar').style.width = `${percentage}%`;
  document.getElementById('user-display-progress').textContent = `${predictedCount}/${totalMatches}`;

  // Update big progress card
  const fullText = document.getElementById('full-progress-text');
  const fullBar = document.getElementById('full-progress-bar');
  if (fullText && fullBar) {
    fullText.textContent = `${percentage}% (${predictedCount} de ${totalMatches} partidos)`;
    fullBar.style.width = `${percentage}%`;
  }
  refreshUnreadNotificationCount();
}

function renderMatchesGrid() {
  const grid = document.getElementById('matches-grid');
  const groupFilter = document.getElementById('group-filter').value;
  const searchQuery = document.getElementById('search-filter').value.toLowerCase().trim();

  // Filter matches
  let filtered = state.matches;

  if (groupFilter !== 'all') {
    filtered = filtered.filter(m => m.group === groupFilter);
  }

  if (searchQuery !== '') {
    filtered = filtered.filter(m => 
      m.team1.toLowerCase().includes(searchQuery) || 
      m.team2.toLowerCase().includes(searchQuery)
    );
  }

  const totalMatches = 72;
  const predictedCount = Object.keys(state.predictions).length;
  const isFull = predictedCount === totalMatches;

  // Toggle instructions visibility
  const instructionElement = document.getElementById('predictions-instruction');
  if (instructionElement) {
    instructionElement.style.display = isFull ? 'none' : 'block';
  }

  let completedBannerHtml = '';

  if (filtered.length === 0) {
    grid.innerHTML = completedBannerHtml + `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--color-text-muted);">
        <i class="fa-solid fa-face-frown" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--gold);"></i>
        <p>No se encontraron partidos para la búsqueda seleccionada.</p>
      </div>
    `;
    return;
  }

  // Generate match card HTML
  const matchesHtml = filtered.map(match => {
    const userPrediction = state.predictions[match.id] || null;
    const isCompleted = match.result !== null;

    // Selected class names
    const selLClass = userPrediction === 'L' ? 'selected-L' : '';
    const selEClass = userPrediction === 'E' ? 'selected-E' : '';
    const selVClass = userPrediction === 'V' ? 'selected-V' : '';

    // Generate mock flag/abbreviation text
    const flag1 = match.team1.substring(0, 3);
    const flag2 = match.team2.substring(0, 3);

    // Results Banner logic
    let resultBannerHtml = '';
    if (isCompleted) {
      if (userPrediction === match.result) {
        resultBannerHtml = `
          <div class="real-result-banner correct">
            <span><i class="fa-solid fa-circle-check"></i> ¡Acertaste el resultado!</span>
            <span>+3 pts</span>
          </div>
        `;
      } else if (userPrediction === null) {
        resultBannerHtml = `
          <div class="real-result-banner pending">
            <span><i class="fa-solid fa-circle-minus"></i> Sin pronóstico. Resultado: ${match.result}</span>
            <span>0 pts</span>
          </div>
        `;
      } else {
        const transResult = match.result === 'L' ? 'Gana Local' : (match.result === 'E' ? 'Empate' : 'Gana Visitante');
        resultBannerHtml = `
          <div class="real-result-banner incorrect">
            <span><i class="fa-solid fa-circle-xmark"></i> Fallaste. Resultado: ${transResult}</span>
            <span>0 pts</span>
          </div>
        `;
      }
    } else {
      resultBannerHtml = `
        <div class="real-result-banner pending">
          <span><i class="fa-solid fa-clock"></i> Partido por jugarse</span>
          <span>Pendiente</span>
        </div>
      `;
    }

    return `
      <div class="match-card ${userPrediction ? 'completed' : ''}" id="match-card-${match.id}">
        <div class="match-meta">
          <span class="match-group">${match.group}</span>
          <span class="match-date"><i class="fa-regular fa-calendar"></i> ${match.date}</span>
        </div>

        <div class="match-teams-layout">
          <div class="team-row">
            <div class="team-info">
              <div class="team-flag-mock">${flag1}</div>
              <span class="team-name">${match.team1}</span>
            </div>
            ${isCompleted && match.result === 'L' ? '<span class="badge badge-success">Ganador</span>' : ''}
          </div>
          
          <span class="match-vs">vs</span>

          <div class="team-row">
            <div class="team-info">
              <div class="team-flag-mock">${flag2}</div>
              <span class="team-name">${match.team2}</span>
            </div>
            ${isCompleted && match.result === 'V' ? '<span class="badge badge-success">Ganador</span>' : ''}
          </div>
        </div>

        <div class="match-options">
          <button class="opt-btn ${selLClass}" onclick="savePrediction(${match.id}, 'L')" ${(userPrediction !== null || isCompleted) ? 'disabled' : ''}>
            L <span class="opt-team-name" title="${match.team1}">${match.team1}</span>
          </button>
          <button class="opt-btn ${selEClass}" onclick="savePrediction(${match.id}, 'E')" ${(userPrediction !== null || isCompleted) ? 'disabled' : ''}>
            E <span class="opt-team-name">Empate</span>
          </button>
          <button class="opt-btn ${selVClass}" onclick="savePrediction(${match.id}, 'V')" ${(userPrediction !== null || isCompleted) ? 'disabled' : ''}>
            V <span class="opt-team-name" title="${match.team2}">${match.team2}</span>
          </button>
        </div>

        ${resultBannerHtml}
      </div>
    `;
  }).join('');

  grid.innerHTML = completedBannerHtml + matchesHtml;
}

function filterMatches() {
  renderMatchesGrid();
}

// Save prediction immediately
async function savePrediction(matchId, predictionValue) {
  const currentPrediction = state.predictions[matchId];
  if (currentPrediction !== undefined && currentPrediction !== null) {
    showToast("Este partido ya cuenta con un pronóstico guardado.", "error");
    return;
  }

  // Optimistic UI update
  state.predictions[matchId] = predictionValue;
  
  // Re-render only that card's styling and disable buttons immediately
  const card = document.getElementById(`match-card-${matchId}`);
  if (card) {
    const buttons = card.querySelectorAll('.opt-btn');
    buttons.forEach(btn => {
      btn.classList.remove('selected-L', 'selected-E', 'selected-V');
      btn.disabled = true; // Disable immediately to lock it
    });

    card.classList.add('completed');
    const targetBtnIndex = predictionValue === 'L' ? 0 : (predictionValue === 'E' ? 1 : 2);
    buttons[targetBtnIndex].classList.add(`selected-${predictionValue}`);
    
    // Temporary animation kick
    buttons[targetBtnIndex].style.transform = 'scale(0.95)';
    setTimeout(() => buttons[targetBtnIndex].style.transform = '', 100);
  }

  // Update progress bars
  updateStatsBar();

  try {
    const response = await fetch(`${API_URL}/predictions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({
        predictions: [{ matchId: matchId, prediction: predictionValue }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al guardar pronóstico", "error");
      // Revert state on error
      delete state.predictions[matchId];
      renderMatchesGrid();
      updateStatsBar();
    } else {
      showToast(`Partido #${matchId} guardado.`, "success");
    }
  } catch (error) {
    console.error("Save prediction error:", error);
    showToast("Error de red. No se guardó la predicción.", "error");
    // Revert state
    delete state.predictions[matchId];
    renderMatchesGrid();
    updateStatsBar();
  }
}

// --- LEADERBOARD & COMPARISONS ---

async function loadStreaks() {
  const container = document.getElementById('streaks-container');
  const content = document.getElementById('streaks-content');
  if (!container || !content) return;

  try {
    const res = await fetch(`${API_URL}/streaks`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    const data = await res.json();
    
    if (!data || !Array.isArray(data.buenaRacha) || !Array.isArray(data.malaRacha)) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    let html = '';

    // Buena
    if (data.buenaRacha.length > 0) {
      const top = data.buenaRacha[0];
      html += `
        <div class="racha-row-container">
          <div class="racha-row">
            <div class="racha-label-group"><span class="racha-emoji">😎</span><div class="racha-info"><span class="racha-title">Buena</span><span class="racha-user" title="${top.username}">${top.username}</span></div></div>
            <div class="racha-badge racha-buena" onclick="toggleStreaksTop3('buena')">${top.activeHits} <span class="seguidos-text"><i class="fa-solid fa-check"></i></span></div>
          </div>
          <div id="top3-buena" class="top3-list">
            ${data.buenaRacha.map((u, i) => `<div class="top3-item"><span class="top3-rank">${i+1}°</span><span class="top3-username" title="${u.username}">${u.username}</span><span class="top3-val">${u.activeHits} <span class="seguidos-text"><i class="fa-solid fa-check"></i></span></span></div>`).join('')}
          </div>
        </div>`;
    }

    // Mala
    if (data.malaRacha.length > 0) {
      const top = data.malaRacha[0];
      html += `
        <div class="racha-row-container">
          <div class="racha-row">
            <div class="racha-label-group"><span class="racha-emoji">😢</span><div class="racha-info"><span class="racha-title">Mala</span><span class="racha-user" title="${top.username}">${top.username}</span></div></div>
            <div class="racha-badge racha-mala" onclick="toggleStreaksTop3('mala')">${top.activeMisses} <span class="seguidos-text"><i class="fa-solid fa-xmark"></i></span></div>
          </div>
          <div id="top3-mala" class="top3-list">
            ${data.malaRacha.map((u, i) => `<div class="top3-item"><span class="top3-rank">${i+1}°</span><span class="top3-username" title="${u.username}">${u.username}</span><span class="top3-val">${u.activeMisses} <span class="seguidos-text"><i class="fa-solid fa-xmark"></i></span></span></div>`).join('')}
          </div>
        </div>`;
    }
    content.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.style.display = 'none';
  }
}

function toggleStreaksTop3(type) {
  const el = document.getElementById(`top3-${type}`);
  if (el) el.classList.toggle('active');
}

async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando tabla de posiciones...</td></tr>`;

  try {
    const response = await fetch(`${API_URL}/leaderboard`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    
    state.leaderboard = await response.json();
    
    if (state.leaderboard.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No hay participantes registrados.</td></tr>`;
      return;
    }

    renderLeaderboardTables();
    loadVotingTrends();
    loadStreaks();
  } catch (error) {
    console.error("Error loading leaderboard:", error);
    showToast("Error al cargar la tabla de posiciones", "error");
  }
}

// Render both main tab table and sidebar panel table
function renderLeaderboardTables() {
  const tbody = document.getElementById('leaderboard-body');
  const sideTbody = document.getElementById('side-leaderboard-body');
  
  if (!state.leaderboard || state.leaderboard.length === 0) return;

  // 1. Render main tab table (Detailed version)
  if (tbody) {
    tbody.innerHTML = state.leaderboard.filter(player => player.username !== 'invitado').map((player, index) => {
      const position = index + 1;
      let rankBadgeClass = 'rank-other';
      if (position === 1) rankBadgeClass = 'rank-1';
      else if (position === 2) rankBadgeClass = 'rank-2';
      else if (position === 3) rankBadgeClass = 'rank-3';

      const isMe = player.id === state.currentUser.id;
      const canView = true;
      const clickHandler = `onclick="viewPlayerPredictions('${player.id}')"`;
      const rowClass = 'clickable';
      const highlightRowStyle = isMe ? 'background: rgba(245, 158, 11, 0.05); font-weight: 600;' : '';
      const adminBadge = player.isAdmin ? '<span class="badge badge-error" style="font-size: 0.6rem; padding: 0.1rem 0.3rem; margin-left: 0.5rem;">Admin</span>' : '';

      return `
        <tr class="${rowClass}" style="${highlightRowStyle}" ${clickHandler}>
          <td style="text-align: center;">
            <div class="rank-badge ${rankBadgeClass}">${position}</div>
          </td>
          <td>
            <div class="player-info-cell ${player.isAdmin ? 'is-admin' : ''}" style="display: flex; align-items: center; gap: 0.5rem;">
              <img src="${player.profilePic || 'avatar.png'}" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--gold);">
              <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: nowrap; white-space: nowrap;">
                <span class="player-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${player.username} ${isMe ? '(Tú)' : ''}">${player.username} ${isMe ? '(Tú)' : ''}</span>
                ${adminBadge}
              </div>
            </div>
          </td>
          <td style="text-align: center; font-family: var(--font-title); font-weight: 700; color: ${isMe ? 'var(--gold)' : 'inherit'}">
            ${player.points} pts
          </td>
        </tr>
      `;
    }).join('');
  }

  // 2. Render side sticky table (Compact version)
  if (sideTbody) {
    sideTbody.innerHTML = state.leaderboard.filter(player => player.username !== 'invitado').map((player, index) => {
      const position = index + 1;
      let rankBadgeClass = 'rank-other';
      if (position === 1) rankBadgeClass = 'rank-1';
      else if (position === 2) rankBadgeClass = 'rank-2';
      else if (position === 3) rankBadgeClass = 'rank-3';

      const isMe = player.id === state.currentUser.id;
      const canView = true;
      const clickHandler = `onclick="viewPlayerPredictions('${player.id}')"`;
      const rowClass = 'clickable';
      const highlightRowStyle = isMe ? 'background: rgba(245, 158, 11, 0.05); font-weight: 600;' : '';

      return `
        <tr class="${rowClass}" style="${highlightRowStyle}" ${clickHandler}>
          <td style="text-align: center;">
            <div class="rank-badge ${rankBadgeClass}">${position}</div>
          </td>
          <td>
            <div class="player-info-cell" style="display: flex; align-items: center; gap: 0.5rem;">
              <img src="${player.profilePic || 'avatar.png'}" alt="Avatar" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--gold);">
              <span class="player-name" style="font-weight: ${isMe ? '700' : '600'}; color: ${isMe ? 'var(--gold)' : 'inherit'};">
                ${player.username} ${isMe ? '(Tú)' : ''}
              </span>
            </div>
          </td>
          <td style="text-align: center; font-family: var(--font-title); font-weight: 700; color: ${isMe ? 'var(--gold)' : 'inherit'}">
            ${player.points} pts
          </td>
        </tr>
      `;
    }).join('');
  }
}

async function loadGoleadores() {
  const tbody = document.getElementById('goleadores-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 3rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando tabla de goleadores...</td></tr>`;

  try {
    const response = await fetch(`${API_URL}/top-scorers`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    
    const scorers = await response.json();
    
    if (scorers.error) {
      showToast(scorers.error, "error");
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--red);">${scorers.error}</td></tr>`;
      return;
    }

    if (scorers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">Aún no hay goles registrados en el torneo.</td></tr>`;
      return;
    }

    tbody.innerHTML = scorers.map((scorer) => {
      return `
        <tr>
          <td style="padding: 0.65rem 1rem;">
            <div style="font-weight: 600; font-size: 0.82rem; color: var(--color-text-main);">
              ${scorer.name}
            </div>
          </td>
          <td style="padding: 0.65rem 1rem;">
            <div style="font-weight: 500; font-size: 0.8rem; color: var(--color-text-muted);">
              ${scorer.team}
            </div>
          </td>
          <td style="text-align: center; padding: 0.65rem 1rem; font-family: var(--font-title); font-weight: 700; color: var(--gold); font-size: 0.82rem; width: 90px;">
            ${scorer.goals}
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error("Error loading top scorers:", error);
    showToast("Error al cargar la tabla de goleadores", "error");
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--red);">Error de red al cargar goleadores.</td></tr>`;
  }
}

// Open comparison details of user
async function viewPlayerPredictions(targetUserId) {
  // If target matches are empty, load matches first
  if (state.matches.length === 0) {
    const matchesRes = await fetch(`${API_URL}/matches`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    state.matches = await matchesRes.json();
  }

  const modal = document.getElementById('comparison-modal');
  const modalTitle = document.getElementById('modal-user-title');
  const modalSubtitle = document.getElementById('modal-user-subtitle');
  const comparisonGrid = document.getElementById('modal-comparison-grid');

  comparisonGrid.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--color-text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando predicciones de jugador...</div>`;
  modal.style.display = 'flex';

  try {
    const response = await fetch(`${API_URL}/predictions/user/${targetUserId}`, {
      headers: { 'x-user-id': state.currentUser.id }
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "No se pudieron obtener los pronósticos", "error");
      closeComparisonModal();
      return;
    }

    modalTitle.textContent = `Panel de Pronósticos: ${data.username}`;
    modalSubtitle.textContent = `Puntos acumulados: ${data.points} pts | Partidos pronosticados: ${Object.keys(data.predictions).length} de 72`;

    comparisonGrid.innerHTML = state.matches.map(match => {
      const bet = data.predictions[match.id] || null;
      const real = match.result;
      const isCompleted = real !== null;

      let scoreClass = 'pts-pending';
      let rowStatusClass = '';
      let pointsText = 'Pendiente';

      if (isCompleted) {
        if (bet === real) {
          scoreClass = 'pts-3';
          rowStatusClass = 'correct';
          pointsText = '+3 pts';
        } else {
          scoreClass = 'pts-0';
          rowStatusClass = 'incorrect';
          pointsText = '0 pts';
        }
      }

      const betValClass = bet ? `val-${bet}` : 'val-none';
      const realValClass = real ? `val-${real}` : 'val-none';

      return `
        <div class="comp-row ${rowStatusClass}">
          <div class="comp-match-info">
            <span class="comp-match-id">#${match.id}</span>
            <div class="comp-teams">
              <span class="comp-team-l">${match.team1}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); font-style: italic;">vs</span>
              <span class="comp-team-v">${match.team2}</span>
            </div>
          </div>

          <div class="comp-results-block">
            <div class="comp-bet">
              <span class="comp-label">Pronóstico</span>
              <span class="comp-val ${betValClass}">${bet || '-'}</span>
            </div>
            <div class="comp-real">
              <span class="comp-label">Resultado</span>
              <span class="comp-val ${realValClass}">${real || '-'}</span>
            </div>
            <div class="comp-score-badge ${scoreClass}">
              ${pointsText}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Error loading user predictions detail:", error);
    showToast("Error de conexión al cargar pronósticos del jugador", "error");
    closeComparisonModal();
  }
}

function closeComparisonModal() {
  document.getElementById('comparison-modal').style.display = 'none';
}

// Close modal when clicking outside contents
window.onclick = function(event) {
  const modal = document.getElementById('comparison-modal');
  const editModal = document.getElementById('edit-predictions-modal');
  const pwaModal = document.getElementById('pwa-install-modal');
  const trendsModal = document.getElementById('trends-voters-modal');
  const announcementModal = document.getElementById('info-announcement-modal');
  const completeTrendsModal = document.getElementById('complete-trends-modal');
  const cropperModal = document.getElementById('cropper-modal');
  if (event.target === modal) {
    closeComparisonModal();
  } else if (event.target === editModal) {
    closeEditPredictionsModal();
  } else if (event.target === pwaModal) {
    closePwaModal();
  } else if (event.target === trendsModal) {
    closeTrendsVotersModal();
  } else if (event.target === announcementModal) {
    closeAnnouncementModal();
  } else if (event.target === completeTrendsModal) {
    closeCompleteTrendsModal();
  } else if (event.target === cropperModal) {
    closeCropperModal();
  }
};

let currentTrendsData = [];

async function loadVotingTrends() {
  const container = document.getElementById('trends-container');
  const grid = document.getElementById('trends-grid');
  
  const tabTrendsContainer = document.getElementById('tab-trends-container');
  const tabTrendsGrid = document.getElementById('tab-trends-grid');

  try {
    const res = await fetch(`${API_URL}/matches/trends`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    if (!res.ok) throw new Error("Error fetching trends");
    
    currentTrendsData = await res.json();
    
    if (currentTrendsData.length === 0) {
      if (container) container.style.display = 'none';
      if (tabTrendsContainer) tabTrendsContainer.style.display = 'none';
      return;
    }
    
    // 1. Render for "Posiciones" tab (only the first 4 next unplayed matches)
    const next4 = currentTrendsData.slice(0, 4);
    if (next4.length === 0) {
      if (container) container.style.display = 'none';
    } else {
      if (container && grid) {
        container.style.display = 'block';
        grid.innerHTML = next4.map((match, idx) => {
          return `
            <div class="trend-card">
              <div class="trend-teams-row">
                <span>${match.team1}</span>
                <span style="color: var(--color-text-muted); font-size: 0.75rem; font-style: italic; margin: 0 0.5rem;">vs</span>
                <span>${match.team2}</span>
              </div>
              <div class="trend-votes-row">
                <div class="trend-vote-box" onclick="showTrendsVoters(${idx}, 'L')">
                  <span class="trend-vote-label">Local</span>
                  <span class="trend-vote-count">${match.stats.L.count}</span>
                </div>
                <div class="trend-vote-box" onclick="showTrendsVoters(${idx}, 'E')">
                  <span class="trend-vote-label">Empate</span>
                  <span class="trend-vote-count">${match.stats.E.count}</span>
                </div>
                <div class="trend-vote-box" onclick="showTrendsVoters(${idx}, 'V')">
                  <span class="trend-vote-label">Visitante</span>
                  <span class="trend-vote-count">${match.stats.V.count}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');

        // Apply collapsed state if saved in localStorage
        const isCollapsed = localStorage.getItem('trends_collapsed') !== 'false';
        const toggleIcon = document.getElementById('trends-toggle-icon');
        const titleH3 = container.querySelector('h3');
        if (isCollapsed) {
          grid.style.display = 'none';
          if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
          if (titleH3) titleH3.style.marginBottom = '0';
        } else {
          grid.style.display = 'grid';
          if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
          if (titleH3) titleH3.style.marginBottom = '0.55rem';
        }
      }
    }
    
    // 2. Render all trends in "Tendencia" tab (unified grid)
    if (tabTrendsContainer && tabTrendsGrid) {
      tabTrendsContainer.style.display = 'block';
      tabTrendsGrid.innerHTML = currentTrendsData.map((match, idx) => {
        return `
          <div class="trend-card">
            <div class="trend-teams-row">
              <span>${match.team1}</span>
              <span style="color: var(--color-text-muted); font-size: 0.75rem; font-style: italic; margin: 0 0.5rem;">vs</span>
              <span>${match.team2}</span>
            </div>
            <div class="trend-votes-row">
              <div class="trend-vote-box" onclick="showTrendsVoters(${idx}, 'L')">
                <span class="trend-vote-label">Local</span>
                <span class="trend-vote-count">${match.stats.L.count}</span>
              </div>
              <div class="trend-vote-box" onclick="showTrendsVoters(${idx}, 'E')">
                <span class="trend-vote-label">Empate</span>
                <span class="trend-vote-count">${match.stats.E.count}</span>
              </div>
              <div class="trend-vote-box" onclick="showTrendsVoters(${idx}, 'V')">
                <span class="trend-vote-label">Visitante</span>
                <span class="trend-vote-count">${match.stats.V.count}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error("Error loading voting trends:", error);
    if (container) container.style.display = 'none';
    if (tabTrendsContainer) tabTrendsContainer.style.display = 'none';
  }
}

function toggleTrendsGrid() {
  const grid = document.getElementById('trends-grid');
  const icon = document.getElementById('trends-toggle-icon');
  const title = document.querySelector('.trends-section h3');
  if (!grid || !icon) return;

  const isCollapsed = grid.style.display === 'none';
  if (isCollapsed) {
    grid.style.display = 'grid';
    icon.style.transform = 'rotate(0deg)';
    if (title) title.style.marginBottom = '0.55rem';
    localStorage.setItem('trends_collapsed', 'false');
  } else {
    grid.style.display = 'none';
    icon.style.transform = 'rotate(180deg)';
    if (title) title.style.marginBottom = '0';
    localStorage.setItem('trends_collapsed', 'true');
  }
}

function showTrendsVoters(matchIndex, predictionType) {
  const match = currentTrendsData[matchIndex];
  if (!match) return;

  const optionName = predictionType === 'L' ? 'Local' : (predictionType === 'E' ? 'Empate' : 'Visitante');
  const predictionStats = match.stats[predictionType];
  if (!predictionStats) return;

  const modal = document.getElementById('trends-voters-modal');
  const modalTitle = document.getElementById('trends-modal-title');
  const modalSubtitle = document.getElementById('trends-modal-subtitle');
  const votersList = document.getElementById('trends-voters-list');

  if (!modal || !modalTitle || !modalSubtitle || !votersList) return;

  modalTitle.textContent = `${match.team1} vs ${match.team2}`;
  modalSubtitle.textContent = `Votaron por ${optionName} (${predictionStats.count} personas)`;

  if (predictionStats.users.length === 0) {
    votersList.innerHTML = `<li style="text-align: center; color: var(--color-text-muted); padding: 1rem 0; font-size: 0.85rem;">Nadie pronosticó esta opción.</li>`;
  } else {
    votersList.innerHTML = predictionStats.users.map(u => {
      const name = typeof u === 'object' ? u.username : u;
      const pic = (typeof u === 'object' && u.profilePic) ? u.profilePic : 'avatar.png';
      return `
        <li style="padding: 0.5rem 0.75rem; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; font-size: 0.85rem; color: var(--color-text-main); font-weight: 500; display: flex; align-items: center; gap: 0.5rem;">
          <img src="${pic}" alt="Avatar" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gold);">
          ${name}
        </li>
      `;
    }).join('');
  }

  modal.style.display = 'flex';
}

function closeTrendsVotersModal() {
  const modal = document.getElementById('trends-voters-modal');
  if (modal) modal.style.display = 'none';
}

window.openCompleteTrendsModal = async function() {
  const modal = document.getElementById('complete-trends-modal');
  const grid = document.getElementById('complete-trends-grid');
  const title = modal ? modal.querySelector('h3') : null;
  const desc = modal ? modal.querySelector('p') : null;
  if (!modal || !grid) return;

  modal.style.display = 'flex';
  grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--color-text-muted);">
    <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--gold); margin-bottom: 0.5rem;"></i>
    <p>Cargando tendencias...</p>
  </div>`;

  const isPhase2 = (state.activeTab === 'new-panel');
  const url = isPhase2 ? '/api/phase2/matches/trends/all' : `${API_URL}/matches/trends/all`;

  if (title) {
    title.innerHTML = isPhase2 
      ? `<i class="fa-solid fa-chart-line"></i> Tendencias Completas (Fase Final)` 
      : `<i class="fa-solid fa-chart-line"></i> Tendencias Completas (Fase 1)`;
  }
  if (desc) {
    desc.textContent = isPhase2 
      ? "Porcentaje y cantidad de votos por cada encuentro de la Fase Final" 
      : "Porcentaje y cantidad de votos por cada encuentro";
  }

  try {
    const res = await fetch(url, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    if (!res.ok) throw new Error("Error loading complete trends");
    const data = await res.json();
    
    window.completeTrendsData = data;

    grid.innerHTML = data.map((match, idx) => {
      const isPlayed = match.result !== null;
      const resultBadge = isPlayed ? `<span class="badge" style="background: rgba(255, 255, 255, 0.05); color: var(--color-text-muted); font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); margin-left: 0.5rem;">Jugado</span>` : '';
      const groupLabel = match.group || 'Fase Final';

      return `
        <div class="trend-card" style="${isPlayed ? 'opacity: 0.8;' : ''}">
          <div class="trend-teams-row" style="justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.35rem; margin-bottom: 0.35rem;">
            <span style="font-weight: 700; font-size: 0.75rem; color: var(--gold);">${groupLabel} - Partido ${match.matchId} ${resultBadge}</span>
          </div>
          <div class="trend-teams-row" style="font-size: 0.8rem; font-weight: 600;">
            <span>${match.team1 || 'Por definir'}</span>
            <span style="color: var(--color-text-muted); font-size: 0.7rem; font-style: italic; margin: 0 0.4rem;">vs</span>
            <span>${match.team2 || 'Por definir'}</span>
          </div>
          <div class="trend-votes-row" style="margin-top: 0.4rem;">
            <div class="trend-vote-box" onclick="showCompleteTrendsVoters(${idx}, 'L')">
              <span class="trend-vote-label">Local</span>
              <span class="trend-vote-count">${match.stats.L.count}</span>
            </div>
            <div class="trend-vote-box" onclick="showCompleteTrendsVoters(${idx}, 'E')">
              <span class="trend-vote-label">Empate</span>
              <span class="trend-vote-count">${match.stats.E.count}</span>
            </div>
            <div class="trend-vote-box" onclick="showCompleteTrendsVoters(${idx}, 'V')">
              <span class="trend-vote-label">Visitante</span>
              <span class="trend-vote-count">${match.stats.V.count}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error("Error fetching all trends:", error);
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--red);">Error al cargar tendencias.</div>`;
  }
};

window.closeCompleteTrendsModal = function() {
  const modal = document.getElementById('complete-trends-modal');
  if (modal) modal.style.display = 'none';
};

window.showCompleteTrendsVoters = function(matchIndex, predictionType) {
  const match = window.completeTrendsData[matchIndex];
  if (!match) return;

  const optionName = predictionType === 'L' ? 'Local' : (predictionType === 'E' ? 'Empate' : 'Visitante');
  const predictionStats = match.stats[predictionType];
  if (!predictionStats) return;

  const modal = document.getElementById('trends-voters-modal');
  const modalTitle = document.getElementById('trends-modal-title');
  const modalSubtitle = document.getElementById('trends-modal-subtitle');
  const votersList = document.getElementById('trends-voters-list');

  if (!modal || !modalTitle || !modalSubtitle || !votersList) return;

  modalTitle.textContent = `${match.team1} vs ${match.team2}`;
  modalSubtitle.textContent = `Votaron por ${optionName} (${predictionStats.count} personas)`;

  const voters = predictionStats.users || [];
  if (voters.length === 0) {
    votersList.innerHTML = '<li style="color: var(--color-text-muted); font-size: 0.85rem; text-align: center; padding: 1rem;">Nadie votó por esta opción</li>';
  } else {
    votersList.innerHTML = voters.map(u => {
      const name = typeof u === 'object' ? u.username : u;
      const pic = (typeof u === 'object' && u.profilePic) ? u.profilePic : 'avatar.png';
      const scoreSuffix = (typeof u === 'object' && u.score) ? ` (${u.score})` : '';
      return `
        <li class="voter-item" style="padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; font-weight: 600; text-transform: capitalize; display: flex; align-items: center; gap: 0.5rem;">
          <img src="${pic}" alt="Avatar" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gold);">
          <span>${name}${scoreSuffix}</span>
        </li>
      `;
    }).join('');
  }

  modal.style.zIndex = '1800';
  modal.style.display = 'flex';
};

function checkAnnouncementModal() {
  // Modal desactivado
  return;
}

function closeAnnouncementModal() {
  const modal = document.getElementById('info-announcement-modal');
  if (modal) modal.style.display = 'none';
}

// --- ADMIN DASHBOARD ---

async function loadAdminDashboard() {
  const list = document.getElementById('admin-matches-list');
  list.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando partidos para administración...</div>`;

  try {
    const response = await fetch(`${API_URL}/matches`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    
    state.matches = await response.json();
    renderAdminMatchesList();

    // Also load and render users
    await loadAdminUsers();
  } catch (error) {
    console.error("Admin matches fetch error:", error);
    showToast("Error de conexión al cargar partidos", "error");
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando usuarios...</td></tr>`;

  try {
    const response = await fetch(`${API_URL}/admin/users`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--red);">Error al cargar usuarios.</td></tr>`;
      return;
    }

    const users = await response.json();
    
    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No hay usuarios registrados.</td></tr>`;
      return;
    }

    // Render users table
    tbody.innerHTML = users.map(user => {
      const isMe = user.id === state.currentUser.id;
      const roleText = user.isAdmin ? '<span class="badge badge-error">Admin</span>' : '<span class="badge badge-success">Jugador</span>';
      
      // Delete button: disabled for oneself or other admins
      const deleteBtnDisabled = (isMe || user.isAdmin) ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : '';
      const deleteBtnTitle = isMe ? 'No puedes eliminarte a ti mismo' : (user.isAdmin ? 'No se pueden eliminar administradores' : 'Eliminar usuario');

      return `
        <tr>
          <td>
            <div class="player-info-cell" style="justify-content: flex-start; gap: 0.75rem; display: flex; align-items: center;">
              <img src="${user.profilePic || 'avatar.png'}" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--gold);">
              <div style="text-align: left;">
                <span class="player-name" style="display: block; font-weight: 600;">${user.username} ${isMe ? '(Tú)' : ''}</span>
                <span class="player-email" style="display: block; font-size: 0.75rem; color: var(--color-text-muted);">${user.email || 'Sin correo'}</span>
              </div>
            </div>
          </td>
          <td style="text-align: center; font-family: var(--font-title); font-weight: 700; color: ${isMe ? 'var(--gold)' : 'inherit'}">
            ${user.points || 0} pts
          </td>
          <td style="text-align: center; display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
            <button class="btn btn-primary" onclick="openEditPredictionsModal('${user.id}', '${user.username}')" style="padding: 0.4rem 0.6rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; font-size: 0.8rem; border-radius: 6px;">
              <i class="fa-solid fa-pen-to-square"></i> Editar Pronósticos
            </button>
            <button class="btn btn-primary" onclick="adminResetUserPassword('${user.id}', '${user.username}')" style="padding: 0.4rem 0.6rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; font-size: 0.8rem; border-radius: 6px; background-color: #3b82f6; border-color: #3b82f6;">
              <i class="fa-solid fa-key"></i> Nueva Contraseña
            </button>
            <button class="btn btn-outline" onclick="deleteUser('${user.id}', '${user.username}')" ${deleteBtnDisabled} title="${deleteBtnTitle}" style="padding: 0.4rem 0.6rem; border-color: var(--red); color: var(--red); display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; font-size: 0.8rem; border-radius: 6px;">
              <i class="fa-solid fa-trash-can"></i> Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error("Error loading admin users:", error);
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--red);">Error de red al cargar usuarios.</td></tr>`;
  }
}

async function deleteUser(userId, username) {
  const confirmation = confirm(`¿Estás seguro de que deseas eliminar al usuario "${username}"?\n\nEsta acción eliminará su cuenta, todos sus pronósticos y notificaciones de forma permanente. Esta acción no se puede deshacer.`);
  if (!confirmation) return;

  try {
    const response = await fetch(`${API_URL}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': state.currentUser.id
      }
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al eliminar usuario", "error");
      return;
    }

    showToast(`Usuario "${username}" eliminado exitosamente.`, "success");
    
    // Reload users list
    loadAdminUsers();
    
    // Refresh leaderboard state
    fetch(`${API_URL}/leaderboard`, {
      headers: { 'x-user-id': state.currentUser.id }
    })
    .then(res => res.json())
    .then(leaderboard => {
      state.leaderboard = leaderboard;
      renderLeaderboardTables();
    })
    .catch(err => console.error("Error refreshing leaderboard after delete:", err));

  } catch (error) {
    console.error("Error deleting user:", error);
    showToast("Error de conexión al eliminar usuario", "error");
  }
}

function renderAdminMatchesList() {
  const list = document.getElementById('admin-matches-list');

  // Ocultar los resultados registrados (matches that already have a result)
  let filtered = state.matches.filter(m => !m.result);

  list.innerHTML = filtered.map(match => {
    const actL = match.result === 'L' ? 'active-L' : '';
    const actE = match.result === 'E' ? 'active-E' : '';
    const actV = match.result === 'V' ? 'active-V' : '';

    return `
      <div class="admin-match-row">
        <div class="admin-match-info">
          <span class="admin-match-id">${match.id}</span>
          <div class="admin-match-teams">
            <span class="admin-team-l">${match.team1}</span>
            <span style="color: var(--color-text-muted); font-size: 0.8rem; font-style: italic;">vs</span>
            <span class="admin-team-v">${match.team2}</span>
          </div>
        </div>

        <div class="admin-match-meta">
          <span class="group-label">${match.group}</span>
          <span>${match.date}</span>
        </div>

        <div class="admin-controls">
          <div class="admin-result-buttons">
            <button class="admin-opt-btn ${actL}" onclick="saveAdminResult(${match.id}, 'L')">L</button>
            <button class="admin-opt-btn ${actE}" onclick="saveAdminResult(${match.id}, 'E')">E</button>
            <button class="admin-opt-btn ${actV}" onclick="saveAdminResult(${match.id}, 'V')">V</button>
          </div>
          ${match.result !== null ? `
            <button class="admin-clear-btn" onclick="saveAdminResult(${match.id}, null)" title="Borrar resultado">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}



async function saveAdminResult(matchId, resultValue) {
  try {
    const response = await fetch(`${API_URL}/admin/matches/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ matchId: matchId, result: resultValue })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al actualizar resultado real", "error");
      return;
    }

    showToast(`Resultado del partido #${matchId} guardado. Puntos recalculados.`, "success");
    
    // Refresh admin list and state
    loadAdminDashboard();
  } catch (error) {
    console.error("Admin save error:", error);
    showToast("Error de conexión al guardar resultado", "error");
  }
}

async function syncFifaScores() {
  const syncBtn = document.getElementById('sync-fifa-btn');
  if (!syncBtn) return;
  const originalHtml = syncBtn.innerHTML;
  
  // Disable button and show spinner
  syncBtn.disabled = true;
  syncBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Sincronizando...`;
  
  try {
    const response = await fetch(`${API_URL}/admin/matches/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      }
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al sincronizar resultados", "error");
      return;
    }

    const { checked, updated } = data.stats;
    showToast(`Sincronización terminada. Se revisaron ${checked} partidos y se actualizaron ${updated} nuevos resultados.`, "success");
    
    // Refresh admin list and state
    loadAdminDashboard();
  } catch (error) {
    console.error("Sync error:", error);
    showToast("Error de conexión al sincronizar con FIFA", "error");
  } finally {
    // Restore button state
    syncBtn.disabled = false;
    syncBtn.innerHTML = originalHtml;
  }
}

async function sendBroadcastNotification() {
  const broadcastBtn = document.getElementById('broadcast-btn');
  if (!broadcastBtn) return;
  const originalHtml = broadcastBtn.innerHTML;

  const titleInput = document.getElementById('broadcast-title').value.trim();
  const bodyInput = document.getElementById('broadcast-body').value.trim();

  if (!titleInput || !bodyInput) {
    showToast("Por favor, completa el título y el mensaje.", "error");
    return;
  }

  broadcastBtn.disabled = true;
  broadcastBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...`;

  try {
    const response = await fetch(`${API_URL}/admin/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ title: titleInput, body: bodyInput })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al enviar mensaje masivo", "error");
      return;
    }

    const { inAppSent, pushSent } = data.stats;
    showToast(`Mensaje enviado con éxito a ${inAppSent} usuarios (${pushSent} push en segundo plano).`, "success");
    
    // Clear message body
    document.getElementById('broadcast-body').value = '';
  } catch (error) {
    console.error("Broadcast error:", error);
    showToast("Error de conexión al enviar mensaje masivo", "error");
  } finally {
    broadcastBtn.disabled = false;
    broadcastBtn.innerHTML = originalHtml;
  }
}

// --- TOAST NOTIFICATIONS ENGINE ---

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color: var(--emerald);"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--red);"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // Auto remove toast
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// --- FLOATING BACK TO TOP BUTTON & BOTTOM NAV SCROLL LOGIC ---

let lastScrollTop = 0;

window.addEventListener('scroll', () => {
  const btn = document.getElementById('back-to-top-btn');
  if (btn) {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }

  const bottomNav = document.getElementById('bottom-nav-bar');
  if (bottomNav) {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > lastScrollTop && scrollTop > 100) {
      // Scrolling down -> hide bottom nav
      bottomNav.classList.add('nav-hidden');
    } else {
      // Scrolling up -> show bottom nav
      bottomNav.classList.remove('nav-hidden');
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
  }
}, { passive: true });

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// --- NOTIFICATIONS CLIENT LOGIC ---

let notificationsInterval = null;

function toggleNotificationsPanel() {
  const modal = document.getElementById('notifications-modal');
  if (!modal) return;
  
  if (modal.style.display === 'flex') {
    modal.style.display = 'none';
  } else {
    modal.style.display = 'flex';
    loadNotifications();
    
    // Check push support and display button accordingly
    const enablePushBtn = document.getElementById('enable-push-btn');
    if (enablePushBtn) {
      if ('Notification' in window && 'serviceWorker' in navigator && Notification.permission !== 'granted') {
        enablePushBtn.style.display = 'block';
      } else {
        enablePushBtn.style.display = 'none';
      }
    }
  }
}

async function refreshUnreadNotificationCount() {
  if (!state.currentUser) return;
  try {
    const response = await fetch(`${API_URL}/notifications`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    if (!response.ok) return;
    const notifications = await response.json();
    const unreadCount = notifications.filter(n => !n.read).length;
    
    const badge = document.getElementById('notification-badge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error("Error checking notification count:", err);
  }
}

async function loadNotifications() {
  // Check push support and display banner accordingly
  const containerEl = document.getElementById('enable-push-btn-container');
  if (containerEl) {
    if ('Notification' in window && 'serviceWorker' in navigator && Notification.permission !== 'granted') {
      containerEl.style.display = 'block';
    } else {
      containerEl.style.display = 'none';
    }
  }

  const listEl = document.getElementById('notifications-list');
  if (!listEl) return;
  
  listEl.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 1rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando notificaciones...</div>`;
  
  try {
    const response = await fetch(`${API_URL}/notifications`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    if (!response.ok) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--red); padding: 1rem;">Error al cargar notificaciones.</div>`;
      return;
    }
    const notifications = await response.json();
    
    if (notifications.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: var(--color-text-muted); padding: 2rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
          <i class="fa-regular fa-bell-slash" style="font-size: 2rem; color: var(--color-text-muted); opacity: 0.5;"></i>
          <p style="font-size: 0.85rem; margin: 0; line-height: 1.4;">No tienes notificaciones todavía.</p>
          <p style="font-size: 0.75rem; color: var(--color-text-muted); margin: 0; line-height: 1.3;">Cuando se publiquen los resultados oficiales de los partidos, recibirás aquí el resumen de tus puntos.</p>
        </div>
      `;
      return;
    }
    
    listEl.innerHTML = notifications.map(n => {
      const isSuccess = n.title.includes('Felicidades');
      const iconClass = isSuccess ? 'fa-circle-check success' : 'fa-circle-xmark danger';
      const wrapperClass = isSuccess ? 'success' : 'danger';
      const itemClass = !n.read ? (isSuccess ? 'notification-item unread unread-success' : 'notification-item unread unread-danger') : 'notification-item';
      
      const timeStr = new Date(n.createdAt).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      
      return `
        <div class="${itemClass}" data-id="${n.id}">
          <div class="notification-icon-wrapper ${wrapperClass}">
            <i class="fa-solid ${iconClass}"></i>
          </div>
          <div class="notification-item-content">
            <div class="notification-item-title">${n.title}</div>
            <div class="notification-item-body">${n.body}</div>
            <span class="notification-item-time">${timeStr}</span>
          </div>
        </div>
      `;
    }).join('');
    
    // Initialize swipe listeners for touch delete
    initSwipeToDelete();
    
  } catch (err) {
    console.error("Error rendering notifications:", err);
    listEl.innerHTML = `<div style="text-align: center; color: var(--red); padding: 1rem;">Error de conexión.</div>`;
  }
}

function initSwipeToDelete() {
  const items = document.querySelectorAll('.notification-item');
  items.forEach(item => {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    const notificationId = item.getAttribute('data-id');

    item.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      item.style.transition = 'none';
      isSwiping = false;
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const diffX = touchX - startX;
      const diffY = touchY - startY;

      // Check if horizontal gesture is dominant
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        isSwiping = true;
        currentX = diffX;
        
        // Translate node
        item.style.transform = `translateX(${diffX}px)`;
        const opacity = Math.max(0.1, 1 - Math.abs(diffX) / 250);
        item.style.opacity = opacity;
        
        // Prevent page scroll when swiping horizontally
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    item.addEventListener('touchend', () => {
      if (!isSwiping) return;
      
      const threshold = 120; // swipe threshold to delete
      item.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease';

      if (Math.abs(currentX) > threshold) {
        // Slide out in swipe direction
        const direction = currentX > 0 ? 1 : -1;
        item.style.transform = `translateX(${direction * 120}%)`;
        item.style.opacity = '0';
        
        // Collapse height and delete
        setTimeout(() => {
          deleteNotificationClient(notificationId, item);
        }, 300);
      } else {
        // Bounce back
        item.style.transform = 'translateX(0)';
        item.style.opacity = '1';
      }
    }, { passive: true });
  });
}

async function deleteNotificationClient(notificationId, element) {
  // Collapse element height smoothly
  element.style.transition = 'all 0.3s ease';
  element.style.height = `${element.offsetHeight}px`;
  // Force layout recalculation
  element.offsetHeight;
  
  element.style.height = '0';
  element.style.padding = '0';
  element.style.margin = '0';
  element.style.border = 'none';
  element.style.overflow = 'hidden';
  
  setTimeout(() => {
    element.remove();
    // Check if empty
    const listEl = document.getElementById('notifications-list');
    if (listEl && listEl.querySelectorAll('.notification-item').length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: var(--color-text-muted); padding: 2rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
          <i class="fa-regular fa-bell-slash" style="font-size: 2rem; color: var(--color-text-muted); opacity: 0.5;"></i>
          <p style="font-size: 0.85rem; margin: 0; line-height: 1.4;">No tienes notificaciones todavía.</p>
        </div>
      `;
    }
  }, 300);

  try {
    const response = await fetch(`${API_URL}/notifications/${notificationId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': state.currentUser.id
      }
    });
    
    if (!response.ok) {
      const data = await response.json();
      showToast(data.error || "Error al eliminar la notificación", "error");
      loadNotifications();
    } else {
      showToast("Notificación eliminada.", "success");
      refreshUnreadNotificationCount();
    }
  } catch (error) {
    console.error("Error deleting notification:", error);
    showToast("Error de red al eliminar la notificación", "error");
    loadNotifications();
  }
}

async function markAllNotificationsAsRead() {
  if (!state.currentUser) return;
  try {
    const response = await fetch(`${API_URL}/notifications/read`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id 
      }
    });
    if (response.ok) {
      const badge = document.getElementById('notification-badge');
      if (badge) badge.style.display = 'none';
      
      // Update UI elements that currently show as unread
      document.querySelectorAll('.notification-item.unread').forEach(item => {
        item.classList.remove('unread', 'unread-success', 'unread-danger');
      });
    }
  } catch (err) {
    console.error("Error marking notifications as read:", err);
  }
}

// Convert public VAPID key base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    showToast("Tu navegador no soporta notificaciones de fondo.", "error");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast("Permiso de notificaciones denegado.", "error");
      return;
    }

    // Get public VAPID key
    const vapidRes = await fetch(`${API_URL}/notifications/vapid-key`, {
      headers: { 'x-user-id': state.currentUser.id }
    });
    const { publicKey } = await vapidRes.json();
    
    // Register Push Subscription
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Send subscription object to backend
    const subRes = await fetch(`${API_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ subscription })
    });

    if (subRes.ok) {
      showToast("¡Notificaciones activadas con éxito!", "success");
      const enablePushBtn = document.getElementById('enable-push-btn');
      if (enablePushBtn) enablePushBtn.style.display = 'none';
      const containerEl = document.getElementById('enable-push-btn-container');
      if (containerEl) containerEl.style.display = 'none';
    } else {
      showToast("Error al activar notificaciones en el servidor.", "error");
    }
  } catch (err) {
    console.error("Error setting up Web Push:", err);
    showToast("Error al configurar las notificaciones.", "error");
  }
}

// --- ADMIN EDIT USER PREDICTIONS MODAL ---

async function openEditPredictionsModal(targetUserId, username) {
  // If target matches are empty, load matches first
  if (state.matches.length === 0) {
    try {
      const matchesRes = await fetch(`${API_URL}/matches`, {
        headers: { 'x-user-id': state.currentUser.id }
      });
      state.matches = await matchesRes.json();
    } catch (e) {
      console.error(e);
      showToast("Error al cargar partidos.", "error");
      return;
    }
  }

  const modal = document.getElementById('edit-predictions-modal');
  const modalTitle = document.getElementById('edit-modal-user-title');
  const modalSubtitle = document.getElementById('edit-modal-user-subtitle');
  const matchesGrid = document.getElementById('edit-modal-matches-grid');

  state.editingUserId = targetUserId;
  state.editingUsername = username;
  state.editingUserPredictions = {};
  state.originalUserPredictions = {};

  matchesGrid.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--color-text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando pronósticos del usuario...</div>`;
  modal.style.display = 'flex';

  try {
    const response = await fetch(`${API_URL}/predictions/user/${targetUserId}`, {
      headers: { 'x-user-id': state.currentUser.id }
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "No se pudieron obtener los pronósticos", "error");
      closeEditPredictionsModal();
      return;
    }

    modalTitle.textContent = `Editar Pronósticos de: ${data.username}`;
    modalSubtitle.textContent = `Modifica las predicciones de los partidos para este usuario.`;

    // Save original predictions and setup state.editingUserPredictions
    state.originalUserPredictions = { ...data.predictions };
    state.editingUserPredictions = { ...data.predictions };

    matchesGrid.innerHTML = state.matches.map(match => {
      const currentPred = state.editingUserPredictions[match.id] || null;
      
      const actL = currentPred === 'L' ? 'active-L' : '';
      const actE = currentPred === 'E' ? 'active-E' : '';
      const actV = currentPred === 'V' ? 'active-V' : '';
      const actNone = currentPred === null ? 'active-none' : '';

      return `
        <div class="admin-match-row" style="padding: 0.75rem 1rem; gap: 1rem; align-items: center;">
          <div class="admin-match-info" style="min-width: auto; flex-grow: 1; gap: 1rem; display: flex; align-items: center;">
            <span class="admin-match-id" style="width: 28px; height: 28px; font-size: 0.85rem; flex-shrink: 0;">#${match.id}</span>
            <div class="admin-match-teams" style="font-size: 0.9rem; flex-grow: 1;">
              <span class="admin-team-l" style="min-width: 80px; font-size: 0.85rem;">${match.team1}</span>
              <span style="color: var(--color-text-muted); font-size: 0.75rem; font-style: italic; font-weight: normal;">vs</span>
              <span class="admin-team-v" style="min-width: 80px; font-size: 0.85rem;">${match.team2}</span>
            </div>
            ${match.result !== null ? `<span class="badge badge-success" style="font-size: 0.65rem; padding: 0.1rem 0.3rem;" title="Resultado real">Resultado: ${match.result}</span>` : ''}
          </div>

          <div class="admin-controls" style="gap: 0.5rem; flex-shrink: 0;">
            <div class="admin-result-buttons" style="background: rgba(0,0,0,0.4);">
              <button class="admin-opt-btn ${actL}" onclick="selectEditedPrediction(${match.id}, 'L')" id="edit-opt-L-${match.id}" style="padding: 0.35rem 0.7rem; font-size: 0.75rem;">L</button>
              <button class="admin-opt-btn ${actE}" onclick="selectEditedPrediction(${match.id}, 'E')" id="edit-opt-E-${match.id}" style="padding: 0.35rem 0.7rem; font-size: 0.75rem;">E</button>
              <button class="admin-opt-btn ${actV}" onclick="selectEditedPrediction(${match.id}, 'V')" id="edit-opt-V-${match.id}" style="padding: 0.35rem 0.7rem; font-size: 0.75rem;">V</button>
              <button class="admin-opt-btn ${actNone}" onclick="selectEditedPrediction(${match.id}, null)" id="edit-opt-null-${match.id}" style="padding: 0.35rem 0.7rem; font-size: 0.75rem; color: var(--red);" title="Sin Pronóstico">-</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Error loading user predictions for edit:", error);
    showToast("Error al cargar datos del usuario", "error");
    closeEditPredictionsModal();
  }
}

function closeEditPredictionsModal() {
  document.getElementById('edit-predictions-modal').style.display = 'none';
  state.editingUserId = null;
  state.editingUsername = null;
  state.editingUserPredictions = {};
  state.originalUserPredictions = {};
}

function selectEditedPrediction(matchId, val) {
  state.editingUserPredictions[matchId] = val;

  const btnL = document.getElementById(`edit-opt-L-${matchId}`);
  const btnE = document.getElementById(`edit-opt-E-${matchId}`);
  const btnV = document.getElementById(`edit-opt-V-${matchId}`);
  const btnNone = document.getElementById(`edit-opt-null-${matchId}`);

  if (btnL) btnL.classList.remove('active-L');
  if (btnE) btnE.classList.remove('active-E');
  if (btnV) btnV.classList.remove('active-V');
  if (btnNone) btnNone.classList.remove('active-none');

  if (val === 'L' && btnL) btnL.classList.add('active-L');
  if (val === 'E' && btnE) btnE.classList.add('active-E');
  if (val === 'V' && btnV) btnV.classList.add('active-V');
  if (val === null && btnNone) btnNone.classList.add('active-none');
}

async function submitEditedPredictions() {
  const saveBtn = document.getElementById('save-edit-predictions-btn');
  if (!saveBtn) return;
  const originalHtml = saveBtn.innerHTML;

  // Find predictions that changed
  const changedPredictions = [];
  for (const match of state.matches) {
    const orig = state.originalUserPredictions[match.id] || null;
    const curr = state.editingUserPredictions[match.id] || null;

    if (orig !== curr) {
      changedPredictions.push({
        matchId: match.id,
        prediction: curr
      });
    }
  }

  if (changedPredictions.length === 0) {
    showToast("No se detectaron cambios en los pronósticos.", "info");
    closeEditPredictionsModal();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...`;

  try {
    const response = await fetch(`${API_URL}/admin/predictions/user/${state.editingUserId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ predictions: changedPredictions })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al guardar los pronósticos", "error");
      return;
    }

    showToast(`Pronósticos de "${state.editingUsername}" actualizados con éxito.`, "success");
    closeEditPredictionsModal();

    // Refresh user list to show updated points if they changed
    loadAdminUsers();
    
    // Refresh leaderboard
    fetch(`${API_URL}/leaderboard`, {
      headers: { 'x-user-id': state.currentUser.id }
    })
    .then(res => res.json())
    .then(leaderboard => {
      state.leaderboard = leaderboard;
      renderLeaderboardTables();
    })
    .catch(err => console.error("Error refreshing leaderboard after edit:", err));

  } catch (error) {
    console.error("Error submitting edited predictions:", error);
    showToast("Error de conexión al guardar pronósticos", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHtml;
  }
}

async function adminResetUserPassword(userId, username) {
  const newPassword = prompt(`Ingresa la nueva contraseña para el usuario "${username}" (Mínimo 6 caracteres):`);
  if (newPassword === null) return;
  if (newPassword.trim().length < 6) {
    showToast("La contraseña debe tener al menos 6 caracteres.", "error");
    return;
  }

  const confirmation = confirm(`¿Estás seguro de que deseas cambiar la contraseña de ${username}?`);
  if (!confirmation) return;

  try {
    const response = await fetch(`${API_URL}/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ newPassword: newPassword.trim() })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al restablecer contraseña", "error");
      return;
    }

    showToast(`Contraseña de ${username} actualizada con éxito.`, "success");
  } catch (error) {
    console.error("Error reseting password:", error);
    showToast("Error de conexión al restablecer contraseña", "error");
  }
}

async function loadProbabilityDashboard() {
  const loading = document.getElementById('probability-loading');
  const list = document.getElementById('probability-list');
  if (!loading || !list) return;

  list.innerHTML = '';
  loading.style.display = 'block';

  try {
    const response = await fetch(`${API_URL}/predictions/probability`, {
      headers: { 'x-user-id': state.currentUser.id }
    });

    const data = await response.json();
    loading.style.display = 'none';

    if (!response.ok) {
      showToast(data.error || "No se pudieron calcular las probabilidades", "error");
      return;
    }

    if (data.length === 0) {
      list.innerHTML = `<li style="text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 1.5rem;">No hay usuarios suficientes.</li>`;
      return;
    }

    list.innerHTML = data.map((user, idx) => {
      let colorClass = '';
      let badgeStyle = '';
      let pctText = '';

      if (user.hasChance) {
        colorClass = 'color: #34d399; font-weight: 700;';
        badgeStyle = 'background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399;';
        if (user.probability === 0) {
          pctText = '<0.01%';
        } else {
          pctText = `${user.probability.toFixed(2)}%`;
        }
      } else {
        colorClass = 'color: #f87171;';
        badgeStyle = 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #f87171;';
        pctText = '0.00%';
      }

      return `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: rgba(255, 255, 255, 0.02); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.04); transition: transform 0.2s ease;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-family: var(--font-title); font-weight: 800; font-size: 0.85rem; color: var(--gold); width: 22px; text-align: center;">${idx + 1}°</span>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 0.85rem; font-weight: 700; color: white;">${user.username}</span>
              <span style="font-size: 0.7rem; color: var(--color-text-muted);">${user.points} pts</span>
            </div>
          </div>
          <span style="font-size: 0.78rem; padding: 0.25rem 0.6rem; border-radius: 20px; font-weight: 800; font-family: var(--font-title); ${badgeStyle}">
            ${pctText}
          </span>
        </li>
      `;
    }).join('');

  } catch (error) {
    console.error("Error fetching winning probabilities:", error);
    showToast("Error de conexión al obtener las probabilidades", "error");
  }
}

async function loadProfileDashboard() {
  const predictionsEl = document.getElementById('profile-stat-predictions');
  const hitsEl = document.getElementById('profile-stat-hits');
  const missesEl = document.getElementById('profile-stat-misses');
  const remainingEl = document.getElementById('profile-stat-remaining');
  const probabilityEl = document.getElementById('profile-stat-probability');
  const bonusEl = document.getElementById('profile-stat-bonus');
  const usernameEl = document.getElementById('profile-username');
  const picDisplay = document.getElementById('profile-pic-display');

  if (usernameEl) usernameEl.textContent = state.currentUser.username;
  if (picDisplay) picDisplay.src = state.currentUser.profilePic || 'avatar.png';

  // Mostrar spinners de carga temporalmente en la tabla
  const loader = `<i class="fa-solid fa-spinner fa-spin"></i>`;
  if (predictionsEl) predictionsEl.innerHTML = loader;
  if (hitsEl) hitsEl.innerHTML = loader;
  if (missesEl) missesEl.innerHTML = loader;
  if (remainingEl) remainingEl.innerHTML = loader;
  if (probabilityEl) probabilityEl.innerHTML = loader;
  if (bonusEl) bonusEl.innerHTML = loader;

  try {
    // Fetches paralelos para tener todos los datos consistentes
    const [matchesRes, predictionsRes, p2MatchesRes, p2PredictionsRes, probRes] = await Promise.all([
      // Fase 1 partidos y predicciones
      state.matches.length === 0 
        ? fetch(`${API_URL}/matches`, { headers: { 'x-user-id': state.currentUser.id } }).then(r => r.json())
        : Promise.resolve(state.matches),
      fetch(`${API_URL}/predictions`, { headers: { 'x-user-id': state.currentUser.id } }).then(r => r.json()),
      
      // Fase 2 partidos y predicciones
      statePhase2.matches.length === 0 
        ? fetch(`/api/phase2/matches`, { headers: { 'x-user-id': state.currentUser.id } }).then(r => r.json())
        : Promise.resolve(statePhase2.matches),
      fetch(`/api/phase2/predictions`, { headers: { 'x-user-id': state.currentUser.id } }).then(r => r.json()),

      // Probabilidades de ganar
      fetch(`${API_URL}/predictions/probability`, { headers: { 'x-user-id': state.currentUser.id } }).then(r => r.json())
    ]);

    // Actualizar estados locales si es necesario
    if (state.matches.length === 0) state.matches = matchesRes;
    state.predictions = {};
    predictionsRes.forEach(p => {
      state.predictions[p.matchId] = p.prediction;
    });

    if (statePhase2.matches.length === 0) statePhase2.matches = p2MatchesRes;
    statePhase2.predictions = {};
    p2PredictionsRes.forEach(p => {
      statePhase2.predictions[p.matchId] = p.prediction;
    });

    // --- CÁLCULOS ---
    
    // 1. Pronósticos realizados
    const p1Count = Object.keys(state.predictions).length;
    const p2Count = Object.keys(statePhase2.predictions).length;
    const totalPredictions = p1Count + p2Count;
    const totalPossibleMatches = 72 + 32; // 72 de Grupos, 32 de Fase Final

    // 2. Aciertos y fallas de Fase 1
    let hitsP1 = 0;
    let missesP1 = 0;
    state.matches.forEach(match => {
      if (match.result !== null) {
        const pred = state.predictions[match.id];
        if (pred !== undefined && pred !== null) {
          if (pred === match.result) {
            hitsP1++;
          } else {
            missesP1++;
          }
        }
      }
    });

    // 3. Aciertos y fallas de Fase 2, y conteo de Bonus
    let hitsP2 = 0;
    let missesP2 = 0;
    let bonusCount = 0;
    statePhase2.matches.forEach(match => {
      if (match.result !== null) {
        const pred = statePhase2.predictions[match.id];
        if (pred) {
          const r1 = parseInt(match.result.team1Score);
          const r2 = parseInt(match.result.team2Score);
          const p1 = parseInt(pred.team1Score);
          const p2 = parseInt(pred.team2Score);
          const realWinner = match.result.winner || (r1 > r2 ? 'L' : (r1 < r2 ? 'V' : 'E'));
          const predWinner = pred.winner || (p1 > p2 ? 'L' : (p1 < p2 ? 'V' : 'E'));

          if (realWinner === predWinner) {
            hitsP2++;
            if (r1 === p1 && r2 === p2) {
              bonusCount++; // Marcador exacto en Fase 2 equivale a Bonus (4 pts)
            }
          } else {
            missesP2++;
          }
        }
      }
    });

    // 4. Totales
    const totalHits = hitsP1 + hitsP2;
    const totalMisses = missesP1 + missesP2;

    // 5. Restantes por jugar
    const remainingP1 = state.matches.filter(m => m.result === null).length;
    const remainingP2 = statePhase2.matches.filter(m => m.result === null).length;
    const totalRemaining = remainingP1 + remainingP2;

    // 6. Buscar probabilidad del usuario en la simulación
    let userProb = 0;
    const myProbData = probRes.find(u => u.id === state.currentUser.id);
    if (myProbData) {
      userProb = myProbData.probability;
    }

    // Render en la interfaz
    if (predictionsEl) predictionsEl.textContent = `${totalPredictions} / ${totalPossibleMatches}`;
    if (hitsEl) hitsEl.textContent = totalHits;
    if (missesEl) missesEl.textContent = totalMisses;
    if (remainingEl) remainingEl.textContent = totalRemaining;
    if (probabilityEl) probabilityEl.textContent = `${userProb.toFixed(2)}%`;
    if (bonusEl) bonusEl.textContent = bonusCount;

  } catch (err) {
    console.error("Error al cargar el dashboard del perfil:", err);
    showToast("Error de conexión al cargar estadísticas del perfil.", "error");
  }
}

let cropperInstance = null;

function closeCropperModal() {
  const modal = document.getElementById('cropper-modal');
  if (modal) modal.style.display = 'none';
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  const fileInput = document.getElementById('profile-pic-input');
  if (fileInput) fileInput.value = '';
}

async function applyImageCrop() {
  if (!cropperInstance) return;
  
  const saveBtn = document.getElementById('cropper-save-btn');
  const originalHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando...`;

  try {
    // Generar canvas con tamaño de 200x200 (para optimizar espacio en base de datos)
    const canvas = cropperInstance.getCroppedCanvas({
      width: 200,
      height: 200,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });

    const croppedBase64 = canvas.toDataURL('image/jpeg', 0.85);

    // Mostrar preview local inmediato
    const picDisplay = document.getElementById('profile-pic-display');
    if (picDisplay) picDisplay.src = croppedBase64;

    showToast("Subiendo foto de perfil recortada...", "info");
    const response = await fetch('/api/user/profile-pic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ profilePic: croppedBase64 })
    });

    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Error al subir la imagen", "error");
      if (picDisplay) picDisplay.src = state.currentUser.profilePic || 'avatar.png';
      return;
    }

    // Actualizar estado local
    state.currentUser.profilePic = croppedBase64;
    localStorage.setItem('quiniela_user', JSON.stringify(state.currentUser));

    // Actualizar en el header
    const headerAvatar = document.getElementById('user-header-avatar');
    if (headerAvatar) headerAvatar.src = croppedBase64;

    showToast("¡Foto de perfil recortada y guardada con éxito!", "success");
    closeCropperModal();
  } catch (err) {
    console.error("Error al recortar/subir imagen:", err);
    showToast("Error al procesar la imagen recortada.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHtml;
  }
}

async function handleProfilePicUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validar tipo de archivo
  if (!file.type.startsWith('image/')) {
    showToast("Por favor selecciona un archivo de imagen válido.", "error");
    return;
  }

  // Validar tamaño de archivo (limitar a 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast("La imagen es muy pesada. Selecciona una de menos de 5MB.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const modal = document.getElementById('cropper-modal');
    const image = document.getElementById('cropper-image');
    if (!modal || !image) return;

    image.src = e.target.result;
    modal.style.display = 'flex';

    // Destruir instancia anterior si existiera
    if (cropperInstance) {
      cropperInstance.destroy();
    }

    // Inicializar Cropper.js
    cropperInstance = new Cropper(image, {
      aspectRatio: 1, // Relación de aspecto cuadrada (1:1)
      viewMode: 1, // Mantener el recuadro dentro de la imagen
      autoCropArea: 0.8,
      responsive: true,
      background: false,
      ready() {
        console.log("Cropper.js listo para usar.");
      }
    });
  };
  reader.readAsDataURL(file);
}

// ====================================================
// --- PHASE 2 (Fase Final) CLIENT LOGIC ---
// ====================================================

async function loadFinalPredictionsDashboard() {
  const grid = document.getElementById('matches-grid-final');
  if (!grid) return;
  grid.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando partidos de Fase Final...</div>`;

  try {
    const [matchesRes, predsRes, configRes] = await Promise.all([
      fetch('/api/phase2/matches', { headers: { 'x-user-id': state.currentUser.id } }),
      fetch('/api/phase2/predictions', { headers: { 'x-user-id': state.currentUser.id } }),
      fetch('/api/phase2/config', { headers: { 'x-user-id': state.currentUser.id } })
    ]);

    if (!matchesRes.ok || !predsRes.ok || !configRes.ok) throw new Error("Error al obtener los datos de Fase Final.");

    statePhase2.matches = await matchesRes.json();
    const predsArray = await predsRes.json();
    statePhase2.predictions = {};
    predsArray.forEach(p => {
      statePhase2.predictions[p.matchId] = p.prediction;
    });
    statePhase2.config = await configRes.json();

    // Render matches
    renderFinalMatchesGrid();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error al cargar el panel de Fase Final", "error");
  }
}

function renderFinalMatchesGrid() {
  const grid = document.getElementById('matches-grid-final');
  if (!grid) return;

  if (!statePhase2.tempPredictions) {
    statePhase2.tempPredictions = {};
  }

  const matchesHtml = statePhase2.matches.map(match => {
    const userPrediction = statePhase2.predictions[match.id] || null;
    const isSaved = !!userPrediction;
    
    if (!isSaved && !statePhase2.tempPredictions[match.id]) {
      statePhase2.tempPredictions[match.id] = { team1Score: '', team2Score: '', winner: null };
    }
    const temp = statePhase2.tempPredictions[match.id] || {};
    const activePrediction = isSaved ? userPrediction : temp;

    const isCompleted = match.result !== null;
    const flag1 = match.team1.substring(0, 3);
    const flag2 = match.team2.substring(0, 3);

    let resultBannerHtml = '';
    if (isCompleted) {
      if (userPrediction) {
        let r1 = parseInt(match.result.team1Score);
        let r2 = parseInt(match.result.team2Score);
        let p1 = parseInt(userPrediction.team1Score);
        let p2 = parseInt(userPrediction.team2Score);
        let realW = match.result.winner || (r1 > r2 ? 'L' : (r1 < r2 ? 'V' : 'E'));
        let predW = userPrediction.winner || (p1 > p2 ? 'L' : (p1 < p2 ? 'V' : 'E'));
        if (realW === predW) {
          let pts = (r1 === p1 && r2 === p2) ? 4 : 3;
          if (pts === 4) {
            resultBannerHtml = `<div class="real-result-banner correct"><span><i class="fa-solid fa-star"></i> ¡Marcador Exacto!</span><span>+4 pts</span></div>`;
          } else {
            resultBannerHtml = `<div class="real-result-banner correct"><span><i class="fa-solid fa-circle-check"></i> Acertaste al que avanza</span><span>+3 pts</span></div>`;
          }
        } else {
          resultBannerHtml = `<div class="real-result-banner incorrect"><span><i class="fa-solid fa-circle-xmark"></i> Fallaste. Avanzó ${realW==='L'?match.team1:match.team2}</span><span>0 pts</span></div>`;
        }
      } else {
        resultBannerHtml = `<div class="real-result-banner pending"><span><i class="fa-solid fa-circle-minus"></i> Sin pronóstico.</span><span>0 pts</span></div>`;
      }
    } else {
      resultBannerHtml = `<div class="real-result-banner pending"><span><i class="fa-solid fa-clock"></i> Pendiente</span><span>Pendiente</span></div>`;
    }

    const hasTBD = match.team1 === 'A definir' || match.team2 === 'A definir';
    const isPaused = statePhase2.config && statePhase2.config.predictionsPaused;
    const disabled = isSaved || isCompleted || isPaused || hasTBD ? 'disabled' : '';
    const val1 = activePrediction.team1Score !== undefined ? activePrediction.team1Score : '';
    const val2 = activePrediction.team2Score !== undefined ? activePrediction.team2Score : '';
    const selL = (activePrediction.winner === 'L') ? 'border: 2px solid var(--gold); border-radius: 8px;' : '';
    const selV = (activePrediction.winner === 'V') ? 'border: 2px solid var(--gold); border-radius: 8px;' : '';

    if (!isCompleted && hasTBD) {
      resultBannerHtml = `<div class="real-result-banner pending" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #f87171;"><span><i class="fa-solid fa-lock"></i> Bloqueado (Equipos por definir)</span></div>`;
    }

    const clickL = (!isSaved && !isCompleted && !isPaused && !hasTBD) ? `onclick="selectFinalWinner(${match.id}, 'L')"` : '';
    const clickV = (!isSaved && !isCompleted && !isPaused && !hasTBD) ? `onclick="selectFinalWinner(${match.id}, 'V')"` : '';

    let confirmBtnHtml = '';
    if (!isSaved && !isCompleted && !isPaused && !hasTBD) {
      confirmBtnHtml = `
        <div style="margin-top: 1rem; text-align: center;">
          <button class="btn btn-primary" onclick="confirmFinalPrediction(${match.id})" style="width: 100%; padding: 0.5rem; border-radius: 8px; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem; background: linear-gradient(135deg, #f59e0b, #d97706); border-color: #d97706;">
            <i class="fa-solid fa-circle-check"></i> Confirmar Pronóstico
          </button>
        </div>
      `;
    } else if (isSaved && !isCompleted) {
      confirmBtnHtml = `
        <div style="margin-top: 0.75rem; text-align: center; color: var(--gold); font-size: 0.8rem; font-weight: 600; background: rgba(245, 158, 11, 0.08); padding: 0.4rem; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center; gap: 0.3rem;">
          <i class="fa-solid fa-lock"></i> Pronóstico Confirmado (Bloqueado)
        </div>
      `;
    }

    return `
      <div class="match-card ${isSaved ? 'completed' : ''}" id="match-card-final-${match.id}">
        <div class="match-meta"><span class="match-group">${match.group}</span><span class="match-date">${match.date}</span></div>
        <div class="match-teams-layout" style="margin-bottom: 1rem;">
          <div class="team-row" style="justify-content: space-between;">
            <div class="team-info" ${clickL} style="${hasTBD ? 'cursor: not-allowed; opacity: 0.6;' : (isSaved ? 'cursor: default;' : 'cursor: pointer;')} padding: 0.5rem; ${selL}">
              <div class="team-flag-mock">${flag1}</div><span class="team-name">${match.team1}</span>
            </div>
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" id="pred1-final-${match.id}" class="score-input" value="${val1}" oninput="updateTempScore(${match.id}, 1, this.value)" ${disabled} style="width: 50px; text-align: center; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.3); color: white; padding: 0.5rem; font-size: 1.1rem; font-weight: bold;">
          </div>
          <div class="team-row" style="justify-content: space-between; margin-top: 0.5rem;">
            <div class="team-info" ${clickV} style="${hasTBD ? 'cursor: not-allowed; opacity: 0.6;' : (isSaved ? 'cursor: default;' : 'cursor: pointer;')} padding: 0.5rem; ${selV}">
              <div class="team-flag-mock">${flag2}</div><span class="team-name">${match.team2}</span>
            </div>
            <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" id="pred2-final-${match.id}" class="score-input" value="${val2}" oninput="updateTempScore(${match.id}, 2, this.value)" ${disabled} style="width: 50px; text-align: center; border-radius: 6px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.3); color: white; padding: 0.5rem; font-size: 1.1rem; font-weight: bold;">
          </div>
        </div>
        ${confirmBtnHtml}
        ${resultBannerHtml}
      </div>
    `;
  }).join('');

  // Calculate prediction progress
  const predCount = statePhase2.matches.filter(m => statePhase2.predictions[m.id]).length;
  const progressEl = document.getElementById('predictions-progress-final');
  if (progressEl) {
    progressEl.textContent = `${predCount} / ${statePhase2.matches.length}`;
  }

  grid.innerHTML = matchesHtml;
}

window.selectFinalWinner = function(matchId, winner) {
  if (!statePhase2.tempPredictions) {
    statePhase2.tempPredictions = {};
  }
  if (!statePhase2.tempPredictions[matchId]) {
    statePhase2.tempPredictions[matchId] = { team1Score: '', team2Score: '', winner: null };
  }
  statePhase2.tempPredictions[matchId].winner = winner;
  renderFinalMatchesGrid();
};

window.updateTempScore = function(matchId, teamIndex, value) {
  if (!statePhase2.tempPredictions) {
    statePhase2.tempPredictions = {};
  }
  if (!statePhase2.tempPredictions[matchId]) {
    statePhase2.tempPredictions[matchId] = { team1Score: '', team2Score: '', winner: null };
  }
  if (teamIndex === 1) {
    statePhase2.tempPredictions[matchId].team1Score = value;
  } else {
    statePhase2.tempPredictions[matchId].team2Score = value;
  }
  
  // Auto-select winner if clear (not a draw)
  const t1 = statePhase2.tempPredictions[matchId].team1Score;
  const t2 = statePhase2.tempPredictions[matchId].team2Score;
  if (t1 !== '' && t2 !== '') {
    const s1 = parseInt(t1);
    const s2 = parseInt(t2);
    if (!isNaN(s1) && !isNaN(s2)) {
      if (s1 > s2) {
        statePhase2.tempPredictions[matchId].winner = 'L';
      } else if (s1 < s2) {
        statePhase2.tempPredictions[matchId].winner = 'V';
      }
    }
  }
};

window.confirmFinalPrediction = async function(matchId) {
  const v1 = document.getElementById(`pred1-final-${matchId}`).value.trim();
  const v2 = document.getElementById(`pred2-final-${matchId}`).value.trim();
  
  if (v1 === '' || v2 === '') {
    showToast("Debes ingresar el marcador de ambos equipos.", "warning");
    return;
  }
  
  const score1 = parseInt(v1);
  const score2 = parseInt(v2);
  if (isNaN(score1) || isNaN(score2)) {
    showToast("Los marcadores deben ser números válidos.", "warning");
    return;
  }

  const temp = (statePhase2.tempPredictions && statePhase2.tempPredictions[matchId]) || {};
  let winner = temp.winner;
  
  if (score1 > score2) {
    winner = 'L';
  } else if (score1 < score2) {
    winner = 'V';
  }
  
  if (score1 === score2 && !winner) {
    showToast("Para empates, debes tocar el nombre del equipo que avanza.", "warning");
    return;
  }

  const confirmSave = confirm("¿Estás seguro de confirmar este pronóstico? Una vez confirmado, no se podrá modificar.");
  if (!confirmSave) return;

  try {
    const res = await fetch('/api/phase2/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({
        predictions: [
          {
            matchId: matchId,
            prediction: {
              team1Score: score1,
              team2Score: score2,
              winner: winner
            }
          }
        ]
      })
    });
    
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    statePhase2.predictions[matchId] = {
      team1Score: score1,
      team2Score: score2,
      winner: winner
    };
    
    if (statePhase2.tempPredictions) {
      delete statePhase2.tempPredictions[matchId];
    }
    
    showToast("¡Pronóstico confirmado y guardado!", "success");
    renderFinalMatchesGrid();
  } catch (err) {
    showToast(err.message || "Error al confirmar el pronóstico", "error");
  }
};

async function loadAdmin2Dashboard() {
  const list = document.getElementById('admin-2-matches-list');
  if (!list) return;
  list.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando partidos de Fase Final...</div>`;

  try {
    const [matchesRes, configRes] = await Promise.all([
      fetch('/api/phase2/matches', { headers: { 'x-user-id': state.currentUser.id } }),
      fetch('/api/phase2/config', { headers: { 'x-user-id': state.currentUser.id } })
    ]);

    if (!matchesRes.ok || !configRes.ok) throw new Error("Error al obtener datos de Admin-2.");

    statePhase2.matches = await matchesRes.json();
    statePhase2.config = await configRes.json();

    const btn = document.getElementById('btn-toggle-pause-final');
    if (btn) {
      btn.innerHTML = statePhase2.config.predictionsPaused ? '<i class="fa-solid fa-play"></i> Habilitar Ediciones' : '<i class="fa-solid fa-pause"></i> Pausar Ediciones';
      btn.className = statePhase2.config.predictionsPaused ? "btn btn-success" : "btn btn-warning";
    }

    renderAdmin2MatchesList();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Error al cargar la administración de Fase Final", "error");
  }
}

function renderAdmin2MatchesList() {
  const list = document.getElementById('admin-2-matches-list');
  if (!list) return;
  if (!window.admin2Winners) window.admin2Winners = {};
  
  const html = statePhase2.matches.map(match => {
    let r1 = match.result ? match.result.team1Score : '';
    let r2 = match.result ? match.result.team2Score : '';
    let win = window.admin2Winners[match.id] || (match.result ? match.result.winner : null);

    let selL = win === 'L' ? 'border: 2px solid var(--gold); border-radius: 8px;' : '';
    let selV = win === 'V' ? 'border: 2px solid var(--gold); border-radius: 8px;' : '';

    return `
      <div class="admin-user-card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong>#${match.id} - ${match.group || 'Partido'}</strong>
          <input type="text" id="admin-2-date-${match.id}" value="${match.date}" class="input-field" style="width: 130px; font-size: 0.8rem; padding: 0.25rem;" placeholder="Fecha/Sede">
        </div>
        
        <!-- Team Editing -->
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; align-items: center;">
          <input type="text" id="admin-2-t1-${match.id}" value="${match.team1}" class="input-field" style="flex:1;" placeholder="Equipo 1">
          <span>vs</span>
          <input type="text" id="admin-2-t2-${match.id}" value="${match.team2}" class="input-field" style="flex:1;" placeholder="Equipo 2">
          <button class="btn btn-secondary" onclick="saveAdmin2Teams(${match.id})" style="padding: 0.5rem; font-size: 0.8rem;">Guardar Datos</button>
        </div>

        <!-- Result Editing -->
        <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
          <div onclick="selectAdmin2Winner(${match.id}, 'L')" style="cursor: pointer; padding: 0.5rem; flex: 1; text-align: center; ${selL}">${match.team1}</div>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" id="admin-2-res1-${match.id}" value="${r1}" class="input-field" style="width: 60px; text-align: center;" placeholder="G">
          <span>-</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" id="admin-2-res2-${match.id}" value="${r2}" class="input-field" style="width: 60px; text-align: center;" placeholder="G">
          <div onclick="selectAdmin2Winner(${match.id}, 'V')" style="cursor: pointer; padding: 0.5rem; flex: 1; text-align: center; ${selV}">${match.team2}</div>
        </div>
        <div style="display: flex; gap: 1rem;">
          <button class="btn btn-primary" style="flex:1;" onclick="saveAdmin2Result(${match.id})">Guardar Marcador</button>
          <button class="btn btn-danger" onclick="saveAdmin2Result(${match.id}, true)">Borrar Marcador</button>
        </div>
      </div>
    `;
  }).join('');
  list.innerHTML = html;
}

window.selectAdmin2Winner = function(matchId, winner) {
  if (!window.admin2Winners) window.admin2Winners = {};
  window.admin2Winners[matchId] = winner;
  renderAdmin2MatchesList();
};

window.saveAdmin2Teams = async function(matchId) {
  const t1 = document.getElementById(`admin-2-t1-${matchId}`).value;
  const t2 = document.getElementById(`admin-2-t2-${matchId}`).value;
  const date = document.getElementById(`admin-2-date-${matchId}`).value;
  try {
    const res = await fetch('/api/phase2/admin/matches/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ matchId, team1: t1, team2: t2, date })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast(data.message, 'success');
    loadAdmin2Dashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.saveAdmin2Result = async function(matchId, clear = false) {
  let result = null;
  if (!clear) {
    const score1Val = document.getElementById(`admin-2-res1-${matchId}`).value;
    const score2Val = document.getElementById(`admin-2-res2-${matchId}`).value;
    const winner = window.admin2Winners[matchId] || (statePhase2.matches.find(m => m.id === matchId).result ? statePhase2.matches.find(m => m.id === matchId).result.winner : null);

    if (score1Val === '' || score2Val === '') {
      showToast("Ingresa los goles para guardar el resultado.", "warning");
      return;
    }
    const s1 = parseInt(score1Val);
    const s2 = parseInt(score2Val);
    if (isNaN(s1) || isNaN(s2)) return;

    if (s1 === s2 && !winner) {
      showToast("Para empates, debes tocar el nombre del equipo que avanza.", "warning");
      return;
    }
    const finalWinner = s1 > s2 ? 'L' : (s1 < s2 ? 'V' : winner);
    result = { team1Score: s1, team2Score: s2, winner: finalWinner };
  }

  try {
    const res = await fetch('/api/phase2/admin/matches/result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': state.currentUser.id
      },
      body: JSON.stringify({ matchId, result })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    if (window.admin2Winners) delete window.admin2Winners[matchId];

    showToast(data.message, 'success');
    loadAdmin2Dashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.toggleAdmin2Predictions = async function() {
  try {
    const res = await fetch('/api/phase2/admin/toggle-predictions', {
      method: 'POST',
      headers: {
        'x-user-id': state.currentUser.id
      }
    });
    const config = await res.json();
    statePhase2.config = config;
    
    const btn = document.getElementById('btn-toggle-pause-final');
    if (btn) {
      btn.innerHTML = config.predictionsPaused ? '<i class="fa-solid fa-play"></i> Habilitar Ediciones' : '<i class="fa-solid fa-pause"></i> Pausar Ediciones';
      btn.className = config.predictionsPaused ? "btn btn-success" : "btn btn-warning";
    }
    
    showToast(config.predictionsPaused ? "Ediciones pausadas" : "Ediciones habilitadas", "info");
  } catch (err) {
    showToast("Error de conexión", "error");
  }
};

// --- PHASE 2 LEADERBOARD & COMPARISONS (NEW PANEL) ---

async function loadPhase2Leaderboard() {
  const tbody = document.getElementById('new-panel-leaderboard-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 3rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando tabla de posiciones final...</td></tr>`;

  try {
    const response = await fetch('/api/phase2/leaderboard', {
      headers: { 'x-user-id': state.currentUser.id }
    });
    
    statePhase2.leaderboard = await response.json();
    
    if (statePhase2.leaderboard.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No hay participantes registrados.</td></tr>`;
      return;
    }

    renderPhase2Leaderboard();
    loadVotingTrendsPhase2();
    loadStreaksPhase2();
    loadBonusPhase2();
  } catch (error) {
    console.error("Error loading Phase 2 leaderboard:", error);
    showToast("Error al cargar la tabla de posiciones final", "error");
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--red);">Error al cargar las posiciones.</td></tr>`;
  }
}

function renderPhase2Leaderboard() {
  const tbody = document.getElementById('new-panel-leaderboard-body');
  if (!tbody) return;

  tbody.innerHTML = statePhase2.leaderboard.filter(player => player.username !== 'invitado').map((player, index) => {
    const position = index + 1;
    let rankBadgeClass = 'rank-other';
    if (position === 1) rankBadgeClass = 'rank-1';
    else if (position === 2) rankBadgeClass = 'rank-2';
    else if (position === 3) rankBadgeClass = 'rank-3';

    const isMe = player.id === state.currentUser.id;
    const clickHandler = `onclick="viewPlayerPredictionsPhase2('${player.id}')"`;
    const highlightRowStyle = isMe ? 'background: rgba(245, 158, 11, 0.05); font-weight: 600;' : '';
    const adminBadge = player.isAdmin ? '<span class="badge badge-error" style="font-size: 0.6rem; padding: 0.1rem 0.3rem; margin-left: 0.5rem;">Admin</span>' : '';

    return `
      <tr class="clickable" style="${highlightRowStyle}" ${clickHandler}>
        <td style="text-align: center;">
          <div class="rank-badge ${rankBadgeClass}">${position}</div>
        </td>
        <td>
          <div class="player-info-cell ${player.isAdmin ? 'is-admin' : ''}" style="display: flex; align-items: center; gap: 0.5rem;">
            <img src="${player.profilePic || 'avatar.png'}" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--gold);">
            <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: nowrap; white-space: nowrap;">
              <span class="player-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${player.username} ${isMe ? '(Tú)' : ''}">${player.username} ${isMe ? '(Tú)' : ''}</span>
              ${adminBadge}
            </div>
          </div>
        </td>
        <td style="text-align: center; font-family: var(--font-title); font-weight: 700; color: ${isMe ? 'var(--gold)' : 'inherit'}">
          ${player.points} pts
        </td>
      </tr>
    `;
  }).join('');
}

async function viewPlayerPredictionsPhase2(targetUserId) {
  if (statePhase2.matches.length === 0) {
    try {
      const matchesRes = await fetch('/api/phase2/matches', {
        headers: { 'x-user-id': state.currentUser.id }
      });
      statePhase2.matches = await matchesRes.json();
    } catch (e) {
      console.error("Error loading final matches:", e);
      showToast("Error al cargar partidos de la fase final", "error");
      return;
    }
  }

  const modal = document.getElementById('comparison-modal');
  const modalTitle = document.getElementById('modal-user-title');
  const modalSubtitle = document.getElementById('modal-user-subtitle');
  const comparisonGrid = document.getElementById('modal-comparison-grid');

  comparisonGrid.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--color-text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando predicciones de jugador...</div>`;
  modal.style.display = 'flex';

  try {
    const response = await fetch(`/api/phase2/predictions/user/${targetUserId}`, {
      headers: { 'x-user-id': state.currentUser.id }
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast((data && data.error) || "No se pudieron obtener los pronósticos", "error");
      closeComparisonModal();
      return;
    }

    modalTitle.textContent = `Panel de Pronósticos Fase Final: ${data.username}`;
    modalSubtitle.textContent = `Puntos de Fase Final: ${data.points} pts | Partidos pronosticados: ${Object.keys(data.predictions).length} de ${statePhase2.matches.length}`;

    // Render using final match comparison style
    comparisonGrid.innerHTML = statePhase2.matches.map(match => {
      const bet = data.predictions[match.id] || null;
      const real = match.result;
      const isCompleted = real !== null;

      let scoreClass = 'pts-pending';
      let rowStatusClass = '';
      let pointsText = 'Pendiente';

      let betText = '-';
      let realText = '-';

      if (bet) {
        betText = `${bet.team1Score} - ${bet.team2Score}`;
        if (bet.winner) {
          betText += ` (${bet.winner === 'L' ? match.team1 : match.team2})`;
        }
      }

      if (isCompleted && typeof real === 'object') {
        realText = `${real.team1Score} - ${real.team2Score}`;
        if (real.winner) {
          realText += ` (${real.winner === 'L' ? match.team1 : match.team2})`;
        }
        
        const exactScore = (bet && bet.team1Score === real.team1Score && bet.team2Score === real.team2Score);
        const winnerCorrect = (bet && bet.winner === real.winner);
        
        if (exactScore) {
          scoreClass = 'pts-3';
          rowStatusClass = 'correct';
          pointsText = '+4 pts';
        } else if (winnerCorrect) {
          scoreClass = 'pts-3';
          rowStatusClass = 'correct';
          pointsText = '+3 pts';
        } else {
          scoreClass = 'pts-0';
          rowStatusClass = 'incorrect';
          pointsText = '0 pts';
        }
      }

      return `
        <div class="comp-row ${rowStatusClass}">
          <div class="comp-match-info">
            <span class="comp-match-id">#${match.id} - ${match.group}</span>
            <div class="comp-teams">
              <span class="comp-team-l">${match.team1}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); font-style: italic;">vs</span>
              <span class="comp-team-v">${match.team2}</span>
            </div>
          </div>

          <div class="comp-results-block">
            <div class="comp-bet">
              <span class="comp-label">Pronóstico</span>
              <span class="comp-val val-none" style="font-weight: bold;">${betText}</span>
            </div>
            <div class="comp-real">
              <span class="comp-label">Resultado</span>
              <span class="comp-val val-none" style="font-weight: bold;">${realText}</span>
            </div>
            <div class="comp-score-badge ${scoreClass}">
              ${pointsText}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Error loading comparison:", error);
    showToast("Error de conexión al cargar pronósticos de jugador", "error");
    closeComparisonModal();
  }
}

let currentTrendsDataPhase2 = [];

async function loadVotingTrendsPhase2() {
  const container = document.getElementById('trends-container-final');
  const grid = document.getElementById('trends-grid-final');
  if (!container || !grid) return;

  try {
    const res = await fetch('/api/phase2/matches/trends', {
      headers: { 'x-user-id': state.currentUser.id }
    });
    if (!res.ok) throw new Error("Error fetching trends");
    
    currentTrendsDataPhase2 = await res.json();
    
    if (currentTrendsDataPhase2.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    // Render only the first 2 next unplayed matches
    const next2 = currentTrendsDataPhase2.slice(0, 2);
    if (next2.length === 0) {
      container.style.display = 'none';
    } else {
      container.style.display = 'block';
      grid.innerHTML = next2.map((match, idx) => {
        return `
          <div class="trend-card">
            <div class="trend-teams-row">
              <span>${match.team1}</span>
              <span style="color: var(--color-text-muted); font-size: 0.75rem; font-style: italic; margin: 0 0.5rem;">vs</span>
              <span>${match.team2}</span>
            </div>
            <div class="trend-votes-row">
              <div class="trend-vote-box" onclick="showTrendsVotersPhase2(${idx}, 'L')">
                <span class="trend-vote-label">Local</span>
                <span class="trend-vote-count">${match.stats.L.count}</span>
              </div>
              <div class="trend-vote-box" onclick="showTrendsVotersPhase2(${idx}, 'E')">
                <span class="trend-vote-label">Empate</span>
                <span class="trend-vote-count">${match.stats.E.count}</span>
              </div>
              <div class="trend-vote-box" onclick="showTrendsVotersPhase2(${idx}, 'V')">
                <span class="trend-vote-label">Visitante</span>
                <span class="trend-vote-count">${match.stats.V.count}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Apply collapsed state
      const isCollapsed = localStorage.getItem('trends_collapsed_final') !== 'false';
      const toggleIcon = document.getElementById('trends-toggle-icon-final');
      const titleH3 = container.querySelector('h3');
      if (isCollapsed) {
        grid.style.display = 'none';
        if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
        if (titleH3) titleH3.style.marginBottom = '0';
      } else {
        grid.style.display = 'grid';
        if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
        if (titleH3) titleH3.style.marginBottom = '0.55rem';
      }
    }
  } catch (err) {
    console.error("Error loading Phase 2 trends:", err);
    container.style.display = 'none';
  }
}

window.toggleTrendsGridFinal = function() {
  const grid = document.getElementById('trends-grid-final');
  const icon = document.getElementById('trends-toggle-icon-final');
  const container = document.getElementById('trends-container-final');
  if (!grid || !container) return;
  const title = container.querySelector('h3');

  if (grid.style.display === 'none') {
    grid.style.display = 'grid';
    if (icon) icon.style.transform = 'rotate(0deg)';
    if (title) title.style.marginBottom = '0.55rem';
    localStorage.setItem('trends_collapsed_final', 'false');
  } else {
    grid.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(180deg)';
    if (title) title.style.marginBottom = '0';
    localStorage.setItem('trends_collapsed_final', 'true');
  }
};

window.showTrendsVotersPhase2 = function(matchIndex, predictionType) {
  const match = currentTrendsDataPhase2[matchIndex];
  if (!match) return;

  const voters = match.stats[predictionType].users || [];
  
  const modal = document.getElementById('trends-voters-modal');
  const modalTitle = document.getElementById('trends-modal-title');
  const modalSubtitle = document.getElementById('trends-modal-subtitle');
  const votersList = document.getElementById('trends-voters-list');
  
  if (!modal || !modalTitle || !votersList) return;
  
  const typeText = predictionType === 'L' ? match.team1 : (predictionType === 'V' ? match.team2 : 'Empate');
  modalTitle.textContent = `${match.team1} vs ${match.team2}`;
  modalSubtitle.textContent = `Votos por: ${typeText}`;
  
  if (voters.length === 0) {
    votersList.innerHTML = `<li style="text-align: center; color: var(--color-text-muted); font-size: 0.9rem; padding: 1rem 0;">Ningún jugador pronosticó esta opción.</li>`;
  } else {
    votersList.innerHTML = voters.map(u => {
      const name = typeof u === 'object' ? u.username : u;
      const pic = (typeof u === 'object' && u.profilePic) ? u.profilePic : 'avatar.png';
      const scoreSuffix = (typeof u === 'object' && u.score) ? ` (${u.score})` : '';
      return `
        <li style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 0.9rem; font-weight: 500;">
          <img src="${pic}" alt="Avatar" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gold);">
          <span>${name}${scoreSuffix}</span>
        </li>
      `;
    }).join('');
  }
  
  modal.style.display = 'flex';
};

async function loadStreaksPhase2() {
  const container = document.getElementById('streaks-container-final');
  const content = document.getElementById('streaks-content-final');
  if (!container || !content) return;

  try {
    const res = await fetch('/api/phase2/streaks', {
      headers: { 'x-user-id': state.currentUser.id }
    });
    const data = await res.json();
    
    if (!data || !Array.isArray(data.buenaRacha) || !Array.isArray(data.malaRacha)) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    let html = '';

    // Buena
    if (data.buenaRacha.length > 0) {
      const top = data.buenaRacha[0];
      html += `
        <div class="racha-row-container">
          <div class="racha-row">
            <div class="racha-label-group"><span class="racha-emoji">😎</span><div class="racha-info"><span class="racha-title">Buena</span><span class="racha-user" title="${top.username}">${top.username}</span></div></div>
            <div class="racha-badge racha-buena" onclick="toggleStreaksTop3Phase2('buena')">${top.activeHits} <span class="seguidos-text"><i class="fa-solid fa-check"></i></span></div>
          </div>
          <div id="top3-buena-final" class="top3-list">
            ${data.buenaRacha.map((u, i) => `<div class="top3-item"><span class="top3-rank">${i+1}°</span><span class="top3-username" title="${u.username}">${u.username}</span><span class="top3-val">${u.activeHits} <span class="seguidos-text"><i class="fa-solid fa-check"></i></span></span></div>`).join('')}
          </div>
        </div>`;
    }

    // Mala
    if (data.malaRacha.length > 0) {
      const top = data.malaRacha[0];
      html += `
        <div class="racha-row-container">
          <div class="racha-row">
            <div class="racha-label-group"><span class="racha-emoji">😢</span><div class="racha-info"><span class="racha-title">Mala</span><span class="racha-user" title="${top.username}">${top.username}</span></div></div>
            <div class="racha-badge racha-mala" onclick="toggleStreaksTop3Phase2('mala')">${top.activeMisses} <span class="seguidos-text"><i class="fa-solid fa-xmark"></i></span></div>
          </div>
          <div id="top3-mala-final" class="top3-list">
            ${data.malaRacha.map((u, i) => `<div class="top3-item"><span class="top3-rank">${i+1}°</span><span class="top3-username" title="${u.username}">${u.username}</span><span class="top3-val">${u.activeMisses} <span class="seguidos-text"><i class="fa-solid fa-xmark"></i></span></span></div>`).join('')}
          </div>
        </div>`;
    }
    content.innerHTML = html;

    // Apply collapsed state for streaks
    const isCollapsed = localStorage.getItem('streaks_collapsed_final') !== 'false';
    const toggleIcon = document.getElementById('streaks-toggle-icon-final');
    const titleH3 = container.querySelector('h3');
    if (isCollapsed) {
      content.style.display = 'none';
      if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
      if (titleH3) titleH3.style.marginBottom = '0';
    } else {
      content.style.display = 'flex';
      if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
      if (titleH3) titleH3.style.marginBottom = '0.55rem';
    }
  } catch (err) {
    console.error("Error loading Phase 2 streaks:", err);
    container.style.display = 'none';
  }
}

window.toggleStreaksGridFinal = function() {
  const content = document.getElementById('streaks-content-final');
  const icon = document.getElementById('streaks-toggle-icon-final');
  const container = document.getElementById('streaks-container-final');
  if (!content || !container) return;
  const title = container.querySelector('h3');

  if (content.style.display === 'none') {
    content.style.display = 'flex';
    if (icon) icon.style.transform = 'rotate(0deg)';
    if (title) title.style.marginBottom = '0.55rem';
    localStorage.setItem('streaks_collapsed_final', 'false');
  } else {
    content.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(180deg)';
    if (title) title.style.marginBottom = '0';
    localStorage.setItem('streaks_collapsed_final', 'true');
  }
};

window.toggleStreaksTop3Phase2 = function(type) {
  const el = document.getElementById(`top3-${type}-final`);
  if (el) el.classList.toggle('active');
};

async function loadBonusPhase2() {
  const container = document.getElementById('bonus-container-final');
  const content = document.getElementById('bonus-content-final');
  if (!container || !content) return;

  try {
    const res = await fetch('/api/phase2/bonus', {
      headers: { 'x-user-id': state.currentUser.id }
    });
    if (!res.ok) throw new Error('Error fetching bonus');
    const data = await res.json();
    
    if (!data || data.length === 0) {
      container.style.display = 'block';
      content.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">Nadie ha obtenido puntos extra aún.</div>';
      return;
    }

    container.style.display = 'block';
    
    const renderStars = (bonusDetails) => {
      if (!bonusDetails) return '';
      return bonusDetails.map(b => 
        `<i class="fa-solid fa-star" style="color: var(--gold); cursor: pointer; font-size: 1rem; margin-left: 2px;" onclick="event.stopPropagation(); window.showBonusMatchPhase2(${b.matchId}, ${b.prediction.team1Score}, ${b.prediction.team2Score})"></i>`
      ).join('');
    };

    let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.25rem;">';
    
    html += data.map((u, i) => `
      <div class="top3-item" style="justify-content: space-between; padding: 0.5rem; background: rgba(255, 255, 255, 0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="top3-rank" style="color: var(--gold);">${i+1}°</span>
          <span class="top3-username" title="${u.username}" style="font-weight: 600;">${u.username}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 2px;">
          ${renderStars(u.bonusDetails)}
        </div>
      </div>
    `).join('');
    
    html += '</div>';
    
    content.innerHTML = html;

    // Apply collapsed state for bonus
    const isCollapsed = localStorage.getItem('bonus_collapsed_final') !== 'false';
    const toggleIcon = document.getElementById('bonus-toggle-icon-final');
    const titleH3 = container.querySelector('h3');
    if (isCollapsed) {
      content.style.display = 'none';
      if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
      if (titleH3) titleH3.style.marginBottom = '0';
    } else {
      content.style.display = 'block';
      if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
      if (titleH3) titleH3.style.marginBottom = '0.55rem';
    }
  } catch (err) {
    console.error("Error loading Phase 2 bonus:", err);
    container.style.display = 'none';
  }
}

window.toggleBonusGridFinal = function() {
  const content = document.getElementById('bonus-content-final');
  const icon = document.getElementById('bonus-toggle-icon-final');
  const container = document.getElementById('bonus-container-final');
  if (!content || !container) return;
  const title = container.querySelector('h3');

  if (content.style.display === 'none') {
    content.style.display = 'block';
    if (icon) icon.style.transform = 'rotate(0deg)';
    if (title) title.style.marginBottom = '0.55rem';
    localStorage.setItem('bonus_collapsed_final', 'false');
  } else {
    content.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(180deg)';
    if (title) title.style.marginBottom = '0';
    localStorage.setItem('bonus_collapsed_final', 'true');
  }
};

window.showBonusMatchPhase2 = function(matchId, s1, s2) {
  const match = statePhase2.matches.find(m => m.id === parseInt(matchId));
  if (!match) return;
  showToast(`Marcador exacto: ${match.team1} ${s1} - ${s2} ${match.team2}`, 'info');
};
