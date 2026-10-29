-- ============================================================================
-- Documentos e comprovantes em buckets PRIVADOS (LGPD)
-- ============================================================================
-- Buckets: documents, residence_proofs, receipts, payment_proofs, proofs
--
-- Antes: buckets públicos. Qualquer pessoa com o link (ou com a chave anon do
-- site, que é pública) podia ver documentos de identidade, comprovantes de
-- residência e comprovantes de pagamento.
--
-- Depois: sem link público. O app gera links temporários (src/lib/privateFiles.ts)
-- e o Supabase só entrega o arquivo a quem estas políticas permitem:
--   • o dono da pasta (1º nível = id do usuário; em documents também documents/<id>/)
--   • a revendedora dona da rifa/campanha, para comprovantes enviados pelas
--     páginas públicas (payment_proofs/<id da rifa ou campanha>/...)
--   • administradores (profiles.role = 'admin')
-- Quem compra pela página pública continua podendo ENVIAR o comprovante,
-- mas não consegue ver nem listar os arquivos.
--
-- ORDEM: publique primeiro a versão do app com src/lib/privateFiles.ts.
-- Depois rode o diagnóstico (supabase/diagnostico_storage_policies.sql) e só
-- então este arquivo, inteiro, no SQL Editor.
-- ============================================================================

begin;

-- 1. Funções de apoio -------------------------------------------------------
-- SECURITY DEFINER: consultam profiles/raffles/campanhas sem depender das
-- políticas dessas tabelas (e sem recursão). Só devolvem verdadeiro/falso.

create or replace function public.cb_is_storage_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'admin' or email in ('anderlevita@gmail.com'))
  );
$$;

-- Pasta do 1º nível é uma rifa ou campanha de sacola surpresa (páginas públicas)
create or replace function public.cb_is_public_campaign_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select folder is not null and (
    exists (select 1 from public.raffles r where r.id::text = folder)
    or exists (select 1 from public.mystery_bag_campaigns c where c.id::text = folder)
  );
$$;

-- A pessoa logada é dona da rifa/campanha daquela pasta
create or replace function public.cb_owns_campaign_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and folder is not null and (
    exists (select 1 from public.raffles r where r.id::text = folder and r.user_id = auth.uid())
    or exists (select 1 from public.mystery_bag_campaigns c where c.id::text = folder and c.user_id = auth.uid())
  );
$$;

-- Caminho está na pasta do próprio usuário
create or replace function public.cb_is_own_storage_path(bucket text, object_name text)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and (
    (storage.foldername(object_name))[1] = auth.uid()::text
    or (
      bucket = 'documents'
      and (storage.foldername(object_name))[1] = 'documents'
      and (storage.foldername(object_name))[2] = auth.uid()::text
    )
  );
$$;

revoke all on function public.cb_is_storage_admin() from public;
revoke all on function public.cb_is_public_campaign_folder(text) from public;
revoke all on function public.cb_owns_campaign_folder(text) from public;
revoke all on function public.cb_is_own_storage_path(text, text) from public;
grant execute on function public.cb_is_storage_admin() to anon, authenticated;
grant execute on function public.cb_is_public_campaign_folder(text) to anon, authenticated;
grant execute on function public.cb_owns_campaign_folder(text) to anon, authenticated;
grant execute on function public.cb_is_own_storage_path(text, text) to anon, authenticated;

-- 2. Remove políticas antigas que davam acesso público a esses buckets ------
-- Conservador: só remove a política se TODOS os textos entre aspas dela forem
-- buckets privados (ou nomes de papel como 'authenticated'). Se ela citar
-- qualquer outro texto (ex.: o bucket products), não é tocada e aparece como
-- aviso "REVISAR". Políticas de leitura que valem para todos os buckets
-- também viram aviso.
do $$
declare
  pol record;
  privados text[] := array['documents','residence_proofs','receipts','payment_proofs','proofs'];
  papeis text[] := array['authenticated','anon','service_role'];
  cita_privado boolean;
  cita_outro boolean;
begin
  for pol in
    select policyname, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as e
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname not like 'cb\_%'
  loop
    cita_privado := exists (
      select 1 from regexp_matches(pol.e, '''([^'']*)''', 'g') as m(v)
      where m.v[1] = any (privados)
    );
    cita_outro := exists (
      select 1 from regexp_matches(pol.e, '''([^'']*)''', 'g') as m(v)
      where m.v[1] <> all (privados) and m.v[1] <> all (papeis)
    );
    if cita_privado and not cita_outro then
      execute format('drop policy %I on storage.objects', pol.policyname);
      raise notice 'Removida: %', pol.policyname;
    elsif cita_privado then
      raise notice 'REVISAR (cita bucket privado e outros textos): %', pol.policyname;
    elsif pol.e !~ 'bucket_id' and pol.cmd in ('SELECT', 'ALL') then
      raise notice 'REVISAR (leitura vale para todos os buckets): %', pol.policyname;
    end if;
  end loop;
end $$;

-- 3. Torna os buckets privados e limita tipo/tamanho dos arquivos ----------
update storage.buckets
set public = false,
    file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array[
      'image/webp', 'image/jpeg', 'image/png', 'image/gif',
      'image/heic', 'image/heif', 'application/pdf'
    ]
where id in ('documents', 'residence_proofs', 'receipts', 'payment_proofs', 'proofs');

-- 4. Novas políticas --------------------------------------------------------
drop policy if exists "cb_privados_ler" on storage.objects;
drop policy if exists "cb_privados_enviar_proprio" on storage.objects;
drop policy if exists "cb_comprovante_pagina_publica" on storage.objects;
drop policy if exists "cb_privados_excluir" on storage.objects;

-- Ler / gerar link temporário: dono, revendedora da rifa/campanha, admin
create policy "cb_privados_ler"
on storage.objects for select
to authenticated
using (
  bucket_id in ('documents', 'residence_proofs', 'receipts', 'payment_proofs', 'proofs')
  and (
    public.cb_is_own_storage_path(bucket_id, name)
    or (bucket_id = 'payment_proofs' and public.cb_owns_campaign_folder((storage.foldername(name))[1]))
    or public.cb_is_storage_admin()
  )
);

-- Enviar arquivo na própria pasta (usuário logado)
create policy "cb_privados_enviar_proprio"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('documents', 'residence_proofs', 'receipts', 'payment_proofs', 'proofs')
  and public.cb_is_own_storage_path(bucket_id, name)
);

-- Comprador da página pública envia comprovante na pasta da rifa/campanha
create policy "cb_comprovante_pagina_publica"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'payment_proofs'
  and public.cb_is_public_campaign_folder((storage.foldername(name))[1])
);

-- Excluir: dono ou admin
create policy "cb_privados_excluir"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('documents', 'residence_proofs', 'receipts', 'payment_proofs', 'proofs')
  and (public.cb_is_own_storage_path(bucket_id, name) or public.cb_is_storage_admin())
);

commit;

-- 5. Conferência (rode depois) ---------------------------------------------
-- select id, public from storage.buckets order by id;
-- select policyname, cmd, roles from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' order by policyname;
