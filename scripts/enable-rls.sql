-- ============================================================
-- HABILITAR ROW-LEVEL SECURITY NAS TABELAS PUBLICAS
-- Rodar no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ============================================================

-- 1. Tabela reservations
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Permitir leitura, inserção, atualização e exclusão via anon key
-- (o app usa o anon key no server-side; sem autenticação de usuario)
CREATE POLICY "Permitir todas operacoes via anon"
  ON reservations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Tabela settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todas operacoes via anon"
  ON settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
