const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL não definida — a app não vai conseguir ligar-se à base de dados.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] erro inesperado no pool de ligações', err);
});

module.exports = { pool };
