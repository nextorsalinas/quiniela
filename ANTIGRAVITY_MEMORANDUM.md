# 📜 ANTIGRAVITY PROJECT MEMORANDUM & ANALYSIS
**Project Name:** Quiniela Mundial 2026
**Target Audience:** Antigravity AI / Developers working on this codebase

This file serves as a context handoff ("knowledge transfer") from the work computer to the home computer. Read this to understand the current state, architecture, and deployment options.

---

## 🏗️ Architecture & Stack
* **Runtime:** Node.js (v20 engines defined in `package.json`).
* **Framework:** Express.js (`server.js`).
* **Frontend:** Vanilla HTML, CSS, JS served statically from the `/public` folder.
* **Excel Reader:** Uses the `xlsx` library to parse and load the matches database from `Quiniela_Mundial_2026_Fase_Grupos.xlsx` upon database initialization.

---

## 🗄️ Hybrid Database Strategy (`db_helper.js`)
The database helper adapts dynamically depending on the environment:
1. **Firestore Mode (Production / Connected):**
   * Triggered if `process.env.FIREBASE_CONFIG` is set, or if `serviceAccountKey.json` is found in the project root.
   * Connects to Google Firebase Firestore to store users, matches, predictions, and subscriptions.
2. **Local JSON Mode (Fallback / Offline):**
   * Triggered when no Firebase configuration or service account keys are detected.
   * Stores all data in a local `db.json` file. Perfect for development or offline testing.

---

## 🚨 Critical Credentials & Excluded Files (Gitignored)
Due to security best practices, the following files are ignored in Git:
* `serviceAccountKey.json` (Firebase Admin SDK private key).
* `db.json` (Local database state).
* `node_modules/` (Re-generated with npm install).
* `proxy_cert.pem` (Local development certificates).

> **Note for Developer:** When running at home, you must manually transfer `serviceAccountKey.json` and `db.json` into the root directory to resume with Firestore connection or preserve local state.

---

## 🛠️ Main Features & API Enpoints
* **Authentication:** `/api/auth/register`, `/api/auth/login`. 
  * *Deadline Check:* User registrations are closed starting June 11, 2026 (restricted on `/api/auth/register` to dates before `2026-06-11T00:00:00-06:00`).
* **Matches:** `/api/matches`. Admin can update match results (`/api/admin/matches/result`) or synchronize them directly from FIFA (`/api/admin/matches/sync`).
* **Predictions:** `/api/predictions` (Get/Save user predictions).
* **Leaderboard:** `/api/leaderboard` (Calculate rankings based on predictions and actual match results).
* **Push Notifications:** Web Push Notification support using the `web-push` library. Public VAPID keys are hardcoded in the helper. Admin can broadcast to all users via `/api/admin/notifications/broadcast`.
* **Admin Default Credentials:** `admin` / `admin2026`.

---

## 🚀 How to Run the Project at Home
1. **Clone the repo:** `git clone <URL>`
2. **Install Node modules:** `npm install`
3. **Restore credentials:** Copy `serviceAccountKey.json` and `db.json` to the root folder.
4. **Run Server:** 
   * Development mode (auto-reload): `npm run dev` (uses `nodemon`)
   * Standard mode: `npm start`
5. **URL:** `http://localhost:3000`
