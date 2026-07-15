-- ATENÇÃO: schema provisório.
-- Construído a partir de "Importar_Contactos_CRM.csv" (ficheiro derivado, mais pequeno,
-- encontrado na mesma pasta do Drive) enquanto aguardamos o cabeçalho real de
-- "Contactos_Consolidado.csv" (335MB, ainda não acessível pelas tools do Drive).
-- Assim que o cabeçalho real for confirmado, esta migração deve ser substituída/ajustada
-- e o import_csv.js atualizado com o mapeamento de colunas correto.

CREATE TABLE IF NOT EXISTS contacts (
  id                  SERIAL PRIMARY KEY,
  external_id         TEXT,
  ee_nome             TEXT,
  ee_telefone         TEXT,
  ee_telefone_2       TEXT,
  ee_telefone_3       TEXT,
  ee_email            TEXT,
  ee_email_secundario TEXT,
  distrito            TEXT,
  concelho            TEXT,
  morada              TEXT,
  codigo_postal       TEXT,
  campanha            TEXT,
  notas               TEXT,
  tags                TEXT,
  aluno_nome          TEXT,
  aluno_genero        TEXT,
  aluno_idade         TEXT,
  aluno_ano           TEXT,
  aluno_turma         TEXT,
  aluno_ano_letivo    TEXT,
  escola_id_unmaze    TEXT,
  escola_nome         TEXT,
  deleted_at          TIMESTAMPTZ,        -- soft delete p/ pedidos RGPD
  deleted_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_ee_nome        ON contacts (ee_nome);
CREATE INDEX IF NOT EXISTS idx_contacts_aluno_nome      ON contacts (aluno_nome);
CREATE INDEX IF NOT EXISTS idx_contacts_ee_telefone     ON contacts (ee_telefone);
CREATE INDEX IF NOT EXISTS idx_contacts_escola_nome     ON contacts (escola_nome);
CREATE INDEX IF NOT EXISTS idx_contacts_distrito        ON contacts (distrito);
CREATE INDEX IF NOT EXISTS idx_contacts_concelho        ON contacts (concelho);
CREATE INDEX IF NOT EXISTS idx_contacts_external_id     ON contacts (external_id);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at      ON contacts (deleted_at);
