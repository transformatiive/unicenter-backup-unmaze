/*
 * Recria a tabela `contacts` com o schema atual (migrations/002_contacts.sql) e
 * importa um CSV grande para ela. Pensado para correr como um job pontual DENTRO
 * do Railway (acesso interno ao Postgres, sem precisar do DATABASE_PUBLIC_URL),
 * mas também funciona localmente.
 *
 * Uso:
 *   node scripts/reset_and_import.js <ficheiro.csv | URL_https_do_csv>
 *
 * Passos:
 *   1. Se receber uma URL, descarrega o CSV para /tmp (streaming).
 *   2. DROP TABLE contacts + volta a criar a partir de migrations/002_contacts.sql.
 *   3. Corre scripts/import_csv.js (COPY streaming -> staging -> INSERT mapeado).
 *
 * Requer DATABASE_URL. No Railway usa a referência interna ${{Postgres.DATABASE_URL}}.
 *
 * NOTA: no fim o processo fica propositadamente vivo (idle) para o Railway não o
 * reiniciar em loop. Confirma o resultado nos logs e apaga o serviço a seguir.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const { pool } = require('../src/db');

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('demasiados redirects'));
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          return resolve(download(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`HTTP ${res.statusCode} ao descarregar o CSV`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error('Uso: node scripts/reset_and_import.js <ficheiro.csv | URL>');

  let csvPath = src;
  if (/^https?:\/\//.test(src)) {
    csvPath = '/tmp/import_source.csv';
    // eslint-disable-next-line no-console
    console.log('[reset] a descarregar CSV da URL fornecida...');
    await download(src, csvPath);
    // eslint-disable-next-line no-console
    console.log(`[reset] descarregado: ${fs.statSync(csvPath).size} bytes -> ${csvPath}`);
  }

  const migrationSql = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '002_contacts.sql'),
    'utf8',
  );

  const client = await pool.connect();
  try {
    // Salvaguarda: NUNCA apagar uma tabela contacts que já tenha dados, a não ser
    // que FORCE_RESET=yes seja definido explicitamente. Assim este job é seguro por
    // omissão — só recria uma tabela vazia (ou inexistente).
    let existingRows = null;
    try {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM contacts');
      existingRows = rows[0].n;
    } catch (e) {
      existingRows = null; // tabela não existe
    }
    if (existingRows !== null && existingRows > 0 && process.env.FORCE_RESET !== 'yes') {
      throw new Error(
        `A tabela contacts já tem ${existingRows} linhas. Abortado para não apagar dados. `
          + 'Define FORCE_RESET=yes se realmente queres recriá-la do zero.',
      );
    }

    if (existingRows !== null) {
      // eslint-disable-next-line no-console
      console.log(`[reset] contacts existe (${existingRows} linhas) — a recriar schema...`);
      await client.query('DROP TABLE contacts CASCADE');
    } else {
      // eslint-disable-next-line no-console
      console.log('[reset] contacts não existe — a criar de novo...');
    }
    await client.query(migrationSql);
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'contacts'",
    );
    // eslint-disable-next-line no-console
    console.log(`[reset] tabela contacts pronta com ${rows[0].n} colunas.`);
  } finally {
    client.release();
    await pool.end();
  }

  // eslint-disable-next-line no-console
  console.log('[reset] a correr import_csv.js...');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'import_csv.js'), csvPath], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`import_csv.js terminou com código ${r.status}`);
}

main()
  // eslint-disable-next-line no-console
  .then(() => console.log('[reset] === CONCLUÍDO COM SUCESSO — a idle para evitar restart. Apaga este serviço. ==='))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[reset] === FALHOU:', e.message, '— a idle para evitar restart-loop. ===');
  })
  // mantém o processo vivo para o Railway não o reiniciar em loop
  .finally(() => setInterval(() => {}, 1 << 30));
