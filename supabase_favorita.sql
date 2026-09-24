-- Create the table for Favorita products
CREATE TABLE IF NOT EXISTS public.produtos_favorita (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    preco_atual DECIMAL(10,2) NOT NULL,
    preco_anterior DECIMAL(10,2),
    categoria TEXT,
    status TEXT NOT NULL, -- 'novo', 'alterado', 'normal'
    ultima_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.produtos_favorita ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (admins and users can see the catalog)
CREATE POLICY "Allow authenticated read" ON public.produtos_favorita
    FOR SELECT TO authenticated USING (true);

-- Allow service role to manage everything (for the server-side sync)
CREATE POLICY "Allow service role all" ON public.produtos_favorita
    FOR ALL TO service_role USING (true);

-- Add comment to the table
COMMENT ON TABLE public.produtos_favorita IS 'Tabela para armazenar produtos sincronizados do site da Favorita';
