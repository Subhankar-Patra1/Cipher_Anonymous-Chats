const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function migrate() {
    try {
        console.log('Dropping old constraint...');
        await pool.query('ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_type_check');
        
        console.log('Adding new constraint...');
        await pool.query("ALTER TABLE rooms ADD CONSTRAINT rooms_type_check CHECK (type IN ('direct', 'group', 'ai'))");
        
        console.log('Constraint updated successfully.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        pool.end();
    }
}

migrate();
