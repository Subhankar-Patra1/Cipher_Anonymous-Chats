const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function run() {
    try {
        console.log('Checking public schema specifically...');
        // 1. Check ID types for public schema
        const res = await pool.query(`
            SELECT table_name, column_name, data_type, udt_name
            FROM information_schema.columns 
            WHERE (table_name = 'messages' OR table_name = 'users') 
            AND column_name = 'id'
            AND table_schema = 'public';
        `);
        
        const types = {};
        res.rows.forEach(row => {
            console.log(`Found: ${row.table_name}.id = ${row.udt_name}`);
            types[row.table_name] = row.udt_name; 
        });
        
        const getSqlType = (udt) => {
            if (!udt) return 'INTEGER'; // Default
            if (udt === 'int4' || udt === 'integer') return 'INTEGER';
            if (udt === 'int8' || udt === 'bigint') return 'BIGINT';
            if (udt === 'uuid') return 'UUID';
            return 'INTEGER';
        };

        const msgType = getSqlType(types['messages']);
        const userType = getSqlType(types['users']);

        console.log(`Using types for DELIVERY -> messages.id: ${msgType}, users.id: ${userType}`);

        // 2. Create Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_deliveries (
                message_id ${msgType} REFERENCES messages(id) ON DELETE CASCADE,
                user_id ${userType} REFERENCES users(id) ON DELETE CASCADE,
                delivered_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (message_id, user_id)
            );
        `);
        
        console.log('message_deliveries table created successfully.');

    } catch (e) {
        console.error('Error creating table:', e.message);
    } finally {
        pool.end();
    }
}

run();
