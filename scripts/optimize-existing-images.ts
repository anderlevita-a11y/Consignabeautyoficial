import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY (service role) in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function optimizeImage(bucket, filePath) {
  try {
    // 1. Download from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (downloadError) {
      console.error(`Error downloading ${filePath}:`, downloadError.message);
      return null;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // 2. Process with sharp
    const optimizedBuffer = await sharp(buffer)
      .resize({
        width: 1920,
        height: 1080,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 80 })
      .toBuffer();

    // 3. Determine new path
    const fileExt = path.extname(filePath);
    const newPath = filePath.replace(new RegExp(`\\${fileExt}$`), '.webp');

    // 4. Upload back
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(newPath, optimizedBuffer, {
        contentType: 'image/webp',
        upsert: true
      });

    if (uploadError) {
      console.error(`Error uploading optimized ${newPath}:`, uploadError.message);
      return null;
    }

    // 5. Remove old if different extension
    if (newPath !== filePath) {
      await supabase.storage.from(bucket).remove([filePath]);
    }

    // 6. Get new public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(newPath);

    return publicUrl;
  } catch (error) {
    console.error(`Unexpected error processing ${filePath}:`, error);
    return null;
  }
}

async function run() {
  console.log('Starting batch image optimization...');

  // --- Optimize Products ---
  console.log('Optimizing Product images...');
  const { data: products, error: pError } = await supabase
    .from('products')
    .select('id, photo_url, image_urls');

  if (pError) {
    console.error('Error fetching products:', pError);
  } else {
    for (const product of products) {
      let updated = false;
      const updates: any = {};

      // photo_url
      if (product.photo_url && product.photo_url.includes('/storage/v1/object/public/products/')) {
        const filePath = product.photo_url.split('/products/')[1];
        if (!filePath.endsWith('.webp')) {
          console.log(`Processing product ${product.id} photo...`);
          const newUrl = await optimizeImage('products', filePath);
          if (newUrl) {
            updates.photo_url = newUrl;
            updated = true;
          }
        }
      }

      // image_urls
      if (product.image_urls && Array.isArray(product.image_urls)) {
        const newUrls = [...product.image_urls];
        let urlsChanged = false;
        for (let i = 0; i < newUrls.length; i++) {
          const url = newUrls[i];
          if (url && url.includes('/storage/v1/object/public/products/')) {
            const filePath = url.split('/products/')[1];
            if (!filePath.endsWith('.webp')) {
              console.log(`Processing product ${product.id} image_url[${i}]...`);
              const newUrl = await optimizeImage('products', filePath);
              if (newUrl) {
                newUrls[i] = newUrl;
                urlsChanged = true;
              }
            }
          }
        }
        if (urlsChanged) {
          updates.image_urls = newUrls;
          updated = true;
        }
      }

      if (updated) {
        const { error: uError } = await supabase
          .from('products')
          .update(updates)
          .eq('id', product.id);
        if (uError) console.error(`Error updating product ${product.id}:`, uError);
      }
    }
  }

  // --- Optimize Profiles ---
  console.log('Optimizing Profile documents...');
  const { data: profiles, error: prError } = await supabase
    .from('profiles')
    .select('id, documento_url');

  if (prError) {
    console.error('Error fetching profiles:', prError);
  } else {
    for (const profile of profiles) {
      if (profile.documento_url && profile.documento_url.includes('/storage/v1/object/public/documents/')) {
        const filePath = profile.documento_url.split('/documents/')[1];
        if (!filePath.endsWith('.webp')) {
          console.log(`Processing profile ${profile.id} document...`);
          const newUrl = await optimizeImage('documents', filePath);
          if (newUrl) {
            await supabase
              .from('profiles')
              .update({ documento_url: newUrl })
              .eq('id', profile.id);
          }
        }
      }
    }
  }

  console.log('Optimization complete!');
}

run().catch(console.error);
