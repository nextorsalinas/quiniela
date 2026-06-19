const dbHelper = require('./db_helper');
const path = require('path');
const fs = require('fs');

async function test() {
  console.log("--- INICIANDO PRUEBA DE BACKEND ---");
  
  // Forzar uso de Firestore para la prueba
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "quiniela----mundial-2026" });
  
  await dbHelper.initDb();

  try {
    console.log("\n1. Probando getMatches()...");
    const m = await dbHelper.getMatches();
    console.log(`   Recibidos ${m.length} partidos.`);
    if (m.length > 0) {
      console.log(`   Primer partido: ID=${m[0].id}, ExcelOrder=${m[0].excelOrder}, Team1=${m[0].team1}`);
    } else {
      console.error("   ERROR: No se recibieron partidos.");
    }

    console.log("\n2. Probando getMatchTrends()...");
    const t = await dbHelper.getMatchTrends();
    console.log(`   Recibidas ${t.length} tendencias.`);
    if (t.length > 0) {
      console.log(`   Primera tendencia: MatchID=${t[0].matchId}, Team1=${t[0].team1}`);
    }

    console.log("\n3. Probando getStreaks()...");
    const s = await dbHelper.getStreaks();
    console.log(`   Rachas calculadas: Buena=${s.buenaRacha.length}, Mala=${s.malaRacha.length}`);
    if (s.buenaRacha.length > 0) {
      console.log(`   Líder Buena: ${s.buenaRacha[0].username} (${s.buenaRacha[0].activeHits} aciertos)`);
    }
    if (s.malaRacha.length > 0) {
      console.log(`   Líder Mala: ${s.malaRacha[0].username} (${s.malaRacha[0].activeMisses} fallos)`);
    }

  } catch (err) {
    console.error("\n   ERROR FATAL DURANTE LA PRUEBA:");
    console.error(err);
  }

  console.log("\n--- PRUEBA FINALIZADA ---");
  process.exit(0);
}

test();
