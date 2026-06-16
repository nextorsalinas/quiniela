const https = require('https');

const data = JSON.stringify({
  username: "Liliana",
  email: "",
  password: "mundial"
});

const options = {
  hostname: 'quiniela----mundial-2026.web.app',
  port: 443,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => { body += d; });
  res.on('end', () => console.log(body));
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
