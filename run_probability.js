process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'quiniela----mundial-2026'
});
process.env.GOOGLE_CLOUD_PROJECT = 'quiniela----mundial-2026';

const dbHelper = require('./db_helper');

async function test() {
  await dbHelper.initDb();
  try {
    const res = await dbHelper.calculateWinningProbabilities();
    console.log("Success! Probabilities count:", res.length);
  } catch (err) {
    console.error("Error in calculateWinningProbabilities:", err);
  }
}

test().catch(console.error);
