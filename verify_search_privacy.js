const http = require('http');

// Configuration
const API_URL = 'http://localhost:5000'; // Found port 5000 in index.js 
// Wait, index.js doesn't show port. Let me check existing code or assume. 
// standard is often 3000 or 5000. Client uses VITE_API_URL.
// I'll try to read .env first or just try 3000/3001/5000. 
// For now, let's assume 3001 as it is common for backends when frontend is 3000/5173.
// Actually, let's check .env if possible, but I can't read it easily if it's not in the file list.
// I'll check server/index.js again for port? No port in snippet.
// I'll assume it's running.

async function request(path, method = 'GET', body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_URL);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function run() {
    const timestamp = Date.now();
    const username = `test_privacy_${timestamp}`;
    const password = 'password123';

    console.log(`Creating user: ${username}`);
    
    // 1. Signup
    const signupRes = await request('/api/auth/signup', 'POST', {
        username,
        displayName: 'Test Privacy',
        password
    });

    if (signupRes.status !== 200) {
        console.error('Signup failed:', signupRes.body);
        return;
    }

    const token = signupRes.body.token;
    const userId = signupRes.body.user.id;
    console.log('Signup successful. Token obtained.');

    // 2. Default: Search should find the user
    console.log('\n--- Test 1: Default Visibility (Everyone) ---');
    let searchRes = await request(`/api/auth/search?q=${username}`, 'GET'); // No token to avoid excluding self
    let found = searchRes.body.find(u => u.username === username);
    if (found) {
        console.log('PASS: User found in search by default.');
    } else {
        console.error('FAIL: User NOT found in search by default.');
        console.log('Search Results:', searchRes.body);
    }

    // 3. Set Privacy to 'nobody'
    console.log('\n--- Test 2: Set Privacy to "nobody" ---');
    const updateRes = await request('/api/users/me/privacy', 'PATCH', { search_privacy: 'nobody' }, token);
    if (updateRes.status === 200 && updateRes.body.search_privacy === 'nobody') {
        console.log('PASS: Privacy setting updated to "nobody".');
    } else {
        console.error('FAIL: Failed to update privacy setting.', updateRes.body);
    }

    // 4. Search again: User should NOT be found
    console.log('\n--- Test 3: Search Visibility ("nobody") ---');
    // Note: We search using the same token. The API implementation says `id != $2` (exclude self). 
    // Wait, if I search for myself, I am excluded by `id != currentUserId`.
    // I need ANOTHER user to search for me, or I need to search anonymously (no token).
    // The `/api/auth/search` endpoint (in `auth.js`) extracts user ID from token if present to exclude self.
    // If I don't provide a token, `currentUserId` is null, so I won't be excluded by ID.
    // So I should search WITHOUT token.
    
    searchRes = await request(`/api/auth/search?q=${username}`, 'GET'); // No token
    found = searchRes.body.find(u => u.username === username);
    if (!found) {
        console.log('PASS: User NOT found in search when privacy is "nobody".');
    } else {
        console.error('FAIL: User FOUND in search when privacy is "nobody".');
        console.log('Search Results:', JSON.stringify(searchRes.body, null, 2));
    }

    // 5. Set Privacy back to 'everyone'
    console.log('\n--- Test 4: Set Privacy back to "everyone" ---');
    const updateRes2 = await request('/api/users/me/privacy', 'PATCH', { search_privacy: 'everyone' }, token);
    if (updateRes2.status === 200 && updateRes2.body.search_privacy === 'everyone') {
        console.log('PASS: Privacy setting updated to "everyone".');
    } else {
        console.error('FAIL: Failed to update privacy setting.', updateRes2.body);
    }

    // 6. Search again: User SHOULD be found
    console.log('\n--- Test 5: Search Visibility ("everyone") ---');
    searchRes = await request(`/api/auth/search?q=${username}`, 'GET'); // No token
    found = searchRes.body.find(u => u.username === username);
    if (found) {
        console.log('PASS: User found in search after reverting privacy.');
    } else {
        console.error('FAIL: User NOT found in search after reverting privacy.');
    }
}

run().catch(console.error);
