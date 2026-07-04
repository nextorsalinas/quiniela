async function test() {
  const url = 'https://api-sazsr76zpa-uc.a.run.app/api/matches/trends';
  console.log("Fetching trends from production function:", url);
  try {
    const res = await fetch(url, {
      headers: { 'x-user-id': 'admin_id_2026' }
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response Body:", text.substring(0, 1000));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}
test();
