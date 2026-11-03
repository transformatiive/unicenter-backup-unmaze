-- Cópia dos ficheiros originais Unmaze ("Contactos_UNMAZE_Geral_part_1..4.csv"),
-- carregada pela página Administração > Ficheiros originais, para comparar com
-- a tabela contacts e preencher campos vazios.
--
-- Só acrescenta tabelas novas. Não altera nem apaga dados de contacts.
-- Idempotente (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS unmaze_fonte (
  fonte_id                 TEXT PRIMARY KEY,   -- coluna "id" do ficheiro original
  ficheiro                 TEXT,
  carregado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_import                TEXT,
  chavealunounmaze         TEXT,
  chavealuno               TEXT,
  chaveee                  TEXT,
  user_owner_id            TEXT,
  address_id               TEXT,
  organization_id          TEXT,
  name                     TEXT,
  phone_number             TEXT,
  email                    TEXT,
  createdat                TEXT,
  updatedat                TEXT,
  pipe_id                  TEXT,
  resultado_id             TEXT,
  telefone                 TEXT,
  telefone_1               TEXT,
  sexo_id                  TEXT,
  nif                      TEXT,
  tipo_de_documento_id     TEXT,
  numero_do_documento      TEXT,
  valido_at                TEXT,
  turma_1                  TEXT,
  obs_aluno                TEXT,
  nome_de_encarregado_d    TEXT,
  carto_de_cidado_n_ee     TEXT,
  valido_at_1              TEXT,
  estado_civil_id          TEXT,
  profisso                 TEXT,
  email_ee                 TEXT,
  tipo_de_filiao_id        TEXT,
  nome_de_encarregado_d_1  TEXT,
  email_ee_1               TEXT,
  tipo_de_contacto_id      TEXT,
  nif_1                    TEXT,
  profisso_1               TEXT,
  inscrito_no_curso_ss     TEXT,
  carto_de_cidado_n        TEXT,
  valido_at_2              TEXT,
  estado_civil_1_id        TEXT,
  nif_2                    TEXT,
  campanhas_passadas_ss    TEXT,
  pasta_documentos         TEXT,
  campanha_actual          TEXT,
  tipologia_marketing_id   TEXT,
  data_de_insero_akadem    TEXT,
  cdigo_de_ao              TEXT,
  id_akademis              TEXT,
  telefone_2               TEXT,
  telemvel                 TEXT,
  telefone_3               TEXT,
  obs_ee                   TEXT,
  escola                   TEXT,
  polo                     TEXT,
  ano_escolar              TEXT,
  data_de_atribuio_do_c    TEXT,
  id_entidade_crm          TEXT,
  rua                      TEXT,
  localidade               TEXT,
  cod_postal               TEXT,
  ano_letivo_novo          TEXT
);

CREATE INDEX IF NOT EXISTS idx_unmaze_fonte_chave ON unmaze_fonte (chavealunounmaze);

-- Resultado de cada comparação (só contagens e ids de contacto de exemplo).
CREATE TABLE IF NOT EXISTS fonte_comparacoes (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER,
  estado       TEXT NOT NULL DEFAULT 'a_calcular',  -- a_calcular | pronto | erro
  resultado    JSONB,
  erro         TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_em TIMESTAMPTZ
);

-- Cada preenchimento: quem, quando, quantos campos.
CREATE TABLE IF NOT EXISTS fonte_preenchimentos (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER,
  estado       TEXT NOT NULL DEFAULT 'a_correr',    -- a_correr | pronto | erro
  colunas      JSONB,
  campos       INTEGER,
  contactos    INTEGER,
  erro         TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminado_em TIMESTAMPTZ
);

-- Que campo de que contacto foi preenchido em cada preenchimento.
-- Antes estava vazio, por isso para desfazer basta voltar a esvaziar.
CREATE TABLE IF NOT EXISTS fonte_preenchimento_campos (
  preenchimento_id INTEGER NOT NULL,
  contact_id       INTEGER NOT NULL,
  coluna           TEXT NOT NULL,
  PRIMARY KEY (preenchimento_id, contact_id, coluna)
);
