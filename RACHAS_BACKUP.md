# 🚀 BACKUP: Funcionalidad de Rachas (Streaks)
Este archivo contiene todo el código necesario para restaurar la funcionalidad de "Rachas" en caso de un reset del proyecto.

## 1. Backend: server.js
**Ubicación:** `/server.js` (o raíz)
**Instrucción:** Agregar el endpoint después de las rutas de matches o leaderboard.

```javascript
app.get('/api/streaks', authenticate, async (req, res) => {
  try {
    const streaks = await dbHelper.getStreaks();
    res.json(streaks);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener las rachas." });
  }
});
```

## 2. Helper: db_helper.js
**Ubicación:** `/db_helper.js`
**Instrucción:** Agregar la función `getStreaks` y exportarla.

```javascript
async function getStreaks() {
  const matches = await internalGetMatches();
  const finishedMatches = matches
    .filter(m => m.result !== null)
    .sort((a, b) => (a.excelOrder || a.id) - (b.excelOrder || b.id));

  const users = await internalGetUsers();
  const nonAdminUsers = users.filter(u => !u.isAdmin);
  
  let allPredictions = [];
  if (dbType === 'firestore') {
    const snap = await firestoreDb.collection('predictions').get();
    allPredictions = snap.docs.map(doc => doc.data());
  } else {
    allPredictions = readDb().predictions || [];
  }

  const userStreaks = nonAdminUsers.map(user => {
    let currentHits = 0;
    let currentMisses = 0;

    finishedMatches.forEach(match => {
      const pred = allPredictions.find(p => p.userId === user.id && p.matchId === match.id);
      if (!pred || pred.prediction !== match.result) {
        currentHits = 0;
        currentMisses++;
      } else {
        currentHits++;
        currentMisses = 0;
      }
    });

    return {
      id: user.id,
      username: user.username,
      points: user.points || 0,
      activeHits: currentHits,
      activeMisses: currentMisses
    };
  });

  let buenaRacha = [...userStreaks]
    .filter(u => u.activeHits > 0)
    .sort((a, b) => b.activeHits - a.activeHits || a.username.localeCompare(b.username))
    .slice(0, 3);

  if (buenaRacha.length === 0 && userStreaks.length > 0) {
    buenaRacha = [...userStreaks]
      .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username))
      .slice(0, 3)
      .map(u => ({ ...u, activeHits: 0 }));
  }

  let malaRacha = [...userStreaks]
    .filter(u => u.activeMisses > 0)
    .sort((a, b) => b.activeMisses - a.activeMisses || a.username.localeCompare(b.username))
    .slice(0, 3);

  if (malaRacha.length === 0 && userStreaks.length > 0) {
    malaRacha = [...userStreaks]
      .sort((a, b) => a.points - b.points || a.username.localeCompare(b.username))
      .slice(0, 3)
      .map(u => ({ ...u, activeMisses: 0 }));
  }

  return { buenaRacha, malaRacha };
}

// No olvides agregar 'getStreaks' al module.exports
```

## 3. Frontend HTML: index.html
**Ubicación:** `/public/index.html`
**Instrucción:** Insertar antes del Leaderboard Table Card.

```html
<!-- Rachas Section -->
<div id="streaks-container" class="streaks-section glass-panel" style="margin-bottom: 1rem; display: none; padding: 0.75rem;">
  <h3 style="margin: 0 0 0.75rem 0; font-size: 0.85rem; font-family: var(--font-title); font-weight: 700; color: var(--gold); display: flex; align-items: center; gap: 0.4rem;">
    <i class="fa-solid fa-fire"></i> Rachas
  </h3>
  <div id="streaks-content" style="display: flex; flex-direction: column; gap: 0.4rem;">
    <!-- Injected dynamically via app.js -->
  </div>
</div>
```

## 4. Frontend Logic: app.js
**Ubicación:** `/public/app.js`
**Instrucción:** Llamar a `loadStreaks()` dentro de `loadLeaderboard()` y agregar las funciones de carga y toggle.

```javascript
// Dentro de loadLeaderboard()
await loadStreaks();

// Función loadStreaks
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
            <div class="racha-label-group"><span class="racha-emoji">😎</span><div class="racha-info"><span class="racha-title">Buena</span><span class="racha-user">${top.username}</span></div></div>
            <div class="racha-badge" onclick="toggleStreaksTop3('buena')">${top.activeHits} <span class="seguidos-text">aciertos seguidos</span></div>
          </div>
          <div id="top3-buena" class="top3-list">
            ${data.buenaRacha.map((u, i) => \`<div class="top3-item"><span class="top3-rank">\${i+1}°</span><span class="top3-username">\${u.username}</span><span class="top3-val">\${u.activeHits} <span class="seguidos-text">seguidos</span></span></div>\`).join('')}
          </div>
        </div>\`;
    }

    // Mala
    if (data.malaRacha.length > 0) {
      const top = data.malaRacha[0];
      html += \`
        <div class="racha-row-container">
          <div class="racha-row">
            <div class="racha-label-group"><span class="racha-emoji">😢</span><div class="racha-info"><span class="racha-title">Mala</span><span class="racha-user">\${top.username}</span></div></div>
            <div class="racha-badge" onclick="toggleStreaksTop3('mala')">\${top.activeMisses} <span class="seguidos-text">fallos seguidos</span></div>
          </div>
          <div id="top3-mala" class="top3-list">
            \${data.malaRacha.map((u, i) => \`<div class="top3-item"><span class="top3-rank">\${i+1}°</span><span class="top3-username">\${u.username}</span><span class="top3-val">\${u.activeMisses} <span class="seguidos-text">seguidos</span></span></div>\`).join('')}
          </div>
        </div>\`;
    }
    content.innerHTML = html;
  } catch (err) {
    console.error(err);
    container.style.display = 'none';
  }
}

function toggleStreaksTop3(type) {
  const el = document.getElementById(\`top3-\${type}\`);
  if (el) el.classList.toggle('active');
}
```

## 5. Frontend Styles: styles.css
**Ubicación:** `/public/styles.css`
**Instrucción:** Agregar al final del archivo.

```css
/* Rachas Section Styles */
.racha-row-container {
  display: flex;
  flex-direction: column;
}

.racha-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.racha-label-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.racha-emoji {
  font-size: 1.1rem;
}

.racha-info {
  display: flex;
  flex-direction: column;
}

.racha-title {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
  font-weight: 600;
}

.racha-user {
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}

.racha-badge .seguidos-text {
  font-size: 0.58rem;
  font-weight: 400;
  opacity: 0.85;
  margin-left: 2px;
}

.racha-badge {
  background: var(--gold);
  color: #111;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.3);
  transition: all 0.2s ease;
}

.racha-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.5);
}

.top3-list {
  display: none;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  animation: fadeInDown 0.3s ease forwards;
}

.top3-list.active {
  display: flex;
}

.top3-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.top3-item:last-child {
  border-bottom: none;
}

.top3-rank {
  color: var(--gold);
  font-weight: 700;
  width: 20px;
}

.top3-username {
  flex: 1;
  color: var(--color-text-main);
  padding-left: 0.5rem;
  text-align: left;
}

.top3-val {
  font-weight: 800;
  color: #fff;
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
```
