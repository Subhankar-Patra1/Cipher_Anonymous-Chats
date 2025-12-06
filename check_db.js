const db = require('./server/db');
console.log('--- Room Members Columns ---');
console.log(JSON.stringify(db.pragma('table_info(room_members)'), null, 2));
