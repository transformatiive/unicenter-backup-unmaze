-- Schema REAL da tabela contacts, gerado a partir do cabeçalho verdadeiro de
-- Contactos_Consolidado.csv (89 colunas do export consolidado Unmaze/akademis).
-- Os nomes de coluna são exatamente os nomes sanitizados que scripts/import_csv.js
-- produz (minúsculas, acentos removidos, não-alfanuméricos -> "_"), para o mapeamento
-- automático do import bater a 100%, sem qualquer pré-processamento do ficheiro.
--
-- A coluna "id" do CSV não é guardada como coluna própria (coincide com a PK serial
-- da app); o seu valor está preservado dentro de "chavealunounmaze", que tem o
-- formato "<id>-<nome do aluno>". Se um dia for preciso o id em bruto, acrescenta-se
-- uma coluna e mapeia-se.
--
-- Colunas geridas pela app (não vêm do CSV): id, deleted_at, deleted_reason,
-- created_at, updated_at.

CREATE TABLE IF NOT EXISTS contacts (
  id                  SERIAL PRIMARY KEY,
  id_import                TEXT,
  chavealunounmaze         TEXT,
  chavealuno               TEXT,
  chaveee                  TEXT,
  id_entidade_crm          TEXT,
  name                     TEXT,
  phone_number             TEXT,
  email                    TEXT,
  telefone                 TEXT,
  telefone_1               TEXT,
  telefone_2               TEXT,
  telefone_3               TEXT,
  telemvel                 TEXT,
  nif                      TEXT,
  nif_1                    TEXT,
  nif_2                    TEXT,
  numero_do_documento      TEXT,
  tipo_de_documento_id     TEXT,
  data_de_nascimento       TEXT,
  sexo_id                  TEXT,
  gnero_id                 TEXT,
  estado_civil_id          TEXT,
  habilitaes_literrias     TEXT,
  escola                   TEXT,
  polo                     TEXT,
  ano_escolar              TEXT,
  ano_letivo_novo          TEXT,
  turma_1                  TEXT,
  ano_1                    TEXT,
  ano_lectivo_1            TEXT,
  rua                      TEXT,
  localidade               TEXT,
  cod_postal               TEXT,
  address_id               TEXT,
  campanha_actual          TEXT,
  campanhas_passadas_ss    TEXT,
  tipologia_marketing_id   TEXT,
  nome_de_encarregado_d    TEXT,
  nome_de_encarregado_d_1  TEXT,
  email_ee                 TEXT,
  email_ee_1               TEXT,
  carto_de_cidado_n        TEXT,
  carto_de_cidado_n_ee     TEXT,
  status_name              TEXT,
  estado_contacto_id       TEXT,
  channel_id               TEXT,
  referral_id              TEXT,
  user_owner_id            TEXT,
  operador_de_call_cent_id TEXT,
  responsvel_pela_recol_id TEXT,
  createdat                TEXT,
  updatedat                TEXT,
  data_de_atribuio_do_c    TEXT,
  data_de_insero_akadem    TEXT,
  obs_aluno                TEXT,
  obs_ee                   TEXT,
  observaes                TEXT,
  source_unmaze            TEXT,
  organization_id          TEXT,
  pipe_id                  TEXT,
  resultado_id             TEXT,
  valido_at                TEXT,
  valido_at_1              TEXT,
  profisso                 TEXT,
  tipo_de_filiao_id        TEXT,
  tipo_de_contacto_id      TEXT,
  profisso_1               TEXT,
  inscrito_no_curso_ss     TEXT,
  valido_at_2              TEXT,
  estado_civil_1_id        TEXT,
  pasta_documentos         TEXT,
  cdigo_de_ao              TEXT,
  id_akademis              TEXT,
  contact_id               TEXT,
  nome_do_projecto_ss      TEXT,
  autorizao_uso_dos_dad    TEXT,
  ano_2_id                 TEXT,
  tipo_de_questionrio_id   TEXT,
  horrio_preferido_id      TEXT,
  marcacao                 TEXT,
  id_google_calendar       TEXT,
  calendario_id            TEXT,
  calendario_zona_id       TEXT,
  calendario_zona_custo_id TEXT,
  tem_hora_marcada         TEXT,
  habilitacaoes_do_enca_id TEXT,
  webinar_ss               TEXT,
  webinar_presenca_ss      TEXT,
  deleted_at          TIMESTAMPTZ,        -- soft delete p/ pedidos RGPD
  deleted_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_chavealunounmaze ON contacts (chavealunounmaze);
CREATE INDEX IF NOT EXISTS idx_contacts_chavealuno ON contacts (chavealuno);
CREATE INDEX IF NOT EXISTS idx_contacts_chaveee ON contacts (chaveee);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);
CREATE INDEX IF NOT EXISTS idx_contacts_nome_de_encarregado_d ON contacts (nome_de_encarregado_d);
CREATE INDEX IF NOT EXISTS idx_contacts_telefone ON contacts (telefone);
CREATE INDEX IF NOT EXISTS idx_contacts_telemvel ON contacts (telemvel);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email);
CREATE INDEX IF NOT EXISTS idx_contacts_email_ee ON contacts (email_ee);
CREATE INDEX IF NOT EXISTS idx_contacts_nif ON contacts (nif);
CREATE INDEX IF NOT EXISTS idx_contacts_escola ON contacts (escola);
CREATE INDEX IF NOT EXISTS idx_contacts_localidade ON contacts (localidade);
CREATE INDEX IF NOT EXISTS idx_contacts_cod_postal ON contacts (cod_postal);
CREATE INDEX IF NOT EXISTS idx_contacts_campanha_actual ON contacts (campanha_actual);
CREATE INDEX IF NOT EXISTS idx_contacts_status_name ON contacts (status_name);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at ON contacts (deleted_at);
