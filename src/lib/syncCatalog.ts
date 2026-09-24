import { supabase } from './supabase';

export async function syncCatalog(previewOnly: boolean = false) {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error('Usuário não autenticado');

  // Helper to fetch all rows from a table (bypassing 1000 row limit)
  async function fetchAll(table: string, userId?: string) {
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let finished = false;

    while (!finished) {
      let query = supabase
        .from(table)
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + step - 1);
        
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) {
        console.error(`Error fetching ${table}:`, error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        finished = true;
      } else {
        allData = allData.concat(data);
        if (data.length < step) {
          finished = true;
        } else {
          from += step;
        }
      }
    }
    // Ensure unique records by ID in case of any pagination overlap
    return Array.from(new Map(allData.map(item => [item.id, item])).values());
  }

  // Fetch central products
  const centralProductsData = await fetchAll('central_products');
  if (!centralProductsData || centralProductsData.length === 0) {
    throw new Error('A Central de Produtos está vazia.');
  }

  // Fetch user products
  const userProducts = await fetchAll('products', user.id);

  // Detect duplicates in user's own products
  const userDuplicates = detectUserDuplicates(userProducts);

  // Create maps for efficient lookup
  const userEanMap = new Map();
  const userNameMap = new Map();
  
  (userProducts || []).forEach(p => {
    const trimmedEan = p.ean?.trim();
    if (trimmedEan && trimmedEan !== '0' && trimmedEan !== '') {
      userEanMap.set(trimmedEan, p);
    }
    userNameMap.set(p.name.toLowerCase().trim(), p);
  });

  const productsToInsert = [];
  const productsToUpdate = [];
  const processedEans = new Set();
  const processedNames = new Set();
  const processedUserProductIds = new Set();

  for (const centralProduct of centralProductsData) {
    const rawEan = centralProduct.ean?.trim();
    const isValidEan = rawEan && rawEan !== '0' && rawEan !== '';
    const normalizedName = centralProduct.name.toLowerCase().trim();

    if (isValidEan) {
      if (processedEans.has(rawEan)) continue;
      processedEans.add(rawEan);
    } else {
      if (processedNames.has(normalizedName)) continue;
      processedNames.add(normalizedName);
    }

    let existingProduct = null;
    
    if (isValidEan) {
      existingProduct = userEanMap.get(rawEan);
    }
    
    if (!existingProduct) {
      existingProduct = userNameMap.get(normalizedName);
    }

    if (existingProduct) {
      if (processedUserProductIds.has(existingProduct.id)) continue;
      processedUserProductIds.add(existingProduct.id);

      const hasChanged = 
        existingProduct.name !== centralProduct.name ||
        existingProduct.sale_price !== centralProduct.sale_price ||
        existingProduct.cost_price !== centralProduct.cost_price ||
        existingProduct.label_name !== centralProduct.label_name ||
        existingProduct.photo_url !== centralProduct.photo_url ||
        existingProduct.has_grid !== centralProduct.has_grid;

      if (hasChanged) {
        productsToUpdate.push({
          id: existingProduct.id,
          payload: {
            name: centralProduct.name,
            label_name: centralProduct.label_name,
            ean: isValidEan ? rawEan : existingProduct.ean,
            cost_price: centralProduct.cost_price,
            sale_price: centralProduct.sale_price,
            photo_url: centralProduct.photo_url || existingProduct.photo_url,
            has_grid: centralProduct.has_grid
          },
          oldData: existingProduct
        });
      }
    } else {
      productsToInsert.push({
        user_id: user.id,
        name: centralProduct.name,
        label_name: centralProduct.label_name,
        ean: isValidEan ? rawEan : null,
        cost_price: centralProduct.cost_price,
        sale_price: centralProduct.sale_price,
        current_stock: 0,
        photo_url: centralProduct.photo_url,
        has_grid: centralProduct.has_grid,
        is_visible_in_store: true
      });
    }
  }

  if (previewOnly) {
    return {
      inserted: productsToInsert,
      updated: productsToUpdate,
      duplicates: userDuplicates
    };
  }

  if (productsToInsert.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < productsToInsert.length; i += chunkSize) {
      const chunk = productsToInsert.slice(i, i + chunkSize);
      const { error: insertError } = await supabase.from('products').insert(chunk);
      if (insertError) {
        console.error('Error inserting products in sync:', insertError);
        throw new Error(`Erro ao inserir produtos: ${insertError.message || JSON.stringify(insertError)}`);
      }
    }
  }

  if (productsToUpdate.length > 0) {
    const chunkSize = 20;
    for (let i = 0; i < productsToUpdate.length; i += chunkSize) {
      const chunk = productsToUpdate.slice(i, i + chunkSize);
      const results = await Promise.all(chunk.map(p => 
        supabase.from('products').update(p.payload).eq('id', p.id)
      ));
      
      const errorResult = results.find(r => r.error);
      if (errorResult?.error) {
        console.error('Error updating product in sync:', errorResult.error);
        throw new Error(`Erro ao atualizar produto: ${errorResult.error.message || JSON.stringify(errorResult.error)}`);
      }
    }
  }

  return { 
    inserted: productsToInsert, 
    updated: productsToUpdate,
    duplicates: userDuplicates
  };
}

