/**
 * Otimiza as imagens que JÁ estão no Supabase Storage para reduzir o egress.
 *
 * O que faz, para cada imagem dos buckets públicos:
 *  1. Redimensiona/recomprime para WebP quando ela é maior que o necessário.
 *  2. Regrava NO MESMO CAMINHO (a URL não muda → nada no banco precisa ser alterado)
 *     com cache de 1 ano, para o navegador não baixar de novo a cada hora.
 *  3. Cria a miniatura `_thumb.webp` das fotos de produto (usada em listas/loja).
 *  4. Antes de sobrescrever, guarda o original no bucket privado `backup-originais`
 *     (se ainda não houver cópia lá). Desative com --no-backup.
 *
 * Uso (precisa da service role key — NUNCA coloque essa chave no frontend):
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_KEY=<service_role> npx tsx scripts/optimize-existing-images.ts           # simulação
 *   SUPABASE_URL=...                     SUPABASE_KEY=...             npx tsx scripts/optimize-existing-images.ts --apply   # executa
 *
 * Opções:
 *   --apply       grava as alterações (sem ela, apenas mostra o que seria feito)
 *   --no-backup   não copia os originais para `backup-originais`
 *   --bucket=xxx  processa só um bucket
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_KEY (service role) nas variáveis de ambiente.');
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const BACKUP = !args.includes('--no-backup');
const ONLY_BUCKET = args.find(a => a.startsWith('--bucket='))?.split('=')[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PUBLIC_BUCKETS = ['products', 'documents', 'receipts', 'proofs', 'payment_proofs', 'brand', 'residence_proofs'];
const BACKUP_BUCKET = 'backup-originais';
const LONG_CACHE = '31536000';

type Preset = { max: number; quality: number; thumb?: boolean };

/** Mesmos limites usados no frontend (src/lib/storage.ts). */
function presetFor(bucket: string, path: string): Preset {
  if (bucket === 'products') {
    if (path.startsWith('product-photos/')) return { max: 1200, quality: 80, thumb: true };
    if (path.startsWith('reviews/')) return { max: 320, quality: 75 };
    if (path.startsWith('store-settings/logo')) return { max: 600, quality: 85 };
    if (path.startsWith('store-settings/insta')) return { max: 800, quality: 78 };
    if (path.startsWith('store-settings/')) return { max: 1600, quality: 80 };
    if (path.startsWith('receipts/')) return { max: 1600, quality: 82 };
    return { max: 1200, quality: 80 };
  }
  // documentos e comprovantes: precisam continuar legíveis
  return { max: 1600, quality: 82 };
}

const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif|avif|bmp|tiff?)$/i;

async function listAll(bucket: string, prefix = ''): Promise<{ path: string; size: number; cache?: string }[]> {
  const out: { path: string; size: number; cache?: string }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        out.push(...(await listAll(bucket, full))); // pasta
      } else {
        out.push({
          path: full,
          size: Number((item.metadata as any)?.size || 0),
          cache: (item.metadata as any)?.cacheControl,
        });
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

async function existsIn(bucket: string, path: string) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 5 });
  return !!data?.some(f => f.name === name);
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

async function run() {
  console.log(APPLY ? '>>> MODO EXECUÇÃO (--apply)' : '>>> SIMULAÇÃO (use --apply para gravar)');
  let before = 0;
  let after = 0;
  let thumbs = 0;
  let touched = 0;

  const buckets = ONLY_BUCKET ? [ONLY_BUCKET] : PUBLIC_BUCKETS;
  for (const bucket of buckets) {
    let files: Awaited<ReturnType<typeof listAll>>;
    try {
      files = await listAll(bucket);
    } catch (e: any) {
      console.log(`- bucket ${bucket}: ignorado (${e.message})`);
      continue;
    }
    const images = files.filter(f => IMAGE_RE.test(f.path) && !/_thumb\.webp$/i.test(f.path));
    console.log(`\n== ${bucket}: ${images.length} imagens`);
    const existing = new Set(files.map(f => f.path));

    for (const f of images) {
      const preset = presetFor(bucket, f.path);
      const thumbPath = f.path.replace(/\.[^/.]+$/, '') + '_thumb.webp';
      const needsThumb = !!preset.thumb && !existing.has(thumbPath);
      const cacheOk = (f.cache || '').includes(LONG_CACHE);
      // Pequena e já com cache longo e miniatura → nada a fazer
      if (cacheOk && !needsThumb && f.size < 60 * 1024) continue;

      try {
        const { data: blob, error } = await supabase.storage.from(bucket).download(f.path);
        if (error || !blob) throw error || new Error('download vazio');
        const original = Buffer.from(await blob.arrayBuffer());

        const optimized = await sharp(original, { failOn: 'none' })
          .rotate() // respeita a orientação EXIF
          .resize({ width: preset.max, height: preset.max, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: preset.quality })
          .toBuffer();

        // Só troca o conteúdo se ficou menor; senão apenas corrige o cache
        const useOptimized = optimized.length < original.length * 0.9;
        const finalBuf = useOptimized ? optimized : original;
        const contentType = useOptimized ? 'image/webp' : blob.type || 'application/octet-stream';

        before += original.length;
        after += finalBuf.length;
        touched++;
        console.log(
          `  ${f.path}: ${kb(original.length)} → ${kb(finalBuf.length)}` +
            `${useOptimized ? '' : ' (mantido)'}${cacheOk ? '' : ' +cache'}${needsThumb ? ' +thumb' : ''}`
        );

        if (!APPLY) {
          if (needsThumb) thumbs++;
          continue;
        }

        if (BACKUP && useOptimized) {
          const backupPath = `${bucket}/${f.path}`;
          if (!(await existsIn(BACKUP_BUCKET, backupPath))) {
            const { error: bErr } = await supabase.storage
              .from(BACKUP_BUCKET)
              .upload(backupPath, original, { contentType: blob.type || undefined, upsert: false });
            if (bErr) throw new Error(`backup falhou (${bErr.message}) — arquivo não alterado`);
          }
        }

        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(f.path, finalBuf, { contentType, cacheControl: LONG_CACHE, upsert: true });
        if (upErr) throw upErr;

        if (needsThumb) {
          const thumb = await sharp(finalBuf).resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
          const { error: tErr } = await supabase.storage
            .from(bucket)
            .upload(thumbPath, thumb, { contentType: 'image/webp', cacheControl: LONG_CACHE, upsert: true });
          if (tErr) console.warn(`    miniatura falhou: ${tErr.message}`);
          else thumbs++;
        }
      } catch (e: any) {
        console.error(`  ERRO ${bucket}/${f.path}: ${e?.message || e}`);
      }
    }
  }

  console.log('\n================ RESUMO ================');
  console.log(`Arquivos processados: ${touched}`);
  console.log(`Tamanho: ${mb(before)} → ${mb(after)} (economia de ${mb(before - after)})`);
  console.log(`Miniaturas ${APPLY ? 'criadas' : 'a criar'}: ${thumbs}`);
  if (!APPLY) console.log('\nNada foi alterado. Rode novamente com --apply para gravar.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
