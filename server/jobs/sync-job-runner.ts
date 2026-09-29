import { createClient } from "@supabase/supabase-js";

export interface SyncJobResults {
  new: number;
  updated: number;
  normal: number;
  errors: number;
  totalFound: number;
}

export interface SyncJobState {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  progress: number; // 0 to 100
  currentCategory: string;
  categoryIndex: number;
  totalCategories: number;
  results: SyncJobResults;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  logs: string[];
}

export class SyncJobRunner {
  private static instance: SyncJobRunner;
  private currentState: SyncJobState = {
    id: "",
    status: "idle",
    progress: 0,
    currentCategory: "",
    categoryIndex: 0,
    totalCategories: 0,
    results: { new: 0, updated: 0, normal: 0, errors: 0, totalFound: 0 },
    startedAt: null,
    completedAt: null,
    error: null,
    logs: [],
  };

  private isRunning = false;

  private constructor() {}

  public static getInstance(): SyncJobRunner {
    if (!SyncJobRunner.instance) {
      SyncJobRunner.instance = new SyncJobRunner();
    }
    return SyncJobRunner.instance;
  }

  public getStatus(): SyncJobState {
    return { ...this.currentState };
  }

  private addLog(message: string) {
    const timestamp = new Date().toISOString().split("T")[1].substring(0, 8);
    const line = `[${timestamp}] ${message}`;
    console.log(`[SyncJobRunner] ${line}`);
    this.currentState.logs.push(line);
    if (this.currentState.logs.length > 50) {
      this.currentState.logs.shift();
    }
  }

  public startJob(supabase: any): { started: boolean; message: string; jobId: string } {
    if (this.isRunning) {
      return {
        started: false,
        message: "Uma sincronização já está em andamento no background.",
        jobId: this.currentState.id,
      };
    }

    const jobId = `sync-${Date.now()}`;
    this.isRunning = true;
    this.currentState = {
      id: jobId,
      status: "running",
      progress: 0,
      currentCategory: "Iniciando sessão...",
      categoryIndex: 0,
      totalCategories: 10,
      results: { new: 0, updated: 0, normal: 0, errors: 0, totalFound: 0 },
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      logs: [],
    };

    this.addLog(`Job ${jobId} iniciado em background thread/process.`);

    // Desacoplamento imediato do Event Loop:
    // setImmediate garante que a resposta HTTP 202 retorne antes do início da computação pesada
    setImmediate(() => {
      this.executeJob(supabase, jobId).catch((err) => {
        this.addLog(`Falha fatal no job: ${err.message}`);
        this.currentState.status = "failed";
        this.currentState.error = err.message;
        this.currentState.completedAt = new Date().toISOString();
        this.isRunning = false;
      });
    });

    return {
      started: true,
      message: "Job de sincronização delegado para processamento concorrente em background.",
      jobId,
    };
  }

