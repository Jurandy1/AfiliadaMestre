
        // Backend local: npm start → http://localhost:3789
        // Mesma origem quando servido por um servidor (local ou Vercel).
        // Só usa localhost quando o arquivo é aberto direto (file://).
        const API_BASE = (location.protocol === "http:" || location.protocol === "https:")
            ? ""
            : (localStorage.getItem("afiliado_mestre_api_base") || "http://localhost:3789");
        let apiLive = false;
        let lastApiSource = "mock";
        let currentPage = 0;
        const PAGE_SIZE = 36;
        let hasMore = false;
        let loadingMore = false;

        // Core Products Mock database (fallback se o backend/Shopee estiver offline)
        const defaultProducts = [
            {
                id: 1,
                title: "Mini Projetor Portátil Smart HY300 Android 11",
                category: "eletronicos",
                oldPrice: 599.00,
                newPrice: 289.90,
                discount: "51%",
                stars: 4.9,
                reviews: 243,
                sales: "1.4k vendidos",
                image: "https://images.unsplash.com/photo-1535016120720-40c646be5580?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-hy300",
                isFlashSale: true,
                flashStock: 82,
                commissionRate: "8.5%",
                sellerCommission: "R$ 14,50",
                shopeeCommission: "R$ 10,14",
                totalCommission: "R$ 24,64",
                desc: "Assista a séries e filmes favoritos em qualquer parede de casa! Qualidade nativa 720p, conexão Wi-Fi, Bluetooth e sistema Android integrado para baixar apps de streaming diretamente no projetor."
            },
            {
                id: 2,
                title: "Fone de Ouvido Sem Fio Bluetooth In-Ear 5.3 Premium",
                category: "eletronicos",
                oldPrice: 129.90,
                newPrice: 47.90,
                discount: "63%",
                stars: 4.8,
                reviews: 1420,
                sales: "4.9k vendidos",
                image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-fone-tws",
                isFlashSale: true,
                flashStock: 65,
                commissionRate: "12.0%",
                sellerCommission: "R$ 3,20",
                shopeeCommission: "R$ 2,54",
                totalCommission: "R$ 5,74",
                desc: "Diga adeus aos cabos que embolam. Conexão super estável Bluetooth 5.3, som cristalino estéreo com graves envolventes e bateria que dura até 6 horas de uso contínuo + estojo de carregamento com display LED digital."
            },
            {
                id: 3,
                title: "Umidificador Difusor de Aromas Portátil USB Madeira Nobre",
                category: "casa",
                oldPrice: 89.90,
                newPrice: 29.99,
                discount: "66%",
                stars: 4.7,
                reviews: 875,
                sales: "2.3k vendidos",
                image: "https://images.unsplash.com/photo-1602928321679-560bb453f190?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-difusor",
                isFlashSale: true,
                flashStock: 91,
                commissionRate: "15.0%",
                sellerCommission: "R$ 2,80",
                shopeeCommission: "R$ 1,69",
                totalCommission: "R$ 4,49",
                desc: "Deixe seu quarto com cheirinho de hotel 5 estrelas. Design elegante imitando madeira nobre, possui luzes de LED decorativas de cores suaves que mudam sozinhas e funciona via USB silenciosamente."
            },
            {
                id: 4,
                title: "Mini Processador Picador de Alimentos Recarregável Sem Fio",
                category: "casa",
                oldPrice: 69.90,
                newPrice: 24.50,
                discount: "64%",
                stars: 4.5,
                reviews: 312,
                sales: "1.1k vendidos",
                image: "https://images.unsplash.com/photo-1574269661126-7e45799919b2?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-processador",
                isFlashSale: true,
                flashStock: 35,
                commissionRate: "10.0%",
                sellerCommission: "R$ 1,45",
                shopeeCommission: "R$ 1,00",
                totalCommission: "R$ 2,45",
                desc: "Pique alho, cebola, vegetais e temperos com apenas 1 clique! Três lâminas super afiadas de aço inoxidável e bateria recarregável via USB. Praticidade absoluta no preparo das refeições."
            },
            {
                id: 5,
                title: "Suporte Organizador de Acrílico Giratório 360 Graus para Cosméticos",
                category: "beleza",
                oldPrice: 159.00,
                newPrice: 54.90,
                discount: "65%",
                stars: 4.9,
                reviews: 184,
                sales: "650 vendidos",
                image: "https://images.unsplash.com/photo-1616763355548-1b606f439f86?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-suporte",
                isFlashSale: false,
                commissionRate: "8.0%",
                sellerCommission: "R$ 2,90",
                shopeeCommission: "R$ 1,49",
                totalCommission: "R$ 4,39",
                desc: "A melhor solução para arrumar suas makes e skincare. Gira 360 graus suavemente, permitindo acesso rápido a todos os cosméticos. Alturas ajustáveis para caber frascos de todos os tamanhos."
            },
            {
                id: 6,
                title: "Garrafa Térmica Inteligente Inox com Sensor de Temperatura Digital",
                category: "utilidades",
                oldPrice: 119.00,
                newPrice: 39.90,
                discount: "66%",
                stars: 4.6,
                reviews: 934,
                sales: "2.1k vendidos",
                image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-garrafa-led",
                isFlashSale: false,
                commissionRate: "9.5%",
                sellerCommission: "R$ 2,50",
                shopeeCommission: "R$ 1,29",
                totalCommission: "R$ 3,79",
                desc: "Saiba a temperatura exata do seu café ou água gelada com um leve toque na tampa. Tela touch de LED embutida, isolamento a vácuo duradouro para manter a bebida na temperatura ideal por até 12 horas."
            },
            {
                id: 7,
                title: "Kit 12 Pincéis de Maquiagem Profissional Super Macios + Estojo Luxo",
                category: "beleza",
                oldPrice: 99.00,
                newPrice: 35.90,
                discount: "63%",
                stars: 4.8,
                reviews: 410,
                sales: "950 vendidos",
                image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-pinceis",
                isFlashSale: false,
                commissionRate: "12.0%",
                sellerCommission: "R$ 2,80",
                shopeeCommission: "R$ 1,50",
                totalCommission: "R$ 4,30",
                desc: "Aplicação perfeita e esfumado profissional garantido com cerdas macias sintéticas hipoalergênicas. O conjunto inclui todos os pincéis fundamentais para preparação de pele e maquiagem dos olhos com precisão."
            },
            {
                id: 8,
                title: "Mini Aspirador Portátil Recarregável de Alta Potência 120W",
                category: "automotivo",
                oldPrice: 149.90,
                newPrice: 48.90,
                discount: "67%",
                stars: 4.4,
                reviews: 580,
                sales: "1.2k vendidos",
                image: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=400",
                affiliateLink: "https://shope.ee/mestre-aspirador",
                isFlashSale: false,
                commissionRate: "11.0%",
                sellerCommission: "R$ 3,10",
                shopeeCommission: "R$ 2,27",
                totalCommission: "R$ 5,37",
                desc: "Mantenha o estofado do carro, o teclado do notebook ou os cantos do sofá sempre limpos. Leve, compacto e sem fios. Acompanha bicos adaptadores para alcançar qualquer fresta difícil de limpar."
            }
        ];

        // App Core State
        let productsDatabase = [];
        let currentStoreCategory = 'todos';
        let currentStoreSubcategory = '';
        let currentStoreSort = 'money';
        let activeProductForBuy = null;
        let flashEndsAt = null;
        let conversionScrollId = '';
        let conversionRows = [];
        let conversionPage = 1;
        let conversionHasNextRemote = false;
        const CONVERSION_PAGE_SIZE = 5;
        let categoryProductsCache = [];

        // Categories Map — carregado dinâmicamente de /api/categorias (com fallback)
        // Fallback local com as mesmas subcategorias do server/categorias.js —
        // garante navegação por subcategoria mesmo antes da API responder.
        let categories = [
            { id: 'todos', label: 'Tudo', icon: 'fa-border-all', color: 'orange', count: 0 },
            { id: 'moda', label: 'Moda Feminina', icon: 'fa-tshirt', color: 'pink', count: 0, subcategories: [
                { id: 'vestidos', label: 'Vestidos & Saias', count: 0 },
                { id: 'calcas', label: 'Calças & Leggings', count: 0 },
                { id: 'tops', label: 'Tops & Blusas', count: 0 },
                { id: 'calcados', label: 'Calçados', count: 0 },
                { id: 'bolsas', label: 'Bolsas', count: 0 },
                { id: 'praia', label: 'Moda Praia', count: 0 },
                { id: 'plus_size', label: 'Plus Size', count: 0 },
                { id: 'lingerie', label: 'Lingerie', count: 0 },
                { id: 'moda_fria', label: 'Moda Fria', count: 0 },
                { id: 'casa_moda', label: 'Pijamas & Casa', count: 0 }
            ] },
            { id: 'beleza', label: 'Beleza', icon: 'fa-spa', color: 'purple', count: 0, subcategories: [
                { id: 'pele', label: 'Skincare', count: 0 },
                { id: 'maquiagem', label: 'Maquiagem', count: 0 },
                { id: 'cabelo', label: 'Cabelo', count: 0 },
                { id: 'perfumes', label: 'Perfumes', count: 0 },
                { id: 'unhas', label: 'Unhas', count: 0 },
                { id: 'acessorios_beleza', label: 'Acessórios de Beleza', count: 0 }
            ] },
            { id: 'acessorios', label: 'Acessórios', icon: 'fa-clock', color: 'yellow', count: 0, subcategories: [
                { id: 'joias', label: 'Joias', count: 0 },
                { id: 'relogios', label: 'Relógios', count: 0 },
                { id: 'oculos', label: 'Óculos', count: 0 },
                { id: 'bolsas_acessorios', label: 'Bolsas & Carteiras', count: 0 },
                { id: 'cabelo_acessorios', label: 'Cabelo', count: 0 },
                { id: 'outros', label: 'Outros', count: 0 }
            ] },
            { id: 'fitness', label: 'Fitness', icon: 'fa-dumbbell', color: 'emerald', count: 0, subcategories: [
                { id: 'roupa_fitness', label: 'Roupas', count: 0 },
                { id: 'equipamentos', label: 'Equipamentos', count: 0 },
                { id: 'bem_estar', label: 'Bem-estar', count: 0 }
            ] },
            { id: 'maternidade', label: 'Mãe & Bebê', icon: 'fa-baby', color: 'rose', count: 0, subcategories: [
                { id: 'bebe_menina', label: 'Bebê Menina', count: 0 },
                { id: 'maternidade_roupa', label: 'Gestante', count: 0 },
                { id: 'higiene_bebe', label: 'Higiene Bebê', count: 0 },
                { id: 'enxoval', label: 'Enxoval', count: 0 }
            ] },
            { id: 'saude', label: 'Saúde & Bem-estar', icon: 'fa-heart-pulse', color: 'rose', count: 0, subcategories: [
                { id: 'suplementos', label: 'Suplementos', count: 0 },
                { id: 'cuidado_pessoal', label: 'Cuidado Pessoal', count: 0 },
                { id: 'higiene_intima', label: 'Higiene Íntima', count: 0 }
            ] },
            { id: 'casa', label: 'Casa', icon: 'fa-couch', color: 'amber', count: 0, subcategories: [
                { id: 'cozinha', label: 'Cozinha', count: 0 },
                { id: 'decoracao', label: 'Decoração', count: 0 },
                { id: 'organizacao', label: 'Organização', count: 0 },
                { id: 'limpeza', label: 'Limpeza & Clima', count: 0 }
            ] },
            { id: 'celular', label: 'Celular', icon: 'fa-mobile-alt', color: 'cyan', count: 0, subcategories: [
                { id: 'protecao', label: 'Proteção', count: 0 },
                { id: 'energia', label: 'Energia & Cabos', count: 0 },
                { id: 'acessorios_cel', label: 'Acessórios', count: 0 }
            ] },
            { id: 'eletronicos', label: 'Eletrônicos', icon: 'fa-laptop', color: 'blue', count: 0, subcategories: [
                { id: 'audio', label: 'Áudio', count: 0 },
                { id: 'wearables', label: 'Relógios & Wearables', count: 0 },
                { id: 'informatica', label: 'Informática', count: 0 },
                { id: 'video', label: 'Vídeo & Projeção', count: 0 },
                { id: 'smart_home', label: 'Casa Inteligente', count: 0 }
            ] },
            { id: 'pet', label: 'Pet Shop', icon: 'fa-paw', color: 'orange', count: 0, subcategories: [
                { id: 'gatos', label: 'Gatos', count: 0 },
                { id: 'caes', label: 'Cães', count: 0 },
                { id: 'acessorios_pet', label: 'Acessórios Pet', count: 0 }
            ] },
            { id: 'infantil', label: 'Infantil', icon: 'fa-child', color: 'indigo', count: 0, subcategories: [
                { id: 'brinquedos', label: 'Brinquedos', count: 0 },
                { id: 'roupa_infantil', label: 'Roupas & Calçados', count: 0 },
                { id: 'escola', label: 'Escola', count: 0 }
            ] },
            { id: 'presentes', label: 'Presentes & Papelaria', icon: 'fa-gift', color: 'fuchsia', count: 0, subcategories: [
                { id: 'papelaria', label: 'Papelaria Aesthetic', count: 0 },
                { id: 'presentes_fem', label: 'Presentes', count: 0 },
                { id: 'viagem', label: 'Viagem', count: 0 }
            ] },
            { id: 'utilidades', label: 'Utilidades', icon: 'fa-tools', color: 'teal', count: 0, subcategories: [
                { id: 'ferramentas', label: 'Ferramentas', count: 0 },
                { id: 'dia_a_dia', label: 'Dia a dia', count: 0 },
                { id: 'organizacao_util', label: 'Organização', count: 0 }
            ] },
            { id: 'automotivo', label: 'Automotivo', icon: 'fa-car', color: 'slate', count: 0, subcategories: [
                { id: 'limpeza_auto', label: 'Limpeza', count: 0 },
                { id: 'tecnologia_auto', label: 'Tecnologia', count: 0 },
                { id: 'conforto_auto', label: 'Conforto', count: 0 }
            ] }
        ];

        const ADMIN_TOKEN_KEY = "afiliada_mestre_admin_token";
        let currentNavSection = "destaque";

        function getAdminToken() {
            try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ""; } catch (_) { return ""; }
        }
        function ensureAdminToken() {
            if (!isAdminMode()) return getAdminToken();
            let t = getAdminToken();
            if (t) return t;
            t = window.prompt("Token do admin (ADMIN_TOKEN do .env). Deixe vazio se não configurou:") || "";
            try { if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t); } catch (_) {}
            return t;
        }
        async function adminFetch(url, opts = {}) {
            const headers = Object.assign({}, opts.headers || {});
            const token = ensureAdminToken();
            if (token) headers["X-Admin-Token"] = token;
            return fetch(url, { ...opts, headers });
        }

        function formatSold(n) {
            const raw = n;
            if (typeof n === "string") {
                const cleaned = n.replace(/vendid[oa]s?/gi, "").trim();
                if (/mil/i.test(cleaned) || /k\b/i.test(cleaned)) return cleaned.includes("vendid") ? cleaned : `${cleaned} vendidos`;
                n = Number(cleaned.replace(/[^\d.,]/g, "").replace(",", "."));
            }
            if (n == null || n === "" || (typeof n === "number" && !Number.isFinite(n))) {
                return raw && String(raw).trim() ? String(raw) : null;
            }
            if (n < 1000) return `${Math.round(n)} vendidos`;
            if (n < 10000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil vendidos`;
            if (n < 1000000) return `${Math.floor(n / 1000)}mil+ vendidos`;
            return `${(n / 1000000).toFixed(1).replace(".", ",")}mi+ vendidos`;
        }
        function formatRating(r) {
            const n = Number(r);
            if (!Number.isFinite(n) || n <= 0) return null;
            return n.toFixed(1);
        }
        function displayDiscount(p) {
            let raw = Number(p?.discountPct);
            if (!Number.isFinite(raw) || raw <= 0) {
                raw = parseInt(String(p?.discount || "0").replace("%", ""), 10) || 0;
            }
            if (raw < 5) return 0;
            return Math.min(raw, 85);
        }
        function cleanShopName(name) {
            if (!name || typeof name !== "string") return null;
            const trimmed = name.trim();
            if (trimmed.length < 4) return null;
            if (/^[a-z]{2}\s/i.test(trimmed) && trimmed.length < 20) return null;
            if (/^cc\b/i.test(trimmed)) return null;
            return trimmed;
        }
        function isOfficialShop(shopType) {
            if (shopType == null || shopType === "") return false;
            if (typeof shopType === "string") return /SHOPEE_MALL|MALL|1/i.test(shopType);
            return Number(shopType) === 1;
        }
        function formatCountBadge(count) {
            const n = Number(count) || 0;
            if (n <= 0) return "";
            if (n >= 100) return "99+";
            return String(n);
        }

        function pathClean() {
            return (window.location.pathname.replace(/\/+$/, "") || "/");
        }

        function isAdminMode() {
            const path = pathClean();
            if (path === "/admin" || path.startsWith("/admin/")) return true;
            const params = new URLSearchParams(window.location.search);
            return params.has("admin") || params.get("mode") === "admin";
        }

        function navigateTo(path, { replace = false } = {}) {
            const next = path.startsWith("/") ? path : `/${path}`;
            if (replace) history.replaceState({ path: next }, "", next);
            else history.pushState({ path: next }, "", next);
            applyRoute({ fromNav: true });
        }

        function initAdminUi() {
            const panel = document.getElementById("admin-panel-root");
            if (!panel || !isAdminMode()) {
                if (panel) {
                    panel.classList.add("hidden");
                    panel.classList.remove("flex");
                }
                document.body.classList.remove("admin-mode");
                return;
            }

            document.body.classList.add("admin-mode");
            panel.classList.remove("hidden");
            panel.classList.add("flex");
            document.title = "Admin — Afiliada Mestre";

            const badge = document.getElementById("admin-api-badge");
            if (badge) badge.classList.remove("hidden");

            loadSubIdSettings();
            loadShortlinkStatus();
            loadCoverageReport();
            loadAutoStatus();
            renderAdminCategoriesPanel();
            setTimeout(() => renderMoneyQueue(), 800);

            const parts = pathClean().split("/").filter(Boolean);
            let view = parts[1] || "dashboard";
            const legacyMap = {
                console: "produtos",
                performance: "desempenho",
                campaigns: "campanhas",
                "campaign-perf": "campanha-desempenho",
                "campanhas-desempenho": "campanha-desempenho",
            };
            if (legacyMap[view]) view = legacyMap[view];
            if (!ADMIN_VIEWS[view]) view = "dashboard";
            setTimeout(() => switchAdminView(view, { skipUrl: true }), 0);
        }

        const ADMIN_VIEWS = {
            dashboard: { title: "Dashboard", subtitle: "Visão geral do catálogo e vendas" },
            catalogo: { title: "Catálogo & Sync", subtitle: "Buscar ofertas, sincronizar categorias e alimentação automática" },
            produtos: { title: "Produtos", subtitle: "Gerencie o catálogo e selecione itens para campanhas" },
            duplicados: { title: "Remover duplicados", subtitle: "Limpa só repetidos reais (loja+nome idêntico ou mesmo item/link)" },
            campanhas: { title: "Campanhas", subtitle: "Links rastreáveis para Facebook, Instagram e outros canais" },
            "campanha-desempenho": { title: "Desempenho da campanha", subtitle: "Vendas, comissões e pedidos agrupados por campanha (API Shopee)" },
            desempenho: { title: "Desempenho geral", subtitle: "Conversões e comissões da API Shopee (Sub ID afiliada_mestre)" },
        };

        function toggleAdminSidebar(forceOpen) {
            const sidebar = document.getElementById("admin-sidebar");
            const backdrop = document.getElementById("admin-sidebar-backdrop");
            if (!sidebar) return;
            const open = forceOpen === undefined ? !sidebar.classList.contains("open") : !!forceOpen;
            sidebar.classList.toggle("open", open);
            if (backdrop) backdrop.classList.toggle("hidden", !open);
        }

        function switchAdminView(view, opts = {}) {
            if (!isAdminMode()) {
                navigateTo(`/admin/${view || "dashboard"}`);
                return;
            }
            if (!ADMIN_VIEWS[view]) view = "dashboard";

            document.querySelectorAll(".admin-view").forEach(el => el.classList.remove("active"));
            const target = document.getElementById("admin-view-" + view);
            if (target) target.classList.add("active");

            document.querySelectorAll(".admin-nav-item[data-admin-view]").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.adminView === view);
            });

            const meta = ADMIN_VIEWS[view];
            const titleEl = document.getElementById("admin-page-title");
            const subEl = document.getElementById("admin-page-subtitle");
            if (titleEl && meta) titleEl.textContent = meta.title;
            if (subEl && meta) subEl.textContent = meta.subtitle;

            if (!opts.skipUrl) {
                try {
                    const next = view === "dashboard" ? "/admin" : `/admin/${view}`;
                    history.replaceState({ path: next }, "", next);
                } catch (_) {}
            }

            toggleAdminSidebar(false);
            if (view === "dashboard") {
                loadAdminStats();
                loadAutoStatus();
            } else if (view === "catalogo") {
                populateAdminCategorySelect();
                loadAutoStatus();
                loadShortlinkStatus();
                applyExplorerPreset('bestsellers');
            } else if (view === "produtos") {
                adminPage = 1;
                populateAdminProductCategoryFilter();
                renderConsoleProducts();
                populateAdminCategorySelect();
                loadAdminStats();
                if (!adminCatalogLoaded || productsDatabase.length <= PAGE_SIZE) {
                    loadAdminCatalogFull({ silent: true });
                }
            } else if (view === "duplicados") {
                scanCatalogDuplicates();
            } else if (view === "campanhas") {
                renderSavedCampaigns();
                updateCampaignLinkPreview();
            } else if (view === "campanha-desempenho") {
                loadCampaignPerformance({ reset: true });
            } else if (view === "desempenho") {
                loadConversions({ reset: true });
            }
        }

        async function applyRoute(opts = {}) {
            const params = new URLSearchParams(window.location.search);
            if ((params.has("admin") || params.get("mode") === "admin") && !pathClean().startsWith("/admin")) {
                const hash = (window.location.hash || "").replace("#", "");
                const view = hash || params.get("view") || "dashboard";
                history.replaceState(null, "", `/admin/${view === "dashboard" ? "" : view}`.replace(/\/$/, "") || "/admin");
            }

            if (isAdminMode()) {
                initAdminUi();
                return;
            }

            document.body.classList.remove("admin-mode");
            const panel = document.getElementById("admin-panel-root");
            if (panel) {
                panel.classList.add("hidden");
                panel.classList.remove("flex");
            }
            document.title = "Afiliada Mestre — Ofertas selecionadas na Shopee";

            const path = pathClean();
            const parts = path.split("/").filter(Boolean);

            if (parts[0] === "categoria") {
                const catId = parts[1] || "todos";
                const subId = parts[2] || "";
                currentNavSection = "category_page";
                if (catId === "todos" || !catId) {
                    await setStoreCategory("todos", { skipUrl: true });
                } else {
                    await setStoreCategory(catId, { skipUrl: true });
                    if (subId) await setStoreSubcategory(subId, { skipUrl: true });
                }
                scrollToStoreGrid();
                return;
            }

            const sectionMap = {
                relampago: { sort: "ending", section: "flash_deals", scroll: "flash" },
                "mais-vendidos": { sort: "sales", section: "top_sellers" },
                "maiores-descontos": { sort: "discount", section: "big_discounts" },
                "melhor-avaliados": { sort: "rating", section: "top_rated" },
                "lojas-oficiais": { sort: "recent", section: "official_shops", filterOfficial: true },
            };
            if (sectionMap[parts[0]]) {
                const cfg = sectionMap[parts[0]];
                currentNavSection = cfg.section;
                currentStoreCategory = "todos";
                currentStoreSubcategory = "";
                if (cfg.sort) setStoreSort(cfg.sort, { skipUrl: true });
                window.__filterOfficialOnly = !!cfg.filterOfficial;
                renderStoreProducts();
                renderHomeSections();
                if (cfg.scroll === "flash") scrollToFlashSale();
                else scrollToStoreGrid();
                return;
            }

            window.__filterOfficialOnly = false;
            currentNavSection = "destaque";
            if (opts.fromNav && path === "/") {
                currentStoreCategory = "todos";
                currentStoreSubcategory = "";
                renderCategories();
                renderSubcategories();
                renderStoreProducts();
                renderHomeSections();
            }
        }

        // Ícones inválidos / Pro-only / nomes antigos → equivalentes Free do FA6
        const ICON_FIXES = {
            "fa-sparkles": "fa-wand-magic-sparkles",
            "fa-check-shield": "fa-shield-halved",
            "fa-chart-line-up": "fa-chart-line",
            "fa-arrow-pointer": "fa-mouse-pointer",
            "fa-external-link": "fa-arrow-up-right-from-square",
            "fa-tshirt": "fa-shirt",
            "fa-mobile-alt": "fa-mobile-screen-button",
            "fa-tools": "fa-toolbox",
            "fa-child": "fa-child-reaching",
            "fa-cut": "fa-scissors",
        };

        // Ícone oficial de cada categoria (sobrepõe o que vier da API/cache antigo).
        const CATEGORY_ICONS = {
            todos: "fa-grip",
            moda: "fa-shirt",
            beleza: "fa-spa",
            acessorios: "fa-gem",
            fitness: "fa-dumbbell",
            maternidade: "fa-baby",
            saude: "fa-heart-pulse",
            casa: "fa-couch",
            celular: "fa-mobile-screen-button",
            eletronicos: "fa-laptop",
            pet: "fa-paw",
            infantil: "fa-child-reaching",
            presentes: "fa-gift",
            utilidades: "fa-toolbox",
            automotivo: "fa-car",
        };

        // Cada subcategoria tem símbolo próprio — evita o placeholder genérico de imagem.
        const SUBCATEGORY_ICONS = {
            moda: {
                vestidos: "fa-person-dress",
                calcas: "fa-person-walking",
                tops: "fa-shirt",
                calcados: "fa-shoe-prints",
                bolsas: "fa-bag-shopping",
                praia: "fa-umbrella-beach",
                plus_size: "fa-user-group",
                lingerie: "fa-heart",
                moda_fria: "fa-snowflake",
                casa_moda: "fa-moon",
            },
            beleza: {
                pele: "fa-droplet",
                maquiagem: "fa-wand-magic-sparkles",
                cabelo: "fa-scissors",
                perfumes: "fa-spray-can-sparkles",
                unhas: "fa-hand-sparkles",
                acessorios_beleza: "fa-brush",
            },
            acessorios: {
                joias: "fa-ring",
                relogios: "fa-clock",
                oculos: "fa-glasses",
                bolsas_acessorios: "fa-wallet",
                cabelo_acessorios: "fa-ribbon",
                outros: "fa-shapes",
            },
            fitness: {
                roupa_fitness: "fa-person-running",
                equipamentos: "fa-dumbbell",
                bem_estar: "fa-leaf",
            },
            maternidade: {
                bebe_menina: "fa-baby",
                maternidade_roupa: "fa-person-pregnant",
                higiene_bebe: "fa-pump-soap",
                enxoval: "fa-baby-carriage",
            },
            saude: {
                suplementos: "fa-pills",
                cuidado_pessoal: "fa-hand-holding-heart",
                higiene_intima: "fa-shield-heart",
            },
            casa: {
                cozinha: "fa-utensils",
                decoracao: "fa-palette",
                organizacao: "fa-boxes-stacked",
                limpeza: "fa-broom",
            },
            celular: {
                protecao: "fa-shield-halved",
                energia: "fa-plug",
                acessorios_cel: "fa-camera",
            },
            eletronicos: {
                audio: "fa-headphones",
                wearables: "fa-stopwatch",
                informatica: "fa-keyboard",
                video: "fa-video",
                smart_home: "fa-house-signal",
            },
            pet: {
                gatos: "fa-cat",
                caes: "fa-dog",
                acessorios_pet: "fa-bone",
            },
            infantil: {
                brinquedos: "fa-puzzle-piece",
                roupa_infantil: "fa-child-dress",
                escola: "fa-school",
            },
            presentes: {
                papelaria: "fa-pen-fancy",
                presentes_fem: "fa-box-open",
                viagem: "fa-suitcase-rolling",
            },
            utilidades: {
                ferramentas: "fa-screwdriver-wrench",
                dia_a_dia: "fa-bottle-water",
                organizacao_util: "fa-box-archive",
            },
            automotivo: {
                limpeza_auto: "fa-spray-can",
                tecnologia_auto: "fa-gauge-high",
                conforto_auto: "fa-car-side",
            },
        };

        function normalizeCategoryIcon(icon) {
            const raw = String(icon || "fa-tag").replace(/^fas\s+/, "");
            return ICON_FIXES[raw] || raw;
        }

        function categoryIconClass(cat) {
            const id = typeof cat === "string" ? cat : cat?.id;
            return CATEGORY_ICONS[id] || normalizeCategoryIcon(cat?.icon);
        }

        // Sem subId (tile "Todas"/"Ver tudo") mostra o ícone da própria categoria.
        function subcategoryIconClass(catId, subId) {
            if (!subId) return categoryIconClass(catId);
            return SUBCATEGORY_ICONS[catId]?.[subId] || categoryIconClass(catId);
        }

        window.onload = async function() {
            captureTrafficAttribution();
            window.addEventListener('popstate', () => applyRoute({ fromNav: true }));
            initAdminUi();
            initDatabase();
            initCountdown();
            renderCategories();
            renderSubcategories();
            renderStoreProducts();
            renderPopularTerms();
            renderConsoleProducts();
            loadHeroProducts();
            if (isAdminMode()) {
                populateAdminCategorySelect();
                loadAdminStats();
                loadAutoStatus();
                loadShortlinkStatus();
                loadConversions({ reset: true });
            }
            const health = await checkApiHealth();

            if (health && health.supabaseConfigured) {
                await loadCategoriesFromApi({ silent: true });
                if (isAdminMode()) {
                    await loadAdminCatalogFull({ silent: true });
                } else {
                    await loadOffersFromSupabase({ silent: true, reset: true });
                    preloadCategoryCovers();
                    renderHomeSections();
                    await loadHeroProducts();
                }
            } else if (isAdminMode()) {
                showToast("Backend offline — rode: npm start", "error");
            }
            await applyRoute({ fromNav: false });
            await applyCampaignLanding();
        };

        function setApiStatus(text, live) {
            apiLive = !!live;
            const short = live ? "API online" : "API offline";
            for (const id of ["api-status-badge", "admin-api-badge"]) {
                const el = document.getElementById(id);
                if (el) el.textContent = id === "admin-api-badge" ? short : text;
            }
        }

        async function checkApiHealth() {
            try {
                const res = await fetch(`${API_BASE}/api/health`);
                const data = await res.json();
                if (!res.ok) throw new Error("health fail");
                const ok = data.shopeeConfigured && data.supabaseConfigured;
                setApiStatus(
                    ok ? "API Status: Shopee + Supabase OK" : "API Status: backend up (verifique .env)",
                    true
                );
                return data;
            } catch (e) {
                setApiStatus("API Status: Simulação / backend offline", false);
                return null;
            }
        }

        // Coalesce re-renders de categorias/subcategorias/termos populares:
        // cargas em lote (append por página) disparavam 3 rebuilds de innerHTML
        // por chamada; agora agrupamos num único render após a rajada.
        let chromeRenderTimer = null;
        function scheduleChromeRender() {
            clearTimeout(chromeRenderTimer);
            chromeRenderTimer = setTimeout(() => {
                renderCategories();
                renderSubcategories();
                renderPopularTerms();
            }, 150);
        }

        function applyProducts(list, source, { append = false, allowEmpty = false, skipRender = false } = {}) {
            if (!Array.isArray(list)) return false;
            if (append) {
                const map = new Map(productsDatabase.map(p => [String(p.id), p]));
                for (const p of list) map.set(String(p.id), p);
                productsDatabase = [...map.values()];
            } else {
                if (!list.length && !allowEmpty) return false;
                productsDatabase = list;
            }
            lastApiSource = source || "api";
            // Limita cache local na vitrine pública (mobile/localStorage).
            // No admin precisamos do catálogo completo para filtrar/selecionar.
            if (!isAdminMode() && productsDatabase.length > 400) {
                productsDatabase = productsDatabase.slice(-400);
            }
            try {
                if (productsDatabase.length <= 400) {
                    localStorage.setItem("afiliado_mestre_db_v1", JSON.stringify(productsDatabase));
                }
            } catch (_) {}
            if (!skipRender) {
                renderStoreProducts();
                scheduleChromeRender();
                if (isAdminMode()) {
                    renderConsoleProducts();
                    loadAdminStats();
                }
            }
            return allowEmpty || productsDatabase.length > 0;
        }

        async function loadCategoriesFromApi({ silent = true } = {}) {
            try {
                const res = await fetch(`${API_BASE}/api/categorias`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                if (Array.isArray(data.categories) && data.categories.length) {
                    categories = (data.categories || []).map((c) => ({
                        ...c,
                        icon: normalizeCategoryIcon(c.icon),
                    }));
                    renderCategories();
                    renderSubcategories();
                }
                return true;
            } catch (err) {
                if (!silent) showToast(`Categorias falharam: ${err.message}`, "error");
                return false;
            }
        }

        async function syncAllCategories({ silent = false } = {}) {
            try {
                const res = await adminFetch(`${API_BASE}/api/sync`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ limit: 20, listType: 0, sortType: 2 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                if (!silent) showToast(`Sync: ${data.count} produtos únicos (${data.keywordsRun} keywords)`, "success");
                return data;
            } catch (err) {
                if (!silent) showToast(`Sync falhou: ${err.message}`, "error");
                return null;
            }
        }

        async function syncCategory(catId, { silent = false, pages } = {}) {
            if (!catId || catId === "todos") return syncAllCategories({ silent });
            try {
                showToast(`Buscando ofertas de "${catId}" na Shopee…`, "success");
                const pageCount = pages || Number(document.getElementById("admin-cat-pages")?.value) || 1;
                const listType = Number(document.getElementById("admin-list-type")?.value) || 0;
                const sortType = Number(document.getElementById("admin-sort-type")?.value) || 2;
                const minRating = document.getElementById("admin-min-rating")?.value;
                const res = await adminFetch(
                    `${API_BASE}/api/sync/categoria/${encodeURIComponent(catId)}?limit=25&listType=${listType}&sortType=${sortType}&pages=${pageCount}`
                    + (minRating != null && minRating !== "" ? `&minRating=${encodeURIComponent(minRating)}` : "")
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                if (!silent) {
                    const filtered = data.filteredOut ? ` · ${data.filteredOut} filtrados` : "";
                    const sl = data.shortlinks?.generated ? ` · ${data.shortlinks.generated} shortlinks` : "";
                    const skip = data.skippedExisting ? ` · ${data.skippedExisting} já existiam` : "";
                    showToast(`✓ ${data.saved || data.count} novos em "${catId}"${skip}${sl}${filtered}`, "success");
                }
                return data;
            } catch (err) {
                if (!silent) showToast(`Sync ${catId} falhou: ${err.message}`, "error");
                return null;
            }
        }

        // ---- Explorador Shopee (Catálogo & Sync) ----
        const EXPLORER_PRESETS = {
            female_money: {
                listType: 1, sortType: 5, minRating: 4.0, minSales: 20, requireCommission: true, minCommissionPct: 5,
                keywords: "vestido longo feminino, kit skincare, bolsa transversal feminina, conjunto fitness feminino, perfume feminino, sandalia feminina, lingerie feminina, colageno hidrolisado",
            },
            bestsellers: {
                listType: 0, sortType: 2, minRating: 4.0, minSales: 50, requireCommission: true, minCommissionPct: 0,
                keywords: "vestido longo feminino, blusa feminina, tênis feminino, kit skincare, maquiagem",
            },
            topperf: {
                listType: 2, sortType: 2, minRating: 4.2, minSales: 20, requireCommission: true, minCommissionPct: 3,
                keywords: "vestido midi feminino, skincare coreano, bolsa feminina, conjunto fitness, perfume feminino",
            },
            commission: {
                listType: 1, sortType: 5, minRating: 4.0, minSales: 10, requireCommission: true, minCommissionPct: 8,
                keywords: "perfume feminino, smartwatch feminino, maquiagem, colageno hidrolisado, serum vitamina c",
            },
            collection: {
                listType: 6, sortType: 5, minRating: 4.0, minSales: 0, requireCommission: true, minCommissionPct: 0,
                keywords: "", matchIdHint: true,
            },
            shop: {
                listType: 5, sortType: 5, minRating: 4.0, minSales: 0, requireCommission: true, minCommissionPct: 0,
                keywords: "", shopIdHint: true,
            },
            rated: {
                listType: 0, sortType: 1, minRating: 4.7, minSales: 30, requireCommission: true, minCommissionPct: 0,
                keywords: "creme facial, escova secadora, serum vitamina c, batom liquido matte",
            },
            budget: {
                listType: 0, sortType: 4, minRating: 4.0, minSales: 20, requireCommission: true, minCommissionPct: 0,
                keywords: "organizador maquiagem, kit maquiagem, scrunchie, necessaire feminina, caderno aesthetic",
            },
        };

        const LIST_TYPE_LABELS_UI = {
            0: "Recomendados", 1: "Maior comissão", 2: "Top performance",
            3: "Landing categoria", 4: "Detalhe categoria", 5: "Detalhe loja", 6: "Detalhe coleção",
        };
        const SORT_TYPE_LABELS_UI = {
            1: "Relevância", 2: "Mais vendidos", 3: "Maior preço", 4: "Menor preço", 5: "Maior comissão",
        };

        let explorerProducts = [];
        let explorerSelected = new Set();
        let explorerAbort = null;
        let explorerBusy = false;

        function parseExplorerKeywords(raw) {
            return [...new Set(String(raw || "")
                .split(/[\n,;]+/)
                .map((s) => s.trim())
                .filter(Boolean))];
        }

        function updateExplorerKwCount() {
            const el = document.getElementById("explorer-kw-count");
            const n = parseExplorerKeywords(document.getElementById("admin-keyword")?.value).length;
            if (el) el.textContent = n === 1 ? "1 keyword" : `${n} keywords`;
        }

        function updateExplorerModeHint() {
            const lt = Number(document.getElementById("admin-list-type")?.value) || 0;
            const st = Number(document.getElementById("admin-sort-type")?.value) || 2;
            const matchId = document.getElementById("admin-match-id")?.value;
            const shopId = document.getElementById("admin-shop-id")?.value;
            const hint = document.getElementById("explorer-mode-hint");
            if (!hint) return;
            let extra = "";
            if ([3, 4, 6].includes(lt)) {
                extra = matchId
                    ? ` · matchId <strong class="text-slate-700">${escapeHtml(matchId)}</strong>`
                    : ` · <span class="text-amber-700 font-bold">informe matchId</span> (coleção/categoria oficial)`;
            }
            if (lt === 5) {
                extra = shopId
                    ? ` · shopId <strong class="text-slate-700">${escapeHtml(shopId)}</strong>`
                    : ` · <span class="text-amber-700 font-bold">informe shopId</span>`;
            }
            hint.innerHTML = `Modo: <strong class="text-slate-700">${LIST_TYPE_LABELS_UI[lt] || lt}</strong> · ordenado por <strong class="text-slate-700">${SORT_TYPE_LABELS_UI[st] || st}</strong>${extra}`;
        }

        function applyExplorerPreset(name) {
            const p = EXPLORER_PRESETS[name];
            if (!p) return;
            const kw = document.getElementById("admin-keyword");
            const lt = document.getElementById("admin-list-type");
            const st = document.getElementById("admin-sort-type");
            const mr = document.getElementById("admin-min-rating");
            const ms = document.getElementById("admin-min-sales");
            const rc = document.getElementById("admin-require-commission");
            const mc = document.getElementById("admin-min-commission");
            if (kw && p.keywords != null) kw.value = p.keywords;
            if (lt) lt.value = String(p.listType);
            if (st) st.value = String(p.sortType);
            if (mr) mr.value = String(p.minRating);
            if (ms) ms.value = String(p.minSales);
            if (rc) rc.checked = !!p.requireCommission;
            if (mc) mc.value = String(p.minCommissionPct != null ? p.minCommissionPct : 0);
            document.querySelectorAll(".explorer-preset").forEach((btn) => {
                const on = btn.dataset.preset === name;
                btn.classList.toggle("bg-shopee-orange", on);
                btn.classList.toggle("border-shopee-orange", on);
                btn.classList.toggle("bg-white/10", !on);
                btn.classList.toggle("border-white/10", !on);
            });
            updateExplorerKwCount();
            updateExplorerModeHint();
            if (p.matchIdHint) showToast("Cole o collectionId/categoryId no campo matchId (Ofertas oficiais)", "info");
            else if (p.shopIdHint) showToast("Cole o shopId da loja no campo shopId", "info");
            else showToast(`Preset: ${name}`, "success");
        }

        function getExplorerFormParams() {
            const matchRaw = document.getElementById("admin-match-id")?.value;
            const shopRaw = document.getElementById("admin-shop-id")?.value;
            const matchId = matchRaw ? Number(matchRaw) : null;
            const shopId = shopRaw ? Number(shopRaw) : null;
            return {
                keywords: parseExplorerKeywords(document.getElementById("admin-keyword")?.value),
                limit: Number(document.getElementById("admin-limit")?.value) || 20,
                pages: Number(document.getElementById("admin-pages")?.value) || 1,
                listType: Number(document.getElementById("admin-list-type")?.value) || 0,
                sortType: Number(document.getElementById("admin-sort-type")?.value) || 2,
                minRating: Number(document.getElementById("admin-min-rating")?.value) || 4,
                minSales: Number(document.getElementById("admin-min-sales")?.value) || 0,
                requireCommission: !!document.getElementById("admin-require-commission")?.checked,
                minCommissionPct: Number(document.getElementById("admin-min-commission")?.value) || 0,
                matchId: Number.isFinite(matchId) && matchId > 0 ? matchId : null,
                shopId: Number.isFinite(shopId) && shopId > 0 ? shopId : null,
            };
        }

        function setExplorerProgress(show, pct = 0, label = "") {
            const wrap = document.getElementById("explorer-progress");
            const bar = document.getElementById("explorer-progress-bar");
            const pctEl = document.getElementById("explorer-progress-pct");
            const lab = document.getElementById("explorer-progress-label");
            if (!wrap) return;
            wrap.classList.toggle("hidden", !show);
            if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
            if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
            if (lab && label) lab.textContent = label;
        }

        function setExplorerStatus(type, html) {
            const el = document.getElementById("explorer-status");
            if (!el) return;
            if (!html) {
                el.classList.add("hidden");
                el.innerHTML = "";
                return;
            }
            const styles = {
                info: "bg-slate-50 border-slate-200 text-slate-600",
                success: "bg-emerald-50 border-emerald-200 text-emerald-800",
                empty: "bg-amber-50 border-amber-200 text-amber-900",
                error: "bg-red-50 border-red-200 text-red-700",
                rate: "bg-orange-50 border-orange-200 text-orange-900",
            };
            el.className = `text-[11px] rounded-lg px-3 py-2 border ${styles[type] || styles.info}`;
            el.innerHTML = html;
            el.classList.remove("hidden");
        }

        function setExplorerBusy(busy) {
            explorerBusy = busy;
            const btn = document.getElementById("btn-explorer-search");
            const cancel = document.getElementById("btn-explorer-cancel");
            if (btn) {
                btn.disabled = busy;
                btn.innerHTML = busy
                    ? `<i class="fas fa-spinner fa-spin"></i> Buscando…`
                    : `<i class="fas fa-magnifying-glass"></i> Pré-visualizar`;
            }
            if (cancel) cancel.classList.toggle("hidden", !busy);
        }

        function cancelExplorerSearch() {
            if (explorerAbort) {
                explorerAbort.abort();
                explorerAbort = null;
            }
            setExplorerBusy(false);
            setExplorerProgress(false);
            setExplorerStatus("info", "Busca cancelada. Os resultados já obtidos foram mantidos.");
        }

        function renderExplorerPreview(products, meta = {}) {
            const box = document.getElementById("explorer-preview");
            if (!box) return;
            const sorted = sortByMoney(Array.isArray(products) ? products : []);
            explorerProducts = sorted;
            explorerSelected = new Set(explorerProducts.map((p) => String(p.itemId || p.id)));
            const selAll = document.getElementById("explorer-select-all");
            if (selAll) selAll.checked = explorerProducts.length > 0;

            if (!explorerProducts.length) {
                box.innerHTML = `
                    <div class="text-center py-8 text-slate-400 text-[11px]">
                        <i class="fas fa-inbox text-2xl text-slate-300 mb-2 block"></i>
                        Nenhum produto na prévia.
                        ${meta.rateLimited ? "<br><strong class='text-orange-700'>Possível rate-limit da Shopee — aguarde e tente de novo.</strong>" : ""}
                        ${meta.filteredOut ? `<br>${meta.filteredOut} itens filtrados pelos critérios de qualidade.` : ""}
                    </div>`;
                updateExplorerSelectionMeta();
                return;
            }

            box.innerHTML = explorerProducts.map((p) => {
                const id = String(p.itemId || p.id);
                const img = p.image || "";
                const price = Number(p.newPrice || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const stars = Number(p.stars || 0).toFixed(1);
                const commission = p.commissionRate || "—";
                const score = moneyScoreOf(p).toFixed(1);
                const mall = isOfficialShop(p.shopType) ? '<span class="bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded">Mall</span>' : '';
                const catLabel = (categories.find(c => c.id === p.category) || {}).label || p.category || "—";
                const subLabel = ((categories.find(c => c.id === p.category) || {}).subcategories || [])
                    .find(s => s.id === p.subcategory)?.label || p.subcategory || "";
                const taxBadge = p.category && p.category !== "todos"
                    ? `<span class="bg-orange-50 text-shopee-orange font-bold px-1.5 py-0.5 rounded">${escapeHtml(catLabel)}${subLabel ? " · " + escapeHtml(subLabel) : ""}</span>`
                    : `<span class="bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded">Sem categoria</span>`;
                return `
                <label class="flex gap-3 p-2.5 rounded-lg border border-slate-100 hover:border-shopee-orange/40 hover:bg-orange-50/30 cursor-pointer transition">
                    <input type="checkbox" class="explorer-item-cb mt-1 rounded border-slate-300 text-shopee-orange focus:ring-shopee-orange"
                        data-id="${escapeHtml(id)}" checked onchange="onExplorerItemToggle('${escapeHtml(id)}', this.checked)">
                    <img src="${escapeHtml(img)}" alt="" class="w-12 h-12 rounded-md object-cover bg-slate-100 shrink-0" loading="lazy"
                        onerror="this.src='https://via.placeholder.com/48?text=…'">
                    <div class="min-w-0 flex-1">
                        <p class="font-bold text-slate-800 text-[11px] leading-snug line-clamp-2">${escapeHtml(p.title || "")}</p>
                        <div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                            <span class="font-black text-shopee-orange">${price}</span>
                            <span><i class="fas fa-star text-amber-400"></i> ${stars}</span>
                            <span>${escapeHtml(String(p.sales || "—"))}</span>
                            <span class="text-emerald-700 font-bold">${escapeHtml(String(commission))}</span>
                            <span class="text-amber-700 font-bold">score ${score}</span>
                            ${mall}
                            ${taxBadge}
                            ${p.keyword ? `<span class="text-slate-400">· ${escapeHtml(p.keyword)}</span>` : ""}
                        </div>
                    </div>
                </label>`;
            }).join("");
            updateExplorerSelectionMeta();
        }

        function onExplorerItemToggle(id, checked) {
            if (checked) explorerSelected.add(String(id));
            else explorerSelected.delete(String(id));
            const selAll = document.getElementById("explorer-select-all");
            if (selAll) selAll.checked = explorerProducts.length > 0 && explorerSelected.size === explorerProducts.length;
            updateExplorerSelectionMeta();
        }

        function toggleExplorerSelectAll(checked) {
            explorerSelected = checked
                ? new Set(explorerProducts.map((p) => String(p.itemId || p.id)))
                : new Set();
            document.querySelectorAll(".explorer-item-cb").forEach((cb) => { cb.checked = checked; });
            updateExplorerSelectionMeta();
        }

        function updateExplorerSelectionMeta() {
            const meta = document.getElementById("explorer-selection-meta");
            const btn = document.getElementById("btn-explorer-save");
            if (meta) meta.textContent = `${explorerSelected.size} selecionados · ${explorerProducts.length} na prévia`;
            if (btn) btn.disabled = explorerSelected.size === 0;
        }

        async function runExplorerSearch({ sync = false } = {}) {
            if (explorerBusy) return;
            const params = getExplorerFormParams();
            const needsMatch = [3, 4, 6].includes(params.listType);
            const needsShop = params.listType === 5;
            if (needsMatch && !params.matchId) {
                setExplorerStatus("error", "listType 3/4/6 exige <strong>matchId</strong> (collectionId ou categoryId das Ofertas oficiais).");
                showToast("Informe o matchId", "error");
                return;
            }
            if (needsShop && !params.shopId) {
                setExplorerStatus("error", "listType 5 exige <strong>shopId</strong> da loja Shopee.");
                showToast("Informe o shopId", "error");
                return;
            }
            if (!params.keywords.length && !params.matchId && !params.shopId) {
                setExplorerStatus("error", "Informe keyword(s), matchId ou shopId.");
                showToast("Digite uma keyword ou ID", "error");
                return;
            }

            explorerAbort = new AbortController();
            setExplorerBusy(true);
            setExplorerProgress(true, 8, sync ? "Buscando e salvando…" : "Pré-visualizando na Shopee…");
            const modeLabel = LIST_TYPE_LABELS_UI[params.listType] || "lista";
            setExplorerStatus("info", `Consultando ${params.keywords.length || 1} origem(ns) × ${params.pages} página(s) · ${modeLabel}…`);

            let fakePct = 8;
            const tick = setInterval(() => {
                fakePct = Math.min(90, fakePct + (90 - fakePct) * 0.08);
                setExplorerProgress(true, fakePct, `Shopee · ${modeLabel}…`);
            }, 400);

            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/batch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: explorerAbort.signal,
                    body: JSON.stringify({
                        keywords: params.keywords,
                        pages: params.pages,
                        pageStart: 1,
                        limit: params.limit,
                        listType: params.listType,
                        sortType: params.sortType,
                        minRating: params.minRating,
                        minSales: params.minSales,
                        requireCommission: params.requireCommission,
                        minCommissionPct: params.minCommissionPct,
                        matchId: params.matchId,
                        shopId: params.shopId,
                        sync,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                clearInterval(tick);
                if (!res.ok) {
                    const rate = data.rateLimited || res.status === 429;
                    setExplorerStatus(rate ? "rate" : "error", escapeHtml(data.error || `HTTP ${res.status}`));
                    showToast(data.error || "Falha na busca", "error");
                    return;
                }
                setExplorerProgress(true, 100, "Pronto");
                renderExplorerPreview(data.products || [], data);
                const savedBit = sync && data.saved ? ` · <strong>${data.saved} salvos</strong>` : "";
                setExplorerStatus(
                    data.count ? "success" : "empty",
                    `${data.count || 0} produtos · ${modeLabel}${data.filteredOut ? ` · ${data.filteredOut} filtrados` : ""}${savedBit}${data.rateLimited ? " · rate-limit" : ""}`
                );
                if (sync && data.saved) {
                    showToast(`Salvos ${data.saved} com shortlink`, "success");
                    await loadOffersFromSupabase({ silent: true, reset: true });
                    loadShortlinkStatus();
                    renderMoneyQueue();
                }
            } catch (err) {
                clearInterval(tick);
                if (err.name === "AbortError") return;
                setExplorerStatus("error", escapeHtml(err.message || "Erro na busca"));
                showToast(err.message || "Erro", "error");
            } finally {
                setExplorerBusy(false);
                setTimeout(() => setExplorerProgress(false), 600);
                explorerAbort = null;
            }
        }

        async function saveExplorerSelection() {
            const selected = explorerProducts.filter((p) => explorerSelected.has(String(p.itemId || p.id)));
            if (!selected.length) {
                showToast("Selecione ao menos um produto", "error");
                return;
            }
            // Deduplicar por itemId (já único na prévia, reforço)
            const byId = new Map();
            for (const p of selected) byId.set(String(p.itemId || p.id), p);
            const products = [...byId.values()];
            const btn = document.getElementById("btn-explorer-save");
            const original = btn ? btn.innerHTML : "";
            if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando…`; }
            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/save-bulk`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        products,
                        listType: Number(document.getElementById("admin-list-type")?.value) || 0,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const sl = data.shortlinks || {};
                const skip = data.skippedExisting ? ` · ${data.skippedExisting} já existiam` : "";
                const slMsg = sl.generated
                    ? ` · ${sl.generated} shortlinks prontos`
                    : (sl.failed ? ` · ${sl.failed} shortlinks falharam` : "");
                showToast(`Salvos: ${data.saved} novos${skip}${slMsg}`, "success");
                setExplorerStatus("success", `<strong>${data.saved}</strong> novos gravados${data.skippedExisting ? ` · <strong>${data.skippedExisting}</strong> ignorados (já postados)` : ""}${sl.generated ? ` · <strong>${sl.generated}</strong> shope.ee` : ""}.`);
                await loadOffersFromSupabase({ silent: true, reset: true });
                await loadCategoriesFromApi({ silent: true });
                populateAdminCategorySelect();
                loadAdminStats();
                loadShortlinkStatus();
            } catch (err) {
                showToast(`Falha ao salvar: ${err.message}`, "error");
                setExplorerStatus("error", escapeHtml(err.message));
            } finally {
                if (btn) { btn.disabled = explorerSelected.size === 0; btn.innerHTML = original; }
            }
        }

        async function fetchLiveOffers(syncToSupabase = false, opts = {}) {
            // Compat: busca simples ainda funciona; multi-keyword usa o Explorador
            const raw = opts.keyword
                || document.getElementById("admin-keyword")?.value
                || document.getElementById("store-search-input")?.value
                || "oferta";
            const keywords = parseExplorerKeywords(raw);
            if (keywords.length > 1 || Number(document.getElementById("admin-pages")?.value) > 1) {
                if (document.getElementById("admin-keyword") && opts.keyword) {
                    document.getElementById("admin-keyword").value = keywords.join(", ");
                }
                return runExplorerSearch({ sync: syncToSupabase });
            }
            const keyword = keywords[0] || "oferta";
            const limit = document.getElementById("admin-limit")?.value || 20;
            const listType = Number(document.getElementById("admin-list-type")?.value) || 0;
            const sortType = Number(document.getElementById("admin-sort-type")?.value) || 2;
            const minRating = document.getElementById("admin-min-rating")?.value ?? 4;
            const minSales = document.getElementById("admin-min-sales")?.value ?? 0;
            const requireCommission = document.getElementById("admin-require-commission")?.checked ? "1" : "0";
            const sync = syncToSupabase ? "&sync=1" : "";
            try {
                const res = await fetch(
                    `${API_BASE}/api/ofertas?keyword=${encodeURIComponent(keyword)}&limit=${limit}&listType=${listType}&sortType=${sortType}`
                    + `&minRating=${encodeURIComponent(minRating)}&minSales=${encodeURIComponent(minSales)}&requireCommission=${requireCommission}${sync}`
                );
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const ok = applyProducts(data.products, "shopee");
                renderExplorerPreview(data.products || [], { filteredOut: data.filteredOut, rateLimited: data.rateLimited });
                if (data.count === 0) {
                    setExplorerStatus(data.rateLimited ? "rate" : "empty",
                        data.rateLimited
                            ? "Rate-limit da Shopee."
                            : `Nenhum produto. Filtrados: ${data.filteredOut || 0}.`);
                } else {
                    setExplorerStatus("success",
                        `<strong>${data.count}</strong> · ${data.listTypeLabel || ""} · ${data.sortTypeLabel || ""} · filtrados ${data.filteredOut || 0}${data.saved ? ` · ${data.saved} salvos` : ""}`);
                }
                if (isAdminMode()) loadAdminStats();
                if (!opts.silent) {
                    showToast(ok
                        ? `Shopee: ${data.count} ofertas${data.saved ? ` · ${data.saved} no Supabase` : ""}`
                        : "Shopee respondeu sem produtos",
                        ok ? "success" : "error");
                }
                setApiStatus("API Status: Shopee ao vivo", true);
                return ok;
            } catch (err) {
                if (!opts.silent) showToast(`Erro Shopee: ${err.message}`, "error");
                setExplorerStatus("error", escapeHtml(err.message));
                return false;
            }
        }

async function loadOffersFromSupabase(opts = {}) {
            const searchTerm = document.getElementById("store-search-input")?.value || "";
            const keyword = opts.keyword ?? searchTerm;
            const subcategory = opts.subcategory ?? (currentStoreSubcategory || "");
            const category = opts.category ?? (currentStoreCategory !== "todos" ? currentStoreCategory : "");
            const reset = opts.reset !== false;
            if (reset) currentPage = 0;
            const limit = PAGE_SIZE;
            const offset = currentPage * PAGE_SIZE;
            const url = `${API_BASE}/api/ofertas/db?limit=${limit}&offset=${offset}`
                + `&keyword=${encodeURIComponent(keyword)}`
                + `&subcategory=${encodeURIComponent(subcategory)}`
                + `&category=${encodeURIComponent(category)}`
                + `&sort=${encodeURIComponent(opts.sort || currentStoreSort)}`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const ok = applyProducts(data.products, "supabase", { append: !reset });
                hasMore = (data.products || []).length >= limit;
                renderLoadMoreBtn();
                if (reset && ok && hasMore) prefetchNextPageIdle();
                if (!opts.silent) {
                    showToast(ok ? `Supabase: ${data.count} ofertas` : "Banco vazio para esse filtro — rode um Sync", ok ? "success" : "error");
                }
                if (ok) setApiStatus("API Status: cache Supabase", true);
                return ok;
            } catch (err) {
                if (!opts.silent) showToast(`Erro Supabase: ${err.message}`, "error");
                return false;
            }
        }

        let adminCatalogLoading = false;
        let adminCatalogLoaded = false;

        function updateAdminCatalogProgress(loaded, total) {
            const loadedEl = document.getElementById('count-db-loaded');
            if (!loadedEl) return;
            if (adminCatalogLoading) {
                loadedEl.textContent = total
                    ? `· carregando ${loaded}/${total}…`
                    : `· carregando ${loaded}…`;
                return;
            }
            if (total > loaded) {
                loadedEl.textContent = `· ${loaded} na memória (faltam ${total - loaded})`;
            } else if (loaded > 0) {
                loadedEl.textContent = `· ${loaded} carregados`;
            } else {
                loadedEl.textContent = '';
            }
        }

        /** Carrega o catálogo inteiro do Supabase em lotes (só no admin). */
        async function loadAdminCatalogFull({ silent = false, force = false } = {}) {
            if (!isAdminMode()) return false;
            if (adminCatalogLoading) return false;
            if (adminCatalogLoaded && !force && productsDatabase.length > PAGE_SIZE) {
                renderConsoleProducts();
                return true;
            }
            adminCatalogLoading = true;
            const BATCH = 200;
            let offset = 0;
            let all = [];
            let knownTotal = Number((categories.find(c => c.id === 'todos') || {}).count) || 0;
            const btn = document.getElementById('btn-load-full-catalog');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Carregando…';
            }
            updateAdminCatalogProgress(0, knownTotal);
            try {
                while (offset < 10000) {
                    const url = `${API_BASE}/api/ofertas/db?limit=${BATCH}&offset=${offset}&sort=recent`;
                    const res = await fetch(url);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                    const batch = Array.isArray(data.products) ? data.products : [];
                    all = all.concat(batch);
                    updateAdminCatalogProgress(all.length, knownTotal || all.length);
                    if (batch.length < BATCH) break;
                    offset += BATCH;
                }
                const map = new Map(all.map(p => [String(p.id), p]));
                productsDatabase = [...map.values()];
                adminCatalogLoaded = true;
                lastApiSource = 'supabase-full';
                renderConsoleProducts();
                populateAdminProductCategoryFilter();
                loadAdminStats();
                updateAdminCatalogProgress(productsDatabase.length, knownTotal || productsDatabase.length);
                if (!silent) {
                    showToast(`Catálogo completo: ${productsDatabase.length} produtos`, 'success');
                }
                return true;
            } catch (err) {
                if (!silent) showToast(`Erro ao carregar catálogo: ${err.message}`, 'error');
                updateAdminCatalogProgress(productsDatabase.length, knownTotal);
                return false;
            } finally {
                adminCatalogLoading = false;
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-cloud-arrow-down mr-1"></i> Carregar catálogo completo';
                }
                updateAdminCatalogProgress(
                    productsDatabase.length,
                    Number((categories.find(c => c.id === 'todos') || {}).count) || productsDatabase.length
                );
            }
        }

        async function loadMoreProducts() {
            if (loadingMore || !hasMore) return;
            loadingMore = true;
            currentPage += 1;
            await loadOffersFromSupabase({ silent: true, reset: false });
            loadingMore = false;
        }

        function renderLoadMoreBtn() {
            const info = document.getElementById('store-results-info');
            if (!info) return;
            const existing = document.getElementById('load-more-btn');
            if (existing) existing.remove();
            if (!hasMore) return;
            const btn = document.createElement('button');
            btn.id = 'load-more-btn';
            btn.className = 'ml-3 px-3 py-1 text-[11px] font-bold rounded-lg bg-shopee-orange text-white hover:bg-shopee-orangeHover';
            btn.textContent = `Carregar mais ${PAGE_SIZE}`;
            btn.onclick = loadMoreProducts;
            info.appendChild(btn);
            setupInfiniteScroll();
        }

        let infiniteScrollObs = null;
        function setupInfiniteScroll() {
            if (infiniteScrollObs) {
                infiniteScrollObs.disconnect();
                infiniteScrollObs = null;
            }
            const btn = document.getElementById('load-more-btn');
            if (!btn || typeof IntersectionObserver === 'undefined') return;
            infiniteScrollObs = new IntersectionObserver((entries) => {
                if (entries.some((e) => e.isIntersecting)) loadMoreProducts();
            }, { rootMargin: '240px' });
            infiniteScrollObs.observe(btn);
        }

        function prefetchNextPageIdle() {
            if (!hasMore || loadingMore || !apiLive) return;
            const run = () => {
                if (!hasMore || loadingMore) return;
                loadMoreProducts().catch(() => {});
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(run, { timeout: 4000 });
            } else {
                setTimeout(run, 2500);
            }
        }

        async function syncDefaultKeywords() {
            showToast("Sincronizando keywords na Shopee…", "success");
            try {
                const res = await adminFetch(`${API_BASE}/api/sync`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ limit: 12, listType: 0, sortType: 2 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                applyProducts(data.products, "sync");
                showToast(`Sync OK: ${data.count} produtos únicos no Supabase`, "success");
            } catch (err) {
                showToast(`Sync falhou: ${err.message}`, "error");
            }
        }

        // Inicializa o estado. Só usa cache do localStorage OU mock enquanto a API não responde;
        // window.onload em seguida vai sobrescrever com dados reais do Supabase.
        function initDatabase() {
            try {
                const cache = localStorage.getItem('afiliado_mestre_db_v1');
                if (cache) {
                    const parsed = JSON.parse(cache);
                    if (Array.isArray(parsed) && parsed.length) {
                        productsDatabase = parsed;
                    } else {
                        productsDatabase = [...defaultProducts];
                    }
                } else {
                    productsDatabase = [...defaultProducts];
                }
            } catch (_) {
                productsDatabase = [...defaultProducts];
            }
        }

        // Restore default mocked data
        function restoreDefaultDatabase() {
            if (confirm("Deseja apagar os produtos adicionados e redefinir o banco de dados padrão?")) {
                localStorage.removeItem('afiliado_mestre_db_v1');
                initDatabase();
                renderStoreProducts();
                renderConsoleProducts();
                if (isAdminMode()) loadAdminStats();
                showToast("Banco de dados restaurado!", "success");
            }
        }

        // Compatibilidade com links antigos (#console, switchMainMode)
        function switchMainMode(mode) {
            if (mode === "storefront") {
                window.location.href = "/";
                return;
            }
            const map = { console: "produtos", campaigns: "campanhas", performance: "desempenho" };
            switchAdminView(map[mode] || mode);
        }

        // Countdown baseado no próximo periodEnd real das ofertas relâmpago
        function initCountdown() {
            setInterval(() => {
                const hourEl = document.getElementById('flash-hour');
                if (!hourEl) return;
                if (!flashEndsAt) {
                    hourEl.innerText = '--';
                    document.getElementById('flash-min').innerText = '--';
                    document.getElementById('flash-sec').innerText = '--';
                    return;
                }
                let totalSeconds = Math.max(0, Math.floor(flashEndsAt - Date.now() / 1000));
                const hrs = Math.floor(totalSeconds / 3600);
                const mins = Math.floor((totalSeconds % 3600) / 60);
                const secs = totalSeconds % 60;
                hourEl.innerText = String(hrs).padStart(2, '0');
                document.getElementById('flash-min').innerText = String(mins).padStart(2, '0');
                document.getElementById('flash-sec').innerText = String(secs).padStart(2, '0');
            }, 1000);
        }

        function parseSalesNumber(p) {
            const raw = String(p.salesRaw || p.sales || '').replace(/[^\d.,]/g, '').replace(',', '.');
            const n = parseFloat(raw);
            return Number.isFinite(n) ? n : 0;
        }

        function sortProductsLocal(list) {
            const arr = [...list];
            if (currentStoreSort === 'money') {
                arr.sort((a, b) => moneyScoreOf(b) - moneyScoreOf(a));
            } else if (currentStoreSort === 'sales') {
                arr.sort((a, b) => parseSalesNumber(b) - parseSalesNumber(a));
            } else if (currentStoreSort === 'discount') {
                arr.sort((a, b) => (b.discountPct || parseInt(b.discount, 10) || 0) - (a.discountPct || parseInt(a.discount, 10) || 0));
            } else if (currentStoreSort === 'rating') {
                arr.sort((a, b) => (b.stars || 0) - (a.stars || 0));
            } else if (currentStoreSort === 'ending') {
                arr.sort((a, b) => (a.periodEnd || Infinity) - (b.periodEnd || Infinity));
            } else if (currentStoreSort === 'price-asc') {
                arr.sort((a, b) => (a.newPrice || 0) - (b.newPrice || 0));
            } else if (currentStoreSort === 'price-desc') {
                arr.sort((a, b) => (b.newPrice || 0) - (a.newPrice || 0));
            }
            return arr;
        }

        function scrollToStoreTop() {
            document.getElementById('main-storefront-section')?.scrollIntoView({ behavior: 'smooth' });
        }
        function clearStoreSearch() {
            const input = document.getElementById('store-search-input');
            if (!input) return;
            input.value = '';
            searchStoreProducts();
            input.focus();
        }
        function scrollToStoreCategories() {
            if (window.matchMedia('(max-width: 639px)').matches) {
                openMobileCategorySheet();
                return;
            }
            document.getElementById('store-categories-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        function scrollToFlashSale() {
            const flash = document.getElementById('flash-sale-section');
            if (flash && !flash.classList.contains('hidden')) {
                flash.scrollIntoView({ behavior: 'smooth' });
                return;
            }
            const hero = document.getElementById('hero-products');
            if (hero) {
                hero.scrollIntoView({ behavior: 'smooth' });
                return;
            }
        }
        function focusStoreSearch() {
            const input = document.getElementById('store-search-input');
            if (!input) return;
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => input.focus(), 350);
        }

        async function setStoreSort(sort, opts = {}) {
            currentStoreSort = sort || 'recent';
            document.querySelectorAll('.store-sort-btn').forEach((btn) => {
                const active = btn.getAttribute('data-sort') === currentStoreSort;
                btn.className = active
                    ? 'store-sort-btn px-2.5 py-1.5 rounded-md bg-shopee-orange text-white shadow-sm'
                    : 'store-sort-btn px-2.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-50';
            });
            if (apiLive) {
                await loadOffersFromSupabase({ silent: true, reset: true, sort: currentStoreSort });
            } else {
                renderStoreProducts();
            }
            renderHomeSections();
        }

        async function setStoreCategory(catId, opts = {}) {
            currentStoreCategory = catId;
            currentStoreSubcategory = '';
            currentPage = 0;
            currentNavSection = catId === 'todos' ? 'destaque' : 'category_page';
            if (!opts.skipUrl) {
                const next = !catId || catId === 'todos' ? '/' : `/categoria/${catId}`;
                history.pushState({ path: next }, '', next);
            }
            renderCategories();
            renderSubcategories();
            renderStoreProducts();
            renderHomeSections();
            preloadSubcategoryCovers(catId);
            if (!apiLive) return;

            const MIN_LOCAL = 12;
            const localCount = catId === 'todos'
                ? productsDatabase.length
                : productsDatabase.filter(p => p.category === catId).length;
            if (localCount >= MIN_LOCAL) {
                if (localCount < 60) {
                    loadCategoryProducts(catId).catch(() => {});
                }
                return;
            }
            await loadCategoryProducts(catId);
        }

        async function setStoreSubcategory(key, opts = {}) {
            currentStoreSubcategory = key || '';
            currentPage = 0;
            if (!opts.skipUrl && currentStoreCategory && currentStoreCategory !== 'todos') {
                const next = key
                    ? `/categoria/${currentStoreCategory}/${key}`
                    : `/categoria/${currentStoreCategory}`;
                history.pushState({ path: next }, '', next);
            }
            renderSubcategories();
            renderStoreProducts();
            scrollToStoreGrid();
        }

        async function loadHeroProducts() {
            const track = document.getElementById('hero-products-track');
            if (!track) return;

            const renderHeroCards = (list) => {
                const now = Math.floor(Date.now() / 1000);
                let picks = femaleOnly(list || [])
                    .filter(p => p && p.image && Number(p.newPrice) > 0)
                    .sort((a, b) => {
                        const flashA = a.isFlashSale && a.periodEnd > now ? 1 : 0;
                        const flashB = b.isFlashSale && b.periodEnd > now ? 1 : 0;
                        if (flashB !== flashA) return flashB - flashA;
                        const money = moneyScoreOf(b) - moneyScoreOf(a);
                        if (money) return money;
                        return (displayDiscount(b) || 0) - (displayDiscount(a) || 0);
                    });
                const flashPicks = picks.filter(p => {
                    if (!(p.isFlashSale && p.periodEnd > now && p.periodEnd - now <= 24 * 3600)) return false;
                    const d = displayDiscount(p);
                    return d >= 20 && d <= 80;
                });
                picks = (flashPicks.length ? flashPicks : picks).slice(0, 12);
                if (!picks.length) {
                    track.innerHTML = `
                        <div class="shrink-0 w-full py-8 text-center text-slate-400 text-xs">
                            Carregando ofertas relâmpago…
                        </div>`;
                    return false;
                }
                track.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5';
                track.innerHTML = picks.map((p, index) => productCardHTML(p, { index, section: 'flash_deals' })).join('');
                return true;
            };

            try {
                const res = await fetch(`${API_BASE}/api/ofertas/db?limit=36&sort=discount`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const list = Array.isArray(data.products) ? data.products : [];
                if (list.length) applyProducts(list, 'hero', { append: true });
                if (!renderHeroCards(list.length ? list : productsDatabase)) {
                    renderHeroCards(productsDatabase);
                }
            } catch (err) {
                if (!renderHeroCards(productsDatabase)) {
                    track.className = 'flex gap-3 overflow-x-auto pb-2 snap-x';
                    track.innerHTML = `
                        <div onclick="scrollToStoreGrid()" class="shrink-0 w-full md:w-[70%] h-44 md:h-56 rounded-2xl bg-shopee-orange text-white p-8 flex flex-col justify-end cursor-pointer">
                            <h3 class="text-2xl font-black">Ofertas Relâmpago</h3>
                            <p class="text-sm text-orange-100 mt-2">Clique para ver os produtos.</p>
                        </div>`;
                }
            }
        }

        function getSubcategoryKeywords(catId, subId) {
            if (!subId) return [];
            const cat = categories.find(c => c.id === catId);
            const sub = (cat?.subcategories || []).find(s => (s.id || s.key) === subId);
            if (!sub) return [];
            if (Array.isArray(sub.keywords) && sub.keywords.length) {
                return sub.keywords.map(k => String(k).toLowerCase().trim());
            }
            return [];
        }

        function productMatchesSubcategory(p, catId, subId) {
            if (!subId) return true;
            if (String(p.subcategory || '') === subId) return true;
            const subKws = getSubcategoryKeywords(catId, subId);
            const kw = String(p.keyword || '').toLowerCase().trim();
            if (subKws.includes(kw)) return true;
            const title = String(p.title || '').toLowerCase();
            const subRules = {
                plus_size: (t) => /\b(plus\s*size|tam(?:anho)?\s*g{2,}|\bxg\b|\bxxg\b|4[6-9]|5[0-4])\b/i.test(t),
                lingerie: (t) => /\b(lingerie|calcinha|sutiã|sutia|cinta\s*modeladora)\b/i.test(t),
                praia: (t) => /\b(biqu[ií]ni|maiô|maio|sa[ií]da\s*de\s*praia|sunga)\b/i.test(t),
                calcas: (t) => /\b(cal[cç]a|jeans|legging|pantalona|alfaiataria|linho)\b/i.test(t),
                calcados: (t) => /\b(sand[aá]lia|t[eê]nis|bota|chinelo|scarpin|salto)\b/i.test(t),
                moda_fria: (t) => /\b(jaquet|casaco|moletom|blusa\s*de\s*frio|oversized)\b/i.test(t),
                casa_moda: (t) => /\b(pijama|robe|camisola|roup[aã]o)\b/i.test(t),
                tops: (t) => /\b(cropped|macac[aã]o|conjunto|blusa|camiseta|regata)\b/i.test(t),
                vestidos: (t) => /\b(vestido|saia)\b/i.test(t),
            };
            const rule = subRules[subId];
            if (rule && rule(title)) return true;
            return subKws.some((k) => keywordTitleScore(k, title) >= 5);
        }

        function keywordTitleScore(keyword, title) {
            const lowerTitle = String(title || '').toLowerCase();
            const stop = new Set(['feminino', 'feminina', 'mulher', 'para', 'com', 'kit', 'tipo', 'modelo', 'novo', 'nova', 'vestido', 'longo', 'midi', 'saia', 'roupa', 'conjunto', 'blusa', 'camiseta', 'moda']);
            const tokens = String(keyword || '').toLowerCase().split(/\s+/)
                .filter((t) => t.length > 3 && !stop.has(t));
            if (!tokens.length) return 0;
            const hits = tokens.filter((tok) => lowerTitle.includes(tok));
            if (!hits.length) return 0;
            const longest = Math.max(...hits.map((h) => h.length));
            return hits.length >= 2 ? longest + hits.length : longest;
        }

        function formatProductOptions(p) {
            const opts = p.options || {};
            const labels = Array.isArray(opts.labels) ? opts.labels : [];
            if (labels.length) return labels;
            return [...(opts.sizes || []), ...(opts.voltages || [])];
        }

        function renderOptionBadges(p, compact = false) {
            const labels = formatProductOptions(p).slice(0, compact ? 3 : 8);
            if (!labels.length && !(p.options && p.options.hasVariants)) return '';
            const sizeClass = compact ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-2 py-1';
            const chips = labels.map((label) =>
                `<span class="bg-slate-100 text-slate-600 font-bold rounded ${sizeClass}">${escapeHtml(label)}</span>`
            ).join('');
            const more = (p.options && p.options.hasVariants && !labels.length)
                ? `<span class="bg-blue-50 text-blue-700 font-bold rounded ${sizeClass}">+ variações</span>`
                : '';
            return `<div class="flex flex-wrap gap-1">${chips}${more}</div>`;
        }

        function subcategoryLabelForProduct(p) {
            const cat = categories.find(c => c.id === p.category);
            if (!cat || !Array.isArray(cat.subcategories)) return '';
            const kw = String(p.keyword || '').toLowerCase();
            const sub = cat.subcategories.find(s => {
                const kws = getSubcategoryKeywords(cat.id, s.id || s.key);
                return kws.includes(kw);
            });
            return sub?.label || '';
        }

        // ===== Fotos de capa de categorias/subcategorias =====
        // Caches preenchidos em background e persistidos para render instantâneo
        // (e zero fetch extra) nas visitas seguintes.
        const categoryCovers = {};
        const subcategoryCovers = {};
        try { Object.assign(categoryCovers, JSON.parse(localStorage.getItem('am_cat_covers_v1') || '{}')); } catch (_) {}
        try { Object.assign(subcategoryCovers, JSON.parse(localStorage.getItem('am_sub_covers_v1') || '{}')); } catch (_) {}
        function persistCovers() {
            try {
                localStorage.setItem('am_cat_covers_v1', JSON.stringify(categoryCovers));
                localStorage.setItem('am_sub_covers_v1', JSON.stringify(subcategoryCovers));
            } catch (_) {}
        }

        // Miniatura da CDN da Shopee (_tn) — bem mais leve para os círculos/tiles.
        // Variantes do CDN da Shopee para o mesmo arquivo, medidas em produção:
        //   _tn.webp → 320px / 23KB   _tn → 320px / 32KB
        //   .webp    → 742px / 102KB  original → 742px / 411KB
        // A grade usa a menor; o modal usa a média. Cada variante tem fallback
        // porque itens antigos do catálogo nem sempre têm webp gerado.
        function shopeeVariant(url, suffix) {
            if (!url) return url || '';
            if (!/(shopee|susercontent)\./i.test(url)) return url;
            const [base, query = ''] = String(url).split('?');
            const clean = base.replace(/(_tn)?(\.webp)?$/i, '');
            return `${clean}${suffix}${query ? `?${query}` : ''}`;
        }

        const thumbUrl = url => shopeeVariant(url, '_tn.webp');
        const displayUrl = url => shopeeVariant(url, '.webp');

        function imgFallbackChain(url) {
            const chain = [
                shopeeVariant(url, '_tn'),
                displayUrl(url),
                url || '',
            ];
            const first = thumbUrl(url);
            return [...new Set(chain)].filter(u => u && u !== first);
        }

        // onerror em cadeia: tenta cada variante mais pesada antes de desistir.
        function tileImgError(img, iconClass) {
            const rest = (img.dataset.fallbacks || '').split('|').filter(Boolean);
            if (rest.length) {
                img.dataset.fallbacks = rest.slice(1).join('|');
                img.src = rest[0];
                return;
            }
            img.replaceWith(Object.assign(document.createElement('i'), { className: iconClass }));
        }

        function tileImgHTML(img, iconClass, eager = false) {
            return `<img src="${escapeAttr(thumbUrl(img))}" data-fallbacks="${escapeAttr(imgFallbackChain(img).join('|'))}" alt="" width="80" height="80" loading="${eager ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${eager ? 'high' : 'low'}" class="w-full h-full object-cover" onerror="tileImgError(this, '${iconClass}')">`;
        }

        function productImgError(img, fallbackSize) {
            const rest = (img.dataset.fallbacks || '').split('|').filter(Boolean);
            if (rest.length) {
                img.dataset.fallbacks = rest.slice(1).join('|');
                img.src = rest[0];
                return;
            }
            img.onerror = null;
            img.src = `https://placehold.co/${fallbackSize}x${fallbackSize}/ffebd7/ee4d2d?text=Shopee`;
        }

        function productImgHTML(url, { eager = false, className = '', fallbackSize = 200 } = {}) {
            const safeThumb = escapeAttr(thumbUrl(url || ''));
            const safeChain = escapeAttr(imgFallbackChain(url || '').join('|'));
            return `<img src="${safeThumb}" data-fallbacks="${safeChain}" alt="" width="${fallbackSize}" height="${fallbackSize}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${eager ? 'high' : 'low'}" class="${className}" onerror="productImgError(this, ${fallbackSize})">`;
        }

        // Imagens candidatas de uma categoria, na ordem do catálogo local.
        function categoryImageCandidates(catId) {
            const out = [];
            if (!catId || catId === 'todos') return out;
            for (const p of productsDatabase) {
                if (p.category === catId && p.image) out.push(p.image);
            }
            if (categoryCovers[catId]) out.push(categoryCovers[catId]);
            return out;
        }

        // Primeira candidata ainda não usada no render atual — evita fotos repetidas.
        function pickUnused(candidates, used) {
            for (const img of candidates) {
                if (img && !used.has(img)) { used.add(img); return img; }
            }
            return null;
        }

        function getCategoryImage(catId) {
            return categoryImageCandidates(catId)[0] || null;
        }

        // Busca 1 produto por categoria em background para garantir uma foto de capa.
        let categoryCoversLoaded = false;
        async function preloadCategoryCovers() {
            if (categoryCoversLoaded || !apiLive) return;
            categoryCoversLoaded = true;
            const missing = categories.filter(c =>
                c.id !== 'todos' && !getCategoryImage(c.id)
            );
            if (!missing.length) return;
            await Promise.all(missing.map(async cat => {
                try {
                    const url = `${API_BASE}/api/ofertas/db?limit=1&offset=0&category=${encodeURIComponent(cat.id)}`;
                    const res = await fetch(url);
                    if (!res.ok) return;
                    const data = await res.json();
                    const first = (data.products || [])[0];
                    if (first && first.image) categoryCovers[cat.id] = first.image;
                } catch (_) {}
            }));
            persistCovers();
            renderCategories();
            renderSubcategories();
            const sheet = document.getElementById('mobile-category-sheet');
            if (sheet && !sheet.classList.contains('hidden')) {
                renderMobileCategoryList();
            }
        }

        // Imagens candidatas de uma subcategoria: produtos que casam com o filtro,
        // depois a capa em cache, depois qualquer produto da categoria (fallback).
        // Só devolve fotos que realmente pertencem à subcategoria — sem capa
        // aleatória da categoria, que dava a impressão de tile trocado.
        // Sem foto compatível, o tile cai no ícone próprio da subcategoria.
        function subcategoryImageCandidates(catId, subId, _catImages, catProducts) {
            const out = [];
            let matched = 0;
            for (const p of catProducts) {
                if (matched >= 4) break;
                if (productMatchesSubcategory(p, catId, subId)) { out.push(p.image); matched++; }
            }
            const cached = subcategoryCovers[`${catId}::${subId}`];
            if (cached) out.push(cached);
            return out;
        }

        const preloadedSubCovers = new Set();
        async function preloadSubcategoryCovers(catId) {
            if (!apiLive || !catId || catId === 'todos') return;
            if (preloadedSubCovers.has(catId)) return;
            preloadedSubCovers.add(catId);
            const cat = categories.find(c => c.id === catId);
            const subs = (cat && Array.isArray(cat.subcategories)) ? cat.subcategories : [];
            if (!subs.length) return;

            // 1 request só: um lote da categoria já rende capas distintas para a
            // maioria das subcategorias via matching local (em vez de 1 fetch por sub).
            if (productsDatabase.filter(p => p.category === catId && p.image).length < 12) {
                try {
                    const res = await fetch(`${API_BASE}/api/ofertas/db?limit=40&offset=0&category=${encodeURIComponent(catId)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data.products) && data.products.length) {
                            applyProducts(data.products, 'supabase', { append: true, allowEmpty: true });
                        }
                    }
                } catch (_) {}
            }

            // Busca dirigida apenas para subcategorias que seguem sem capa própria.
            const catProducts = productsDatabase.filter(p => p.category === catId && p.image);
            const missing = subs.filter(s => {
                const subId = s.id || s.key;
                if (subcategoryCovers[`${catId}::${subId}`]) return false;
                return !catProducts.some(p => productMatchesSubcategory(p, catId, subId));
            });
            await Promise.all(missing.map(async s => {
                const subId = s.id || s.key;
                try {
                    const url = `${API_BASE}/api/ofertas/db?limit=1&offset=0&category=${encodeURIComponent(catId)}&subcategory=${encodeURIComponent(subId)}`;
                    const res = await fetch(url);
                    if (!res.ok) return;
                    const data = await res.json();
                    const first = (data.products || [])[0];
                    if (first && first.image) subcategoryCovers[`${catId}::${subId}`] = first.image;
                } catch (_) {}
            }));
            persistCovers();
            renderSubcategories();
            const sheet = document.getElementById('mobile-category-sheet');
            if (sheet && !sheet.classList.contains('hidden')) {
                renderMobileCategoryList();
            }
        }

        function categoryTileHTML(cat, { size = 'md', used, openSheet = false } = {}) {
            const isActive = cat.id === currentStoreCategory;
            const borderClass = isActive ? 'border-shopee-orange shadow-sm bg-orange-50/40' : 'border-transparent';
            const bgIconClass = isActive || cat.id === 'todos' ? 'bg-orange-100 text-shopee-orange' : 'bg-slate-100 text-slate-600';
            const textClass = isActive ? 'text-shopee-orange font-bold' : 'text-slate-600 font-medium';
            const count = Number(cat.count || 0);
            const badgeLabel = formatCountBadge(count);
            const badge = badgeLabel
                ? `<span class="text-[9px] text-slate-400 font-semibold">${badgeLabel}</span>`
                : '';
            const circleSize = size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';
            const iconSize = size === 'lg' ? 'text-2xl' : 'text-base';
            const img = used
                ? pickUnused(categoryImageCandidates(cat.id), used)
                : getCategoryImage(cat.id);
            const icon = categoryIconClass(cat);
            const inner = img
                ? tileImgHTML(img, `fas ${icon} ${iconSize} text-shopee-orange`, true)
                : `<i class="fas ${icon} ${iconSize}"></i>`;
            const circleBg = img ? 'bg-slate-100' : bgIconClass;
            const clickAction = openSheet
                ? `openMobileCategorySheet('${cat.id}')`
                : `setStoreCategory('${cat.id}')`;
            return `
                <button
                    onclick="${clickAction}"
                    class="flex flex-col items-center p-2 rounded-xl hover:bg-slate-50 transition border ${borderClass} group w-full snap-start"
                >
                    <div class="${circleSize} rounded-full ${circleBg} overflow-hidden flex items-center justify-center mb-1.5 transition transform group-hover:scale-105 ring-2 ${isActive ? 'ring-shopee-orange' : 'ring-transparent'}">
                        ${inner}
                    </div>
                    <span class="text-[11px] text-center leading-tight ${textClass} line-clamp-2">${escapeHtml(cat.label)}</span>
                    ${badge}
                </button>`;
        }

        function renderCategories() {
            const desktop = document.getElementById('store-categories-container');
            const strip = document.getElementById('mobile-category-strip');
            const visible = categories.filter(cat => cat.id !== 'todos');
            if (desktop) {
                const used = new Set();
                desktop.innerHTML = visible.map(cat => categoryTileHTML(cat, { size: 'md', used })).join('');
            }
            if (strip) {
                const used = new Set();
                const tiles = visible.map(cat => categoryTileHTML(cat, { size: 'lg', used, openSheet: true })).join('');
                const verMais = `
                    <button onclick="openMobileCategorySheet()" class="flex flex-col items-center p-2 rounded-xl hover:bg-slate-50 transition border border-transparent group w-full snap-start">
                        <div class="h-16 w-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-1.5">
                            <i class="fas fa-th-large text-2xl"></i>
                        </div>
                        <span class="text-[11px] text-center leading-tight text-slate-600 font-medium">Ver Mais</span>
                    </button>`;
                strip.innerHTML = tiles + verMais;
            }
        }

        // Filter by category — usa cache local imediatamente; só busca no servidor
        // se a categoria tiver poucos itens no cache atual (evita ida ao Supabase
        // a cada toque, que era o principal gargalo no mobile).

        async function loadCategoryProducts(catId) {
            try {
                const url = `${API_BASE}/api/ofertas/db?limit=${PAGE_SIZE}&offset=0`
                    + (catId === 'todos' ? '' : `&category=${encodeURIComponent(catId)}`)
                    + `&sort=${encodeURIComponent(currentStoreSort)}`;
                const res = await fetch(url);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                categoryProductsCache = data.products || [];
                // append=true preserva o cache das outras categorias
                applyProducts(categoryProductsCache, 'supabase', { append: true, allowEmpty: true });
                hasMore = categoryProductsCache.length >= PAGE_SIZE;
                renderLoadMoreBtn();
                return categoryProductsCache.length > 0;
            } catch (err) {
                showToast(`Erro ao carregar categoria: ${err.message}`, 'error');
                return false;
            }
        }

        // Renderiza subcategorias agrupadas da categoria ativa (somente desktop).
        function renderSubcategories() {
            const wrapper = document.getElementById('store-subcategories');
            const container = document.getElementById('store-subcategories-container');
            const breadcrumb = document.getElementById('subcat-breadcrumb');
            if (!wrapper || !container) return;

            if (window.matchMedia('(max-width: 639px)').matches) {
                wrapper.classList.add('hidden');
                container.innerHTML = '';
                if (breadcrumb) breadcrumb.textContent = '';
                return;
            }

            const cat = categories.find(c => c.id === currentStoreCategory);
            const subs = (cat && Array.isArray(cat.subcategories)) ? cat.subcategories : [];

            if (currentStoreCategory === 'todos' || !subs.length) {
                wrapper.classList.add('hidden');
                container.innerHTML = '';
                if (breadcrumb) breadcrumb.textContent = '';
                updateMobileCategoryUI();
                return;
            }

            wrapper.classList.remove('hidden');
            const activeSub = subs.find(s => (s.id || s.key) === currentStoreSubcategory);
            if (breadcrumb) {
                breadcrumb.textContent = activeSub
                    ? `${cat.label} › ${activeSub.label}`
                    : cat.label;
            }

            const tile = (id, label, count, active, img) => {
                const iconClass = `fas ${subcategoryIconClass(cat.id, id)} text-xl text-shopee-orange`;
                const inner = img
                    ? tileImgHTML(img, iconClass)
                    : `<i class="${iconClass}"></i>`;
                const tileBg = img
                    ? 'bg-slate-100'
                    : 'bg-gradient-to-br from-orange-50 to-rose-50';
                return `
                <button onclick="setStoreSubcategory('${String(id).replace(/'/g, "\\'")}')"
                    class="flex flex-col items-center p-1.5 rounded-xl transition border ${active
                        ? 'border-shopee-orange bg-orange-50/40 shadow-sm'
                        : 'border-transparent hover:bg-slate-50'}">
                    <div class="aspect-square w-full rounded-lg ${tileBg} overflow-hidden flex items-center justify-center mb-1.5 ring-2 ${active ? 'ring-shopee-orange' : 'ring-transparent'}">
                        ${inner}
                    </div>
                    <span class="text-[11px] leading-tight text-center line-clamp-2 ${active ? 'text-shopee-orange font-bold' : 'text-slate-600 font-medium'}">${escapeHtml(label)}</span>
                    ${count > 0 ? `<span class="text-[9px] text-slate-400 font-semibold">${count}</span>` : ''}
                </button>`;
            };

            // Uma foto por tile, sem repetir dentro do bloco de subcategorias.
            const catProducts = productsDatabase.filter(p => p.category === cat.id && p.image);
            const catImages = catProducts.map(p => p.image);
            if (categoryCovers[cat.id]) catImages.push(categoryCovers[cat.id]);
            const used = new Set();

            const totalInCat = Number(cat.count || 0);
            container.innerHTML =
                tile('', 'Todas', totalInCat, currentStoreSubcategory === '', pickUnused(catImages, used))
                + subs.map(s => {
                    const subId = s.id || s.key;
                    return tile(
                        subId,
                        s.label,
                        Number(s.count || 0),
                        currentStoreSubcategory === subId,
                        pickUnused(subcategoryImageCandidates(cat.id, subId, catImages, catProducts), used)
                    );
                }).join('');
            updateMobileCategoryUI();
        }

        // ===== Página de categorias em tela cheia (estilo Shopee) =====
        // `mobileExpandedCat` guarda a categoria selecionada na sidebar.
        let mobileExpandedCat = null;

        function openMobileCategorySheet(prefilledCatId) {
            document.getElementById('mobile-category-sheet')?.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            if (prefilledCatId && prefilledCatId !== 'todos') {
                mobileExpandedCat = prefilledCatId;
            } else if (!mobileExpandedCat || mobileExpandedCat === 'todos') {
                mobileExpandedCat = currentStoreCategory !== 'todos' ? currentStoreCategory : null;
            }
            renderMobileCategoryList();
            if (mobileExpandedCat) preloadSubcategoryCovers(mobileExpandedCat);
        }
        function closeMobileCategorySheet() {
            document.getElementById('mobile-category-sheet')?.classList.add('hidden');
            document.body.style.overflow = '';
        }

        // Seleção na sidebar: categorias sem subcategorias aplicam o filtro direto.
        function selectCategoryPage(catId) {
            const cat = categories.find(c => c.id === catId);
            if (!cat) return;
            const hasSubs = cat.id !== 'todos'
                && Array.isArray(cat.subcategories)
                && cat.subcategories.length > 0;
            if (!hasSubs) {
                setStoreCategory(catId);
                closeMobileCategorySheet();
                return;
            }
            mobileExpandedCat = catId;
            preloadSubcategoryCovers(catId);
            renderMobileCategoryList();
        }

        function selectMobileSubcategory(catId, subId) {
            // Fecha o painel imediatamente para dar sensação de resposta.
            closeMobileCategorySheet();
            // Aplica categoria + subcategoria juntas, sem dois renders sequenciais.
            currentStoreCategory = catId;
            currentStoreSubcategory = subId || '';
            currentPage = 0;
            renderCategories();
            renderSubcategories();
            renderStoreProducts();
            scrollToStoreGrid();
            // Carrega dados frescos em background se o cache estiver curto.
            if (!apiLive) return;
            const localCount = productsDatabase.filter(p => p.category === catId).length;
            if (localCount < 12) loadCategoryProducts(catId).catch(() => {});
        }

        function updateMobileCategoryUI() {
            if (!document.getElementById('mobile-category-sheet')?.classList.contains('hidden')) {
                renderMobileCategoryList();
            }
        }

        function renderMobileCategoryList() {
            const sidebar = document.getElementById('category-page-sidebar');
            const panel = document.getElementById('category-page-panel');
            if (!sidebar || !panel) return;

            // Sem seleção ainda: cai na primeira categoria com subcategorias.
            if (!mobileExpandedCat || !categories.some(c => c.id === mobileExpandedCat)) {
                const firstWithSubs = categories.find(c =>
                    c.id !== 'todos' && Array.isArray(c.subcategories) && c.subcategories.length > 0
                );
                mobileExpandedCat = firstWithSubs ? firstWithSubs.id : null;
            }
            const selected = categories.find(c => c.id === mobileExpandedCat) || null;

            sidebar.innerHTML = categories
                .filter(cat => cat.id !== 'todos')
                .map(cat => {
                const isSel = selected && cat.id === selected.id;
                return `
                <button onclick="selectCategoryPage('${cat.id}')"
                    class="w-full flex flex-col items-center gap-1.5 px-1 py-3.5 text-center border-l-[3px] transition ${isSel
                        ? 'bg-white text-shopee-orange border-shopee-orange'
                        : 'text-slate-500 border-transparent active:bg-slate-200/60'}">
                    <i class="fas ${categoryIconClass(cat)} text-lg"></i>
                    <span class="text-[10px] leading-tight font-semibold">${escapeHtml(cat.label)}</span>
                </button>`;
            }).join('');

            if (!selected) { panel.innerHTML = ''; return; }

            // Fotos sem repetição dentro do painel.
            const used = new Set();
            const catProducts = productsDatabase.filter(p => p.category === selected.id && p.image);
            const catImages = catProducts.map(p => p.image);
            if (categoryCovers[selected.id]) catImages.push(categoryCovers[selected.id]);
            const subs = Array.isArray(selected.subcategories) ? selected.subcategories : [];

            const tile = (id, label, img, active) => {
                const iconClass = `fas ${subcategoryIconClass(selected.id, id)} text-2xl text-shopee-orange`;
                const inner = img
                    ? tileImgHTML(img, iconClass)
                    : `<i class="${iconClass}"></i>`;
                const tileBg = img
                    ? 'bg-slate-100'
                    : 'bg-gradient-to-br from-orange-50 to-rose-50';
                return `
                <button onclick="selectMobileSubcategory('${selected.id}','${String(id).replace(/'/g, "\\'")}')"
                    class="flex flex-col items-center gap-2 py-2">
                    <span class="h-20 w-20 rounded-full ${tileBg} overflow-hidden flex items-center justify-center ring-2 ${active ? 'ring-shopee-orange' : 'ring-transparent'}">
                        ${inner}
                    </span>
                    <span class="text-xs leading-tight text-center line-clamp-2 ${active ? 'text-shopee-orange font-bold' : 'text-slate-700 font-medium'}">${escapeHtml(label)}</span>
                </button>`;
            };

            const isCatActive = currentStoreCategory === selected.id;
            panel.innerHTML = `
                <div class="grid grid-cols-3 gap-x-1 gap-y-3">
                    ${tile('', 'Ver tudo', pickUnused(catImages, used), isCatActive && currentStoreSubcategory === '')}
                    ${subs.map(s => {
                        const subId = s.id || s.key;
                        return tile(
                            subId,
                            s.label,
                            pickUnused(subcategoryImageCandidates(selected.id, subId, catImages, catProducts), used),
                            isCatActive && currentStoreSubcategory === subId
                        );
                    }).join('')}
                </div>`;
        }

        function isFemaleProduct(p) {
            if (!p) return false;
            const cat = String(p.category || '').toLowerCase();
            if (['moda', 'beleza', 'acessorios', 'fitness', 'maternidade', 'saude', 'casa', 'presentes', 'pet', 'infantil'].includes(cat)) return true;
            return /feminin|mulher|menina|gestante|matern|maquiagem|skincare|batom|vestido|saia|biquini|lingerie|suti[aã]|calcinha|bolsa|necessaire|cropped|pantalo|sandalia|rasteir|scrunchie|boob\s*tape|plus\s*size|amamenta|legging|brinco|colar|unha|pijama|tiara/i
                .test(`${p.title || ''} ${p.keyword || ''} ${p.subcategory || ''}`);
        }

        function moneyScoreOf(p) {
            if (p && Number.isFinite(Number(p.moneyScore))) return Number(p.moneyScore);
            const rate = Number(String(p.commissionRate || p.commissionPct || '0').replace('%', '')) || 0;
            const commissionPct = rate <= 1 && rate > 0 ? rate * 100 : rate;
            const sales = parseSalesNumber(p);
            const rating = Number(p.stars) > 0 ? Math.min(5, Number(p.stars)) : 4;
            return Math.round(commissionPct * Math.log10(sales + 1) * rating * 100) / 100;
        }

        function femaleOnly(list) {
            return (Array.isArray(list) ? list : []).filter(isFemaleProduct);
        }

        function sortByMoney(list) {
            return [...(list || [])].sort((a, b) => moneyScoreOf(b) - moneyScoreOf(a));
        }

        function prioritizeFemaleProducts(list) {
            // Home: 100% feminino. Em outras telas, 95/5 via filter duro só na home.
            return femaleOnly(list);
        }

        function productCardHTML(p, { index = 0, section = 'destaque' } = {}) {
            const disc = displayDiscount(p);
            const priceFormatted = Number(p.newPrice).toFixed(2).replace('.', ',');
            const rating = formatRating(p.stars);
            const soldCount = parseSalesNumber(p);
            const sold = formatSold(p.salesRaw != null ? p.salesRaw : p.sales);
            const salesBadge = soldCount >= 1000
                ? `+${soldCount >= 10000 ? `${Math.floor(soldCount / 1000)} mil` : soldCount.toLocaleString('pt-BR')} vendidos`
                : (soldCount >= 100 ? `+${soldCount} vendidos` : '');
            const shop = cleanShopName(p.shopName);
            const official = isOfficialShop(p.shopType);
            const subLabel = subcategoryLabelForProduct(p);
            return `
                <div class="bg-white rounded-xl overflow-hidden border border-slate-100 hover:border-shopee-orange hover:shadow-md transition flex flex-col h-full relative group">
                    <div onclick="openProductModal(${p.id}, '${section}')" class="cursor-pointer flex flex-col flex-1">
                    ${disc ? `
                    <div class="absolute top-0 right-0 bg-[#ffe97a] text-shopee-orange text-[9px] font-black px-1.5 py-1 text-center rounded-bl-lg z-10 leading-none">
                        <span class="block">-${disc}%</span>
                        <span class="text-[7px] text-orange-600 font-bold uppercase block mt-0.5">OFF</span>
                    </div>` : ''}
                    ${official ? `<span class="absolute left-2 top-2 z-10 rounded bg-shopee-orange px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Oficial</span>` : ''}
                    ${salesBadge ? `<span class="absolute left-2 ${official ? 'top-8' : 'top-2'} z-10 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">${escapeHtml(salesBadge)}</span>` : ''}
                    <div class="aspect-square img-skeleton relative overflow-hidden">
                        ${productImgHTML(p.image, {
                            eager: index < 4,
                            className: 'w-full h-full object-cover transition duration-300 group-hover:scale-105'
                        })}
                    </div>
                    <div class="p-2.5 flex flex-col justify-between flex-1 space-y-1">
                        ${subLabel ? `<span class="self-start bg-orange-50 text-shopee-orange text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">${escapeHtml(subLabel)}</span>` : ''}
                        <h4 class="text-[13px] text-slate-900 font-semibold line-clamp-2 min-h-[2.4rem] leading-snug group-hover:text-shopee-orange transition">${escapeHtml(p.title)}</h4>
                        ${renderOptionBadges(p, true)}
                        <div>
                            ${p.oldPrice > p.newPrice ? `<p class="text-[9px] text-slate-400 line-through leading-none">R$ ${Number(p.oldPrice).toFixed(2).replace('.', ',')}</p>` : ''}
                            <p class="text-shopee-orange text-base font-black mt-0.5">R$ ${priceFormatted}</p>
                        </div>
                        <div class="flex items-center gap-1 text-[10px] text-slate-500 pt-1 border-t border-slate-50">
                            ${rating ? `<span class="text-amber-500">★</span><span class="font-semibold text-slate-700">${rating}</span>` : ''}
                            ${rating && sold ? `<span class="text-slate-300">·</span>` : ''}
                            ${sold ? `<span>${escapeHtml(sold)}</span>` : ''}
                        </div>
                        ${shop ? `<p class="text-[9px] text-slate-400 truncate">${escapeHtml(shop)}</p>` : ''}
                    </div>
                    </div>
                    <button type="button" onclick="event.stopPropagation(); buyFromCard(${p.id}, '${section}')"
                        class="mx-2.5 mb-2.5 mt-auto w-[calc(100%-1.25rem)] bg-shopee-orange hover:bg-shopee-orangeHover text-white text-[11px] font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 transition">
                        Comprar na Shopee <i class="fas fa-arrow-up-right-from-square text-[9px]"></i>
                    </button>
                </div>`;
        }

        function parseSalesNumber(p) {
            if (typeof p.salesRaw === 'number') return p.salesRaw;
            const s = String(p.salesRaw || p.sales || '');
            const mil = s.match(/([\d.,]+)\s*mil/i);
            if (mil) return Number(mil[1].replace(',', '.')) * 1000 || 0;
            const k = s.match(/([\d.,]+)\s*k/i);
            if (k) return Number(k[1].replace(',', '.')) * 1000 || 0;
            const n = Number(String(s).replace(/[^\d]/g, ''));
            return Number.isFinite(n) ? n : 0;
        }

        function deriveHomeSections(list) {
            const items = sortByMoney(femaleOnly(list));
            const topSellers = items
                .filter(p => parseSalesNumber(p) >= 100)
                .sort((a, b) => parseSalesNumber(b) - parseSalesNumber(a))
                .slice(0, 12);
            const bigDiscounts = items
                .map(p => ({ p, d: displayDiscount(p) }))
                .filter(x => x.d >= 30 && x.d <= 85 && parseSalesNumber(x.p) >= 50)
                .sort((a, b) => b.d - a.d)
                .map(x => x.p)
                .slice(0, 12);
            const topRated = items
                .filter(p => Number(p.stars) >= 4.7 && parseSalesNumber(p) >= 200)
                .sort((a, b) => Number(b.stars) - Number(a.stars))
                .slice(0, 12);
            const officialShops = items.filter(p => isOfficialShop(p.shopType)).slice(0, 12);
            const premium = items.filter(p => moneyScoreOf(p) > 0).slice(0, 12);
            const moda = items.filter(p => p.category === 'moda').slice(0, 12);
            const beleza = items.filter(p => p.category === 'beleza').slice(0, 12);
            return { topSellers, bigDiscounts, topRated, officialShops, premium, moda, beleza };
        }

        function renderHomeSections() {
            const box = document.getElementById('home-sections');
            if (!box || isAdminMode()) return;
            if (currentStoreCategory !== 'todos' || currentStoreSubcategory) {
                box.innerHTML = '';
                return;
            }
            const path = pathClean();
            if (path !== '/' && path !== '') {
                box.innerHTML = '';
                return;
            }
            const { topSellers, bigDiscounts, topRated, officialShops, premium, moda, beleza } = deriveHomeSections(productsDatabase);
            const blocks = [
                { title: 'Seleção premium pra ela', href: '/mais-vendidos', items: premium, section: 'premium_picks' },
                { title: 'Achadinhos moda', href: '/categoria/moda', items: moda, section: 'moda_picks' },
                { title: 'Beleza & skincare', href: '/categoria/beleza', items: beleza, section: 'beleza_picks' },
                { title: 'Mais Vendidos', href: '/mais-vendidos', items: topSellers, section: 'top_sellers' },
                { title: 'Maiores Descontos', href: '/maiores-descontos', items: bigDiscounts, section: 'big_discounts' },
                { title: 'Melhor Avaliados', href: '/melhor-avaliados', items: topRated, section: 'top_rated' },
                { title: 'Lojas Oficiais', href: '/lojas-oficiais', items: officialShops, section: 'official_shops' },
            ].filter(b => b.items.length > 0);
            if (!blocks.length) {
                box.innerHTML = '';
                return;
            }
            // Só o primeiro bloco entra como eager: no 4G, dezenas de imagens em
            // fetchpriority=high disputam banda e atrasam justo as que estão na tela.
            box.innerHTML = blocks.map((b, blockIndex) => `
                <section class="bg-white rounded-xl shadow-sm border border-slate-200/60 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-base md:text-lg font-black text-slate-800">${escapeHtml(b.title)}</h3>
                        <a href="${b.href}" class="text-xs font-bold text-shopee-orange hover:underline" onclick="event.preventDefault(); navigateTo('${b.href}')">Ver todos →</a>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                        ${b.items.slice(0, 6).map((p, i) => productCardHTML(p, {
                            index: blockIndex === 0 ? i : 99,
                            section: b.section,
                        })).join('')}
                    </div>
                </section>
            `).join('');
        }

        // Render Products in the Public Storefront Grid
        function renderStoreProducts() {
            const grid = document.getElementById('store-products-grid');
            const flashContainer = document.getElementById('flash-products-container');
            const flashSection = document.getElementById('flash-sale-section');
            const searchVal = (document.getElementById('store-search-input')?.value || '').toLowerCase().trim();
            if (!grid || !flashContainer) return;

            const onHome = (pathClean() === '/' || pathClean() === '') && currentStoreCategory === 'todos' && !currentStoreSubcategory && !searchVal;

            let filtered = productsDatabase.filter(p => {
                const matchesCategory = currentStoreCategory === 'todos' || p.category === currentStoreCategory;
                if (!matchesCategory) return false;
                if (searchVal) {
                    const title = (p.title || '').toLowerCase();
                    const desc = (p.desc || '').toLowerCase();
                    if (!title.includes(searchVal) && !desc.includes(searchVal)) return false;
                }
                return productMatchesSubcategory(p, currentStoreCategory, currentStoreSubcategory);
            });
            if (onHome) {
                filtered = sortByMoney(femaleOnly(filtered));
            } else {
                filtered = sortProductsLocal(filtered);
                if (currentStoreCategory === 'todos' && !searchVal) {
                    filtered = prioritizeFemaleProducts(filtered);
                }
            }
            const totalFiltered = filtered.length;
            filtered = filtered.slice(0, (currentPage + 1) * PAGE_SIZE);

            const now = Math.floor(Date.now() / 1000);
            let flashSales = (onHome ? femaleOnly(productsDatabase) : filtered)
                .filter(p => {
                    if (!p.isFlashSale || !p.periodEnd || p.periodEnd <= now) return false;
                    if (p.periodEnd - now > 24 * 3600) return false;
                    const d = displayDiscount(p);
                    return d >= 20 && d <= 80;
                })
                .sort((a, b) => (a.periodEnd || 0) - (b.periodEnd || 0));

            flashEndsAt = flashSales.length ? flashSales[0].periodEnd : null;
            if (flashSection) flashSection.classList.toggle('hidden', flashSales.length === 0);

            if (flashSales.length === 0) {
                flashContainer.innerHTML = `
                    <div class="py-4 text-center text-slate-400 text-xs w-full">
                        Nenhuma oferta com prazo de término próximo nesta categoria.
                    </div>`;
            } else {
                flashContainer.className = 'p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3';
                flashContainer.innerHTML = flashSales.slice(0, 10).map((p, index) => productCardHTML(p, { index, section: 'flash_deals' })).join('');
            }

            if (window.__filterOfficialOnly) {
                filtered = filtered.filter(p => isOfficialShop(p.shopType));
            }

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                        <i class="far fa-folder-open text-3xl"></i>
                        <p class="font-bold text-sm">Nenhum produto correspondente encontrado.</p>
                        <p class="text-xs">Tente mudar sua busca ou categoria!</p>
                    </div>`;
            } else {
                grid.innerHTML = filtered.map((p, index) => productCardHTML(p, { index, section: currentNavSection || 'destaque' })).join('');
            }

            const info = document.getElementById('store-results-info');
            const catObj = categories.find(c => c.id === currentStoreCategory) || {};
            const catLabel = catObj.label || 'Tudo';
            const subObj = (catObj.subcategories || []).find(s => (s.id || s.key) === currentStoreSubcategory);
            const scopeLabel = subObj ? `${catLabel} › ${subObj.label}` : catLabel;
            if (info) {
                info.textContent = filtered.length
                    ? `${filtered.length}${totalFiltered > filtered.length ? ` de ${totalFiltered}` : ''} ofertas · ${scopeLabel}`
                    : 'Nenhuma oferta nesta seleção';
            }
            renderLoadMoreBtn();
        }

        function escapeHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function escapeAttr(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/</g, '&lt;');
        }

        // Quick search set
        function applyStoreSearch(term) {
            document.getElementById('store-search-input').value = term;
            searchStoreProducts();
            scrollToStoreGrid();
        }

        const POPULAR_TERM_CANDIDATES = [
            'Vestido', 'Skincare', 'Bolsa', 'Sandália', 'Conjunto', 'Lingerie',
            'Perfume', 'Maquiagem', 'Legging', 'Cropped', 'Plus size', 'Batom',
            'Scrunchie', 'Pijama', 'Smartwatch'
        ];

        function renderPopularTerms() {
            const container = document.getElementById('popular-terms');
            if (!container) return;
            const scored = POPULAR_TERM_CANDIDATES
                .map(term => {
                    const t = term.toLowerCase();
                    const count = femaleOnly(productsDatabase).filter(p =>
                        (p.title || '').toLowerCase().includes(t)
                    ).length;
                    return { term, count };
                })
                .filter(x => x.count > 0)
                .sort((a, b) => b.count - a.count);

            const items = (scored.length ? scored : [
                { term: 'Vestido' },
                { term: 'Skincare' },
                { term: 'Bolsa' }
            ]).slice(0, 4);

            container.innerHTML = '';
            items.forEach(({ term }) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = term;
                btn.className = 'bg-white/15 hover:bg-white hover:text-shopee-orange active:scale-95 text-white rounded-full px-3 py-1 text-[11px] font-semibold transition min-h-[28px] cursor-pointer border border-white/20';
                btn.addEventListener('click', () => applyStoreSearch(term));
                container.appendChild(btn);
            });
        }

        let searchDebounce = null;
        async function searchStoreProducts() {
            const term = (document.getElementById('store-search-input')?.value || "").trim();
            document.getElementById('store-search-clear')?.classList.toggle('hidden', !term);
            // Filtra o que já está carregado imediatamente (sem custo)
            renderStoreProducts();
            if (!apiLive || term.length < 2) return;
            // Busca no cache do Supabase (não grava nada) com debounce
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                loadOffersFromSupabase({ silent: true, reset: true, keyword: term });
            }, 400);
        }

        function scrollToStoreGrid() {
            document.getElementById('store-grid-section').scrollIntoView({ behavior: 'smooth' });
        }

        let modalImageToken = 0;

        // A miniatura já veio no card, então aparece na hora; a versão grande
        // entra por cima só quando termina de baixar, sem tela cinza no meio.
        function setModalImage(url) {
            const el = document.getElementById('modal-img');
            if (!el) return;
            const token = ++modalImageToken;
            el.src = thumbUrl(url);

            const big = new Image();
            big.decoding = 'async';
            big.onload = () => { if (token === modalImageToken) el.src = big.src; };
            big.onerror = () => {
                if (token !== modalImageToken || big.src === url) return;
                big.onerror = null;
                big.src = url;
            };
            big.src = displayUrl(url);
        }

        // Abre o popup com as informações do produto para o cliente
        function openProductModal(id, section = null) {
            const p = productsDatabase.find(prod => prod.id === id);
            if (!p) return;
            activeProductForBuy = p;
            if (section) currentNavSection = section;

            const catLabel = (categories.find(c => c.id === p.category) || {}).label || p.category || 'Oferta';
            const disc = displayDiscount(p);
            const rating = formatRating(p.stars);
            const sold = formatSold(p.salesRaw != null ? p.salesRaw : p.sales);
            const shop = cleanShopName(p.shopName);

            setModalImage(p.image || '');
            document.getElementById('modal-discount').innerText = disc ? `-${disc}% OFF` : 'OFERTA';
            document.getElementById('modal-category').innerText = catLabel;
            document.getElementById('modal-title').innerText = p.title || 'Produto';
            document.getElementById('modal-sales').innerText = [rating ? `★ ${rating}` : '', sold].filter(Boolean).join(' · ');
            document.getElementById('modal-old-price').innerText = (p.oldPrice && p.oldPrice > p.newPrice)
                ? `De: R$ ${Number(p.oldPrice).toFixed(2).replace('.', ',')}` : '';
            document.getElementById('modal-new-price').innerText = `R$ ${Number(p.newPrice).toFixed(2).replace('.', ',')}`;

            const optionsBox = document.getElementById('modal-options');
            const optionsHint = document.getElementById('modal-options-hint');
            const optionLabels = formatProductOptions(p);
            if (optionsBox) {
                if (optionLabels.length || (p.options && p.options.hasVariants)) {
                    optionsBox.innerHTML = renderOptionBadges(p, false);
                    optionsBox.classList.remove('hidden');
                } else {
                    optionsBox.innerHTML = '';
                    optionsBox.classList.add('hidden');
                }
            }
            if (optionsHint) {
                // Dica de variação vai na lista de benefícios — evita texto corrido duplicado
                optionsHint.textContent = '';
                optionsHint.classList.add('hidden');
            }

            const starsBox = document.getElementById('modal-stars');
            starsBox.innerHTML = rating
                ? `<span class="text-amber-500 mr-1">★</span><span class="text-slate-700 font-bold">${rating}</span>`
                : '';

            const shopWrap = document.getElementById('modal-shop');
            if (shop) {
                document.getElementById('modal-shop-name').innerText = shop;
                shopWrap.classList.remove('hidden');
                shopWrap.classList.add('flex');
            } else {
                shopWrap.classList.add('hidden');
                shopWrap.classList.remove('flex');
            }

            const benefitsEl = document.getElementById('modal-benefits');
            if (benefitsEl) {
                const items = [];
                if (disc) {
                    items.push(`Oferta com <strong>${disc}% de desconto</strong> aplicado.`);
                }
                if (sold) {
                    items.push(`Já foram <strong>${escapeHtml(String(sold))}</strong> nesta seleção.`);
                }
                const hasVariants = optionLabels.length || (p.options && p.options.hasVariants)
                    || (p.oldPrice && p.newPrice && p.oldPrice > p.newPrice * 1.02);
                if (hasVariants) {
                    items.push('Variações (cores/tamanhos) disponíveis na página do produto.');
                }
                if (shop) {
                    items.push(`Vendido e entregue por <strong>${escapeHtml(shop)}</strong>.`);
                }
                items.push('Frete e prazo finais são confirmados na Shopee.');
                benefitsEl.innerHTML = items.map((t) => `
                    <li class="flex items-start gap-2">
                        <i class="fas fa-check text-emerald-500 mt-0.5 shrink-0"></i>
                        <span>${t}</span>
                    </li>`).join('');
            }

            const deadlineEl = document.getElementById('modal-deadline');
            const now = Math.floor(Date.now() / 1000);
            if (deadlineEl) {
                // periodEnd da Shopee às vezes vem com anos à frente → esconde se > 7 dias
                const MAX_URGENCY_H = 168;
                if (p.periodEnd && p.periodEnd > now) {
                    const left = p.periodEnd - now;
                    const h = Math.floor(left / 3600);
                    const m = Math.floor((left % 3600) / 60);
                    if (h > MAX_URGENCY_H) {
                        deadlineEl.textContent = '';
                        deadlineEl.classList.add('hidden');
                    } else {
                        deadlineEl.innerHTML = `<i class="fas fa-clock animate-pulse"></i> Termina em ${h}h ${m}min — aproveite enquanto a oferta estiver válida.`;
                        deadlineEl.classList.remove('hidden');
                    }
                } else {
                    deadlineEl.textContent = '';
                    deadlineEl.classList.add('hidden');
                }
            }

            const buyBtn = document.getElementById('modal-buy-btn');
            const buyLabel = document.getElementById('modal-buy-label');
            if (buyLabel) buyLabel.textContent = 'Comprar na Shopee';
            buyBtn.href = p.shortLink || p.affiliateLink || '#';
            buyBtn.dataset.itemId = String(p.id);
            buyBtn.dataset.category = String(p.category || 'todos');
            buyBtn.dataset.origin = p.affiliateLink || p.productLink || '';
            buyBtn.dataset.section = section || currentNavSection || 'modal_direct';

            const modal = document.getElementById('product-modal');
            const card = document.getElementById('modal-card');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            requestAnimationFrame(() => {
                modal.classList.remove('opacity-0');
                card.classList.remove('scale-95');
            });
            // Prefetch shortlink com Sub IDs do canal — CTA pronto no clique
            if (!hasMatchingTrackedLink(p)) {
                resolveAffiliateUrl(p).then((url) => {
                    if (url && url !== '#' && activeProductForBuy && String(activeProductForBuy.id) === String(p.id)) {
                        buyBtn.href = url;
                    }
                }).catch(() => {});
            }
        }

        // Alfanumérico puro — Shopee rejeita "_" e "-" ao gerar shortlink.
        const SITE_SUBID = 'afiliadamestre';
        const TRACKING_STORAGE_KEY = 'afiliada_mestre_traffic_v1';
        const TRACKED_LINKS_KEY = 'afiliada_mestre_tracked_links';

        // Sub IDs Shopee só aceitam alfanumérico — "_" e "-" quebram como "invalid sub id".
        function sanitizeSubId(value, fallback) {
            const clean = String(value || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .slice(0, 40);
            return clean || fallback;
        }

        function normalizeChannel(raw) {
            const v = sanitizeSubId(raw, 'organico');
            const aliases = {
                fb: 'facebook',
                face: 'facebook',
                ig: 'instagram',
                insta: 'instagram',
                wa: 'whatsapp',
                wpp: 'whatsapp',
                zap: 'whatsapp',
                tt: 'tiktok',
                googleads: 'google',
                ads: 'google',
                direct: 'organico',
                organic: 'organico',
                none: 'organico',
                site: 'organico',
            };
            return aliases[v] || v;
        }

        function readStoredAttribution() {
            try {
                return JSON.parse(sessionStorage.getItem(TRACKING_STORAGE_KEY) || 'null')
                    || JSON.parse(localStorage.getItem(TRACKING_STORAGE_KEY) || 'null')
                    || null;
            } catch (_) {
                return null;
            }
        }

        function persistAttribution(attr) {
            try {
                sessionStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(attr));
                localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(attr));
            } catch (_) {}
        }

        // Captura origem da visita (Facebook Ads, Instagram, WhatsApp, etc.)
        // e guarda até o clique em Comprar — assim o Sub ID identifica a campanha.
        function captureTrafficAttribution() {
            const params = new URLSearchParams(location.search);
            const channelRaw = params.get('utm_source')
                || params.get('src')
                || params.get('canal')
                || params.get('source')
                || params.get('ref')
                || '';
            const campaignRaw = params.get('utm_campaign')
                || params.get('campanha')
                || params.get('campaign')
                || '';
            const mediumRaw = params.get('utm_medium') || params.get('medium') || '';

            if (channelRaw || campaignRaw) {
                const attr = {
                    channel: normalizeChannel(channelRaw || 'organico'),
                    campaign: sanitizeSubId(campaignRaw || 'vitrine', 'vitrine'),
                    medium: sanitizeSubId(mediumRaw, ''),
                    capturedAt: Date.now(),
                };
                persistAttribution(attr);
                return attr;
            }

            const existing = readStoredAttribution();
            if (existing?.channel) return existing;

            const fallback = {
                channel: 'organico',
                campaign: 'vitrine',
                medium: '',
                capturedAt: Date.now(),
            };
            persistAttribution(fallback);
            return fallback;
        }

        function getSubIdSettings() {
            const attr = readStoredAttribution() || captureTrafficAttribution();
            return {
                source: SITE_SUBID,
                channel: normalizeChannel(attr.channel || 'organico'),
                campaign: sanitizeSubId(attr.campaign || 'vitrine', 'vitrine'),
                medium: sanitizeSubId(attr.medium || '', ''),
            };
        }

        function getTrackingSubIds(category, itemId = '', product = null, section = null) {
            const s = getSubIdSettings();
            const catSlot = product?.subcategory
                ? sanitizeSubId(`${category || product.category}_${product.subcategory}`, sanitizeSubId(category || product.category, 'geral'))
                : sanitizeSubId(category || product?.category, 'geral');
            const base = Array.isArray(product?.subIds) && product.subIds.length
                ? product.subIds
                : [
                    SITE_SUBID,
                    'organico',
                    'vitrine',
                    catSlot,
                    sanitizeSubId(itemId ? `p${itemId}` : 'produto', 'produto'),
                ];
            const channelSlot = s.medium && s.medium !== s.channel
                ? sanitizeSubId(`${s.channel}_${s.medium}`, s.channel)
                : s.channel;
            const SECTION_CODES = {
                home: 'vitrine', home_hero: 'hh', flash_deals: 'fl', top_sellers: 'ts',
                big_discounts: 'bd', top_rated: 'tr', official_shops: 'of', category_page: 'ct',
                search_result: 'sr', modal_direct: 'md', destaque: 'vd', oficial: 'oficial',
            };
            const sec = section || currentNavSection || null;
            const sectionCode = sec && SECTION_CODES[sec] ? SECTION_CODES[sec] : (sec ? sanitizeSubId(sec, null) : null);
            const campaignDefault = !s.campaign || s.campaign === 'vitrine';
            const campaignSlot = campaignDefault && sectionCode ? sectionCode : s.campaign;
            return [
                SITE_SUBID,
                channelSlot,
                campaignSlot,
                sanitizeSubId(base[3] || catSlot, 'geral'),
                sanitizeSubId(base[4] || (itemId ? `p${itemId}` : 'produto'), 'produto'),
            ].slice(0, 5);
        }

        function productSubIdsLabel(p) {
            if (Array.isArray(p?.subIds) && p.subIds.length) return p.subIds.join(' | ');
            return [
                SITE_SUBID,
                'organico',
                'vitrine',
                sanitizeSubId(p?.category, 'geral'),
                sanitizeSubId(p?.id ? `p${p.id}` : 'produto', 'produto'),
            ].join(' | ');
        }

        function parseUtmContent(utm) {
            const parts = String(utm || '')
                .split(/[|,;/]+/)
                .map(s => s.trim())
                .filter(Boolean);
            return {
                site: parts[0] || '',
                channel: parts[1] || '',
                campaign: parts[2] || '',
                category: parts[3] || '',
                product: parts[4] || '',
                raw: parts,
            };
        }

        function getSubIdSignature(category, itemId, product = null) {
            return getTrackingSubIds(category, itemId, product).join('|');
        }

        function hasMatchingTrackedLink(p) {
            if (!p?.shortLink) return false;
            try {
                const map = JSON.parse(sessionStorage.getItem(TRACKED_LINKS_KEY) || '{}');
                return map[String(p.id)] === getSubIdSignature(p.category, p.id, p);
            } catch (_) {
                return false;
            }
        }

        function rememberTrackedLink(p) {
            try {
                const map = JSON.parse(sessionStorage.getItem(TRACKED_LINKS_KEY) || '{}');
                map[String(p.id)] = getSubIdSignature(p.category, p.id, p);
                sessionStorage.setItem(TRACKED_LINKS_KEY, JSON.stringify(map));
            } catch (_) {}
        }

        function buildCampaignShareUrl(channel, campaign, productId = '') {
            // Links com produto vão para /p/:id (SSR popup rápido).
            // Links sem produto continuam na home com UTMs preservados.
            const basePath = productId ? `/p/${encodeURIComponent(String(productId))}` : '/';
            const url = new URL(location.origin + basePath);
            url.searchParams.set('utm_source', sanitizeSubId(channel, 'organico'));
            url.searchParams.set('utm_campaign', sanitizeSubId(campaign, 'vitrine'));
            url.searchParams.set('utm_medium', 'social');
            return url.toString();
        }

        let campaignSelectedProducts = [];

        function getCampaignSelectedProducts() {
            return campaignSelectedProducts;
        }

        function addProductToCampaign(productOrId, { silent = false } = {}) {
            const p = typeof productOrId === 'object'
                ? productOrId
                : productsDatabase.find(x => String(x.id) === String(productOrId));
            const id = p ? p.id : Number(productOrId);
            if (!id) {
                if (!silent) showToast('Informe um ID de produto válido', 'error');
                return false;
            }
            if (campaignSelectedProducts.some(x => String(x.id) === String(id))) {
                if (!silent) showToast('Produto já está na campanha', 'error');
                return false;
            }
            campaignSelectedProducts.push({
                id,
                title: p?.title || `Produto ${id}`,
                category: p?.category || 'geral',
                image: p?.image || '',
            });
            if (!silent) {
                renderCampaignSelectedProducts();
                updateCampaignLinkPreview();
            }
            return true;
        }

        function removeProductFromCampaign(id) {
            campaignSelectedProducts = campaignSelectedProducts.filter(x => String(x.id) !== String(id));
            renderCampaignSelectedProducts();
            updateCampaignLinkPreview();
        }

        function addCampaignProductById() {
            const raw = prompt('Cole o ID do produto Shopee (número do item):');
            if (!raw) return;
            const id = String(raw).replace(/\D/g, '');
            if (!id) {
                showToast('ID inválido', 'error');
                return;
            }
            addProductToCampaign(id);
        }

        function renderCampaignProductPicker() {
            const box = document.getElementById('campaign-product-picker');
            const q = (document.getElementById('campaign-product-search')?.value || '').trim().toLowerCase();
            if (!box) return;
            if (!q || q.length < 2) {
                box.innerHTML = '';
                return;
            }
            const hits = productsDatabase
                .filter(p =>
                    String(p.id).includes(q)
                    || String(p.title || '').toLowerCase().includes(q)
                )
                .slice(0, 8);
            if (!hits.length) {
                box.innerHTML = `<p class="text-[10px] text-slate-400 px-1">Nenhum produto carregado com esse termo. Use "+ ID".</p>`;
                return;
            }
            box.innerHTML = hits.map(p => `
                <button type="button" onclick="addProductToCampaign('${String(p.id).replace(/'/g, '')}')"
                    class="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-orange-50 text-left border border-transparent hover:border-orange-100">
                    <img src="${escapeAttr(thumbUrl(p.image) || p.image || '')}" class="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" alt=""
                        onerror="this.style.display='none'">
                    <span class="min-w-0 flex-1">
                        <span class="block text-[11px] font-semibold text-slate-700 truncate">${escapeHtml(p.title)}</span>
                        <span class="block text-[9px] text-slate-400 font-mono">ID ${escapeHtml(String(p.id))}</span>
                    </span>
                    <i class="fas fa-plus text-shopee-orange text-[10px]"></i>
                </button>
            `).join('');
        }

        function renderCampaignSelectedProducts() {
            const box = document.getElementById('campaign-selected-products');
            if (!box) return;
            if (!campaignSelectedProducts.length) {
                box.innerHTML = `<p class="text-[10px] text-slate-400">Nenhum produto selecionado (campanha geral).</p>`;
                return;
            }
            box.innerHTML = campaignSelectedProducts.map(p => `
                <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                    <img src="${escapeAttr(thumbUrl(p.image) || p.image || '')}" class="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" alt=""
                        onerror="this.style.display='none'">
                    <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-semibold text-slate-700 truncate">${escapeHtml(p.title)}</p>
                        <p class="text-[9px] font-mono text-slate-400">p${escapeHtml(String(p.id))}</p>
                    </div>
                    <button type="button" onclick="removeProductFromCampaign('${String(p.id).replace(/'/g, '')}')"
                        class="text-red-400 hover:text-red-600 px-2" title="Remover"><i class="fas fa-times"></i></button>
                </div>
            `).join('');
        }

        function updateCampaignLinkPreview() {
            const channel = document.getElementById('campaign-link-channel')?.value || 'facebook';
            const campaign = document.getElementById('campaign-link-name')?.value || 'promo_vitrine';
            const el = document.getElementById('campaign-link-preview');
            const selected = getCampaignSelectedProducts();
            if (!el) return;

            if (!selected.length) {
                const url = buildCampaignShareUrl(channel, campaign);
                el.innerHTML = `
                    <div class="space-y-1">
                        <p class="text-[9px] font-bold text-slate-500">Vitrine geral</p>
                        <p class="font-mono text-[10px] text-slate-700 break-all select-all" data-campaign-url="${escapeAttr(url)}">${escapeHtml(url)}</p>
                    </div>`;
                updateSubIdPreview(channel, campaign, null);
                return;
            }

            el.innerHTML = selected.map(p => {
                const url = buildCampaignShareUrl(channel, campaign, p.id);
                return `
                <div class="border border-slate-200 rounded-lg p-2 bg-white space-y-1">
                    <p class="text-[10px] font-bold text-slate-700 truncate">${escapeHtml(p.title)}</p>
                    <p class="font-mono text-[9px] text-slate-600 break-all select-all" data-campaign-url="${escapeAttr(url)}">${escapeHtml(url)}</p>
                    <button type="button" onclick="navigator.clipboard.writeText(this.previousElementSibling.dataset.campaignUrl||this.previousElementSibling.textContent).then(()=>showToast('Link copiado!','success'))"
                        class="text-[10px] font-bold text-shopee-orange">Copiar este link</button>
                </div>`;
            }).join('');
            updateSubIdPreview(channel, campaign, selected[0]);
        }

        function copyCampaignLink() {
            const nodes = document.querySelectorAll('#campaign-link-preview [data-campaign-url]');
            const urls = [...nodes].map(n => n.getAttribute('data-campaign-url') || n.textContent.trim()).filter(Boolean);
            if (!urls.length) return;
            navigator.clipboard?.writeText(urls.join('\n')).then(() => {
                showToast(urls.length > 1 ? `${urls.length} links copiados!` : 'Link de campanha copiado!', 'success');
            }).catch(() => {
                showToast('Copie o link manualmente', 'error');
            });
        }

        function updateSubIdPreview(channel, campaign, product) {
            const preview = document.getElementById('subid-preview');
            if (!preview) return;
            const ch = sanitizeSubId(channel || document.getElementById('campaign-link-channel')?.value || 'facebook', 'facebook');
            const camp = sanitizeSubId(campaign || document.getElementById('campaign-link-name')?.value || 'promo_vitrine', 'vitrine');
            const cat = product?.category || 'moda';
            const pid = product?.id ? `p${product.id}` : 'p123456';
            const ids = [SITE_SUBID, `${ch}_social`, camp, sanitizeSubId(cat, 'geral'), sanitizeSubId(pid, 'produto')];
            preview.textContent = `No clique Comprar (exemplo): ${ids.join(' | ')}`;
        }

        function loadSubIdSettings() {
            localStorage.removeItem('afiliada_mestre_subids');
            captureTrafficAttribution();
            renderCampaignSelectedProducts();
            updateCampaignLinkPreview();
        }

        const SAVED_CAMPAIGNS_KEY = 'afiliada_mestre_campanhas_v1';
        const deletedCampaignIds = new Set();

        function readSavedCampaigns() {
            try {
                const list = JSON.parse(localStorage.getItem(SAVED_CAMPAIGNS_KEY) || '[]');
                return Array.isArray(list) ? list : [];
            } catch (_) {
                return [];
            }
        }

        function writeSavedCampaigns(list) {
            try {
                localStorage.setItem(SAVED_CAMPAIGNS_KEY, JSON.stringify(list.slice(0, 50)));
            } catch (_) {
                showToast('Não foi possível salvar (armazenamento cheio)', 'error');
            }
        }

        async function saveCurrentCampaign() {
            const channel = document.getElementById('campaign-link-channel')?.value || 'facebook';
            const campaign = sanitizeSubId(
                document.getElementById('campaign-link-name')?.value || 'promo_vitrine',
                'vitrine'
            );
            const products = getCampaignSelectedProducts().map(p => ({
                id: p.id,
                title: p.title,
                category: p.category,
                image: p.image,
            }));
            const links = products.length
                ? products.map(p => ({
                    productId: p.id,
                    title: p.title,
                    url: buildCampaignShareUrl(channel, campaign, p.id),
                }))
                : [{ productId: null, title: 'Vitrine geral', url: buildCampaignShareUrl(channel, campaign) }];

            const entry = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                channel,
                campaign,
                products,
                links,
                createdAt: new Date().toISOString(),
                exampleSubIds: [
                    SITE_SUBID,
                    `${sanitizeSubId(channel, 'facebook')}_social`,
                    campaign,
                    sanitizeSubId(products[0]?.category || 'geral', 'geral'),
                    products[0]?.id ? `p${products[0].id}` : 'pID',
                ],
            };

            const list = readSavedCampaigns().filter(c => c.id !== entry.id);
            list.unshift(entry);
            writeSavedCampaigns(list);
            renderSavedCampaignsList(list);

            try {
                const res = await adminFetch(`${API_BASE}/api/campanhas-rastreio`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entry),
                });
                const data = await res.json().catch(() => ({}));
                if (res.status === 401 || res.status === 403) {
                    throw new Error('token de admin inválido — clique em "Entrar" no painel');
                }
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                showToast('Campanha salva no banco (Supabase)!', 'success');
            } catch (err) {
                showToast(`Salva só neste navegador — ${err.message}`, 'error');
            }
            renderSavedCampaigns();
        }

        async function deleteSavedCampaign(id) {
            if (!confirm('Apagar esta campanha salva?')) return;
            const kept = readSavedCampaigns().filter(c => c.id !== id);
            writeSavedCampaigns(kept);
            deletedCampaignIds.add(String(id));
            renderSavedCampaignsList(kept);
            try {
                const res = await adminFetch(`${API_BASE}/api/campanhas-rastreio/${encodeURIComponent(id)}`, { method: 'DELETE' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                showToast('Campanha removida do banco', 'success');
            } catch (err) {
                showToast(`Removida só localmente — ${err.message}`, 'error');
            }
        }

        function loadSavedCampaignIntoEditor(id) {
            const entry = readSavedCampaigns().find(c => c.id === id);
            if (!entry) return;
            const ch = document.getElementById('campaign-link-channel');
            const name = document.getElementById('campaign-link-name');
            if (ch) ch.value = entry.channel || 'facebook';
            if (name) name.value = entry.campaign || 'promo_vitrine';
            campaignSelectedProducts = Array.isArray(entry.products) ? [...entry.products] : [];
            switchAdminView('campanhas');
            renderCampaignSelectedProducts();
            updateCampaignLinkPreview();
            document.getElementById('campaign-link-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('Campanha carregada no editor', 'success');
        }

        function copySavedCampaignLinks(id) {
            const entry = readSavedCampaigns().find(c => c.id === id);
            if (!entry?.links?.length) return;
            const text = entry.links.map(l => l.url).join('\n');
            navigator.clipboard?.writeText(text).then(() => {
                showToast(entry.links.length > 1 ? `${entry.links.length} links copiados!` : 'Link copiado!', 'success');
            }).catch(() => showToast('Copie manualmente', 'error'));
        }

        async function renderSavedCampaigns() {
            const box = document.getElementById('saved-campaigns-list');
            if (!box) return;

            const local = readSavedCampaigns();
            renderSavedCampaignsList(local);

            let remote = null;
            try {
                const res = await fetch(`${API_BASE}/api/campanhas-rastreio`);
                const data = await res.json();
                if (res.ok && Array.isArray(data.campaigns)) remote = data.campaigns;
            } catch (_) {}
            if (!remote) return;

            // O banco é a fonte preferida, mas nunca apaga o que só existe local:
            // sem isso uma campanha recém-criada some assim que o POST falha.
            const byId = new Map();
            for (const c of local) {
                if (c?.id && !deletedCampaignIds.has(String(c.id))) byId.set(String(c.id), c);
            }
            for (const c of remote) {
                if (c?.id && !deletedCampaignIds.has(String(c.id))) byId.set(String(c.id), c);
            }
            const merged = [...byId.values()].sort(
                (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            );
            writeSavedCampaigns(merged);
            renderSavedCampaignsList(merged);
        }

        function renderSavedCampaignsList(list) {
            const box = document.getElementById('saved-campaigns-list');
            if (!box) return;

            if (!list.length) {
                box.innerHTML = `<p class="text-slate-400 text-center py-8">Nenhuma campanha salva ainda.<br><button onclick="switchAdminView('campanhas')" class="mt-3 text-shopee-orange font-bold">Criar campanha</button></p>`;
                return;
            }
            box.innerHTML = list.map(c => {
                const when = c.createdAt ? new Date(c.createdAt).toLocaleString('pt-BR') : '';
                const nProd = (c.products || []).length;
                return `
                <article class="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p class="font-bold text-slate-800">${escapeHtml(c.campaign)}</p>
                            <p class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(c.channel)} · ${nProd ? nProd + ' produto(s)' : 'vitrine geral'} · ${escapeHtml(when)}</p>
                        </div>
                        <span class="text-[9px] font-bold uppercase bg-orange-50 text-shopee-orange px-2 py-1 rounded">${escapeHtml(c.channel)}</span>
                    </div>
                    <p class="font-mono text-[9px] text-slate-500 break-all">${escapeHtml((c.exampleSubIds || []).join(' | '))}</p>
                    <div class="space-y-1 max-h-24 overflow-y-auto">
                        ${(c.links || []).map(l => `
                            <p class="font-mono text-[9px] text-slate-600 break-all bg-slate-50 rounded px-2 py-1">${escapeHtml(l.url)}</p>
                        `).join('')}
                    </div>
                    <div class="flex flex-wrap gap-2 pt-1">
                        <button type="button" onclick="copySavedCampaignLinks('${c.id}')" class="px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-bold">Copiar links</button>
                        <button type="button" onclick="openCampaignPerfByName('${escapeAttr(c.campaign)}')" class="px-2.5 py-1.5 rounded-lg bg-shopee-orange text-white text-[10px] font-bold">Desempenho</button>
                        <button type="button" onclick="loadSavedCampaignIntoEditor('${c.id}')" class="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600">Editar</button>
                        <button type="button" onclick="deleteSavedCampaign('${c.id}')" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red-500">Apagar</button>
                    </div>
                </article>`;
            }).join('');
        }

        async function ensureProductLoaded(itemId) {
            let p = productsDatabase.find(x => String(x.id) === String(itemId));
            if (p) return p;
            try {
                const res = await fetch(`${API_BASE}/api/ofertas/db?itemId=${encodeURIComponent(String(itemId))}`);
                const data = await res.json();
                if (res.ok && Array.isArray(data.products) && data.products.length) {
                    applyProducts(data.products, 'campaign', { append: true });
                    return productsDatabase.find(x => String(x.id) === String(itemId)) || data.products[0];
                }
            } catch (_) {}
            return null;
        }

        async function applyCampaignLanding() {
            const params = new URLSearchParams(location.search);
            const productId = params.get('produto') || params.get('product') || params.get('item');
            const multi = (params.get('produtos') || '')
                .split(/[,|]+/)
                .map(s => s.trim())
                .filter(Boolean);

            if (multi.length > 1 && !productId) {
                // Destaca só os produtos da campanha na grade
                const loaded = [];
                for (const id of multi.slice(0, 24)) {
                    const p = await ensureProductLoaded(id);
                    if (p) loaded.push(p);
                }
                if (loaded.length) {
                    applyProducts(loaded, 'campaign', { append: false, allowEmpty: false });
                    showToast(`${loaded.length} produtos desta campanha`, 'success');
                    scrollToStoreGrid();
                }
                return;
            }

            if (!productId) return;
            const p = await ensureProductLoaded(productId);
            if (!p) {
                showToast('Produto da campanha não encontrado na vitrine', 'error');
                return;
            }
            scrollToStoreGrid();
            requestAnimationFrame(() => openProductModal(p.id));
        }

        async function resetVitrineAndRefill() {
            if (!confirm('Isso apaga todos os produtos do Supabase e busca de novo (foco feminino). Continuar?')) return;
            showToast('Limpando e realimentando a vitrine…', 'success');
            try {
                const res = await adminFetch(`${API_BASE}/api/reset-vitrine`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 50, pages: 2, maxItems: 2000 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                sessionStorage.removeItem(TRACKED_LINKS_KEY);
                sessionStorage.removeItem(TRACKING_STORAGE_KEY);
                localStorage.removeItem(TRACKING_STORAGE_KEY);
                localStorage.removeItem('afiliado_mestre_db_v1');
                await loadOffersFromSupabase({ silent: true, reset: true });
                await loadCategoriesFromApi({ silent: true });
                loadAdminStats();
                loadAutoStatus();
                showToast(`Vitrine resetada: ${data.removed} removidos · ${data.refilled} novos itens`, 'success');
            } catch (err) {
                showToast(`Falha no reset: ${err.message}`, 'error');
            }
        }

        function commissionNumber(value) {
            if (typeof value === 'number') return value;
            const clean = String(value ?? '0').replace(/[^\d,.-]/g, '').replace(',', '.');
            return Number(clean) || 0;
        }

        function conversionDate(unix) {
            const n = Number(unix);
            if (!n) return 'Data não informada';
            return new Date(n * 1000).toLocaleString('pt-BR');
        }

        function conversionStatusLabel(status) {
            const labels = {
                COMPLETED: 'Concluído',
                PENDING: 'Pendente',
                CANCELLED: 'Cancelado',
                UNPAID: 'Não pago',
            };
            return labels[String(status || '').toUpperCase()] || status || '—';
        }

        function renderConversions() {
            const list = document.getElementById('conversion-list');
            if (!list) return;

            const orders = conversionRows.flatMap(c =>
                (Array.isArray(c.orders) ? c.orders : []).map(order => ({ conversion: c, order }))
            );
            const totalLoadedPages = Math.max(1, Math.ceil(orders.length / CONVERSION_PAGE_SIZE));
            conversionPage = Math.min(Math.max(conversionPage, 1), totalLoadedPages);
            const pageStart = (conversionPage - 1) * CONVERSION_PAGE_SIZE;
            const visibleOrders = orders.slice(pageStart, pageStart + CONVERSION_PAGE_SIZE);
            const subIds = new Set(
                conversionRows.map(c => String(c.utmContent || '').trim()).filter(Boolean)
            );
            const commission = conversionRows.reduce((sum, c) => sum + commissionNumber(c.totalCommission), 0);

            document.getElementById('conversion-total').textContent = String(conversionRows.length);
            document.getElementById('conversion-orders').textContent = String(orders.length);
            const commissionText = commission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            document.getElementById('conversion-commission').textContent = commissionText;
            document.getElementById('conversion-subids').textContent = String(subIds.size);
            const dashTotal = document.getElementById('dash-conversion-total');
            const dashComm = document.getElementById('dash-conversion-commission');
            if (dashTotal) dashTotal.textContent = String(conversionRows.length);
            if (dashComm) dashComm.textContent = commissionText;

            if (!orders.length) {
                document.getElementById('conversion-pagination')?.classList.add('hidden');
                list.innerHTML = `
                    <div class="py-8 text-center text-slate-400 text-xs space-y-2">
                        <i class="fas fa-chart-line text-2xl mb-2 block"></i>
                        <p class="font-bold text-slate-600">Nenhuma venda deste site ainda</p>
                        <p>O painel só mostra pedidos com Sub ID <strong>afiliada_mestre</strong>.</p>
                        <p>Vendas de Stories, Pin e outras campanhas da Shopee ficam de fora — isso é esperado.</p>
                        <p class="text-slate-500">Assim que alguém comprar pela vitrine, a conversão aparece aqui.</p>
                    </div>`;
                return;
            }

            list.innerHTML = visibleOrders.map(({ conversion, order }) => {
                const items = Array.isArray(order.items) ? order.items : [];
                const status = conversionStatusLabel(order.orderStatus);
                const statusClass = order.orderStatus === 'COMPLETED'
                    ? 'bg-emerald-50 text-emerald-700'
                    : order.orderStatus === 'CANCELLED'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-amber-50 text-amber-700';
                return `
                    <article class="border border-slate-200 rounded-xl p-3 text-xs">
                        <div class="flex flex-wrap justify-between gap-2 mb-3">
                            <div>
                                <p class="font-bold text-slate-800">Pedido ${escapeHtml(String(order.orderId || '—'))}</p>
                                <p class="text-[10px] text-slate-400">${escapeHtml(conversionDate(conversion.purchaseTime))}</p>
                            </div>
                            <span class="self-start px-2 py-1 rounded-md text-[9px] font-bold ${statusClass}">${escapeHtml(status)}</span>
                        </div>
                        <div class="bg-orange-50 border border-orange-100 rounded-lg p-2 mb-3">
                            <p class="text-[9px] uppercase font-black text-shopee-orange mb-1">Rastreio da venda</p>
                            ${(() => {
                                const parsed = parseUtmContent(conversion.utmContent);
                                if (!parsed.raw.length) {
                                    return `<p class="font-mono text-[10px] text-slate-500">Sem Sub ID informado</p>`;
                                }
                                return `
                                <div class="grid grid-cols-2 gap-1.5 text-[10px]">
                                    <div><span class="text-slate-400">Site</span><br><span class="font-bold text-slate-800">${escapeHtml(parsed.site || '—')}</span></div>
                                    <div><span class="text-slate-400">Canal</span><br><span class="font-bold text-slate-800">${escapeHtml(parsed.channel || '—')}</span></div>
                                    <div><span class="text-slate-400">Campanha</span><br><span class="font-bold text-slate-800">${escapeHtml(parsed.campaign || '—')}</span></div>
                                    <div><span class="text-slate-400">Categoria</span><br><span class="font-bold text-slate-800">${escapeHtml(parsed.category || '—')}</span></div>
                                    <div class="col-span-2"><span class="text-slate-400">Produto</span><br><span class="font-bold text-slate-800">${escapeHtml(parsed.product || '—')}</span></div>
                                </div>
                                <p class="font-mono text-[9px] text-slate-400 mt-2 break-all">${escapeHtml(String(conversion.utmContent))}</p>`;
                            })()}
                        </div>
                        <div class="space-y-2">
                            ${items.map(item => {
                                const category = categories.find(c => c.id === item.category);
                                const categoryLabel = category?.label || (item.category === 'todos' ? 'Categoria não identificada' : item.category);
                                const image = item.imageUrl
                                    ? escapeAttr(item.imageUrl)
                                    : 'https://placehold.co/96x96/ffebd7/ee4d2d?text=Shopee';
                                return `
                                <div class="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                                    <img src="${image}" alt="" class="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-100 shrink-0"
                                        onerror="this.onerror=null;this.src='https://placehold.co/96x96/ffebd7/ee4d2d?text=Shopee'">
                                    <div class="min-w-0 flex-1">
                                        <p class="font-semibold text-slate-700 line-clamp-2">${escapeHtml(String(item.itemName || `Item ${item.itemId || ''}`))}</p>
                                        <div class="flex flex-wrap items-center gap-1 mt-1">
                                            <span class="bg-orange-50 text-shopee-orange rounded px-1.5 py-0.5 text-[8px] font-bold uppercase">${escapeHtml(String(categoryLabel))}</span>
                                            <span class="text-[9px] text-slate-400">${escapeHtml(String(item.shopName || 'Loja Shopee'))} · Qtd. ${Number(item.qty) || 1}</span>
                                        </div>
                                    </div>
                                    <span class="font-bold text-emerald-600 whitespace-nowrap">
                                        ${commissionNumber(item.itemTotalCommission).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                </div>`;
                            }).join('') || '<p class="text-slate-400 text-[10px]">Itens não detalhados pela Shopee.</p>'}
                        </div>
                    </article>`;
            }).join('');

            const pagination = document.getElementById('conversion-pagination');
            const prev = document.getElementById('conversion-prev');
            const next = document.getElementById('conversion-next');
            pagination?.classList.toggle('hidden', orders.length <= CONVERSION_PAGE_SIZE && !conversionHasNextRemote);
            if (prev) prev.disabled = conversionPage <= 1;
            if (next) next.disabled = conversionPage >= totalLoadedPages && !conversionHasNextRemote;
            const pageInfo = document.getElementById('conversion-page-info');
            if (pageInfo) {
                pageInfo.textContent = `Página ${conversionPage} de ${totalLoadedPages}${conversionHasNextRemote ? '+' : ''}`;
            }
        }

        let campaignPerfRows = [];
        let campaignPerfSelected = '';
        let campaignPerfLoading = false;

        function formatMoneyBRL(value) {
            return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }

        function normalizeCampaignKey(name) {
            const raw = String(name || '').trim().toLowerCase();
            return raw || 'sem_campanha';
        }

        function campaignDisplayName(key) {
            if (!key || key === 'sem_campanha') return 'Sem campanha / orgânico';
            return key;
        }

        function buildCampaignPerformanceMap(rows) {
            const map = new Map();
            for (const conversion of rows || []) {
                const parsed = parseUtmContent(conversion.utmContent);
                const key = normalizeCampaignKey(parsed.campaign);
                if (!map.has(key)) {
                    map.set(key, {
                        key,
                        name: campaignDisplayName(key),
                        conversions: 0,
                        orders: 0,
                        itemsQty: 0,
                        commission: 0,
                        sellerCommission: 0,
                        shopeeCommission: 0,
                        channels: {},
                        statuses: {},
                        products: {},
                        devices: {},
                        buyerTypes: {},
                        conversionsList: [],
                        lastPurchase: 0,
                    });
                }
                const bucket = map.get(key);
                bucket.conversions += 1;
                bucket.commission += commissionNumber(conversion.totalCommission);
                bucket.sellerCommission += commissionNumber(conversion.sellerCommission);
                bucket.shopeeCommission += commissionNumber(conversion.shopeeCommissionCapped);
                bucket.conversionsList.push(conversion);
                const purchase = Number(conversion.purchaseTime) || 0;
                if (purchase > bucket.lastPurchase) bucket.lastPurchase = purchase;

                const channel = sanitizeSubId(parsed.channel, 'desconhecido');
                bucket.channels[channel] = (bucket.channels[channel] || 0) + 1;

                if (conversion.device) {
                    const d = String(conversion.device);
                    bucket.devices[d] = (bucket.devices[d] || 0) + 1;
                }
                if (conversion.buyerType) {
                    const b = String(conversion.buyerType);
                    bucket.buyerTypes[b] = (bucket.buyerTypes[b] || 0) + 1;
                }

                for (const order of (conversion.orders || [])) {
                    bucket.orders += 1;
                    const st = String(order.orderStatus || 'UNKNOWN');
                    bucket.statuses[st] = (bucket.statuses[st] || 0) + 1;
                    for (const item of (order.items || [])) {
                        const qty = Number(item.qty) || 1;
                        bucket.itemsQty += qty;
                        const pid = String(item.itemId || item.itemName || 'item');
                        if (!bucket.products[pid]) {
                            bucket.products[pid] = {
                                id: item.itemId,
                                name: item.itemName || `Item ${item.itemId || ''}`,
                                image: item.imageUrl || '',
                                shop: item.shopName || '',
                                qty: 0,
                                commission: 0,
                                price: Number(item.itemPrice) || 0,
                            };
                        }
                        bucket.products[pid].qty += qty;
                        bucket.products[pid].commission += commissionNumber(item.itemTotalCommission);
                    }
                }
            }
            return [...map.values()].sort((a, b) => b.commission - a.commission || b.orders - a.orders);
        }

        async function fetchConversionBatch({ days, status, scrollId = '' }) {
            const params = new URLSearchParams({ days: String(days), limit: '50', siteOnly: '1' });
            if (status) params.set('status', status);
            if (scrollId) params.set('scrollId', scrollId);
            const res = await fetch(`${API_BASE}/api/conversions?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Não foi possível consultar as conversões');
            return data;
        }

        async function loadCampaignPerformance({ reset = false } = {}) {
            const list = document.getElementById('camp-perf-list');
            if (!list || !isAdminMode() || campaignPerfLoading) return;
            campaignPerfLoading = true;
            if (reset) {
                campaignPerfRows = [];
                campaignPerfSelected = '';
                closeCampaignPerfDetail();
            }
            list.innerHTML = '<div class="py-8 text-center text-slate-400 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i>Consultando vendas na Shopee…</div>';
            try {
                const days = document.getElementById('camp-perf-days')?.value || '30';
                const status = document.getElementById('camp-perf-status')?.value || '';
                let scrollId = '';
                let hasNext = true;
                let pages = 0;
                const maxPages = 6; // até ~300 conversões do site
                const all = [];
                while (hasNext && pages < maxPages) {
                    const data = await fetchConversionBatch({ days, status, scrollId });
                    const received = Array.isArray(data.conversions) ? data.conversions : [];
                    all.push(...received);
                    scrollId = data.pageInfo?.scrollId || '';
                    hasNext = Boolean(data.pageInfo?.hasNextPage && scrollId && received.length);
                    pages += 1;
                    if (!received.length) break;
                }
                campaignPerfRows = all;
                renderCampaignPerformance();
                if (!all.length) {
                    showToast('Nenhuma venda deste site no período', 'success');
                } else if (hasNext) {
                    showToast(`Carregadas ${all.length} conversões (há mais na Shopee — refine o período)`, 'success');
                }
            } catch (err) {
                list.innerHTML = `
                    <div class="py-8 text-center text-red-500 text-xs">
                        <i class="fas fa-circle-exclamation mr-1"></i>${escapeHtml(err.message)}
                    </div>`;
            } finally {
                campaignPerfLoading = false;
            }
        }

        function renderCampaignPerformance() {
            const list = document.getElementById('camp-perf-list');
            if (!list) return;
            const campaigns = buildCampaignPerformanceMap(campaignPerfRows);
            const totalOrders = campaigns.reduce((s, c) => s + c.orders, 0);
            const totalItems = campaigns.reduce((s, c) => s + c.itemsQty, 0);
            const totalCommission = campaigns.reduce((s, c) => s + c.commission, 0);

            document.getElementById('camp-perf-count').textContent = String(campaigns.length);
            document.getElementById('camp-perf-conversions').textContent = String(campaignPerfRows.length);
            document.getElementById('camp-perf-orders').textContent = String(totalOrders);
            document.getElementById('camp-perf-items').textContent = String(totalItems);
            document.getElementById('camp-perf-commission').textContent = formatMoneyBRL(totalCommission);

            if (!campaigns.length) {
                list.innerHTML = `
                    <div class="py-10 text-center text-slate-400 text-xs space-y-2">
                        <i class="fas fa-chart-pie text-2xl block mb-2"></i>
                        <p class="font-bold text-slate-600">Nenhuma venda por campanha ainda</p>
                        <p>Quando alguém comprar por um link com Sub ID de campanha, o desempenho aparece aqui.</p>
                        <button onclick="switchAdminView('campanhas')" class="mt-2 text-shopee-orange font-bold">Criar campanha</button>
                    </div>`;
                return;
            }

            list.innerHTML = campaigns.map(c => {
                const topChannels = Object.entries(c.channels)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([ch, n]) => `${escapeHtml(ch)} (${n})`)
                    .join(' · ') || '—';
                const statusBits = Object.entries(c.statuses)
                    .map(([st, n]) => `${escapeHtml(conversionStatusLabel(st))}: ${n}`)
                    .join(' · ');
                const selected = campaignPerfSelected === c.key ? 'ring-2 ring-shopee-orange border-shopee-orange' : 'border-slate-200';
                return `
                <article onclick="openCampaignPerfDetail('${escapeAttr(c.key)}')"
                    class="admin-stat-card border ${selected} rounded-xl p-4 text-xs bg-white hover:bg-orange-50/40">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="font-black text-slate-800 text-sm truncate">${escapeHtml(c.name)}</p>
                            <p class="text-[10px] text-slate-400 mt-1">Canais: ${topChannels}</p>
                            <p class="text-[10px] text-slate-400">${escapeHtml(statusBits || 'Sem pedidos')}</p>
                            ${c.lastPurchase ? `<p class="text-[10px] text-slate-400 mt-1">Última venda: ${escapeHtml(conversionDate(c.lastPurchase))}</p>` : ''}
                        </div>
                        <div class="text-right shrink-0 space-y-1">
                            <p class="text-lg font-black text-emerald-600">${formatMoneyBRL(c.commission)}</p>
                            <p class="text-[10px] text-slate-500">${c.orders} pedido(s) · ${c.conversions} conv. · ${c.itemsQty} item(ns)</p>
                            <span class="inline-block text-[9px] font-bold uppercase text-shopee-orange">Ver detalhes →</span>
                        </div>
                    </div>
                </article>`;
            }).join('');
        }

        function openCampaignPerfByName(campaignName) {
            switchAdminView('campanha-desempenho');
            const key = normalizeCampaignKey(campaignName);
            // Aguarda o load e abre o detalhe
            const tryOpen = () => {
                if (campaignPerfLoading) {
                    setTimeout(tryOpen, 200);
                    return;
                }
                openCampaignPerfDetail(key);
            };
            setTimeout(tryOpen, 100);
        }

        function openCampaignPerfDetail(key) {
            const campaigns = buildCampaignPerformanceMap(campaignPerfRows);
            const c = campaigns.find(x => x.key === key);
            const detail = document.getElementById('camp-perf-detail');
            if (!c || !detail) {
                showToast('Campanha sem vendas no período carregado', 'error');
                return;
            }
            campaignPerfSelected = key;
            renderCampaignPerformance();

            document.getElementById('camp-perf-detail-title').textContent = c.name;
            document.getElementById('camp-perf-detail-meta').textContent =
                `${c.conversions} conversões · ${c.orders} pedidos · ${Object.keys(c.channels).length} canal(is)`;

            document.getElementById('camp-perf-detail-stats').innerHTML = `
                <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-[9px] uppercase font-bold text-slate-400">Comissão total</p>
                    <p class="text-lg font-black text-emerald-600">${formatMoneyBRL(c.commission)}</p>
                </div>
                <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-[9px] uppercase font-bold text-slate-400">Comissão loja</p>
                    <p class="text-sm font-black text-slate-800">${formatMoneyBRL(c.sellerCommission)}</p>
                </div>
                <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-[9px] uppercase font-bold text-slate-400">Comissão Shopee</p>
                    <p class="text-sm font-black text-slate-800">${formatMoneyBRL(c.shopeeCommission)}</p>
                </div>
                <div class="bg-slate-50 rounded-lg p-3">
                    <p class="text-[9px] uppercase font-bold text-slate-400">Itens / pedidos</p>
                    <p class="text-lg font-black text-shopee-orange">${c.itemsQty} / ${c.orders}</p>
                </div>`;

            const channelsEl = document.getElementById('camp-perf-detail-channels');
            const channelEntries = Object.entries(c.channels).sort((a, b) => b[1] - a[1]);
            channelsEl.innerHTML = channelEntries.length
                ? channelEntries.map(([ch, n]) => `
                    <div class="flex justify-between items-center border border-slate-100 rounded-lg px-3 py-2">
                        <span class="font-bold text-slate-700">${escapeHtml(ch)}</span>
                        <span class="text-slate-500">${n} venda(s)</span>
                    </div>`).join('')
                : '<p class="text-slate-400">Sem canais</p>';

            const productsEl = document.getElementById('camp-perf-detail-products');
            const products = Object.values(c.products).sort((a, b) => b.qty - a.qty || b.commission - a.commission).slice(0, 12);
            productsEl.innerHTML = products.length
                ? products.map(p => `
                    <div class="flex items-center gap-2 border border-slate-100 rounded-lg p-2">
                        <img src="${escapeAttr(p.image || 'https://placehold.co/64x64/ffebd7/ee4d2d?text=S')}" alt=""
                            class="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                            onerror="this.onerror=null;this.src='https://placehold.co/64x64/ffebd7/ee4d2d?text=S'">
                        <div class="min-w-0 flex-1">
                            <p class="font-semibold text-slate-700 line-clamp-1">${escapeHtml(p.name)}</p>
                            <p class="text-[10px] text-slate-400">${p.qty} un. · ${formatMoneyBRL(p.commission)}${p.shop ? ' · ' + escapeHtml(p.shop) : ''}</p>
                        </div>
                    </div>`).join('')
                : '<p class="text-slate-400">Sem produtos</p>';

            const ordersEl = document.getElementById('camp-perf-detail-orders');
            const orderRows = c.conversionsList.flatMap(conv =>
                (conv.orders || []).map(order => ({ conv, order }))
            );
            ordersEl.innerHTML = orderRows.length
                ? orderRows.map(({ conv, order }) => {
                    const parsed = parseUtmContent(conv.utmContent);
                    const status = conversionStatusLabel(order.orderStatus);
                    const statusClass = order.orderStatus === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : order.orderStatus === 'CANCELLED'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-amber-50 text-amber-700';
                    const items = (order.items || []).map(item =>
                        `<p class="text-[10px] text-slate-600">${escapeHtml(String(item.itemName || item.itemId))} · qtd ${item.qty || 1} · ${formatMoneyBRL(item.itemTotalCommission)}</p>`
                    ).join('');
                    return `
                    <article class="border border-slate-200 rounded-xl p-3 text-xs">
                        <div class="flex flex-wrap justify-between gap-2 mb-2">
                            <div>
                                <p class="font-bold text-slate-800">Pedido ${escapeHtml(String(order.orderId || '—'))}</p>
                                <p class="text-[10px] text-slate-400">${escapeHtml(conversionDate(conv.purchaseTime))} · canal ${escapeHtml(parsed.channel || '—')}</p>
                            </div>
                            <span class="self-start px-2 py-1 rounded-md text-[9px] font-bold ${statusClass}">${escapeHtml(status)}</span>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] mb-2 bg-slate-50 rounded-lg p-2">
                            <div><span class="text-slate-400">Device</span><br><strong>${escapeHtml(String(conv.device || '—'))}</strong></div>
                            <div><span class="text-slate-400">Buyer</span><br><strong>${escapeHtml(String(conv.buyerType || '—'))}</strong></div>
                            <div><span class="text-slate-400">Clique</span><br><strong>${escapeHtml(conversionDate(conv.clickTime))}</strong></div>
                            <div><span class="text-slate-400">Comissão</span><br><strong class="text-emerald-600">${formatMoneyBRL(conv.totalCommission)}</strong></div>
                        </div>
                        ${items}
                        <p class="font-mono text-[9px] text-slate-400 mt-2 break-all">${escapeHtml(String(conv.utmContent || ''))}</p>
                    </article>`;
                }).join('')
                : '<p class="text-slate-400 text-xs text-center py-4">Nenhum pedido</p>';

            detail.classList.remove('hidden');
            detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function closeCampaignPerfDetail() {
            campaignPerfSelected = '';
            document.getElementById('camp-perf-detail')?.classList.add('hidden');
            renderCampaignPerformance();
        }

        async function loadConversions({ reset = false, advance = false } = {}) {
            const list = document.getElementById('conversion-list');
            if (!list || !isAdminMode()) return;
            if (reset) {
                conversionScrollId = '';
                conversionRows = [];
                conversionPage = 1;
                conversionHasNextRemote = false;
            }
            list.innerHTML = '<div class="py-8 text-center text-slate-400 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i>Consultando a Shopee…</div>';
            try {
                const days = document.getElementById('conversion-days')?.value || '30';
                const status = document.getElementById('conversion-status')?.value || '';
                const params = new URLSearchParams({ days, limit: '20', siteOnly: '1' });
                if (status) params.set('status', status);
                if (conversionScrollId) params.set('scrollId', conversionScrollId);
                const res = await fetch(`${API_BASE}/api/conversions?${params}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Não foi possível consultar as conversões');
                const received = Array.isArray(data.conversions) ? data.conversions : [];
                conversionRows = reset ? received : conversionRows.concat(received);
                conversionScrollId = data.pageInfo?.scrollId || '';
                conversionHasNextRemote = Boolean(data.pageInfo?.hasNextPage && conversionScrollId);
                if (advance && received.length) conversionPage += 1;
                renderConversions();
                if (reset && data.ignoredFromOtherChannels > 0 && !received.length) {
                    showToast(`${data.ignoredFromOtherChannels} vendas de outras campanhas foram ocultadas (não são deste site)`, 'success');
                }
            } catch (err) {
                list.innerHTML = `
                    <div class="py-8 text-center text-red-500 text-xs">
                        <i class="fas fa-circle-exclamation mr-1"></i>${escapeHtml(err.message)}
                    </div>`;
            }
        }

        function previousConversionPage() {
            if (conversionPage <= 1) return;
            conversionPage -= 1;
            renderConversions();
            document.getElementById('conversion-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function nextConversionPage() {
            const orderCount = conversionRows.reduce(
                (total, conversion) => total + (Array.isArray(conversion.orders) ? conversion.orders.length : 0),
                0
            );
            const totalLoadedPages = Math.max(1, Math.ceil(orderCount / CONVERSION_PAGE_SIZE));
            if (conversionPage < totalLoadedPages) {
                conversionPage += 1;
                renderConversions();
                document.getElementById('conversion-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            if (conversionHasNextRemote && conversionScrollId) {
                loadConversions({ reset: false, advance: true });
            }
        }

        async function resolveAffiliateUrl(p) {
            if (!p) return '#';
            if (hasMatchingTrackedLink(p)) return p.shortLink;
            const origin = p.affiliateLink || p.productLink;
            if (!origin || origin === '#') return p.shortLink || '#';
            // Usa shortlink do DB imediatamente se existir; regenera em paralelo
            const fallback = p.shortLink || origin;
            try {
                const section = document.getElementById('modal-buy-btn')?.dataset?.section || currentNavSection || 'modal_direct';
                const res = await fetch(`${API_BASE}/api/shortlink`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        originUrl: origin,
                        itemId: p.id,
                        subIds: getTrackingSubIds(p.category, p.id, p, section),
                    }),
                });
                const data = await res.json();
                if (res.ok && data.shortLink) {
                    p.shortLink = data.shortLink;
                    rememberTrackedLink(p);
                    const idx = productsDatabase.findIndex((x) => String(x.id) === String(p.id));
                    if (idx >= 0) productsDatabase[idx].shortLink = data.shortLink;
                    return data.shortLink;
                }
            } catch (_) {}
            return fallback;
        }

        /** Abre aba em sync (anti popup-blocker) e navega quando o shortlink chegar. */
        async function openAffiliateInNewTab(p, { labelEl = null } = {}) {
            if (!p) return;
            const immediate = (hasMatchingTrackedLink(p) && p.shortLink)
                || p.shortLink
                || p.affiliateLink
                || p.productLink
                || '';
            const tab = window.open(immediate && immediate !== '#' ? immediate : 'about:blank', '_blank');
            if (hasMatchingTrackedLink(p) && p.shortLink) return;
            if (labelEl) labelEl.textContent = 'Abrindo…';
            try {
                const url = await resolveAffiliateUrl(p);
                if (url && url !== '#') {
                    if (tab && !tab.closed) {
                        try { tab.location.href = url; } catch (_) {
                            window.location.href = url;
                        }
                    } else {
                        window.open(url, '_blank', 'noopener,noreferrer');
                    }
                    const btn = document.getElementById('modal-buy-btn');
                    if (btn) btn.href = url;
                }
            } finally {
                if (labelEl) labelEl.textContent = 'Comprar na Shopee';
            }
        }

        async function handleBuyClick(event) {
            const p = activeProductForBuy;
            if (!p) return true;
            const label = document.getElementById('modal-buy-label');
            const btn = document.getElementById('modal-buy-btn');
            if (hasMatchingTrackedLink(p) && p.shortLink) {
                if (btn) btn.href = p.shortLink;
                return true;
            }
            event.preventDefault();
            await openAffiliateInNewTab(p, { labelEl: label });
            return false;
        }

        async function buyFromCard(id, section = 'destaque') {
            const p = productsDatabase.find((prod) => String(prod.id) === String(id));
            if (!p) return;
            activeProductForBuy = p;
            if (section) currentNavSection = section;
            await openAffiliateInNewTab(p);
        }

        function closeProductModal() {
            const modal = document.getElementById('product-modal');
            const card = document.getElementById('modal-card');
            modal.classList.add('opacity-0');
            card.classList.add('scale-95');
            document.body.style.overflow = '';
            setTimeout(() => {
                modal.classList.remove('flex');
                modal.classList.add('hidden');
            }, 200);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeProductModal();
        });

        window.addEventListener('scroll', () => {
            const btn = document.getElementById('back-to-top-btn');
            if (!btn) return;
            const show = window.scrollY > 500;
            btn.classList.toggle('hidden', !show);
            btn.classList.toggle('flex', show);
        }, { passive: true });

        // ---- Gerenciador de produtos (filtros + seleção em massa) ----
        let adminPage = 1;
        let adminPageSize = 24;
        let adminSearchTerm = '';
        let adminFilterCategory = '';
        let adminFilterType = '';
        let adminFilterSort = 'recent';
        let adminSelectedIds = new Set();
        let adminSearchTimer = null;

        function parseCommissionPct(value) {
            const n = parseFloat(String(value || '').replace('%', '').replace(',', '.'));
            return Number.isFinite(n) ? n : 0;
        }

        function getAdminFiltered() {
            const term = adminSearchTerm.toLowerCase().trim();
            let list = productsDatabase.slice();

            if (adminFilterCategory) {
                list = list.filter(p => String(p.category || '') === adminFilterCategory);
            }
            if (adminFilterType === 'flash') {
                list = list.filter(p => !!p.isFlashSale);
            } else if (adminFilterType === 'normal') {
                list = list.filter(p => !p.isFlashSale);
            }
            if (term) {
                list = list.filter(p => {
                    const hay = [
                        p.title,
                        p.category,
                        p.subcategory,
                        p.shopName,
                        p.id,
                        p.itemId,
                        p.keyword,
                    ].map(v => String(v || '').toLowerCase()).join(' ');
                    return hay.includes(term);
                });
            }

            switch (adminFilterSort) {
                case 'name':
                    list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR'));
                    break;
                case 'price_asc':
                    list.sort((a, b) => Number(a.newPrice || 0) - Number(b.newPrice || 0));
                    break;
                case 'price_desc':
                    list.sort((a, b) => Number(b.newPrice || 0) - Number(a.newPrice || 0));
                    break;
                case 'discount':
                    list.sort((a, b) => Number(b.discountPct || 0) - Number(a.discountPct || 0));
                    break;
                case 'commission':
                    list.sort((a, b) => parseCommissionPct(b.commissionRate) - parseCommissionPct(a.commissionRate));
                    break;
                default:
                    list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
            }
            return list;
        }

        function syncAdminFilterControls() {
            const search = document.getElementById('admin-search');
            const cat = document.getElementById('admin-filter-category');
            const type = document.getElementById('admin-filter-type');
            const sort = document.getElementById('admin-filter-sort');
            const size = document.getElementById('admin-page-size');
            if (search && search.value !== adminSearchTerm) search.value = adminSearchTerm;
            if (cat) cat.value = adminFilterCategory;
            if (type) type.value = adminFilterType;
            if (sort) sort.value = adminFilterSort;
            if (size) size.value = String(adminPageSize);
        }

        function populateAdminProductCategoryFilter() {
            const sel = document.getElementById('admin-filter-category');
            if (!sel) return;
            const current = adminFilterCategory || sel.value;
            const opts = categories
                .filter(c => c.id !== 'todos')
                .map(c => {
                    const count = productsDatabase.filter(p => p.category === c.id).length;
                    return `<option value="${escapeAttr(c.id)}">${escapeHtml(c.label)}${count ? ` (${count})` : ''}</option>`;
                })
                .join('');
            sel.innerHTML = `<option value="">Todas as categorias</option>${opts}`;
            if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
        }

        function onAdminSearch() {
            clearTimeout(adminSearchTimer);
            adminSearchTimer = setTimeout(() => {
                adminSearchTerm = document.getElementById('admin-search')?.value || '';
                adminPage = 1;
                renderConsoleProducts();
            }, 180);
        }

        function onAdminFiltersChange() {
            adminFilterCategory = document.getElementById('admin-filter-category')?.value || '';
            adminFilterType = document.getElementById('admin-filter-type')?.value || '';
            adminFilterSort = document.getElementById('admin-filter-sort')?.value || 'recent';
            adminPage = 1;
            renderConsoleProducts();
        }

        function onAdminPageSizeChange() {
            adminPageSize = Math.min(100, Math.max(8, Number(document.getElementById('admin-page-size')?.value) || 24));
            adminPage = 1;
            renderConsoleProducts();
        }

        function clearAdminFilters() {
            adminSearchTerm = '';
            adminFilterCategory = '';
            adminFilterType = '';
            adminFilterSort = 'recent';
            adminPage = 1;
            syncAdminFilterControls();
            renderConsoleProducts();
        }

        function updateAdminBulkBar() {
            const bar = document.getElementById('admin-bulk-bar');
            const countEl = document.getElementById('admin-selected-count');
            const n = adminSelectedIds.size;
            if (countEl) countEl.textContent = String(n);
            if (bar) bar.classList.toggle('hidden', n === 0);
        }

        function toggleAdminProductSelect(id, checked) {
            const key = String(id);
            if (checked) adminSelectedIds.add(key);
            else adminSelectedIds.delete(key);
            updateAdminBulkBar();
            const pageCb = document.getElementById('admin-select-page');
            if (pageCb) {
                const filtered = getAdminFiltered();
                const start = (adminPage - 1) * adminPageSize;
                const pageItems = filtered.slice(start, start + adminPageSize);
                const allOnPage = pageItems.length > 0 && pageItems.every(p => adminSelectedIds.has(String(p.id)));
                pageCb.checked = allOnPage;
                pageCb.indeterminate = !allOnPage && pageItems.some(p => adminSelectedIds.has(String(p.id)));
            }
        }

        function toggleSelectAdminPage(checked) {
            const filtered = getAdminFiltered();
            const start = (adminPage - 1) * adminPageSize;
            const pageItems = filtered.slice(start, start + adminPageSize);
            pageItems.forEach(p => {
                if (checked) adminSelectedIds.add(String(p.id));
                else adminSelectedIds.delete(String(p.id));
            });
            renderConsoleProducts();
        }

        function selectAllFilteredProducts() {
            const filtered = getAdminFiltered();
            if (!filtered.length) {
                showToast('Nenhum produto no filtro atual', 'error');
                return;
            }
            filtered.forEach(p => adminSelectedIds.add(String(p.id)));
            renderConsoleProducts();
            showToast(`${filtered.length} produto(s) selecionado(s)`, 'success');
        }

        function clearAdminProductSelection() {
            adminSelectedIds.clear();
            renderConsoleProducts();
        }

        function addSelectedProductsToCampaign() {
            if (!adminSelectedIds.size) {
                showToast('Selecione ao menos um produto', 'error');
                return;
            }
            let added = 0;
            let skipped = 0;
            for (const id of adminSelectedIds) {
                const ok = addProductToCampaign(id, { silent: true });
                if (ok) added += 1;
                else skipped += 1;
            }
            renderCampaignSelectedProducts();
            updateCampaignLinkPreview();
            adminSelectedIds.clear();
            renderConsoleProducts();
            showToast(
                added
                    ? `${added} produto(s) adicionados à campanha${skipped ? ` (${skipped} já estavam)` : ''}`
                    : 'Nenhum produto novo para adicionar',
                added ? 'success' : 'error'
            );
            if (added) switchAdminView('campanhas');
        }

        function adminPrevPage() {
            if (adminPage > 1) { adminPage--; renderConsoleProducts(); }
        }

        function adminNextPage() {
            const total = getAdminFiltered().length;
            const maxPage = Math.max(1, Math.ceil(total / adminPageSize));
            if (adminPage < maxPage) { adminPage++; renderConsoleProducts(); }
        }

        function renderConsoleProducts() {
            const container = document.getElementById('console-products-list');
            if (!container) return;

            populateAdminProductCategoryFilter();
            syncAdminFilterControls();

            const countEl = document.getElementById('count-db-items');
            const loadedEl = document.getElementById('count-db-loaded');
            const summaryEl = document.getElementById('admin-filter-summary');
            const dbTotal = Number((categories.find(c => c.id === 'todos') || {}).count) || 0;
            if (countEl) countEl.innerText = dbTotal > 0 ? dbTotal : productsDatabase.length;
            if (loadedEl && !adminCatalogLoading) {
                if (dbTotal > productsDatabase.length) {
                    loadedEl.textContent = `· ${productsDatabase.length} na memória (faltam ${dbTotal - productsDatabase.length})`;
                } else if (productsDatabase.length) {
                    loadedEl.textContent = `· ${productsDatabase.length} carregados`;
                } else {
                    loadedEl.textContent = '';
                }
            }

            const filtered = getAdminFiltered();
            const total = filtered.length;
            const maxPage = Math.max(1, Math.ceil(total / adminPageSize));
            if (adminPage > maxPage) adminPage = maxPage;
            const start = (adminPage - 1) * adminPageSize;
            const pageItems = filtered.slice(start, start + adminPageSize);

            if (summaryEl) {
                const bits = [];
                if (adminSearchTerm) bits.push(`busca “${adminSearchTerm}”`);
                if (adminFilterCategory) {
                    const lab = (categories.find(c => c.id === adminFilterCategory) || {}).label || adminFilterCategory;
                    bits.push(lab);
                }
                if (adminFilterType === 'flash') bits.push('relâmpago');
                if (adminFilterType === 'normal') bits.push('normal');
                summaryEl.textContent = bits.length
                    ? `${total} resultado(s) · ${bits.join(' · ')}`
                    : `${total} produto(s) listados`;
            }

            const pageCb = document.getElementById('admin-select-page');
            if (pageCb) {
                const allOnPage = pageItems.length > 0 && pageItems.every(p => adminSelectedIds.has(String(p.id)));
                pageCb.checked = allOnPage;
                pageCb.indeterminate = !allOnPage && pageItems.some(p => adminSelectedIds.has(String(p.id)));
            }

            if (!pageItems.length) {
                container.innerHTML = `
                    <div class="py-12 text-center text-slate-400 text-xs space-y-2">
                        <i class="fas fa-box-open text-2xl block"></i>
                        <p class="font-bold text-slate-600">Nenhum produto encontrado</p>
                        <p>Ajuste os filtros ou limpe a busca.</p>
                        <button type="button" onclick="clearAdminFilters()" class="text-shopee-orange font-bold">Limpar filtros</button>
                    </div>`;
            } else {
                container.innerHTML = pageItems.map(p => {
                    const selected = adminSelectedIds.has(String(p.id));
                    const labelFlash = p.isFlashSale
                        ? `<span class="bg-red-500 text-white font-bold text-[8px] px-1.5 py-0.5 rounded">RELÂMPAGO</span>`
                        : '';
                    const rate = p.commissionRate && p.commissionRate !== '0.0%' ? p.commissionRate : '—';
                    const catLabel = (categories.find(c => c.id === p.category) || {}).label || p.category || '';
                    const border = selected ? 'border-shopee-orange bg-orange-50/60 ring-1 ring-orange-200' : 'border-slate-200 bg-slate-50';
                    return `
                        <div class="p-3 rounded-xl border ${border} text-xs flex items-start gap-3 transition">
                            <label class="pt-3 shrink-0 cursor-pointer">
                                <input type="checkbox" class="rounded border-slate-300 text-shopee-orange focus:ring-shopee-orange"
                                    ${selected ? 'checked' : ''}
                                    onchange="toggleAdminProductSelect('${String(p.id).replace(/'/g, '')}', this.checked)">
                            </label>
                            <img src="${escapeAttr(p.image || '')}" alt="" class="w-12 h-12 object-cover rounded-lg border bg-white shrink-0"
                                onerror="this.onerror=null; this.src='https://placehold.co/100x100/ffebd7/ee4d2d?text=Icon'">
                            <div class="min-w-0 flex-1">
                                <h5 class="font-bold text-slate-800 line-clamp-2 leading-snug">${escapeHtml(p.title)}</h5>
                                <div class="flex items-center gap-1.5 flex-wrap mt-1">
                                    <span class="bg-slate-200 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold text-slate-600">${escapeHtml(String(catLabel))}</span>
                                    ${labelFlash}
                                    <span class="text-shopee-orange font-bold text-[10px]">R$ ${Number(p.newPrice || 0).toFixed(2)}</span>
                                    ${p.discountPct ? `<span class="text-emerald-600 text-[9px] font-bold">-${p.discountPct}%</span>` : ''}
                                    <span class="text-slate-400 text-[9px]">comissão ${escapeHtml(String(rate))}</span>
                                    <span class="text-slate-300 text-[9px] font-mono">#${escapeHtml(String(p.id))}</span>
                                </div>
                                ${p.shopName ? `<p class="text-[10px] text-slate-400 mt-0.5 truncate">${escapeHtml(p.shopName)}</p>` : ''}
                            </div>
                            <div class="flex items-center gap-2 shrink-0 pt-1">
                                <button type="button" onclick="addProductToCampaign('${String(p.id).replace(/'/g, '')}'); showToast('Produto adicionado à campanha','success'); switchAdminView('campanhas');"
                                    class="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-shopee-orange hover:border-shopee-orange flex items-center justify-center" title="Adicionar à campanha">
                                    <i class="fas fa-bullhorn"></i>
                                </button>
                                <a href="${escapeAttr(p.affiliateLink || '#')}" target="_blank" rel="noopener"
                                    class="h-8 w-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-shopee-orange hover:border-shopee-orange flex items-center justify-center" title="Abrir link">
                                    <i class="fas fa-arrow-up-right-from-square"></i>
                                </a>
                                <button type="button" onclick="removeProductFromDatabase(${JSON.stringify(String(p.id))})"
                                    class="h-8 w-8 rounded-lg bg-white border border-slate-200 text-red-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center" title="Excluir">
                                    <i class="fas fa-trash-can"></i>
                                </button>
                            </div>
                        </div>`;
                }).join('');
            }

            const info = document.getElementById('admin-page-info');
            if (info) {
                const from = total ? start + 1 : 0;
                const to = Math.min(start + adminPageSize, total);
                info.textContent = total
                    ? `Página ${adminPage} de ${maxPage} · ${from}–${to} de ${total}`
                    : 'Sem resultados';
            }
            const prev = document.getElementById('admin-prev');
            const next = document.getElementById('admin-next');
            if (prev) prev.disabled = adminPage <= 1;
            if (next) next.disabled = adminPage >= maxPage;
            updateAdminBulkBar();
        }

        // Remove product
        function removeProductFromDatabase(id) {
            productsDatabase = productsDatabase.filter(p => String(p.id) !== String(id));
            adminSelectedIds.delete(String(id));
            localStorage.setItem('afiliado_mestre_db_v1', JSON.stringify(productsDatabase));
            renderConsoleProducts();
            renderStoreProducts();
            if (isAdminMode()) loadAdminStats();
            showToast("Produto removido do banco!", "success");
        }

        // Update single inline affiliate links
        function updateSingleAffiliateLink(id, newLink) {
            const idx = productsDatabase.findIndex(p => p.id === id);
            if (idx !== -1) {
                productsDatabase[idx].affiliateLink = newLink;
                localStorage.setItem('afiliado_mestre_db_v1', JSON.stringify(productsDatabase));
                showToast("Link de redirecionamento atualizado com sucesso!", "success");
            }
        }

        // Open Form
        function openNewProductForm() {
            document.getElementById('new-product-form-card').classList.remove('hidden');
        }

        function closeNewProductForm() {
            document.getElementById('new-product-form-card').classList.add('hidden');
        }

        // Save custom product
        function saveNewProduct() {
            const title = document.getElementById('add-title').value.trim();
            const oldPrice = parseFloat(document.getElementById('add-old-price').value);
            const newPrice = parseFloat(document.getElementById('add-new-price').value);
            const category = document.getElementById('add-category').value;
            const stock = parseInt(document.getElementById('add-stock').value) || 0;
            const affLink = document.getElementById('add-aff-link').value.trim();
            const imgUrl = document.getElementById('add-img-url').value.trim();
            const desc = document.getElementById('add-desc').value.trim();

            if (!title || isNaN(newPrice)) {
                showToast("Preencha ao menos o Título e o Preço com Desconto!", "error");
                return;
            }

            // Calculations
            const finalOldPrice = isNaN(oldPrice) ? newPrice * 1.5 : oldPrice;
            const discountPct = Math.round(((finalOldPrice - newPrice) / finalOldPrice) * 100);
            const generatedId = Date.now();

            // Default mock commissions
            const estShopeeRate = 0.045; // 4.5% standard platform
            const estSellerRate = 0.055; // 5.5% average extra shop offer
            const totalRateStr = `${((estShopeeRate + estSellerRate) * 100).toFixed(1)}%`;
            
            const shopeeCommVal = newPrice * estShopeeRate;
            const sellerCommVal = newPrice * estSellerRate;
            const totalCommVal = shopeeCommVal + sellerCommVal;

            const placeholderImgs = [
                "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400",
                "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&q=80&w=400",
                "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400"
            ];
            const finalImage = imgUrl || placeholderImgs[Math.floor(Math.random() * placeholderImgs.length)];

            const newProdObj = {
                id: generatedId,
                title: title,
                category: category,
                oldPrice: finalOldPrice,
                newPrice: newPrice,
                discount: `${discountPct}%`,
                stars: 4.5,
                reviews: Math.floor(Math.random() * 50 + 10),
                sales: `${Math.floor(Math.random() * 120 + 15)} vendidos`,
                image: finalImage,
                affiliateLink: affLink || "https://shope.ee/mestre-custom",
                isFlashSale: stock > 0,
                flashStock: stock,
                commissionRate: totalRateStr,
                sellerCommission: `R$ ${sellerCommVal.toFixed(2)}`,
                shopeeCommission: `R$ ${shopeeCommVal.toFixed(2)}`,
                totalCommission: `R$ ${totalCommVal.toFixed(2)}`,
                desc: desc || "Lindo achado adicionado diretamente pelo painel master. Pronto para ser promovido nas suas redes com ótimas taxas de lucro."
            };

            productsDatabase.unshift(newProdObj);
            localStorage.setItem('afiliado_mestre_db_v1', JSON.stringify(productsDatabase));

            // Reload UI
            renderConsoleProducts();
            renderStoreProducts();
            if (isAdminMode()) loadAdminStats();
            closeNewProductForm();

            // Clear inputs
            document.getElementById('add-title').value = '';
            document.getElementById('add-old-price').value = '';
            document.getElementById('add-new-price').value = '';
            document.getElementById('add-stock').value = '';
            document.getElementById('add-desc').value = '';
            document.getElementById('add-img-url').value = '';

            showToast("✨ Novo produto integrado e publicado com sucesso!", "success");
        }

        // ---- Painel admin: estatísticas reais + auto-sync ----
        function fmtDateTime(iso) {
            if (!iso) return '—';
            try {
                return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            } catch { return iso; }
        }

        function populateAdminCategorySelect() {
            const sel = document.getElementById('admin-cat-sync');
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = categories
                .filter(c => c.id !== 'todos')
                .map(c => `<option value="${c.id}">${escapeHtml(c.label)}${c.count ? ` (${c.count})` : ''}</option>`)
                .join('');
            if (current) sel.value = current;
        }

        async function loadAdminStats() {
            const prodEl = document.getElementById('stat-db-products');
            const catEl = document.getElementById('stat-db-categories');
            try {
                const res = await fetch(`${API_BASE}/api/categorias`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const cats = data.categories || [];
                const total = (cats.find(c => c.id === 'todos') || {}).count || 0;
                const active = cats.filter(c => c.id !== 'todos' && Number(c.count) > 0).length;
                if (prodEl) prodEl.innerText = total.toLocaleString('pt-BR');
                if (catEl) catEl.innerText = active;
                const countEl = document.getElementById('count-db-items');
                const loadedEl = document.getElementById('count-db-loaded');
                if (countEl) countEl.innerText = total.toLocaleString('pt-BR');
                if (loadedEl && !adminCatalogLoading) {
                    if (total > productsDatabase.length) {
                        loadedEl.textContent = `· ${productsDatabase.length} na memória (faltam ${total - productsDatabase.length})`;
                    } else if (productsDatabase.length) {
                        loadedEl.textContent = `· ${productsDatabase.length} carregados`;
                    } else {
                        loadedEl.textContent = '';
                    }
                }
            } catch (err) {
                if (prodEl) prodEl.innerText = productsDatabase.length;
                if (catEl) catEl.innerText = new Set(productsDatabase.map(p => p.category)).size;
            }
        }

        async function loadShortlinkStatus() {
            const line = document.getElementById('shortlink-status-line');
            const bar = document.getElementById('shortlink-status-bar');
            if (!line || !bar) return;
            try {
                const res = await fetch(`${API_BASE}/api/status/shortlinks`);
                const s = await res.json();
                if (!res.ok) throw new Error(s.error || `HTTP ${res.status}`);
                const total = Number(s.total) || 0;
                const ready = Number(s.ready) || 0;
                const missing = Number(s.missing) || 0;
                const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
                bar.style.width = `${pct}%`;
                bar.className = `h-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`;
                line.innerHTML = total
                    ? `<strong>${ready.toLocaleString('pt-BR')}</strong> / ${total.toLocaleString('pt-BR')} produtos com shortlink pronto (${pct}%). Faltam <strong>${missing.toLocaleString('pt-BR')}</strong>.`
                    : 'Nenhum produto no banco ainda. Rode um sync primeiro.';
            } catch (err) {
                line.innerHTML = `<span class="text-rose-500"><i class="fas fa-circle-exclamation mr-1"></i>${escapeHtml(err.message || 'Erro ao consultar status')}</span>`;
            }
        }

        async function runShortlinkBackfill() {
            const btn = document.getElementById('btn-shortlink-backfill');
            const line = document.getElementById('shortlink-status-line');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Gerando tudo…'; }
            if (line) line.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Gerando <strong>todos</strong> os shortlinks faltantes (lotes de 50). Pode levar alguns minutos…';
            try {
                const res = await adminFetch(`${API_BASE}/api/shortlinks/backfill`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ all: true, limit: 50 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const missing = data.status?.missing;
                let msg = `Shortlinks: ${data.generated} gerados, ${data.failed || 0} falhas`;
                if (data.rateLimited) {
                    msg += ' — rate-limit. Clique de novo em alguns segundos para continuar.';
                } else if (data.timedOut || (typeof missing === 'number' && missing > 0)) {
                    msg += ` — ainda faltam ${missing != null ? missing : 'alguns'}. Clique de novo para continuar.`;
                } else {
                    msg += ' — fila zerada.';
                }
                showToast(msg, data.generated || data.done ? 'success' : 'error');
            } catch (err) {
                showToast(err.message || 'Erro no backfill', 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-1"></i> Gerar tudo que falta'; }
                loadShortlinkStatus();
            }
        }

        async function loadAutoStatus() {
            const box = document.getElementById('auto-status-box');
            const badge = document.getElementById('auto-enabled-badge');
            try {
                const res = await fetch(`${API_BASE}/api/auto/status`);
                const s = await res.json();
                if (!res.ok) throw new Error(s.error || `HTTP ${res.status}`);

                const stateEl = document.getElementById('stat-auto-state');
                const nextEl = document.getElementById('stat-auto-next');
                const lastEl = document.getElementById('stat-auto-last');
                const upsEl = document.getElementById('stat-auto-upserts');
                if (stateEl) stateEl.innerText = s.enabled ? (s.running ? 'Rodando…' : 'Ativo') : 'Desligado';
                if (nextEl) nextEl.innerText = `próxima: ${fmtDateTime(s.nextRunAt)}`;
                if (lastEl) lastEl.innerText = fmtDateTime(s.lastRunAt);
                if (upsEl) upsEl.innerText = `itens salvos: ${s.totalUpserts ?? 0}`;

                if (badge) {
                    if (s.enabled) {
                        badge.textContent = s.running ? 'Rodando' : 'Ativo';
                        badge.className = 'text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200';
                    } else {
                        badge.textContent = 'Pausado (AUTO_SYNC=0)';
                        badge.className = 'text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-slate-100 text-slate-500 border-slate-200';
                    }
                }

                const modes = (s.modes || []).map(m => m.label || `${m.listType}/${m.sortType}`).join(' → ');
                if (box) {
                    box.innerHTML = [
                        `estado........: ${s.enabled ? (s.running ? 'rodando' : 'ativo') : 'desligado'}`,
                        `feed..........: ${s.feedMode || 'coverage-95-5'}`,
                        `home..........: ${s.homePolicy || '100% feminino'}`,
                        `lote..........: ${s.batch} keyword(s) / execução`,
                        `foco feminino.: ${s.femalePercentTarget || 95}% das buscas (5% geral)`,
                        `fila coverage.: ${s.queueSize ?? '—'} (cursor ${s.cursor ?? 0})`,
                        `intervalo.....: ${s.intervalMin} min`,
                        `itens/keyword.: ${s.limit}`,
                        `modos.........: ${modes || 'comissão → top → recomendados'}`,
                        `shortlinks....: on-save + residual ${s.shortlinkBackfillPerRun ?? 50}/run`,
                        `última rodada.: ${(s.lastResult && s.lastResult.shortlinksGenerated != null) ? (s.lastResult.shortlinksGenerated + ' shortlinks') : '—'}`,
                        `execuções.....: ${s.runs}`,
                        `última........: ${fmtDateTime(s.lastRunAt)}`,
                        `próxima.......: ${fmtDateTime(s.nextRunAt)}`,
                        `limpeza.......: ${s.pruneDays ? s.pruneDays + ' dias' : 'desligada'}`,
                        s.lastError ? `último erro...: ${escapeHtml(s.lastError)}` : ``,
                    ].filter(Boolean).map(l => `<div>${l}</div>`).join('');
                }
            } catch (err) {
                if (box) box.innerHTML = `<div class="text-red-500">Não foi possível ler o status (${escapeHtml(err.message)}).</div>`;
                if (badge) {
                    badge.textContent = 'Erro';
                    badge.className = 'text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border bg-red-50 text-red-600 border-red-200';
                }
            }
        }

        async function runAutoSyncNow() {
            const btn = document.getElementById('btn-run-auto');
            const original = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> Sincronizando…`; }
            showToast('Rodando um lote de sincronização…', 'success');
            try {
                const res = await adminFetch(`${API_BASE}/api/auto/run`, { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const ups = data.result?.upserts ?? 0;
                const sl = data.result?.shortlinksGenerated ?? 0;
                const skip = data.result?.skippedExisting ?? 0;
                showToast(`Lote: ${ups} novos · ${skip} já existiam · ${sl} shortlinks`, 'success');
                await loadOffersFromSupabase({ silent: true, reset: true });
                await loadCategoriesFromApi({ silent: true });
                populateAdminCategorySelect();
                loadAdminStats();
                loadAutoStatus();
                loadShortlinkStatus();
            } catch (err) {
                showToast(`Falha ao sincronizar: ${err.message}`, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = original; }
            }
        }

        async function runTopPerformanceNow() {
            const btn = document.getElementById('btn-top-perf');
            const original = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> Buscando…`; }
            showToast('Populando destaques (Top Performance)…', 'success');
            try {
                const res = await adminFetch(`${API_BASE}/api/auto/top-performance`, { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const ups = data.result?.upserts ?? 0;
                const sl = data.result?.shortlinksGenerated ?? 0;
                const skip = data.result?.skippedExisting ?? 0;
                showToast(`Destaques: ${ups} novos · ${skip} já existiam · ${sl} shortlinks`, 'success');
                await loadOffersFromSupabase({ silent: true, reset: true });
                await loadCategoriesFromApi({ silent: true });
                populateAdminCategorySelect();
                loadAdminStats();
                loadAutoStatus();
                loadShortlinkStatus();
                loadHeroProducts();
            } catch (err) {
                showToast(`Falha nos destaques: ${err.message}`, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = original; }
            }
        }

        async function adminSyncCategory() {
            const sel = document.getElementById('admin-cat-sync');
            const catId = sel?.value;
            if (!catId) return;
            const btn = document.getElementById('btn-sync-cat');
            const status = document.getElementById('cat-sync-status');
            const original = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sincronizando…`; }
            if (status) {
                status.className = 'text-[11px] rounded-lg px-3 py-2 border bg-slate-50 border-slate-200 text-slate-600';
                status.textContent = `Sincronizando categoria "${catId}"…`;
                status.classList.remove('hidden');
            }
            const data = await syncCategory(catId, { silent: false });
            if (data) {
                if (status) {
                    status.className = 'text-[11px] rounded-lg px-3 py-2 border bg-emerald-50 border-emerald-200 text-emerald-800';
                    status.innerHTML = `<strong>${data.saved || data.count || 0}</strong> novos · <strong>${data.skippedExisting || 0}</strong> já existiam · <strong>${data.shortlinks?.generated || 0}</strong> shortlinks · ${data.keywordsRun || 0} keywords`;
                }
                await loadOffersFromSupabase({ silent: true, reset: true, category: catId });
                await loadCategoriesFromApi({ silent: true });
                populateAdminCategorySelect();
                loadAdminStats();
                loadShortlinkStatus();
                if (isAdminMode()) loadAdminCatalogFull({ silent: true, force: true });
            } else if (status) {
                status.className = 'text-[11px] rounded-lg px-3 py-2 border bg-red-50 border-red-200 text-red-700';
                status.textContent = 'Falha ao sincronizar a categoria.';
            }
            if (btn) { btn.disabled = false; btn.innerHTML = original; }
        }

        async function loadOfficialShopeeOffers() {
            const box = document.getElementById('official-offers-box');
            if (!box) return;
            box.innerHTML = '<p class="text-slate-400"><i class="fas fa-spinner fa-spin mr-1"></i> Carregando oficiais…</p>';
            try {
                const res = await fetch(`${API_BASE}/api/campanhas?limit=20`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const items = data.campaigns || data.offers || data.nodes || [];
                if (!items.length) {
                    box.innerHTML = '<p class="text-slate-400">Nenhuma oferta oficial retornada agora.</p>';
                    return;
                }
                window.__officialOffers = items;
                box.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-slate-700">${items.length} ofertas</span>
                        <button type="button" onclick="importOfficialShopeeOffers()" class="px-3 py-1.5 rounded-lg bg-shopee-orange text-white text-[10px] font-bold">Importar todas</button>
                    </div>
                    <div class="space-y-2 max-h-64 overflow-y-auto">
                        ${items.slice(0, 20).map((c, i) => {
                            const collectionId = c.collectionId || c.collection_id || '';
                            const categoryId = c.categoryId || c.category_id || '';
                            const match = collectionId || categoryId;
                            const lt = collectionId ? 6 : 4;
                            return `
                            <div class="border border-slate-100 rounded-lg p-2 flex gap-2">
                                <img src="${escapeHtml(c.imageUrl || c.image || '')}" class="w-10 h-10 rounded object-cover bg-slate-100" onerror="this.style.display='none'">
                                <div class="min-w-0 flex-1">
                                    <p class="font-bold text-slate-800 text-[11px] line-clamp-2">${escapeHtml(c.title || c.productName || c.name || 'Oferta')}</p>
                                    <p class="text-[10px] text-slate-400">${match ? `ID ${escapeHtml(String(match))} · listType ${lt}` : 'sem matchId'}</p>
                                </div>
                                ${match ? `<button type="button" onclick="useOfficialInExplorer(${i})" class="shrink-0 px-2 py-1 rounded bg-slate-800 text-white text-[10px] font-bold">Explorador</button>` : ''}
                            </div>`;
                        }).join('')}
                    </div>`;
            } catch (err) {
                box.innerHTML = `<p class="text-red-600">Falha: ${escapeHtml(err.message)}</p>`;
            }
        }

        function useOfficialInExplorer(index) {
            const c = (window.__officialOffers || [])[index];
            if (!c) return;
            const collectionId = c.collectionId || c.collection_id;
            const categoryId = c.categoryId || c.category_id;
            const match = collectionId || categoryId;
            if (!match) return showToast('Oferta sem collectionId/categoryId', 'error');
            const matchEl = document.getElementById('admin-match-id');
            const lt = document.getElementById('admin-list-type');
            const st = document.getElementById('admin-sort-type');
            const kw = document.getElementById('admin-keyword');
            const rc = document.getElementById('admin-require-commission');
            if (matchEl) matchEl.value = String(match);
            if (lt) lt.value = collectionId ? '6' : '4';
            if (st) st.value = '5';
            if (kw) kw.value = '';
            if (rc) rc.checked = true;
            updateExplorerKwCount();
            updateExplorerModeHint();
            document.getElementById('admin-match-id')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('matchId no Explorador — clique Pré-visualizar', 'success');
        }

        async function importOfficialShopeeOffers() {
            const items = window.__officialOffers || [];
            if (!items.length) return showToast('Nada para importar', 'error');
            let savedTotal = 0;
            let shortTotal = 0;
            let usedCollection = 0;
            try {
                for (const c of items.slice(0, 8)) {
                    const collectionId = c.collectionId || c.collection_id;
                    const categoryId = c.categoryId || c.category_id;
                    if (collectionId || categoryId) {
                        const res = await adminFetch(`${API_BASE}/api/campanhas/import-products`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                collectionId: collectionId || undefined,
                                categoryId: categoryId || undefined,
                                limit: 25,
                                keyword: 'oficial',
                                forceCategory: /beauty|beleza|skincare/i.test(c.title || '') ? 'beleza'
                                    : /fashion|moda|women|roupa/i.test(c.title || '') ? 'moda' : null,
                            }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                            savedTotal += data.saved || 0;
                            shortTotal += data.shortlinks?.generated || 0;
                            usedCollection += 1;
                        }
                    }
                }
                if (!usedCollection) {
                    showToast('Oficiais sem collectionId — use o Explorador "Feminino + comissão"', 'error');
                    return;
                }
                showToast(`Campanhas: ${savedTotal} produtos · ${shortTotal} shortlinks`, 'success');
                loadShortlinkStatus();
                loadCoverageReport();
                await loadOffersFromSupabase({ silent: true, reset: true });
            } catch (err) {
                showToast(`Import falhou: ${err.message}`, 'error');
            }
        }

        async function loadCoverageReport() {
            const line = document.getElementById('coverage-status-line');
            const table = document.getElementById('coverage-table');
            if (!line || !table) return;
            try {
                // Leitura pública — não precisa de token (evita prompt bloqueando)
                const res = await fetch(`${API_BASE}/api/coverage`);
                const text = await res.text();
                let data = null;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch (_) {
                    throw new Error(
                        res.ok
                            ? "Resposta inválida do servidor (não é JSON). Faça deploy da versão nova ou reinicie o servidor local."
                            : `HTTP ${res.status}: rota /api/coverage indisponível — suba o código pro GitHub/Vercel.`
                    );
                }
                if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
                window.__coverageReport = data;
                line.innerHTML = `Alvo feed <strong>${data.femalePercentTarget || 95}%</strong> feminino · <strong>${data.femaleGaps || 0}</strong> buracos femininos · <strong>${data.generalGaps || 0}</strong> gerais · ${data.totalProducts || 0} produtos`;
                const cats = data.categories || [];
                table.innerHTML = cats.map((c) => {
                    const pct = c.target ? Math.min(100, Math.round((c.count / c.target) * 100)) : 100;
                    const subs = (c.subcategories || [])
                        .filter((s) => s.gap > 0)
                        .slice(0, 6)
                        .map((s) => `<span class="inline-block mr-2 text-rose-600">${escapeHtml(s.label)} ${s.count}/${s.target}</span>`)
                        .join('');
                    return `<div class="mb-2 border-b border-slate-50 pb-2">
                        <div class="flex justify-between gap-2 font-bold text-slate-700">
                            <span>${c.feminine ? '♀' : '·'} ${escapeHtml(c.label)} <span class="text-slate-400 font-normal">${c.count}/${c.target}</span></span>
                            <button type="button" onclick="runCoverageFill('${c.id}')" class="text-[10px] text-pink-600 font-bold hover:underline">Preencher</button>
                        </div>
                        <div class="h-1 bg-slate-100 rounded mt-1"><div class="h-full ${pct >= 80 ? 'bg-emerald-500' : 'bg-pink-500'} rounded" style="width:${pct}%"></div></div>
                        <div class="mt-1 text-[10px] text-slate-500">${subs || 'Subs ok'}</div>
                    </div>`;
                }).join('') || '<p>Sem dados de cobertura.</p>';
            } catch (err) {
                line.innerHTML = `<span class="text-rose-500">${escapeHtml(err.message)}</span>`;
                if (table) table.innerHTML = '<p class="text-slate-400">Não foi possível carregar a cobertura.</p>';
            }
        }

        async function runCoverageFill(category) {
            const btn = document.getElementById('btn-coverage-fill');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Preenchendo…'; }
            try {
                const res = await adminFetch(`${API_BASE}/api/sync/coverage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batch: 12, limit: 20, category: category || undefined }),
                });
                const text = await res.text();
                let data = null;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch (_) {
                    throw new Error(
                        res.ok
                            ? 'Resposta inválida do sync/coverage (não é JSON). Deploy da versão nova necessário.'
                            : `HTTP ${res.status}: sync/coverage indisponível — faça deploy.`
                    );
                }
                if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
                showToast(`Cobertura: ${data.saved} novos · ${data.skippedExisting || 0} já existiam · ${data.shortlinks?.generated || 0} shortlinks`, 'success');
                await loadCoverageReport();
                loadShortlinkStatus();
                await loadOffersFromSupabase({ silent: true, reset: true });
            } catch (err) {
                showToast(err.message || 'Falha na cobertura', 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-fill-drip mr-1"></i> Preencher buracos'; }
            }
        }

        async function scanCatalogDuplicates() {
            const line = document.getElementById('duplicates-status-line');
            const table = document.getElementById('duplicates-table');
            const btn = document.getElementById('btn-remove-duplicates');
            if (line) line.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Analisando catálogo…';
            if (btn) btn.disabled = true;
            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/duplicates?max=5000`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                window.__duplicatesReport = data;
                const groups = data.duplicates || [];
                if (line) {
                    line.innerHTML = groups.length
                        ? `Escaneados <strong>${data.scanned}</strong> · <strong class="text-rose-600">${data.toRemove}</strong> para remover em <strong>${data.groups}</strong> grupos`
                        : `Escaneados <strong>${data.scanned}</strong> · <span class="text-emerald-600">nenhum duplicado encontrado</span>`;
                }
                if (btn) btn.disabled = !(data.toRemove > 0);
                if (!table) return;
                if (!groups.length) {
                    table.innerHTML = '<p class="text-emerald-600 font-semibold">Catálogo limpo — sem duplicados detectados.</p>';
                    return;
                }
                table.innerHTML = groups.map((g) => `
                    <div class="mb-3 border border-slate-100 rounded-lg p-3">
                        <p class="font-bold text-slate-800 text-[11px] mb-1">Manter · ${escapeHtml(g.keep.title || '')}</p>
                        <p class="text-[10px] text-emerald-700 mb-2">#${g.keep.itemId} · ${escapeHtml(g.keep.shopName || 'loja')} · ${g.keep.shortLink ? 'shope.ee' : 'sem shortlink'} · score ${g.keep.score}</p>
                        <p class="text-[10px] text-rose-600 font-bold mb-1">Remover (${g.remove.length}):</p>
                        <ul class="space-y-1 text-slate-600">${g.remove.map((r) =>
                            `<li class="truncate">#${r.itemId} · ${escapeHtml(r.title || '')}</li>`
                        ).join('')}</ul>
                    </div>`).join('');
            } catch (err) {
                if (line) line.innerHTML = `<span class="text-rose-500">${escapeHtml(err.message)}</span>`;
                if (table) table.innerHTML = '<p class="text-rose-500">Falha ao analisar.</p>';
            }
        }

        async function removeCatalogDuplicates() {
            const report = window.__duplicatesReport;
            if (!report?.toRemove) return showToast('Analise primeiro', 'error');
            if (!confirm(`Remover ${report.toRemove} produto(s) duplicado(s)? O melhor de cada grupo será mantido.`)) return;
            const btn = document.getElementById('btn-remove-duplicates');
            const line = document.getElementById('duplicates-status-line');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Removendo…'; }
            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/duplicates/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ max: 5000 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                showToast(`Removidos ${data.removed} duplicados · ${data.kept} mantidos`, 'success');
                if (line) line.innerHTML = `Removidos <strong>${data.removed}</strong> · restam ~<strong>${data.kept}</strong> no catálogo`;
                await loadOffersFromSupabase({ silent: true, reset: true });
                await loadCategoriesFromApi({ silent: true });
                loadAdminStats();
                loadShortlinkStatus();
                await scanCatalogDuplicates();
            } catch (err) {
                showToast(err.message || 'Falha ao remover', 'error');
            } finally {
                if (btn) btn.innerHTML = '<i class="fas fa-trash mr-1"></i> Remover duplicados';
            }
        }

        async function scanWeakOffers() {
            const line = document.getElementById('duplicates-status-line');
            const table = document.getElementById('weak-offers-table');
            const btn = document.getElementById('btn-purge-weak');
            if (line) line.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Analisando ofertas fracas…';
            if (btn) btn.disabled = true;
            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/weak?max=5000`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                window.__weakReport = data;
                if (line) {
                    line.innerHTML = `Escaneados <strong>${data.scanned}</strong> · <strong class="text-amber-700">${data.weakCount}</strong> fracos (nota &lt; ${data.minRating} ou vendas &lt; ${data.minSales} ou sem comissão)`;
                }
                if (btn) btn.disabled = !(data.weakCount > 0);
                if (table) {
                    table.classList.remove('hidden');
                    if (!data.samples?.length) {
                        table.innerHTML = '<p class="text-emerald-600 font-semibold">Nenhuma oferta fraca no filtro atual.</p>';
                    } else {
                        table.innerHTML = `<p class="font-bold text-amber-800 mb-2">Amostra de fracos:</p><ul class="space-y-1">${
                            data.samples.map((s) =>
                                `<li class="truncate">#${s.itemId} · ★${s.rating ?? '—'} · ${escapeHtml(String(s.sales || '0'))} · ${escapeHtml(s.title || '')}</li>`
                            ).join('')
                        }</ul>`;
                    }
                }
            } catch (err) {
                if (line) line.innerHTML = `<span class="text-rose-500">${escapeHtml(err.message)}</span>`;
                showToast(err.message || 'Falha ao analisar fracos', 'error');
            }
        }

        async function purgeWeakOffers() {
            const report = window.__weakReport;
            if (!report?.weakCount) return showToast('Analise os fracos primeiro', 'error');
            if (!confirm(`Remover ${report.weakCount} oferta(s) fraca(s)? (nota/vendas/comissão abaixo do filtro)`)) return;
            const btn = document.getElementById('btn-purge-weak');
            const line = document.getElementById('duplicates-status-line');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Limpando…'; }
            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/purge-weak`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ max: 5000 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                showToast(`Removidos ${data.removed} fracos · ~${data.kept} mantidos`, 'success');
                if (line) line.innerHTML = `Fracos removidos: <strong>${data.removed}</strong>`;
                await loadOffersFromSupabase({ silent: true, reset: true });
                await loadCategoriesFromApi({ silent: true });
                loadAdminStats();
                await scanWeakOffers();
            } catch (err) {
                showToast(err.message || 'Falha ao limpar fracos', 'error');
            } finally {
                if (btn) btn.innerHTML = '<i class="fas fa-broom mr-1"></i> Limpar fracos';
            }
        }

        async function refreshTopOffers() {
            showToast('Atualizando top ofertas na Shopee…', 'success');
            try {
                const res = await adminFetch(`${API_BASE}/api/ofertas/refresh-top`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 40 }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                showToast(`Top: ${data.updated} atualizados · ${data.purged || 0} removidos`, 'success');
                await loadOffersFromSupabase({ silent: true, reset: true });
            } catch (err) {
                showToast(err.message || 'Falha no refresh-top', 'error');
            }
        }

        async function prioritizeConversionWinners() {
            showToast('Priorizando winners no sync…', 'success');
            try {
                const days = Number(document.getElementById('conversion-days')?.value) || 30;
                const res = await adminFetch(`${API_BASE}/api/conversions/prioritize`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ days }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                showToast(`${data.jobsQueued} keywords na fila prioritária`, 'success');
            } catch (err) {
                showToast(err.message || 'Falha ao priorizar', 'error');
            }
        }

        async function loadConversionSummary() {
            const list = document.getElementById('conversion-list');
            if (list) list.innerHTML = '<p class="text-slate-400 text-xs"><i class="fas fa-spinner fa-spin mr-1"></i> Carregando canais…</p>';
            try {
                const days = Number(document.getElementById('conversion-days')?.value) || 30;
                const res = await adminFetch(`${API_BASE}/api/conversions/summary?days=${days}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                const channels = data.channels || [];
                const tops = data.topItems || [];
                if (list) {
                    list.innerHTML = `
                        <div class="space-y-3">
                            <div>
                                <p class="text-[10px] font-bold uppercase text-slate-500 mb-2">Por canal (Sub ID)</p>
                                ${channels.length ? channels.map((c) => `
                                    <div class="flex justify-between text-xs border-b border-slate-50 py-1.5">
                                        <span class="font-semibold text-slate-700">${escapeHtml(c.channel)}</span>
                                        <span>${c.conversions} conv · <strong class="text-emerald-600">R$ ${(Number(c.commission)||0).toFixed(2).replace('.',',')}</strong></span>
                                    </div>`).join('') : '<p class="text-slate-400 text-xs">Sem dados de canal ainda.</p>'}
                            </div>
                            <div>
                                <p class="text-[10px] font-bold uppercase text-slate-500 mb-2">Top itens</p>
                                ${tops.slice(0, 10).map((t) => `
                                    <div class="text-xs truncate py-1">#${t.itemId} · ${escapeHtml(t.itemName || '')} · qty ${t.qty}</div>
                                `).join('') || '<p class="text-slate-400 text-xs">Sem itens.</p>'}
                            </div>
                        </div>`;
                }
            } catch (err) {
                if (list) list.innerHTML = `<p class="text-rose-500 text-xs">${escapeHtml(err.message)}</p>`;
            }
        }

        async function renderMoneyQueue() {
            const box = document.getElementById('money-queue-box');
            if (!box) return;
            box.innerHTML = '<p class="text-slate-400"><i class="fas fa-spinner fa-spin mr-1"></i> Carregando top comissão…</p>';
            try {
                // Garante catálogo admin carregado
                if (!productsDatabase.length) {
                    await loadOffersFromSupabase({ silent: true, reset: true }).catch(() => {});
                }
                const list = sortByMoney(femaleOnly(productsDatabase)).slice(0, 20);
                window.__moneyQueue = list;
                if (!list.length) {
                    box.innerHTML = '<p class="text-slate-500">Nenhum produto feminino no banco. Rode o Explorador (preset Feminino + comissão) ou Preencher buracos.</p>';
                    return;
                }
                const missing = list.filter((p) => !p.shortLink).length;
                box.innerHTML = `
                    <p class="mb-3 text-slate-600">${list.length} top · <strong class="text-amber-700">${missing} sem shortlink</strong> · score = comissão × vendas × nota</p>
                    <div class="space-y-2">${list.map((p) => {
                        const id = p.itemId || p.id;
                        const price = Number(p.newPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                        const score = moneyScoreOf(p).toFixed(1);
                        const hasSl = !!p.shortLink;
                        const link = p.shortLink || p.affiliateLink || p.productLink || '';
                        return `<div class="flex flex-wrap items-center gap-2 border border-slate-100 rounded-lg p-2 hover:border-amber-200">
                            <img src="${escapeHtml(p.image || '')}" class="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" alt="" onerror="this.style.display='none'">
                            <div class="min-w-0 flex-1">
                                <p class="font-semibold text-slate-800 text-[11px] line-clamp-1">${escapeHtml(p.title || '')}</p>
                                <p class="text-[10px] text-slate-500">${price} · <span class="text-emerald-700 font-bold">${escapeHtml(p.commissionRate || '—')}</span> · score <span class="text-amber-700 font-bold">${score}</span>${hasSl ? ' · <span class="text-emerald-600">shope.ee</span>' : ' · <span class="text-rose-500">sem shortlink</span>'}</p>
                            </div>
                            <div class="flex flex-wrap gap-1 shrink-0">
                                ${!hasSl ? `<button type="button" onclick="moneyQueueMakeShortlink('${id}')" class="px-2 py-1 rounded bg-amber-500 text-white text-[10px] font-bold hover:bg-amber-600">Shortlink</button>` : ''}
                                <button type="button" onclick="moneyQueueCopyLink('${id}')" class="px-2 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200">Copiar</button>
                                <a href="${escapeHtml(link || '#')}" target="_blank" rel="nofollow sponsored noopener" class="px-2 py-1 rounded bg-shopee-orange text-white text-[10px] font-bold hover:bg-orange-600 ${link ? '' : 'pointer-events-none opacity-40'}">Abrir</a>
                                <button type="button" onclick="moneyQueueToExplorer('${id}')" class="px-2 py-1 rounded bg-slate-800 text-white text-[10px] font-bold hover:bg-slate-700">Explorar</button>
                            </div>
                        </div>`;
                    }).join('')}</div>`;
            } catch (err) {
                box.innerHTML = `<p class="text-rose-500">${escapeHtml(err.message)}</p>`;
            }
        }

        function moneyQueueFind(id) {
            const sid = String(id);
            return (window.__moneyQueue || []).find((p) => String(p.itemId || p.id) === sid)
                || productsDatabase.find((p) => String(p.itemId || p.id) === sid);
        }

        async function moneyQueueMakeShortlink(id) {
            const p = moneyQueueFind(id);
            if (!p) return showToast('Produto não encontrado', 'error');
            const origin = p.affiliateLink || p.productLink || p.offerLink || '';
            if (!origin) return showToast('Sem link de afiliado', 'error');
            try {
                const res = await adminFetch(`${API_BASE}/api/shortlink`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        originUrl: origin,
                        itemId: Number(p.itemId || p.id),
                        subIds: p.subIds || undefined,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                p.shortLink = data.shortLink;
                showToast('Shortlink gerado', 'success');
                renderMoneyQueue();
                loadShortlinkStatus();
            } catch (err) {
                showToast(err.message || 'Falha no shortlink', 'error');
            }
        }

        function moneyQueueCopyLink(id) {
            const p = moneyQueueFind(id);
            if (!p) return;
            const link = p.shortLink || p.affiliateLink || p.productLink || '';
            if (!link) return showToast('Sem link', 'error');
            copyTextToClipboard(link, 'Link copiado');
        }

        function moneyQueueToExplorer(id) {
            const p = moneyQueueFind(id);
            if (!p) return;
            const words = String(p.title || '')
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .split(/[^a-z0-9]+/)
                .filter((t) => t.length > 3)
                .slice(0, 4)
                .join(' ');
            const kwEl = document.getElementById('admin-keyword');
            const lt = document.getElementById('admin-list-type');
            const st = document.getElementById('admin-sort-type');
            const rc = document.getElementById('admin-require-commission');
            if (kwEl) kwEl.value = words || p.keyword || 'vestido feminino';
            if (lt) lt.value = '1';
            if (st) st.value = '5';
            if (rc) rc.checked = true;
            if (p.shopId) {
                const shopEl = document.getElementById('admin-shop-id');
                if (shopEl) shopEl.value = String(p.shopId);
            }
            updateExplorerKwCount();
            updateExplorerModeHint();
            document.getElementById('admin-keyword')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('Keywords no Explorador — clique Pré-visualizar', 'success');
        }

        async function moneyQueueShortlinkTop() {
            const list = (window.__moneyQueue || sortByMoney(femaleOnly(productsDatabase)).slice(0, 20))
                .filter((p) => !p.shortLink);
            if (!list.length) {
                showToast('Top já tem shortlink', 'success');
                return renderMoneyQueue();
            }
            showToast(`Gerando shortlink em ${Math.min(list.length, 10)} produtos…`, 'info');
            for (const p of list.slice(0, 10)) {
                await moneyQueueMakeShortlink(p.itemId || p.id);
            }
        }

        async function renderAdminCategoriesPanel() {
            const box = document.getElementById('admin-categories-panel');
            if (!box) return;
            try {
                await loadCategoriesFromApi({ silent: true });
                const cats = (categories || []).filter((c) => c.id !== 'todos');
                if (!cats.length) {
                    box.innerHTML = '<p>Sem categorias da API.</p>';
                    return;
                }
                box.innerHTML = cats.map((c) => {
                    const fem = ['moda','beleza','acessorios','fitness','maternidade','saude','casa','presentes','pet','infantil'].includes(c.id);
                    const subs = (c.subcategories || []).map((s) =>
                        `<button type="button" onclick="loadCategoryKeywordsToExplorer('${c.id}','${s.id}')" class="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-100 hover:border-pink-300 text-slate-600">${escapeHtml(s.label)} <span class="text-slate-400">${s.count || 0}</span></button>`
                    ).join(' ');
                    return `<div class="mb-3 border-b border-slate-50 pb-3">
                        <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <span class="font-bold text-slate-700">${fem ? '♀' : '·'} ${escapeHtml(c.label)} <span class="text-slate-400 font-normal">${c.count || 0}</span></span>
                            <div class="flex gap-1">
                                <button type="button" onclick="loadCategoryKeywordsToExplorer('${c.id}')" class="px-2 py-1 rounded bg-pink-50 text-pink-700 text-[10px] font-bold hover:bg-pink-100">Keywords → Explorador</button>
                                <button type="button" onclick="document.getElementById('admin-cat-sync').value='${c.id}'; adminSyncCategory()" class="px-2 py-1 rounded bg-slate-800 text-white text-[10px] font-bold hover:bg-slate-700">Sync</button>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-1">${subs || '<span class="text-slate-400">Sem subs</span>'}</div>
                    </div>`;
                }).join('');
            } catch (err) {
                box.innerHTML = `<p class="text-rose-500">${escapeHtml(err.message)}</p>`;
            }
        }

        function loadCategoryKeywordsToExplorer(catId, subId) {
            const cat = categories.find((c) => c.id === catId);
            if (!cat) return showToast('Categoria não encontrada', 'error');
            let kws = [];
            const subs = subId
                ? (cat.subcategories || []).filter((s) => s.id === subId)
                : (cat.subcategories || []);
            for (const s of subs) {
                if (Array.isArray(s.keywords) && s.keywords.length) {
                    kws.push(...s.keywords.slice(0, 5));
                } else {
                    kws.push(`${s.label} feminino`.toLowerCase());
                }
            }
            // Cobertura (se já carregou) complementa com keywords femininas
            const cov = (window.__coverageReport?.categories || []).find((c) => c.id === catId);
            if (cov) {
                const covSubs = subId
                    ? (cov.subcategories || []).filter((s) => s.id === subId)
                    : (cov.subcategories || []);
                for (const s of covSubs) {
                    kws.push(...(s.femaleKeywords || s.keywords || []).slice(0, 3));
                }
            }
            kws = [...new Set(kws.map((k) => String(k).trim()).filter(Boolean))].slice(0, 15);
            const kwEl = document.getElementById('admin-keyword');
            const lt = document.getElementById('admin-list-type');
            const st = document.getElementById('admin-sort-type');
            const rc = document.getElementById('admin-require-commission');
            if (kwEl) kwEl.value = kws.join(', ');
            if (lt) lt.value = '1';
            if (st) st.value = '5';
            if (rc) rc.checked = true;
            updateExplorerKwCount();
            updateExplorerModeHint();
            document.getElementById('admin-keyword')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast(`${kws.length} keywords de ${cat.label} no Explorador`, 'success');
        }

        // Unified compatibility clipboard copier helper
        function copyTextToClipboard(text, successMsg) {
            const temp = document.createElement('textarea');
            temp.value = text;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            showToast(successMsg, "success");
        }

        // Custom interactive visual toast notification
        function showToast(message, type = "success") {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            
            const isSuccess = type === "success";
            const bgClass = isSuccess ? "bg-slate-900 border-shopee-orange" : "bg-red-600 border-red-500";
            const icon = isSuccess ? '<i class="fas fa-check-circle text-shopee-orange mr-2"></i>' : '<i class="fas fa-exclamation-triangle text-white mr-2"></i>';

            toast.className = `${bgClass} text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between border transition-all duration-300 transform translate-y-3 opacity-0 select-none pointer-events-auto`;
            toast.innerHTML = `
                <div class="flex items-center font-semibold">
                    ${icon}
                    <span>${message}</span>
                </div>
            `;

            container.appendChild(toast);

            // Pop animation trigger
            setTimeout(() => {
                toast.classList.remove('translate-y-3', 'opacity-0');
            }, 10);

            // Close timer
            setTimeout(() => {
                toast.classList.add('translate-y-3', 'opacity-0');
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, 4000);
        }
    