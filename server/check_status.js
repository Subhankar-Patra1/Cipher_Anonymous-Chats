const http = require('http');

http.get('http://localhost:3000/api/users/status?ids=14,20', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.log(data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
