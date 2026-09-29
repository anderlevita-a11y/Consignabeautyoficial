export interface SyncProgressUpdate {
  progress: number;
  currentStep: string;
  itemsProcessed?: number;
  totalItemsFound?: number;
}

export type ProgressCallback = (update: SyncProgressUpdate) => void;

export async function runFavoritaSyncOptimized(
  supabase: any,
  onProgress?: ProgressCallback
) {
  const updateProgress = (update: SyncProgressUpdate) => {
    if (onProgress) {
      try {
        onProgress(update);
      } catch (err) {
        console.error('Error reporting progress:', err);
      }
    }
  };

  updateProgress({
    progress: 5,
    currentStep: 'Iniciando sincronização e verificando credenciais...'
  });

  const cpf = process.env.FAVORITA_CPF;
  const senha = process.env.FAVORITA_SENHA;

  if (!cpf || !senha) {
    throw new Error('Credenciais da Favorita (FAVORITA_CPF / FAVORITA_SENHA) não configuradas no ambiente.');
  }

  let browser: any = null;

  const categorias = [
    { nome: 'Lancamentos', id: '1', url: 'https://www.catalogofavorita.com.br/search?c=1&order_by=priority' },
    { nome: 'Feminino', id: '4', url: 'https://www.catalogofavorita.com.br/search?c=4&order_by=priority' },
    { nome: 'Masculino', id: '15', url: 'https://www.catalogofavorita.com.br/search?c=15&order_by=priority' },
    { nome: 'Moda Intima', id: '20', url: 'https://www.catalogofavorita.com.br/search?c=20&order_by=priority' },
    { nome: 'Cosmeticos', id: '22', url: 'https://www.catalogofavorita.com.br/search?c=22&order_by=priority' },
    { nome: 'Sex Shop', id: '27', url: 'https://www.catalogofavorita.com.br/search?c=27&order_by=priority' },
    { nome: 'RMC Casa', id: '71', url: 'https://www.catalogofavorita.com.br/search?c=71&order_by=priority' },
    { nome: 'Empreendedora', id: '40', url: 'https://www.catalogofavorita.com.br/search?c=40&order_by=priority' },
    { nome: 'Acao da Semana', id: '35', url: 'https://www.catalogofavorita.com.br/search?c=35&order_by=priority' },
    { nome: 'Outlet Torra', id: '37', url: 'https://www.catalogofavorita.com.br/search?c=37&order_by=priority' }
  ];

  const results = {
    new: 0,
    updated: 0,
    normal: 0,
    errors: 0
  };

  try {
    updateProgress({
      progress: 10,
      currentStep: 'Carregando produtos de referência...'
    });

    const { chromium } = await import('playwright-chromium');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.setDefaultNavigationTimeout(90000);

    updateProgress({
      progress: 15,
      currentStep: 'Autenticando no portal do parceiro Favorita...'
    });

    try {
      await page.goto('https://www.catalogofavorita.com.br/login', {
        waitUntil: 'networkidle',
        timeout: 90000
      }).catch(() => page.goto('https://catalogofavorita.com.br/login', { waitUntil: 'networkidle', timeout: 60000 }));

      const loginSelector = 'input[type="text"], input[name="cpf"], input[id="cpf"], input[type="email"], input[name="login"], input[placeholder*="CPF"]';
      await page.waitForSelector(loginSelector, { timeout: 45000 });
      await page.type(loginSelector, cpf, { delay: 50 });

      const passSelector = 'input[type="password"], input[name="senha"], #senha';
      await page.waitForSelector(passSelector, { timeout: 30000 });
      await page.type(passSelector, senha, { delay: 50 });

      const submitSelector = 'button[type="submit"], .btn-login, #btn-login, input[type="submit"], button:has-text("Entrar")';
      await Promise.all([
        page.click(submitSelector),
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => console.log('Aviso: Timeout na navegação pós-login.'))
      ]);

      if (page.url().includes('login') || page.url().includes('search?search=')) {
        await page.goto('https://www.catalogofavorita.com.br/search?c=1', { waitUntil: 'networkidle' });
      }

      // Tenta fechar cookies
      try {
        const cookieButton = await page.$('button:has-text("Aceitar"), #onetrust-accept-btn-handler, .accept-cookies, #btn-aceitar-cookies, #btn-aceitar, .cookie-accept');
        if (cookieButton) {
          await cookieButton.click();
          await page.waitForTimeout(1000);
        }
      } catch {}

    } catch (loginError: any) {
      console.warn('Aviso no login:', loginError.message);
    }

    let totalItemsFound = 0;
    let itemsProcessed = 0;

    const baseProgress = 20;
    const progressPerCat = (90 - baseProgress) / categorias.length;

    for (let catIndex = 0; catIndex < categorias.length; catIndex++) {
      const cat = categorias[catIndex];
      const currentCatProgress = Math.round(baseProgress + (catIndex * progressPerCat));

      updateProgress({
        progress: currentCatProgress,
        currentStep: `Extraindo categoria (${catIndex + 1}/${categorias.length}): ${cat.nome}...`,
        itemsProcessed,
        totalItemsFound
      });

      try {
        await page.goto(cat.url, { waitUntil: 'networkidle', timeout: 60000 });

        if (page.url().includes('/login')) {
          continue;
        }

        try {
          await page.waitForSelector('a[href*="/p"]', { timeout: 20000 });
        } catch {
          console.log(`Sem produtos detectados em ${cat.nome}`);
        }

        const produtos: any[] = await page.evaluate((categoriaNome: string) => {
          const cards = Array.from(document.querySelectorAll('a[href*="/p"]'));
          const data: any[] = [];
          const seenSkus = new Set();

          cards.forEach(card => {
            const container = card.closest('div[class*="product"], div[class*="item"], article, .vtex-search-result-3-x-galleryItem');
            if (!container) return;

            const texto = (container as HTMLElement).innerText;
            const precoMatch = texto.match(/R\$\s?(\d+[\d.,]*)/);

            if (precoMatch) {
              const link = card.getAttribute('href') || '';
              const sku = link.split('/').pop()?.split('?')[0] || '';
              if (!sku || seenSkus.has(sku)) return;

              seenSkus.add(sku);
              data.push({
                sku,
                nome: texto.split('\n')[0].trim().substring(0, 100),
                preco: parseFloat(precoMatch[1].replace(/\./g, '').replace(',', '.')),
                categoria: categoriaNome
              });
            }
          });
          return data;
        }, cat.nome);

        totalItemsFound += produtos.length;

        // Processamento em Lote (Batching) no Supabase:
        // Evita 1 query por produto; processa em lotes de 50
        const BATCH_SIZE = 50;
        for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
          const chunk = produtos.slice(i, i + BATCH_SIZE);
          const skus = chunk.map(p => p.sku);

          // 1. Busca todos os existentes do lote em uma única query
          const { data: existingProducts } = await supabase
            .from('produtos_favorita')
            .select('sku, preco_atual')
            .in('sku', skus);

          const existingMap = new Map<string, number>();
          if (existingProducts) {
            existingProducts.forEach((ep: any) => existingMap.set(ep.sku, ep.preco_atual));
          }

          // Separa para inserts e updates
          const toInsert: any[] = [];
          const toUpdateChanged: any[] = [];
          const toUpdateNormal: string[] = [];

          chunk.forEach(p => {
            if (!existingMap.has(p.sku)) {
              toInsert.push({
                sku: p.sku,
                nome: p.nome,
                preco_atual: p.preco,
                categoria: p.categoria,
                status: 'novo',
                ultima_atualizacao: new Date().toISOString()
              });
            } else {
              const oldPrice = existingMap.get(p.sku);
              if (oldPrice !== p.preco) {
                toUpdateChanged.push({
                  sku: p.sku,
                  preco_anterior: oldPrice,
                  preco_atual: p.preco,
                  status: 'alterado',
                  ultima_atualizacao: new Date().toISOString()
                });
              } else {
                toUpdateNormal.push(p.sku);
              }
            }
          });

          // Executa em lote
          if (toInsert.length > 0) {
            const { error: insErr } = await supabase.from('produtos_favorita').insert(toInsert);
            if (!insErr) results.new += toInsert.length;
            else results.errors += toInsert.length;
          }

          for (const item of toUpdateChanged) {
            const { error: updErr } = await supabase
              .from('produtos_favorita')
              .update({
                preco_anterior: item.preco_anterior,
                preco_atual: item.preco_atual,
                status: 'alterado',
                ultima_atualizacao: item.ultima_atualizacao
              })
              .eq('sku', item.sku);
            if (!updErr) results.updated++;
            else results.errors++;
          }

          if (toUpdateNormal.length > 0) {
            const { error: normErr } = await supabase
              .from('produtos_favorita')
              .update({
                status: 'normal',
                ultima_atualizacao: new Date().toISOString()
              })
              .in('sku', toUpdateNormal);
            if (!normErr) results.normal += toUpdateNormal.length;
            else results.errors += toUpdateNormal.length;
          }

          itemsProcessed += chunk.length;

          // Yield para o event loop não engasgar
          await new Promise(resolve => setImmediate(resolve));
        }

      } catch (catError: any) {
        console.error(`Erro ao processar categoria ${cat.nome}:`, catError.message);
      }
    }

    updateProgress({
      progress: 100,
      currentStep: 'Sincronização concluída com sucesso!',
      itemsProcessed,
      totalItemsFound
    });

    return {
      success: true,
      totalItemsFound,
      results
    };

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
