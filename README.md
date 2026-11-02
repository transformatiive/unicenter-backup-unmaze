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
- [x] Seleção individual/massiva e exportação (agora sempre por lote de envio)
- [x] Quadro cruzado: cruzar dois critérios e escolher grupos com um clique
- [x] Etiquetas, incluindo etiquetar milhares de contactos de uma vez
- [x] Lotes de envio: CSV sem limite, Excel até 50 000 linhas, modelo Zoho Bigin
- [ ] Área de eliminação RGPD — **placeholder apenas**, specs a fornecer
- [ ] Schema de `contacts` a confirmar com o cabeçalho real de `Contactos_Consolidado.csv`
- [ ] Import dos dados reais para produção (pendente do ponto anterior)

## Quadro cruzado, etiquetas e lotes de envio

- **Quadro cruzado** (`/quadro`): escolhe um critério para as linhas e outro para as colunas
  (localidade, escola, ano, campanha, estado, canal, código postal, autorização). Mostra os
  15 e 12 valores mais frequentes; o resto fica em "Outros". Clica em quadrados, linhas ou
  colunas para montar a seleção.
- **Etiquetas** (`/etiquetas`): criar etiquetas e aplicá-las em massa a partir do quadro.
  Não há apagar etiquetas nem contactos (regra: nada de apagar dados).
- **Lotes de envio** (`/lotes`): cada exportação cria um lote com a lista exata de contactos.
  Por defeito o quadro esconde quem já saiu num lote, para não enviar duas vezes.
  Estados: criado, descarregado, importado no Bigin. Cada descarga fica no `audit_log`.
- **Modelos de colunas**: Zoho Bigin (encarregado de educação = contacto, escola = empresa),
  lista, todos os campos sem dados sensíveis, e todos com NIF/documentos/nascimento
  (só administrador).

### A validar com dados reais

- O filtro "Só com autorização de dados" considera autorizado quem tem no campo de
  autorização `sim`, `s`, `yes`, `true`, `1`, `x` ou texto a começar por `autoriz`
  (`AUTH_EXPR` em `src/lib/segment.js`). Confirmar com os valores reais antes de enviar.

### Memória

- CSV: o Postgres gera o ficheiro (`COPY ... TO STDOUT`) e a app só o passa ao browser.
  Teste com 500 000 contactos: 4,7 s, pico de 89 MB.
- Excel: escritor próprio em fio (`src/lib/xlsx.js`). 44 000 linhas x 84 colunas: pico de 108 MB.
- Uma exportação de cada vez por utilizador; ligações à base limitadas a 5 e fechadas após 10 s
  sem uso; `node --max-old-space-size=256`.
- Sugestão: ativar "App Sleeping" (serverless) no Railway, porque a app é pouco usada.
