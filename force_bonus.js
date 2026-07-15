const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function forceBonus() {
    try {
        console.log("Forcing exact matches for Phase 2...");

        // Find a valid user
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            console.log("No users found.");
            process.exit(1);
        }
        
        let targetUser = usersSnapshot.docs[0];
        for(const u of usersSnapshot.docs) {
            if (u.data().username && u.data().username.toLowerCase().includes('nextor')) {
                targetUser = u;
                break;
            }
        }
        const userId = targetUser.id;
        console.log(`Using user: ${targetUser.data().username}`);

        // Matches we want to force
        const matchIds = [49, 50, 51, 52, 53];
        
        for (let i = 0; i < matchIds.length; i++) {
            const matchId = matchIds[i];
            
            // Create a fake prediction
            const predData = {
                userId: userId,
                matchId: matchId,
                prediction: {
                    team1Score: 2,
                    team2Score: 1,
                    winner: 'L'
                },
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Upsert prediction
            const predId = `phase2_${userId}_${matchId}`;
            await db.collection('phase2_predictions').doc(predId).set(predData, { merge: true });
            
            // Update the match result
            await db.collection('matchesPhase2').doc(matchId.toString()).set({
                result: {
                    team1Score: 2,
                    team2Score: 1,
                    winner: 'L'
                },
                status: 'FINISHED'
            }, { merge: true });
            
            console.log(`Forced match ${matchId} and prediction for user.`);
        }

        console.log(`Successfully forced 5 exact matches (bonuses) for testing.`);
        process.exit(0);
    } catch (e) {
        console.error("Error forcing bonus:", e);
        process.exit(1);
    }
}

forceBonus();
