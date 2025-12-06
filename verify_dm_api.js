// Using native fetch (Node 18+)

const BASE_URL = 'http://localhost:3000/api';

async function verify() {
    const timestamp = Date.now();
    const userA = { username: `userA_${timestamp}`, displayName: 'User A', password: 'password123' };
    const userB = { username: `userB_${timestamp}`, displayName: 'User B', password: 'password123' };

    console.log('1. Creating Users...');
    
    // Create User A
    const resA = await fetch(`${BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userA)
    });
    const dataA = await resA.json();
    if (!resA.ok) throw new Error(`Failed to create User A: ${JSON.stringify(dataA)}`);
    console.log('User A created:', dataA.user.username);

    // Create User B
    const resB = await fetch(`${BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userB)
    });
    const dataB = await resB.json();
    if (!resB.ok) throw new Error(`Failed to create User B: ${JSON.stringify(dataB)}`);
    console.log('User B created:', dataB.user.username);

    console.log('\n2. Searching for User B as User A...');
    const searchRes = await fetch(`${BASE_URL}/auth/search?q=${userB.username}`, {
        headers: { 'Authorization': `Bearer ${dataA.token}` }
    });
    const searchData = await searchRes.json();
    console.log('Search Results:', searchData);
    
    const foundUser = searchData.find(u => u.username === userB.username);
    if (!foundUser) throw new Error('User B not found in search');
    console.log('User B found in search!');

    console.log('\n3. Creating DM Room...');
    const roomRes = await fetch(`${BASE_URL}/rooms`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${dataA.token}`
        },
        body: JSON.stringify({ type: 'direct', targetUserId: foundUser.id })
    });
    const roomData = await roomRes.json();
    if (!roomRes.ok) throw new Error(`Failed to create room: ${JSON.stringify(roomData)}`);
    console.log('Room created/retrieved:', roomData);

    console.log('\n4. Verifying Room List for User A...');
    const listARes = await fetch(`${BASE_URL}/rooms`, {
        headers: { 'Authorization': `Bearer ${dataA.token}` }
    });
    const listA = await listARes.json();
    const roomA = listA.find(r => r.id === roomData.id);
    console.log('User A Room Entry:', roomA);
    if (roomA.name !== userB.displayName) throw new Error(`Expected room name '${userB.displayName}', got '${roomA.name}'`);

    console.log('\n5. Verifying Room List for User B...');
    const listBRes = await fetch(`${BASE_URL}/rooms`, {
        headers: { 'Authorization': `Bearer ${dataB.token}` }
    });
    const listB = await listBRes.json();
    const roomB = listB.find(r => r.id === roomData.id);
    console.log('User B Room Entry:', roomB);
    if (roomB.name !== userA.displayName) throw new Error(`Expected room name '${userA.displayName}', got '${roomB.name}'`);

    console.log('\nSUCCESS: All API verification steps passed!');
}

verify().catch(err => {
    console.error('\nFAILURE:', err.message);
    process.exit(1);
});
