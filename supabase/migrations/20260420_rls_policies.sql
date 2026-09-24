-- 
-- Row Level Security (RLS) Policies for Consigna Beauty
-- 

-- Enable RLS for all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bag_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_legal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_notepad ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE mystery_bag_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE mystery_bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffle_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sweepstakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sweepstakes_participants ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Users can only see and edit their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Products: Users can only manage their own products
CREATE POLICY "Users can manage own products" ON products 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Customers: Users can only manage their own customers
CREATE POLICY "Users can manage own customers" ON customers 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Campaigns: Users can only manage their own campaigns
CREATE POLICY "Users can manage own campaigns" ON campaigns 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Bags: Users can only manage their own bags
CREATE POLICY "Users can manage own bags" ON bags 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Bag Items: Users can only manage items for their own bags
-- Note: This assumes a join or user_id column. If no user_id, we check the bag's user_id.
CREATE POLICY "Users can manage own bag items" ON bag_items 
  FOR ALL USING (EXISTS (SELECT 1 FROM bags WHERE bags.id = bag_id AND bags.user_id = auth.uid()));

-- 7. Transactions: Users can only manage their own transactions
CREATE POLICY "Users can manage own transactions" ON financial_transactions 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Legal Settings: Publicly readable, only readable
CREATE POLICY "Legal settings are publicly readable" ON app_legal_settings FOR SELECT USING (true);

-- 9. Store Settings: Publicly readable for the catalog/storefront, but only user can edit
CREATE POLICY "Store settings are publicly readable" ON store_settings FOR SELECT USING (true);
CREATE POLICY "Users can manage own store settings" ON store_settings 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10. Smart Notepad & Insights
CREATE POLICY "Users can manage own notepad" ON smart_notepad 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own insights" ON daily_insights 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11. Routes & Stops
CREATE POLICY "Users can manage own routes" ON routes 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own route stops" ON route_stops 
  FOR ALL USING (EXISTS (SELECT 1 FROM routes WHERE routes.id = route_id AND routes.user_id = auth.uid()));

-- 12. Mystery Bags, Raffles, Sweepstakes
CREATE POLICY "Users can manage own mystery campaigns" ON mystery_bag_campaigns 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own mystery bags" ON mystery_bags 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can view active mystery campaigns" ON mystery_bag_campaigns FOR SELECT USING (status = 'active');

CREATE POLICY "Users can manage own raffles" ON raffles 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own sweepstakes" ON sweepstakes 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 13. Public/Anonymous participants (Raffle/Sweepstakes)
-- For public sweepstakes/raffles, we might allow anonymous insert to participants tables
CREATE POLICY "Public can join sweepstakes" ON sweepstakes_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can buy raffle tickets" ON raffle_tickets FOR INSERT WITH CHECK (true);
