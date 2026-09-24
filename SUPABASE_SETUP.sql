-- CONFIGURAÇÃO DE SEGURANÇA SUPABASE (RLS)
-- Este arquivo contém o código SQL para habilitar Row Level Security e definir políticas
-- que garantem a Idempotência e a Proteção de Dados (LGPD) em toda a plataforma.

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bag_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE mystery_bag_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE mystery_bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- 2. Políticas para a tabela PROFILES (Usuário logado vê apenas seu perfil)
CREATE POLICY "Usuários podem ver seu próprio perfil" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 3. Políticas para CUSTOMERS (Isolamento por consultor)
CREATE POLICY "Consultores podem ver seus próprios clientes" ON customers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Consultores podem gerenciar seus próprios clientes" ON customers
  FOR ALL USING (auth.uid() = user_id);

-- 4. Políticas para PRODUCTS
CREATE POLICY "Consultores gerenciam seu próprio estoque" ON products
  FOR ALL USING (auth.uid() = user_id);

-- 5. Políticas para BAGS e BAG_ITEMS (Sacolas)
CREATE POLICY "Consultores gerenciam suas sacolas" ON bags
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Itens da sacola protegidos por relacionamento" ON bag_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bags 
      WHERE bags.id = bag_items.bag_id 
      AND bags.user_id = auth.uid()
    )
  );

-- 6. Políticas para CAMPAIGNS
CREATE POLICY "Consultores gerenciam suas campanhas" ON campaigns
  FOR ALL USING (auth.uid() = user_id);

-- 7. Políticas para SACALAS PREMIADAS (Mystery Bags)
CREATE POLICY "Consultores gerenciam suas campanhas premiadas" ON mystery_bag_campaigns
  FOR ALL USING (auth.uid() = user_id);

-- Público pode VER campanhas ativas para participar
CREATE POLICY "Público pode ver detalhes da campanha premiada" ON mystery_bag_campaigns
  FOR SELECT USING (status = 'active');

CREATE POLICY "Público pode ver sacolas da campanha" ON mystery_bags
  FOR SELECT USING (true); -- Necessário para exibição pública na reserva

-- Reserva de Sacola Premiada (Idempotência via CHECK de status 'available')
CREATE POLICY "Público pode reservar sacolas disponíveis" ON mystery_bags
  FOR UPDATE USING (status = 'available') 
  WITH CHECK (status = 'reserved');

-- 8. Políticas para COMPROVANTES DE PAGAMENTO
CREATE POLICY "Usuários veem seus próprios comprovantes" ON payment_receipts
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Usuários e Admins gerenciam comprovantes" ON payment_receipts
  FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 9. FUNÇÃO PARA TRIGGERS DE LOG (OPCIONAL PARA GOVERNANÇA)
-- Exemplo de restrição de idempotência via UNIQUE INDEX:
-- ALTER TABLE customers ADD CONSTRAINT unique_cpf_per_consultant UNIQUE (user_id, cpf);
