const db = require('./server/db');

console.log('Running schema fix...');

const addColumn = (table, column, definition) => {
    try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
        console.log(`Added ${column} to ${table}`);
    } catch (err) {
        if (err.message.includes('duplicate column name')) {
            console.log(`${column} already exists in ${table}`);
        } else {
            console.error(`Error adding ${column} to ${table}:`, err.message);
        }
    }
};

addColumn('room_members', 'role', "TEXT DEFAULT 'member'");
addColumn('room_members', 'joined_at', "DATETIME DEFAULT CURRENT_TIMESTAMP");
addColumn('room_members', 'last_read_at', "DATETIME"); // SQLite limitation workaround

// Backfill
try {
    db.prepare("UPDATE room_members SET last_read_at = CURRENT_TIMESTAMP WHERE last_read_at IS NULL").run();
} catch (e) {}

console.log('Schema fix completed.');