export function detectUserDuplicates(products: any[]) {
  const duplicates: { key: string; type: 'ean' | 'name'; products: any[] }[] = [];
  const eanGroups = new Map<string, any[]>();
  const nameGroups = new Map<string, any[]>();

  products.forEach(p => {
    const ean = p.ean?.trim();
    if (ean && ean !== '0' && ean !== '') {
      if (!eanGroups.has(ean)) eanGroups.set(ean, []);
      eanGroups.get(ean)!.push(p);
    }
    const name = p.name.toLowerCase().trim();
    if (!nameGroups.has(name)) nameGroups.set(name, []);
    nameGroups.get(name)!.push(p);
  });

  eanGroups.forEach((group, ean) => {
    if (group.length > 1) {
      duplicates.push({ key: ean, type: 'ean', products: group });
    }
  });

  nameGroups.forEach((group, name) => {
    if (group.length > 1) {
      // Only add as name duplicate if not already in an EAN duplicate group
      // to avoid double counting
      const alreadyInEanGroup = group.some(p => {
        const ean = p.ean?.trim();
        return ean && ean !== '0' && ean !== '' && eanGroups.get(ean)!.length > 1;
      });
      if (!alreadyInEanGroup) {
        duplicates.push({ key: name, type: 'name', products: group });
      }
    }
  });

  return duplicates;
}

export async function getLinkedProductIds(userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('bag_items')
      .select('product_id, bags!inner(user_id)')
      .eq('bags.user_id', userId);
    
    if (error) throw error;
    
    const linkedIds = new Set(
      (data || [])
        .map(item => item.product_id)
        .filter((id): id is string => !!id)
    );
    
    return linkedIds;
  } catch (err) {
    console.error('Error fetching linked product IDs:', err);
    return new Set();
  }
}

export async function resolveDuplicates(duplicateIdsToDelete: string[]) {
  if (duplicateIdsToDelete.length === 0) return;

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error('Usuário não autenticado');

  // Safety check: Don't allow deleting linked products even if requested
  const linkedIds = await getLinkedProductIds(user.id);
  const safeToDelete = duplicateIdsToDelete.filter(id => !linkedIds.has(id));

  if (safeToDelete.length === 0) return;

  const chunkSize = 50;
  for (let i = 0; i < safeToDelete.length; i += chunkSize) {
    const chunk = safeToDelete.slice(i, i + chunkSize);
    const { error } = await supabase.from('products').delete().in('id', chunk);
    if (error) {
      console.error('Error deleting duplicates:', error);
      throw new Error(`Erro ao excluir duplicados: ${error.message}`);
    }
  }
}
