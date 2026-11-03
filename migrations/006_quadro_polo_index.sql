-- Índice "estreito" do quadro cruzado, agora com o polo (região), para o
-- quadro poder ler só o índice (ver 005).
--
-- Só acrescenta. Não altera nem apaga dados. Idempotente (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_contacts_quadro_cover2
  ON contacts (id)
  INCLUDE (polo, localidade, escola, ano_escolar, campanha_actual, status_name,
           channel_id, cod_postal, autorizao_uso_dos_dad)
  WHERE deleted_at IS NULL;