  private async executeJob(supabase: any, jobId: string) {
    const cpf = process.env.FAVORITA_CPF;
    const senha = process.env.FAVORITA_SENHA;

    if (!cpf || !senha) {
      throw new Error("Credenciais da Favorita (FAVORITA_CPF ou FAVORITA_SENHA) não configuradas no ambiente.");
    }

    let browser: any = null;

    const categorias = [
      { nome: "Lancamentos", id: "1", url: "https://www.catalogofavorita.com.br/search?c=1&order_by=priority" },
      { nome: "Feminino", id: "4", url: "https://www.catalogofavorita.com.br/search?c=4&order_by=priority" },
      { nome: "Masculino", id: "15", url: "https://www.catalogofavorita.com.br/search?c=15&order_by=priority" },
      { nome: "Moda Intima", id: "20", url: "https://www.catalogofavorita.com.br/search?c=20&order_by=priority" },
      { nome: "Cosmeticos", id: "22", url: "https://www.catalogofavorita.com.br/search?c=22&order_by=priority" },
      { nome: "Sex Shop", id: "27", url: "https://www.catalogofavorita.com.br/search?c=27&order_by=priority" },
      { nome: "RMC Casa", id: "71", url: "https://www.catalogofavorita.com.br/search?c=71&order_by=priority" },
      { nome: "Empreendedora", id: "40", url: "https://www.catalogofavorita.com.br/search?c=40&order_by=priority" },
      { nome: "Acao da Semana", id: "35", url: "https://www.catalogofavorita.com.br/search?c=35&order_by=priority" },
      { nome: "Outlet Torra", id: "37", url: "https://www.catalogofavorita.com.br/search?c=37&order_by=priority" },
    ];

    this.currentState.totalCategories = categorias.length;

    try {
      this.addLog("Inicializando runtime isolado do Chromium...");
      const { chromium } = await import("playwright-chromium");

      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", // Previne estouro de memória compartilhada em containers
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
        ],
      });

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);
      await page.setViewportSize({ width: 1280, height: 800 });

      this.addLog("Efetuando autenticação na Favorita...");
      this.currentState.currentCategory = "Autenticando...";
      this.currentState.progress = 5;

      try {
        await page
          .goto("https://www.catalogofavorita.com.br/login", { waitUntil: "networkidle", timeout: 60000 })
          .catch(() => page.goto("https://catalogofavorita.com.br/login", { waitUntil: "networkidle", timeout: 45000 }));

        const loginSelector =
          'input[type="text"], input[name="cpf"], input[id="cpf"], input[type="email"], input[name="login"], input[placeholder*="CPF"]';
        await page.waitForSelector(loginSelector, { timeout: 30000 });
        await page.type(loginSelector, cpf, { delay: 50 });

        const passSelector = 'input[type="password"], input[name="senha"], #senha';
        await page.waitForSelector(passSelector, { timeout: 20000 });
        await page.type(passSelector, senha, { delay: 50 });

        const submitSelector = 'button[type="submit"], .btn-login, #btn-login, input[type="submit"], button:has-text("Entrar")';
        await Promise.all([
          page.click(submitSelector),
          page.waitForNavigation({ waitUntil: "networkidle", timeout: 45000 }).catch(() => {}),
        ]);

        // Trata banner de cookies
        try {
          const cookieButton = await page.$(
            'button:has-text("Aceitar"), #onetrust-accept-btn-handler, .accept-cookies, #btn-aceitar-cookies'
          );
          if (cookieButton) {
            await cookieButton.click();
            await page.waitForTimeout(1000);
          }
        } catch {
          // ignora
        }
      } catch (authErr: any) {
        this.addLog(`Aviso durante autenticação: ${authErr.message}`);
      }

      this.currentState.progress = 10;
      this.addLog("Autenticação finalizada. Iniciando extração por categorias...");

      let categoryIdx = 0;
      for (const cat of categorias) {
        categoryIdx++;
        this.currentState.categoryIndex = categoryIdx;
        this.currentState.currentCategory = cat.nome;
        this.currentState.progress = Math.round(10 + (categoryIdx / categorias.length) * 80);
        this.addLog(`[${categoryIdx}/${categorias.length}] Processando categoria: ${cat.nome}`);

        try {
          await page.goto(cat.url, { waitUntil: "networkidle", timeout: 60000 });

          if (page.url().includes("/login")) {
            this.addLog(`Sessão expirada para ${cat.nome}, pulando...`);
            continue;
          }

          // Aguarda produtos
          try {
            await page.waitForSelector('a[href*="/p"]', { timeout: 20000 });
          } catch {
            this.addLog(`Timeout aguardando links de produtos em ${cat.nome}`);
          }

          // Extração estruturada dentro do browser
          const produtos = await page.evaluate((catNome: string) => {
            const cards = Array.from(document.querySelectorAll('a[href*="/p"]'));
            const data: any[] = [];
            const seenSkus = new Set();

            cards.forEach((card) => {
              const container = card.closest('div[class*="product"], div[class*="item"], article, .vtex-search-result-3-x-galleryItem');
              if (!container) return;

              const texto = (container as HTMLElement).innerText;
              const precoMatch = texto.match(/R\$\s?(\d+[\d.,]*)/);

              if (precoMatch) {
                const link = card.getAttribute("href") || "";
                const sku = link.split("/").pop()?.split("?")[0] || "";
                if (!sku || seenSkus.has(sku)) return;

                seenSkus.add(sku);
                data.push({
                  sku,
                  nome: texto.split("\n")[0].trim().substring(0, 100),
                  preco: parseFloat(precoMatch[1].replace(/\./g, "").replace(",", ".")),
                  categoria: catNome,
                });
              }
            });
            return data;
          }, cat.nome);

          this.addLog(`Encontrados ${produtos.length} produtos em ${cat.nome}. Executando sincronização em lote...`);
          this.currentState.results.totalFound += produtos.length;

          // ==============================================================
          // OTIMIZAÇÃO CRÍTICA DE EVENT LOOP E BANCO DE DADOS (BULK OPS):
          // Em vez de N+1 queries síncronas que travam a fila de microtasks,
          // fazemos lookups e upserts em blocos de 50 registros (O(1)).
          // ==============================================================
          if (produtos.length > 0) {
            const BATCH_SIZE = 50;
            for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
              const chunk = produtos.slice(i, i + BATCH_SIZE);
              const skus = chunk.map((p: any) => p.sku);

              // 1. Busca em lote dos SKUs existentes
              const { data: existingProducts, error: fetchErr } = await supabase
                .from("produtos_favorita")
                .select("sku, preco_atual")
                .in("sku", skus);

              if (fetchErr) {
                this.addLog(`Erro ao buscar lote no Supabase: ${fetchErr.message}`);
                this.currentState.results.errors += chunk.length;
                continue;
              }

              const existingMap = new Map<string, number>();
              if (existingProducts) {
                existingProducts.forEach((ep: any) => {
                  existingMap.set(ep.sku, ep.preco_atual);
                });
              }

              const toUpsert: any[] = [];
              const now = new Date().toISOString();

              for (const p of chunk) {
                const existingPrice = existingMap.get(p.sku);

                if (existingPrice === undefined) {
                  // Novo produto
                  toUpsert.push({
                    sku: p.sku,
                    nome: p.nome,
                    preco_atual: p.preco,
                    categoria: p.categoria,
                    status: "novo",
                    ultima_atualizacao: now,
                  });
                  this.currentState.results.new++;
                } else if (existingPrice !== p.preco) {
                  // Preço alterado
                  toUpsert.push({
                    sku: p.sku,
                    nome: p.nome,
                    preco_anterior: existingPrice,
                    preco_atual: p.preco,
                    categoria: p.categoria,
                    status: "alterado",
                    ultima_atualizacao: now,
                  });
                  this.currentState.results.updated++;
                } else {
                  // Normal / sem alteração
                  toUpsert.push({
                    sku: p.sku,
                    nome: p.nome,
                    preco_atual: p.preco,
                    categoria: p.categoria,
                    status: "normal",
                    ultima_atualizacao: now,
                  });
                  this.currentState.results.normal++;
                }
              }

              // 2. Upsert em lote único no Supabase
              if (toUpsert.length > 0) {
                const { error: upsertErr } = await supabase
                  .from("produtos_favorita")
                  .upsert(toUpsert, { onConflict: "sku" });

                if (upsertErr) {
                  this.addLog(`Erro no upsert em lote: ${upsertErr.message}`);
                  this.currentState.results.errors += toUpsert.length;
                }
              }

              // Cede a thread para a fila de I/O do Event Loop (evita starve do libuv)
              await new Promise((resolve) => setImmediate(resolve));
            }
          }
        } catch (catErr: any) {
          this.addLog(`Erro ao processar ${cat.nome}: ${catErr.message}`);
          this.currentState.results.errors++;
        }
      }

      this.currentState.progress = 100;
      this.currentState.status = "completed";
      this.currentState.completedAt = new Date().toISOString();
      this.addLog(
        `Job finalizado com sucesso! Novos: ${this.currentState.results.new}, Alterados: ${this.currentState.results.updated}, Normais: ${this.currentState.results.normal}, Erros: ${this.currentState.results.errors}`
      );
    } catch (err: any) {
      this.currentState.status = "failed";
      this.currentState.error = err.message;
      this.currentState.completedAt = new Date().toISOString();
      this.addLog(`Falha no Job: ${err.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
      }
      this.isRunning = false;
    }
  }
}
