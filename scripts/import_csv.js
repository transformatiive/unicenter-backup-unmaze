/*
 * Importa um CSV grande (ex: Contactos_Consolidado.csv) para a tabela `contacts`.
 *
 * Estratégia (robusta a diferenças de schema entre o CSV e a tabela final):
 *   1. Lê a linha de cabeçalho do CSV.
 *   2. Cria uma tabela de staging temporária com uma coluna TEXT por cada coluna do CSV
 *      (nomes sanitizados), e faz COPY FROM STDIN diretamente do ficheiro (rápido,
 *      streaming, não carrega o ficheiro todo em memória).
 *   3. Faz INSERT INTO contacts (...) SELECT ... FROM staging, mapeando apenas as
 *      colunas do CSV que têm correspondência exata de nome com colunas de `contacts`.
 *      Colunas do CSV sem correspondência ficam registadas no log (não se perdem —
 *      continuam na staging table, que só é limpa manualmente se quiseres).
 *   4. No fim, mostra um resumo: linhas importadas, colunas mapeadas, colunas ignoradas.
 *
 * Uso:
 *   node scripts/import_csv.js /caminho/para/Contactos_Consolidado.csv
 *
 * Requer DATABASE_URL definida (ver .env.example).
 */
require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { pool } = require('../src/db');
const copyFrom = require('pg-copy-streams').from;

function sanitizeIdentifier(name, index) {
  let s = name
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) s = `col_${index}`;
  if (/^[0-9]/.test(s)) s = `c_${s}`;
  return s;
}

async function readHeader(filePath) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }) });
  for await (const line of rl) {
    rl.close();
    // parse simples de CSV para a linha de cabeçalho (assume vírgula como separador
    // e aspas duplas para escapar campos com vírgulas)
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols.map((c) => c.replace(/^"|"$/g, ''));
  }
  throw new Error('Ficheiro CSV vazio.');
}

async function getContactsColumns(client) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'contacts'
       AND column_name NOT IN ('id', 'created_at', 'updated_at', 'deleted_at', 'deleted_reason')`,
  );
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('Uso: node scripts/import_csv.js /caminho/para/ficheiro.csv');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Ficheiro não encontrado: ${filePath}`);
  }

  const rawHeader = await readHeader(filePath);
  const stagingCols = rawHeader.map((h, i) => sanitizeIdentifier(h, i));

  // eslint-disable-next-line no-console
  console.log(`[import] cabeçalho detetado (${stagingCols.length} colunas):`);
  rawHeader.forEach((h, i) => console.log(`  ${i + 1}. "${h}" -> ${stagingCols[i]}`));

  const client = await pool.connect();
  const stagingTable = 'contacts_import_staging';

  try {
    await client.query(`DROP TABLE IF EXISTS ${stagingTable}`);
    const colsDdl = stagingCols.map((c) => `"${c}" TEXT`).join(', ');
    await client.query(`CREATE TABLE ${stagingTable} (${colsDdl})`);

    // eslint-disable-next-line no-console
    console.log(`[import] a copiar ${path.basename(filePath)} para staging (streaming)...`);

    await new Promise((resolve, reject) => {
      const copyCols = stagingCols.map((c) => `"${c}"`).join(', ');
      const stream = client.query(
        copyFrom(`COPY ${stagingTable} (${copyCols}) FROM STDIN WITH (FORMAT csv, HEADER true)`),
      );
      const fileStream = fs.createReadStream(filePath);
      fileStream.on('error', reject);
      stream.on('error', reject);
      stream.on('finish', resolve);
      fileStream.pipe(stream);
    });

    const { rows: countRows } = await client.query(`SELECT count(*)::int AS n FROM ${stagingTable}`);
    // eslint-disable-next-line no-console
    console.log(`[import] ${countRows[0].n} linhas copiadas para staging.`);

    const contactsCols = await getContactsColumns(client);
    const mapped = stagingCols.filter((c) => contactsCols.has(c));
    const unmapped = stagingCols.filter((c) => !contactsCols.has(c));

    if (mapped.length === 0) {
      throw new Error(
        'Nenhuma coluna do CSV corresponde a colunas de `contacts`. Ajusta migrations/002_contacts.sql ao cabeçalho real antes de importar.',
      );
    }

    // eslint-disable-next-line no-console
    console.log(`[import] colunas mapeadas para contacts (${mapped.length}): ${mapped.join(', ')}`);
    if (unmapped.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[import] colunas do CSV SEM correspondência em contacts (${unmapped.length}): ${unmapped.join(', ')}`);
      // eslint-disable-next-line no-console
      console.log('[import] -> ajusta migrations/002_contacts.sql se estas colunas também devem ser guardadas.');
    }

    const insertCols = mapped.map((c) => `"${c}"`).join(', ');
    const selectCols = mapped.map((c) => `"${c}"`).join(', ');

    // eslint-disable-next-line no-console
    console.log('[import] a inserir na tabela contacts...');
    const insertResult = await client.query(
      `INSERT INTO contacts (${insertCols}) SELECT ${selectCols} FROM ${stagingTable}`,
    );
    // eslint-disable-next-line no-console
    console.log(`[import] ${insertResult.rowCount} linhas inseridas em contacts.`);

    // eslint-disable-next-line no-console
    console.log(`[import] staging table '${stagingTable}' mantida para verificação. Apaga manualmente com:`);
    // eslint-disable-next-line no-console
    console.log(`  DROP TABLE ${stagingTable};`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[import] falhou:', err);
  process.exit(1);
});
