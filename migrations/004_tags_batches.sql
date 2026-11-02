-- Etiquetas e lotes de envio.
--
-- Só acrescenta tabelas e índices. Não altera nem apaga nenhum contacto.
-- Idempotente (IF NOT EXISTS): corre em todos os arranques sem efeito depois da 1.ª vez.
--
-- Não há ON DELETE CASCADE de propósito: nada nesta app apaga etiquetas, lotes ou contactos.

CREATE TABLE IF NOT EXISTS tags (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  color       TEXT NOT NULL DEFAULT '#0F6468',
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  tag_id      INTEGER NOT NULL REFERENCES tags(id),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags (tag_id);

-- Um lote = uma exportação guardada. Guarda os critérios usados e a lista exata
-- de contactos, para se poder descarregar outra vez e para não enviar o mesmo
-- contacto duas vezes para o Zoho Bigin.
CREATE TABLE IF NOT EXISTS export_batches (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  criteria       JSONB NOT NULL,
  contact_count  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'criado',   -- criado | descarregado | importado_bigin
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_batch_contacts (
  batch_id    INTEGER NOT NULL REFERENCES export_batches(id),
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  PRIMARY KEY (batch_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_export_batch_contacts_contact ON export_batch_contacts (contact_id);

-- Índices para as dimensões do quadro cruzado que ainda não tinham.
CREATE INDEX IF NOT EXISTS idx_contacts_ano_escolar ON contacts (ano_escolar);
CREATE INDEX IF NOT EXISTS idx_contacts_channel_id  ON contacts (channel_id);
