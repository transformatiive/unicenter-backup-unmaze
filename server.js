require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const { pool } = require('./src/db');
const { requireAuth, requireAdmin } = require('./src/middleware/auth');

const authRoutes = require('./src/routes/auth');
const contactsRoutes = require('./src/routes/contacts');
const adminRoutes = require('./src/routes/admin');
const gdprRoutes = require('./src/routes/gdpr');
const quadroRoutes = require('./src/routes/quadro');
const lotesRoutes = require('./src/routes/lotes');
const etiquetasRoutes = require('./src/routes/etiquetas');

const app = express();
app.set('trust proxy', 1); // necessário no Railway (atrás de proxy) para cookies "secure"

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'changeme',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  }),
);

// disponibiliza o utilizador autenticado a todas as views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

app.use('/', authRoutes);
app.use('/contacts', requireAuth, contactsRoutes);
app.use('/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/gdpr', requireAuth, gdprRoutes);
app.use('/quadro', requireAuth, quadroRoutes);
app.use('/lotes', requireAuth, lotesRoutes);
app.use('/etiquetas', requireAuth, etiquetasRoutes);

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/quadro');
  return res.redirect('/login');
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Página não encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).render('error', { message: 'Ocorreu um erro inesperado.' });
});

async function bootstrap() {
  const fs = require('fs');
  const path2 = require('path');
  const bcrypt = require('bcryptjs');

  // corre migrações em falta (idempotente — usa IF NOT EXISTS)
  const migrationsDir = path2.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path2.join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
    // eslint-disable-next-line no-console
    console.log(`[bootstrap] ${files.length} migração(ões) verificadas/aplicadas.`);

    // cria o utilizador inicial só se ainda não existir nenhum utilizador
    const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
    if (rows[0].n === 0) {
      const username = process.env.SEED_ADMIN_USERNAME || 'jdias';
      const password = process.env.SEED_ADMIN_PASSWORD;
      if (password) {
        const hash = await bcrypt.hash(password, 12);
        await client.query(
          'INSERT INTO users (username, password_hash, active, is_admin) VALUES ($1, $2, TRUE, TRUE)',
          [username, hash],
        );
        // eslint-disable-next-line no-console
        console.log(`[bootstrap] utilizador inicial '${username}' criado.`);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[bootstrap] SEED_ADMIN_PASSWORD não definida — nenhum utilizador inicial criado.');
      }
    }
  } finally {
    client.release();
  }
}

const PORT = process.env.PORT || 3000;

bootstrap()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[bootstrap] falhou:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] a correr na porta ${PORT}`);
    });
  });
