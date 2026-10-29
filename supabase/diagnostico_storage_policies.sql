-- Diagnóstico (só leitura): como estão os buckets e as políticas do Storage hoje.
-- Rode no SQL Editor ANTES da migração 20261029_buckets_privados_documentos.sql
-- e confira o resultado. Não altera nada.

-- 1. Buckets e se são públicos
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- 2. Políticas da tabela storage.objects
select policyname, cmd, roles, qual as usando, with_check as verificando
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
