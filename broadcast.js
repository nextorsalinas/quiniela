const dbHelper = require('./db_helper');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

// Configure VAPID keys
const publicVapidKey = 'BEaWhoAX6YwyIPLLnk8d5c2N6pF7sHKylPha5CaCp7Pcvk8UzPvhg-uejox0vCJRUX6pwG4t1GO5roeXPKwS-ww';
const privateVapidKey = 'HFfMYamVkTBFIak9jxDfdDTlPw_hNAL39WhkOZJDEb4';

webpush.setVapidDetails(
  'mailto:admin@quiniela.com.mx',
  publicVapidKey,
  privateVapidKey
);

async function run() {
  console.log("=========================================");
  console.log("  INICIANDO ENVÍO DE NOTIFICACIÓN MASIVA ");
  console.log("=========================================");
  
  // Initialize db to set up firestore connection
  await dbHelper.initDb();
  
  const users = await dbHelper.getUsers();
  console.log(`Se encontraron ${users.length} usuarios registrados.\n`);

  const title = "Aviso Importante ⚠️";
  const body = "Recuerden que el tiempo límite para depositar es mañana miércoles 10 de junio.";

  // Determine if using Firestore
  const isFirestore = process.env.FIREBASE_CONFIG || fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'));

  for (const user of users) {
    console.log(`Procesando usuario: ${user.username} (ID: ${user.id})`);
    
    // 1. In-app notification
    const notificationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const notification = {
      id: notificationId,
      userId: user.id,
      title,
      body,
      read: false,
      createdAt: new Date().toISOString()
    };

    try {
      if (isFirestore) {
        const admin = require('firebase-admin');
        const firestoreDb = admin.firestore();
        await firestoreDb.collection('notifications').doc(notificationId).set(notification);
        console.log(`  - Notificación in-app guardada en Firestore para ${user.username}`);
      } else {
        const dbPath = path.join(__dirname, 'db.json');
        if (fs.existsSync(dbPath)) {
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          if (!db.notifications) db.notifications = [];
          db.notifications.push(notification);
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
          console.log(`  - Notificación in-app guardada en JSON para ${user.username}`);
        }
      }
    } catch (e) {
      console.error(`  - Error al guardar notificación in-app para ${user.username}:`, e.message);
    }

    // 2. Web Push Notification
    if (user.pushSubscriptions && user.pushSubscriptions.length > 0) {
      const payload = JSON.stringify({ title, body });
      const updatedSubscriptions = [...user.pushSubscriptions];
      let subChanged = false;

      for (const sub of user.pushSubscriptions) {
        try {
          await webpush.sendNotification(sub, payload);
          console.log(`  - Push enviado con éxito a ${user.username}`);
        } catch (err) {
          console.error(`  - Error al enviar push a ${user.username}:`, err.statusCode);
          if (err.statusCode === 410 || err.statusCode === 404) {
            const idx = updatedSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
            if (idx > -1) {
              updatedSubscriptions.splice(idx, 1);
              subChanged = true;
            }
          }
        }
      }

      if (subChanged) {
        try {
          if (isFirestore) {
            const admin = require('firebase-admin');
            const firestoreDb = admin.firestore();
            await firestoreDb.collection('users').doc(user.id).update({ pushSubscriptions: updatedSubscriptions });
            console.log(`  - Suscripciones push depuradas en Firestore para ${user.username}`);
          } else {
            const dbPath = path.join(__dirname, 'db.json');
            if (fs.existsSync(dbPath)) {
              const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
              const dbUser = db.users.find(u => u.id === user.id);
              if (dbUser) {
                dbUser.pushSubscriptions = updatedSubscriptions;
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
                console.log(`  - Suscripciones push depuradas en JSON para ${user.username}`);
              }
            }
          }
        } catch (e) {
          console.error(`  - Error al actualizar suscripciones push para ${user.username}:`, e.message);
        }
      }
    } else {
      console.log(`  - El usuario ${user.username} no tiene suscripciones de notificaciones push activas.`);
    }
  }

  console.log("\n=========================================");
  console.log("  ENVÍO MASIVO FINALIZADO EXITOSAMENTE!  ");
  console.log("=========================================");
}

run().catch(err => {
  console.error("Error general en el envío masivo:", err);
});
