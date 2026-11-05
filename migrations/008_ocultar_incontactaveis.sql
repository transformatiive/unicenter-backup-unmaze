-- Esconde (apagamento lógico) os registos sem nenhum telefone e sem nenhum email.
-- Pedido do Nuno a 2026-11-05. Corre uma só vez (fica registado em operacoes_feitas).
-- Os dados NÃO são apagados da base de dados: só ficam com deleted_at preenchido,
-- e a app deixa de os mostrar. Para voltar atrás:
--   UPDATE contacts SET deleted_at = NULL, deleted_reason = NULL
--    WHERE deleted_reason = 'Sem telefone e sem email (2026-11-05)';

CREATE TABLE IF NOT EXISTS operacoes_feitas (
  nome      TEXT PRIMARY KEY,
  feito_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  linhas    INTEGER
);

DO $$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM operacoes_feitas WHERE nome = 'ocultar_incontactaveis_2026_11_05') THEN
    UPDATE contacts
       SET deleted_at = now(),
           deleted_reason = 'Sem telefone e sem email (2026-11-05)'
     WHERE deleted_at IS NULL
       AND NULLIF(btrim(telemvel), '') IS NULL
       AND NULLIF(btrim(telefone), '') IS NULL
       AND NULLIF(btrim(telefone_1), '') IS NULL
       AND NULLIF(btrim(telefone_2), '') IS NULL
       AND NULLIF(btrim(telefone_3), '') IS NULL
       AND NULLIF(btrim(phone_number), '') IS NULL
       AND NULLIF(btrim(email_ee), '') IS NULL
       AND NULLIF(btrim(email), '') IS NULL
       AND NULLIF(btrim(email_ee_1), '') IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO operacoes_feitas (nome, linhas) VALUES ('ocultar_incontactaveis_2026_11_05', n);
  END IF;
END $$;
