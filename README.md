# Unicenter — Backup Unmaze

Aplicação interna de consulta ao backup de contactos Unmaze (Unicenter): login com utilizadores,
pesquisa/filtragem de registos, exportação para Excel e área de administração de utilizadores.

## Stack

- Node.js + Express
- PostgreSQL (via `pg`), sessões guardadas em Postgres (`connect-pg-simple`)
- Templates server-side com EJS (sem build step)
- `bcryptjs` para hashing de passwords
- `exceljs` para exportação de registos

## Estrutura

```
server.js               entrypoint — arranca a app e corre migrações em falta no boot
src/db.js                pool de ligação Postgres
src/middleware/auth.js    requireAuth / requireAdmin
src/routes/               auth, contacts, admin, gdpr
src/views/                templates EJS
public/                   CSS/JS estático
migrations/                001_init.sql (users, sessions, audit_log), 002_contacts.sql
scripts/
  migrate.js               corre as migrações manualmente
  seed_admin.js             cria/atualiza o utilizador inicial
  import_csv.js             importa um CSV grande (streaming COPY) para a tabela contacts
```

## Variáveis de ambiente

Ver `.env.example`. Em produção (Railway), `DATABASE_URL` e `PORT` são injetadas automaticamente
pelo serviço Postgres. Define também `SESSION_SECRET`, e opcionalmente `SEED_ADMIN_USERNAME` /
`SEED_ADMIN_PASSWORD` para o utilizador inicial (só é criado se a tabela `users` estiver vazia).

**Nota:** se usares um ficheiro `.env` local, valores que contenham `#` têm de estar entre aspas
(ex: `SEED_ADMIN_PASSWORD="a-tua-password#comAlgo"`), porque o dotenv trata `#` sem aspas como
início de comentário — sem aspas a password fica truncada. Isto não afeta variáveis de ambiente
definidas diretamente no Railway (não passam pelo parser do dotenv).

## Arranque local

```bash
npm install
cp .env.example .env   # e edita DATABASE_URL, etc.
npm run migrate
npm run seed:admin
npm start
```

## Importar o backup de contactos

```bash
DATABASE_URL=... node scripts/import_csv.js /caminho/para/Contactos_Consolidado.csv
```

O script lê o cabeçalho do CSV, copia tudo (streaming) para uma tabela de staging e depois
insere na tabela `contacts` apenas as colunas com nome correspondente. Colunas do CSV sem
correspondência ficam registadas no log — se o schema real do ficheiro for diferente do que
está em `migrations/002_contacts.sql`, ajusta essa migração (e a lista `SEARCHABLE_FIELDS` /
`LIST_COLUMNS` em `src/routes/contacts.js`) antes de importar.

## Estado atual

- [x] Login / logout, sessões em Postgres
- [x] Administração de utilizadores (criar, ativar/desativar, redefinir password)
- [x] Pesquisa e filtragem de contactos por campos-chave
- [x] Seleção individual/massiva e exportação para Excel
- [ ] Área de eliminação RGPD — **placeholder apenas**, specs a fornecer
- [ ] Schema de `contacts` a confirmar com o cabeçalho real de `Contactos_Consolidado.csv`
- [ ] Import dos dados reais para produção (pendente do ponto anterior)
