import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
// Defer playwright import to runtime
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import cron from "node-cron";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

// Define __dirname and __filename in a way that works for both ESM and CJS
let __filename: string;
let __dirname: string;

try {
  // ESM
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  // CJS (after bundle)
  __filename = (globalThis as any).__filename || "";
  __dirname = (globalThis as any).__dirname || process.cwd();
}

// Rate Limiters
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    message: "Muitas requisições originadas deste IP, por favor tente novamente em 15 minutos."
  }
});

const heavyApiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 requests per hour for expensive operations
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Limite de sincronização atingido. Por favor, aguarde uma hora para tentar novamente."
  }
});

async function runFavoritaSync(supabase: any) {
  console.log(`[${new Date().toISOString()}] Starting Favorita Sync...`);
  
  const cpf = process.env.FAVORITA_CPF;
  const senha = process.env.FAVORITA_SENHA;

  if (!cpf || !senha) {
    console.error("ERRO: FAVORITA_CPF ou FAVORITA_SENHA não configurados.");
    return { success: false, error: "Credenciais da Favorita não configuradas." };
  }

  let browser;
  
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
    // 0. Buscar produtos da Central para usar como base de comparação
    const { data: centralProducts, error: centralError } = await supabase
      .from('central_products')
      .select('ean, name, sale_price');
    
    if (centralError) {
      console.error("Error fetching central products:", centralError);
    }

    const centralMap = new Map();
    if (centralProducts) {
      centralProducts.forEach((p: any) => {
        if (p.ean && p.ean !== '0' && p.ean !== '') {
          centralMap.set(p.ean, p);
        }
        if (p.name) {
          centralMap.set(p.name.toLowerCase().trim(), p);
        }
      });
    }
    console.log(`Loaded ${centralMap.size} products from central_products.`);

    const { chromium } = await import("playwright-chromium");
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Aumentar o timeout padrão para 120 segundos (2 minutos)
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Login no site da Favorita
    console.log("Navegando para a página de login...");
    let vtexCookie: string | undefined;
    try {
      await page.goto('https://www.catalogofavorita.com.br/login', { 
        waitUntil: 'networkidle',
        timeout: 120000 
      }).catch(() => page.goto('https://catalogofavorita.com.br/login', { waitUntil: 'networkidle', timeout: 60000 }));
      
      const cpf = process.env.FAVORITA_CPF!;
      const senha = process.env.FAVORITA_SENHA!;

      if (!cpf || !senha) {
        throw new Error("Credenciais da Favorita (CPF/Senha) não configuradas no ambiente.");
      }

      // 1. TENTA PREENCHER (usando seletores mais genéricos para Next.js)
      console.log("Preenchendo credenciais...");
      const loginSelector = 'input[type="text"], input[name="cpf"], input[id="cpf"], input[type="email"], input[name="login"], input[placeholder*="CPF"]';
      await page.waitForSelector(loginSelector, { timeout: 60000 });
      await page.type(loginSelector, cpf, { delay: 100 });
      
      const passSelector = 'input[type="password"], input[name="senha"], #senha';
      await page.waitForSelector(passSelector, { timeout: 30000 });
      await page.type(passSelector, senha, { delay: 100 });

      // 2. CLIQUE E ESPERA REAL
      console.log("Clicando no botão de login...");
      const submitSelector = 'button[type="submit"], .btn-login, #btn-login, input[type="submit"], button:has-text("Entrar")';
      
      // Espera o clique e observa se a URL muda para algo que não seja "search?search="
      await Promise.all([
        page.click(submitSelector),
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => console.log("Aviso: Timeout na navegação pós-login."))
      ]);

      // 3. VERIFICAÇÃO DE SUCESSO
      // Se ainda estiver na página de login ou na busca vazia, tentamos um refresh
      if (page.url().includes('login') || page.url().includes('search?search=')) {
        console.log("Login parece ter ficado preso. Tentando acessar uma categoria direto para forçar sessão...");
        await page.goto('https://www.catalogofavorita.com.br/search?c=1', { waitUntil: 'networkidle' });
      }

      console.log("Login concluído (URL atual: " + page.url() + ")");
      console.log("Título da página: " + await page.title());

      // 4. ACEITAR COOKIES (Essencial para o Next.js renderizar o conteúdo)
      try {
        console.log("Tentando aceitar cookies...");
        const cookieButton = await page.$('button:has-text("Aceitar"), #onetrust-accept-btn-handler, .accept-cookies, #btn-aceitar-cookies, #btn-aceitar, .cookie-accept');
        if (cookieButton) {
          await cookieButton.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        console.log("Banner de cookies não apareceu ou já foi fechado.");
      }
      
      // Esperar um pouco mais para garantir que a sessão foi estabelecida
      await page.waitForTimeout(5000);

      // Capturar cookies de sessão para uso na API
      const cookies = await context.cookies();
      vtexCookie = cookies.find(c => c.name === 'VtexIdclientAutCookie')?.value || process.env.VTEX_TOKEN;
      
      if (vtexCookie) {
        console.log("Sessão VTEX capturada com sucesso.");
      } else {
        console.log("Aviso: Cookie VtexIdclientAutCookie não encontrado. A API pode falhar.");
      }

      } catch (loginError) {
        console.error("Erro durante o login ou captura de sessão:", loginError);
      }
      
      let totalItemsFound = 0;
      for (const cat of categorias) {
        console.log(`Navegando para: ${cat.nome}`);
        try {
          await page.goto(cat.url, { waitUntil: 'networkidle', timeout: 90000 });

          // Verifica se fomos redirecionados para o login
          if (page.url().includes('/login')) {
            console.log("Sessão expirada ou não iniciada. Tentando re-login...");
            // Aqui poderíamos chamar a lógica de login novamente se necessário, 
            // mas por enquanto vamos apenas registrar o aviso.
            continue; 
          }

          // 1. ESPERA O CONTEÚDO CARREGAR (Aguarda links de produtos ou o texto 'R$')
          try {
            // Espera por links de produtos que são o gatilho da extração
            await page.waitForSelector('a[href*="/p"]', { timeout: 30000 });
            // Garantia extra que os preços renderizaram
            await page.waitForFunction(() => document.body.innerText.includes('R$'), { timeout: 10000 });
          } catch (e) {
            console.log(`Aviso: Conteúdo ou preços não detectados em ${cat.nome} após 40s. Tentando extrair o que houver...`);
          }

          // 2. EXTRAÇÃO POR ESTRUTURA
          const produtos = await page.evaluate((categoriaNome) => {
            const cards = Array.from(document.querySelectorAll('a[href*="/p"]'));
            const data: any[] = [];
            const seenSkus = new Set();

            cards.forEach(card => {
              const container = card.closest('div[class*="product"], div[class*="item"], article, .vtex-search-result-3-x-galleryItem');
              if (!container) return;

              const texto = (container as HTMLElement).innerText;
              const precoMatch = texto.match(/R\$\s?(\d+[\d.,]*)/);
              
              if (precoMatch) {
                const link = card.getAttribute('href') || "";
                const sku = link.split('/').pop()?.split('?')[0] || "";
                if (!sku || seenSkus.has(sku)) return;

                seenSkus.add(sku);
                data.push({
                  sku: sku,
                  nome: texto.split('\n')[0].trim().substring(0, 100),
                  preco: parseFloat(precoMatch[1].replace(/\./g, '').replace(',', '.')),
                  categoria: categoriaNome
                });
              }
            });
            return data;
          }, cat.nome);

          console.log(`Sucesso: ${produtos.length} produtos encontrados em ${cat.nome}`);
          totalItemsFound += produtos.length;

          // 3. SALVAR NO SUPABASE (Com lógica de comparação para o seu relatório)
          for (const p of produtos) {
            try {
              const { data: antigo } = await supabase
                .from('produtos_favorita')
                .select('preco_atual')
                .eq('sku', p.sku)
                .maybeSingle();

              if (!antigo) {
                // NOVO PRODUTO
                const { error } = await supabase.from('produtos_favorita').insert({
                  sku: p.sku,
                  nome: p.nome,
                  preco_atual: p.preco,
                  categoria: p.categoria,
                  status: 'novo',
                  ultima_atualizacao: new Date()
                });
                if (!error) results.new++;
                else results.errors++;
              } else if (antigo.preco_atual !== p.preco) {
                // PREÇO ALTERADO
                const { error } = await supabase.from('produtos_favorita').update({
                  preco_anterior: antigo.preco_atual,
                  preco_atual: p.preco,
                  status: 'alterado',
                  ultima_atualizacao: new Date()
                }).eq('sku', p.sku);
                if (!error) results.updated++;
                else results.errors++;
              } else {
                // NORMAL
                await supabase.from('produtos_favorita').update({
                  ultima_atualizacao: new Date(),
                  status: 'normal'
                }).eq('sku', p.sku);
                results.normal++;
              }
            } catch (pError) {
              console.error(`Erro ao processar produto ${p.sku}:`, pError);
              results.errors++;
            }
          }
        } catch (catError) {
          console.error(`Erro ao processar categoria ${cat.nome}:`, catError);
        }
      }

    console.log(`Total products found across all categories: ${totalItemsFound}`);
    console.log(`Sync finished. New: ${results.new}, Updated: ${results.updated}, Normal: ${results.normal}, Errors: ${results.errors}`);
    return { success: true, results };
  } catch (error: any) {
    console.error("Sync error:", error);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

// Lazy initialize Supabase client to avoid crashes if keys are missing
let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SUPABASE_URL ou SUPABASE_KEY não configurados no ambiente (.env). Verifique o painel de segredos do AI Studio.");
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Essential for rate limiting behind reverse proxy (Like AI Studio / Cloud Run)
  app.set('trust proxy', 1);

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://*.supabase.co", "https://js.stripe.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*.supabase.co", "https://*.stripe.com", "https://www.catalogofavorita.com.br"],
        connectSrc: ["'self'", "https://*.supabase.co", "https://api.abacatepay.com", "https://*.stripe.com", "wss://*.supabase.co"],
        frameSrc: ["'self'", "https://js.stripe.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        frameAncestors: ["*"], // Allow the app to be embedded in iframes (required for AI Studio preview)
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: false, // Disables X-Frame-Options to allow embedding
  }));

  app.use(express.json());

  // Schedule Favorita Sync: Every Monday at 08:00
  cron.schedule("0 8 * * 1", async () => {
    console.log("Running scheduled Favorita Sync...");
    try {
      const supabase = getSupabase();
      await runFavoritaSync(supabase);
    } catch (err) {
      console.error("Scheduled sync failed (Supabase not configured):", err);
    }
  });

  // API Route for manual Favorita Sync - applying heavy limiter
  app.post("/api/sync-favorita", heavyApiLimiter, async (req, res) => {
    try {
      const supabase = getSupabase();
      const result = await runFavoritaSync(supabase);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API Route for AbacatePay Payment Link - applying general limiter
  app.post("/api/abacate-pay/create-link", generalApiLimiter, async (req, res) => {
    try {
      const token = process.env.ABACATEPAY_TOKEN;
      if (!token) {
        console.error("ABACATEPAY_TOKEN não configurado.");
        return res.status(500).json({ error: "Configuração de pagamento incompleta (token ausente)." });
      }

      // Using global fetch (Node 18+)
      const response = await fetch("https://api.abacatepay.com/v2/payment-links/create", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("AbacatePay sub-request error:", data);
        return res.status(response.status).json(data);
      }

      res.json(data);
    } catch (err: any) {
      console.error("AbacatePay creation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL ERROR: Failed to start server:", err);
  process.exit(1);
});
