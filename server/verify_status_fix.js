const axios = require('axios');

async function testStatusEndpoint() {
    try {
        console.log('Testing /api/users/status endpoint...');
        // Test with a sample ID '1'
        const res = await axios.get('http://localhost:3000/api/users/status?ids=1');

        if (res.status === 200) {
            console.log('SUCCESS: Endpoint returned 200 OK');
            console.log('Response:', res.data);
        } else {
            console.error(`FAILURE: Endpoint returned status ${res.status}`);
            console.error('Response:', res.data);
        }
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.error('ERROR: Could not connect to server. Is it running on port 3000?');
        } else {
            console.error('ERROR:', err.message);
            if (err.response) {
                console.log('Status:', err.response.status);
                console.log('Data:', err.response.data);
            }
        }
    }
}

testStatusEndpoint();
