-- Índice "estreito" para o quadro cruzado e para as contagens da lista.
--
-- A tabela contacts tem ~89 colunas de texto (~2,7 GB). Contar ou agrupar
-- obrigava a ler a tabela inteira. Este índice guarda só o id e as colunas
-- usadas no quadro, por isso o Postgres pode responder lendo só o índice
-- (index-only scan), que é muito mais pequeno.
--
-- Só acrescenta. Não altera nem apaga dados. Idempotente (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_contacts_quadro_cover
  ON contacts (id)
  INCLUDE (localidade, escola, ano_escolar, campanha_actual, status_name,
           channel_id, cod_postal, autorizao_uso_dos_dad)
  WHERE deleted_at IS NULL;
