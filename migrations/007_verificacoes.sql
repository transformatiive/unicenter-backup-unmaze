-- Resultados de verificações da base de dados (só números, nenhum dado pessoal).
-- Só acrescenta. Idempotente.
CREATE TABLE IF NOT EXISTS verificacoes (
  id        SERIAL PRIMARY KEY,
  tipo      TEXT NOT NULL,
  resultado JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
