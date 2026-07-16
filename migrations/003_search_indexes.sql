-- Índices de pesquisa (trigram) para a listagem de contactos.
--
-- A pesquisa usa ILIKE '%termo%' (contém), que com índices B-tree normais faz
-- sequential scan de toda a tabela (~500k linhas) -> lento. Os índices GIN com
-- pg_trgm tornam o ILIKE '%...%' rápido em qualquer um dos campos-chave.
--
-- Idempotente (IF NOT EXISTS). A construção corre uma vez no primeiro arranque
-- depois deste deploy; nos arranques seguintes é no-op.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS trgm_contacts_name                  ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_nome_de_encarregado_d ON contacts USING gin (nome_de_encarregado_d gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_telefone              ON contacts USING gin (telefone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_telemvel             ON contacts USING gin (telemvel gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_email                 ON contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_email_ee              ON contacts USING gin (email_ee gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_escola                ON contacts USING gin (escola gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_localidade            ON contacts USING gin (localidade gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_cod_postal            ON contacts USING gin (cod_postal gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_nif                   ON contacts USING gin (nif gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_campanha_actual       ON contacts USING gin (campanha_actual gin_trgm_ops);
CREATE INDEX IF NOT EXISTS trgm_contacts_chavealunounmaze      ON contacts USING gin (chavealunounmaze gin_trgm_ops);
