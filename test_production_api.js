const fetch = require('node-fetch');

async function test() {
  const baseUrl = "https://quiniela----mundial-2026.web.app/api";
  const userId = "admin"; // Using default admin ID for test
  
  console.log(`Testing API at: ${baseUrl}`);
  
  const endpoints = [
    '/matches',
    '/matches/trends',
    '/streaks',
    '/leaderboard'
  ];

  for (const ep of endpoints) {
    try {
      console.log(`\nFetching ${ep}...`);
      const res = await fetch(`${baseUrl}${ep}`, {
        headers: { 'x-user-id': userId }
      });
      console.log(`Status: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        console.log(`Result: Array of ${data.length} items.`);
      } else {
        console.log(`Result: Object. Keys: ${Object.keys(data)}`);
      }
    } catch (err) {
      console.error(`Error fetching ${ep}:`, err.message);
    }
  }
}

test();
