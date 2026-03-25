    const STORAGE_KEY = 'shopee_products';
    const DRAFTS_KEY = 'precificador_product_drafts';
    const APP_VERSION = 'Precificador_v1.49';
    const PROFILE_KEY = 'precificador_profile_v1';
    let currentDetailProductId = null;
    const NOTICE_KEY = 'precificador_notice_state';
    const SETTINGS_KEY = 'precificador_app_settings_v1';
    const COLUMN_PREFS_KEY = 'precificador_visible_columns_v149';
    const PANEL_PREFS_KEY = 'precificador_panel_visibility_v149';
    const TABLE_DENSITY_KEY = 'precificador_table_density_v149';
const THEME_KEY = 'precificador_theme_v149';
    const WORKSPACE_VIEW_KEY = 'precificador_workspace_view_v149';
    const FORM_FIELD_IDS = ['prod-id-custom', 'prod-nome', 'prod-sku', 'prod-custo', 'prod-margem', 'prod-preco-fixo', 'prod-lucro-desejado', 'prod-outros', 'prod-full', 'prod-desconto', 'prod-imposto', 'prod-afiliados', 'prod-roas', 'prod-categoria', 'prod-listing-type', 'prod-marketplace-rate', 'prod-marketplace-fixed'];
    const MONEY_FIELD_IDS = ['prod-custo', 'prod-preco-fixo', 'prod-lucro-desejado', 'prod-outros', 'prod-full', 'prod-marketplace-fixed'];
    let searchDebounceTimer = null;
    let isSavingProduct = false;
    let modalSnapshot = '';
    let confirmResolver = null;
    let mentorContext = { source: 'dashboard', productId: null };
    let activeMarketplace = 'todos';
    const DEFAULT_APP_SETTINGS = {
      shopeeBrackets: [
        { max: 79.99, rate: 20, fixed: 4 },
        { max: 99.99, rate: 14, fixed: 16 },
        { max: 199.99, rate: 14, fixed: 20 },
        { max: 499.99, rate: 14, fixed: 26 },
        { max: null, rate: 14, fixed: 26 }
      ],
      mercadoLivre: {
        classic: { rate: 16, fixed: 6 },
        premium: { rate: 19, fixed: 0 }
      },
      tiktok: {
        standard: { rate: 6, fixed: 2 }
      }
    };

    const storageLayer = {
      cache: new Map(),
      timers: new Map()
    };

    const calcCache = new Map();
    const renderState = {
      rafId: 0,
      dashboardTimer: 0
    };

    function cloneJSON(value) {
      return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function readJSONStorage(key, fallback) {
      if (storageLayer.cache.has(key)) return cloneJSON(storageLayer.cache.get(key));
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : fallback;
        storageLayer.cache.set(key, parsed);
        return cloneJSON(parsed);
      } catch {
        storageLayer.cache.set(key, fallback);
        return cloneJSON(fallback);
      }
    }

    function writeJSONStorage(key, value, { debounce = 120 } = {}) {
      storageLayer.cache.set(key, cloneJSON(value));
      clearTimeout(storageLayer.timers.get(key));
      const timer = setTimeout(() => {
        localStorage.setItem(key, JSON.stringify(storageLayer.cache.get(key)));
        storageLayer.timers.delete(key);
      }, debounce);
      storageLayer.timers.set(key, timer);
    }

    function flushJSONStorage(key) {
      if (!storageLayer.cache.has(key)) return;
      clearTimeout(storageLayer.timers.get(key));
      localStorage.setItem(key, JSON.stringify(storageLayer.cache.get(key)));
      storageLayer.timers.delete(key);
    }

    window.addEventListener('beforeunload', () => {
      for (const key of storageLayer.cache.keys()) flushJSONStorage(key);
    });

    function invalidateCalcCache() {
      calcCache.clear();
    }

    let appSettings = loadAppSettings();
    let mentorProfile = loadProfile();
    let products = safeLoadProducts();
    let drafts = safeLoadDrafts();
    let selectedProductIds = new Set();
    let lastVisibleProductIds = [];
    const DEFAULT_VISIBLE_COLUMNS = { product: true, marketplace: true, custo: true, target: true, preco: true, lucro: true, margem: true, status: true };
    const DEFAULT_PANEL_VISIBILITY = { compare: true, mentor: true, spy: true };
    let visibleColumns = loadVisibleColumns();
    let panelVisibility = loadPanelVisibility();
    let isCompactDensity = loadTableDensity();
    let currentTheme = loadTheme();
    let currentWorkspaceView = loadWorkspaceView();

    function loadProfile() {
      const parsed = readJSONStorage(PROFILE_KEY, {});
      return {
        marketplaces: Array.isArray(parsed.marketplaces) ? parsed.marketplaces : [],
        erp: typeof parsed.erp === 'string' ? parsed.erp : '',
        stage: typeof parsed.stage === 'string' ? parsed.stage : 'iniciante',
        logistics: typeof parsed.logistics === 'string' ? parsed.logistics : 'coleta',
        ads: typeof parsed.ads === 'string' ? parsed.ads : 'baixo',
        ticket: numberOrZero(parsed.ticket),
        pain: typeof parsed.pain === 'string' ? parsed.pain : ''
      };
    }

    function saveProfile(profile) {
      mentorProfile = {
        marketplaces: Array.isArray(profile.marketplaces) ? profile.marketplaces : [],
        erp: profile.erp || '',
        stage: profile.stage || 'iniciante',
        logistics: profile.logistics || 'coleta',
        ads: profile.ads || 'baixo',
        ticket: numberOrZero(profile.ticket),
        pain: profile.pain || ''
      };
      writeJSONStorage(PROFILE_KEY, mentorProfile, { debounce: 120 });
    }

    function getProfileFormData() {

      return {
        marketplaces: ['shopee','mercadolivre','tiktok','site'].filter((key) => document.getElementById(`profile-mp-${key}`)?.checked),
        erp: (document.getElementById('profile-erp')?.value || '').trim(),
        stage: document.getElementById('profile-stage')?.value || 'iniciante',
        logistics: document.getElementById('profile-logistics')?.value || 'coleta',
        ads: document.getElementById('profile-ads')?.value || 'baixo',
        ticket: parseLocaleNumber(document.getElementById('profile-ticket')?.value || 0) || 0,
        pain: (document.getElementById('profile-pain')?.value || '').trim()
      };
    }

    function fillProfileForm() {
      ['shopee','mercadolivre','tiktok','site'].forEach((key) => {
        const el = document.getElementById(`profile-mp-${key}`);
        if (el) el.checked = mentorProfile.marketplaces.includes(key);
      });
      if (document.getElementById('profile-erp')) document.getElementById('profile-erp').value = mentorProfile.erp || '';
      if (document.getElementById('profile-stage')) document.getElementById('profile-stage').value = mentorProfile.stage || 'iniciante';
      if (document.getElementById('profile-logistics')) document.getElementById('profile-logistics').value = mentorProfile.logistics || 'coleta';
      if (document.getElementById('profile-ads')) document.getElementById('profile-ads').value = mentorProfile.ads || 'baixo';
      if (document.getElementById('profile-ticket')) document.getElementById('profile-ticket').value = mentorProfile.ticket ? formatMoneyInputValue(mentorProfile.ticket) : '';
      if (document.getElementById('profile-pain')) document.getElementById('profile-pain').value = mentorProfile.pain || '';
    }

    function humanProfileList(list = []) {
      if (!list.length) return 'nenhum canal definido';
      return list.map((item) => item === 'mercadolivre' ? 'Mercado Livre' : item === 'tiktok' ? 'TikTok Shop' : item === 'site' ? 'site próprio' : 'Shopee').join(', ');
    }

    function buildProfileSummary(profile = mentorProfile) {
      const blocks = [];
      blocks.push(`Opera em ${humanProfileList(profile.marketplaces)}.`);
      if (profile.erp) blocks.push(`ERP: ${profile.erp}.`);
      blocks.push(`Momento: ${profile.stage}.`);
      blocks.push(`Logística: ${profile.logistics}.`);
      blocks.push(`Ads: ${profile.ads}.`);
      if (profile.ticket > 0) blocks.push(`Ticket alvo perto de ${fmt(profile.ticket)}.`);
      if (profile.pain) blocks.push(`Dor principal: ${profile.pain}.`);
      return blocks.join(' ');
    }


    function loadTheme() {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function saveTheme(theme) {
      currentTheme = theme === 'dark' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, currentTheme);
    }

    function applyTheme() {
      document.body.classList.toggle('theme-dark', currentTheme === 'dark');
      document.body.classList.toggle('theme-light', currentTheme !== 'dark');
      const icon = document.getElementById('theme-toggle-icon');
      const label = document.getElementById('theme-toggle-label');
      if (icon) icon.textContent = currentTheme === 'dark' ? '☾' : '☀︎';
      if (label) label.textContent = currentTheme === 'dark' ? 'Night' : 'Light';
    }

    function toggleTheme() {
      saveTheme(currentTheme === 'dark' ? 'light' : 'dark');
      applyTheme();
    }

    function loadWorkspaceView() {
      const saved = localStorage.getItem(WORKSPACE_VIEW_KEY);
      return saved === 'listings' ? 'listings' : 'products';
    }

    function saveWorkspaceView() {
      localStorage.setItem(WORKSPACE_VIEW_KEY, currentWorkspaceView);
    }

    function setWorkspaceView(view = 'products') {
      currentWorkspaceView = view === 'listings' ? 'listings' : 'products';
      saveWorkspaceView();
      const productsBtn = document.getElementById('workspace-view-products-btn');
      const listingsBtn = document.getElementById('workspace-view-listings-btn');
      const familiesWrap = document.getElementById('product-families-wrap');
      const listingsWrap = document.getElementById('products-table-wrap');
      if (productsBtn) productsBtn.classList.toggle('active', currentWorkspaceView === 'products');
      if (listingsBtn) listingsBtn.classList.toggle('active', currentWorkspaceView === 'listings');
      if (familiesWrap) familiesWrap.classList.toggle('hidden', currentWorkspaceView !== 'products');
      if (listingsWrap) listingsWrap.classList.toggle('hidden', currentWorkspaceView !== 'listings');
      const bulkBar = document.getElementById('bulk-bar');
      if (bulkBar && currentWorkspaceView !== 'listings') bulkBar.classList.add('hidden');
      const quickHint = document.querySelector('.quick-entry-help');
      if (quickHint) quickHint.textContent = currentWorkspaceView === 'products'
        ? 'Cadastre o produto base uma vez. Depois vincule Shopee, Mercado Livre e outros canais sem duplicar sua operação.'
        : 'Aqui você enxerga e ajusta cada anúncio/canal individualmente, com inline edit e auto-save.';
      renderProducts();
    }

    function toggleImportPanel() {
      const panel = document.getElementById('import-panel');
      if (panel) panel.classList.toggle('hidden');
    }

    function copyTextValue(value = '', label = 'Texto') {
      const safe = String(value || '').trim();
      if (!safe) {
        showToast(`Nada para copiar em ${label.toLowerCase()}.`, 'info');
        return;
      }
      navigator.clipboard?.writeText(safe).then(() => {
        showToast(`${label} copiado.`, 'success');
      }).catch(() => {
        const temp = document.createElement('input');
        temp.value = safe;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        temp.remove();
        showToast(`${label} copiado.`, 'success');
      });
    }

    function copySkuField() {
      const input = document.getElementById('prod-sku');
      if (!input) return;
      copyTextValue(input.value, 'SKU');
    }

    function parseCSVText(text = '') {
      const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const separator = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
      const rows = [];
      let current = [];
      let value = '';
      let inQuotes = false;
      const pushValue = () => { current.push(value.trim()); value = ''; };
      const pushRow = () => { rows.push(current); current = []; };
      for (const line of lines) {
        current = [];
        value = '';
        inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { value += '"'; i++; }
            else inQuotes = !inQuotes;
          } else if (ch === separator && !inQuotes) pushValue();
          else value += ch;
        }
        pushValue();
        pushRow();
      }
      return rows;
    }

    function resolveImportField(rowObj, keys) {
      for (const key of keys) {
        const found = Object.keys(rowObj).find((candidate) => candidate.includes(key));
        if (found && rowObj[found] != null && String(rowObj[found]).trim()) return rowObj[found];
      }
      return '';
    }

    function normalizeImportedMarketplace(value = '') {
      const v = String(value || '').toLowerCase();
      if (v.includes('mercado') || v.includes('ml')) return 'mercadolivre';
      if (v.includes('tik')) return 'tiktok';
      if (v.includes('shop')) return 'shopee';
      return activeMarketplace === 'todos' ? 'shopee' : activeMarketplace;
    }

    function importProductsCSV(event) {
      const file = event?.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rows = parseCSVText(String(reader.result || ''));
          if (rows.length < 2) {
            showToast('CSV vazio ou sem cabeçalho reconhecível.', 'error');
            return;
          }
          const headers = rows[0].map((item) => String(item || '').trim().toLowerCase());
          let imported = 0;
          rows.slice(1).forEach((row) => {
            const rowObj = {};
            headers.forEach((header, index) => rowObj[header] = row[index] || '');
            const nome = String(resolveImportField(rowObj, ['nome','titulo','title','produto']) || '').trim();
            const sku = String(resolveImportField(rowObj, ['sku','referencia','ref']) || '').trim();
            if (!nome && !sku) return;
            const marketplace = normalizeImportedMarketplace(resolveImportField(rowObj, ['marketplace','canal','loja','plataforma']));
            const custo = parseLocaleNumber(resolveImportField(rowObj, ['custo','cost','preco de custo'])) || 0;
            const preco = parseLocaleNumber(resolveImportField(rowObj, ['preco','price','valor','preço'])) || 0;
            const categoria = String(resolveImportField(rowObj, ['categoria','category']) || '').trim();
            const existing = products.find((item) => (
              sku && normalizeCompareValue(item.sku) === normalizeCompareValue(sku) && (item.marketplace || 'shopee') === marketplace
            ) || (
              !sku && normalizeCompareValue(item.nome) === normalizeCompareValue(nome) && (item.marketplace || 'shopee') === marketplace
            ));
            const payload = {
              nome: nome || sku || 'Produto importado',
              sku,
              marketplace,
              categoria,
              custo,
              margem: 20,
              modo: preco > 0 ? 'preco' : 'margem',
              precoVendaFixo: preco > 0 ? preco : '',
              idCustom: '', outros: 0, full: 0, desconto: 0, imposto: 0, afiliados: 0, roas: 0, listingType: 'classic', marketplaceRate: '', marketplaceFixed: ''
            };
            if (existing) Object.assign(existing, payload);
            else products.unshift(normalizeProduct({ id: Date.now() + Math.random(), ...payload }));
            imported += 1;
          });
          saveProducts();
          renderProducts();
          showToast(`${imported} item(ns) importado(s) do CSV.`, 'success');
        } catch (error) {
          console.error(error);
          showToast('Não foi possível importar este CSV.', 'error');
        } finally {
          if (event?.target) event.target.value = '';
        }
      };
      reader.readAsText(file, 'utf-8');
    }

    function getProductFamilies(list = products) {
      const groups = new Map();
      list.forEach((item) => {
        const key = normalizeCompareValue(item.sku || item.nome || `${item.id}`);
        const bucket = groups.get(key) || {
          key,
          nome: item.nome,
          sku: item.sku || '—',
          items: []
        };
        bucket.items.push({ ...item, _r: item._r || calcProduct(item) });
        if (!bucket.nome && item.nome) bucket.nome = item.nome;
        if ((bucket.sku === '—' || !bucket.sku) && item.sku) bucket.sku = item.sku;
        groups.set(key, bucket);
      });
      return Array.from(groups.values()).map((family) => {
        const priceValues = family.items.map((item) => numberOrZero(item._r.precoEfetivo)).filter((value) => value > 0);
        const marginValues = family.items.map((item) => numberOrZero(item._r.margemReal)).filter((value) => Number.isFinite(value));
        const custoBase = family.items.length ? Math.min(...family.items.map((item) => numberOrZero(item.custo))) : 0;
        const hasCritical = family.items.some((item) => item._r.inviavel || item._r.margemReal < 5);
        const hasWarning = family.items.some((item) => item._r.taxasPendentes || (item._r.margemReal >= 5 && item._r.margemReal < 12));
        return {
          ...family,
          channels: [...new Set(family.items.map((item) => item.marketplace || 'shopee'))],
          custoBase,
          bestPrice: priceValues.length ? Math.max(...priceValues) : 0,
          avgMargin: marginValues.length ? marginValues.reduce((acc, value) => acc + value, 0) / marginValues.length : 0,
          statusTone: hasCritical ? 'bad' : hasWarning ? 'warn' : 'good',
          statusText: hasCritical ? 'Crítico' : hasWarning ? 'Atenção' : 'Saudável'
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    function renderFamilyRow(family) {
      const channelChips = family.channels.map((channel) => `<span class="row-meta-chip">${esc(getMarketplaceLabel(channel))}</span>`).join(' ');
      return `
        <tr>
          <td>
            <div class="row-product-cell">
              <strong class="row-family-name">${esc(family.nome || 'Produto sem nome')}</strong>
              <div class="row-meta"><span class="row-meta-chip">${family.items.length} anúncio(s)</span></div>
            </div>
          </td>
          <td><div class="sku-inline"><span>${esc(family.sku || '—')}</span>${family.sku && family.sku !== '—' ? `<button type="button" class="sku-copy-inline" onclick="copyTextValue('${esc(family.sku)}','SKU')">Copiar</button>` : ''}</div></td>
          <td><div class="family-channel-list">${channelChips || '<span class="row-meta-chip">Sem canal</span>'}</div></td>
          <td class="grid-num">${fmt(family.custoBase)}</td>
          <td class="grid-num">${family.bestPrice ? fmt(family.bestPrice) : '—'}</td>
          <td class="grid-num"><span class="row-status ${family.statusTone}">${family.avgMargin ? `${family.avgMargin.toFixed(1)}%` : '—'}</span></td>
          <td><span class="row-status ${family.statusTone}">${family.statusText}</span></td>
          <td>
            <div class="row-actions family-actions">
              <button type="button" class="row-action-btn" onclick="openFamilyEdit('${family.key}')" title="Editar base">
                <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true"><path d="M4 20h4.2L18 10.2 13.8 6 4 15.8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m11.8 8 4.2 4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="row-action-btn" onclick="openFamilyListings('${family.key}')" title="Ver anúncios">
                <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.7"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }

    function openFamilyEdit(familyKey) {
      const match = products.find((item) => normalizeCompareValue(item.sku || item.nome || `${item.id}`) === familyKey);
      if (match) openModal(match.id);
    }

    function openFamilyListings(familyKey) {
      const match = products.find((item) => normalizeCompareValue(item.sku || item.nome || `${item.id}`) === familyKey);
      if (!match) return;
      const search = document.getElementById('search');
      if (search) search.value = match.sku || match.nome || '';
      setWorkspaceView('listings');
    }

    function buildMentorProfileTail(profile = mentorProfile) {
      if (!profile) return '';
      const tips = [];
      if (profile.erp) tips.push(`Como você usa ${profile.erp}, vale manter preço e estoque grudados no ERP para não vender margem errada.`);
      if (profile.stage === 'iniciante') tips.push('Sua leitura do Mentor vai priorizar blindar margem e evitar promoção torta antes de escalar volume.');
      if (profile.stage === 'escala') tips.push('Como sua operação já está em escala, o Mentor vai puxar mais para kit, Ads e defesa de canal com disciplina de margem.');
      if (profile.ads === 'baixo') tips.push('Como Ads ainda não é maduro, o foco fica em preço, reputação e conversão orgânica antes de acelerar tráfego.');
      if (profile.logistics === 'full') tips.push('Como você já opera Full/Fulfillment, monitore se a conveniência está pagando a mordida logística na margem.');
      if (profile.pain) tips.push(`Dor central anotada: ${profile.pain}.`);
      return tips.join(' ');
    }

    function updateProfileUI() {
      fillProfileForm();
      const summary = document.getElementById('profile-summary');
      if (summary) summary.textContent = buildProfileSummary();
      const badgeRow = document.getElementById('profile-channel-badges');
      const panelBadgeRow = document.getElementById('profile-panel-badges');
      const list = mentorProfile.marketplaces.length ? mentorProfile.marketplaces : ['none'];
      const labelize = (item) => item === 'none' ? 'Sem marketplaces definidos' : (item === 'mercadolivre' ? 'Mercado Livre' : item === 'tiktok' ? 'TikTok Shop' : item === 'site' ? 'Site próprio' : 'Shopee');
      if (badgeRow) {
        badgeRow.innerHTML = list.map((item) => `<span class="profile-mini-badge">${labelize(item)}</span>`).join('');
      }
      if (panelBadgeRow) {
        panelBadgeRow.innerHTML = list.map((item) => `<span class="profile-popover-pill">${labelize(item)}</span>`).join('');
      }
    }

    function saveProfileForm() {
      saveProfile(getProfileFormData());
      updateProfileUI();
      renderProducts();
      showToast('Perfil salvo. O Mentor já passa a falar com base na sua operação.', 'success');
    }

    function safeLoadProducts() {
      const parsed = readJSONStorage(STORAGE_KEY, []);
      return Array.isArray(parsed) ? parsed.map(normalizeProduct).filter(Boolean) : [];
    }

    function saveProducts({ immediate = false } = {}) {
      invalidateCalcCache();
      if (immediate) {
        storageLayer.cache.set(STORAGE_KEY, cloneJSON(products));
        flushJSONStorage(STORAGE_KEY);
        return;
      }
      writeJSONStorage(STORAGE_KEY, products, { debounce: 120 });
    }

    function safeLoadDrafts() {
      const parsed = readJSONStorage(DRAFTS_KEY, []);
      return Array.isArray(parsed) ? parsed.map(normalizeDraft).filter(Boolean) : [];
    }

    function saveDrafts({ immediate = false } = {}) {
      if (immediate) {
        storageLayer.cache.set(DRAFTS_KEY, cloneJSON(drafts));
        flushJSONStorage(DRAFTS_KEY);
        return;
      }
      writeJSONStorage(DRAFTS_KEY, drafts, { debounce: 120 });
    }


    function createBaseProduct(data = {}) {

      return {
        id: data.id || Date.now(),
        nome: data.nome || '',
        custo: numberOrZero(data.custo),
        modo: data.modo || 'margem',
        idCustom: data.idCustom || '',
        sku: data.sku || '',
        marketplace: data.marketplace || 'shopee',
        margem: data.margem ?? 20,
        precoVendaFixo: numberOrZero(data.precoVendaFixo),
        lucroDesejado: numberOrZero(data.lucroDesejado),
        outros: numberOrZero(data.outros),
        full: numberOrZero(data.full),
        desconto: numberOrZero(data.desconto),
        imposto: numberOrZero(data.imposto),
        afiliados: numberOrZero(data.afiliados),
        roas: numberOrZero(data.roas),
        categoria: data.categoria || '',
        listingType: data.listingType || 'classic',
        marketplaceRate: numberOrZero(data.marketplaceRate),
        marketplaceFixed: numberOrZero(data.marketplaceFixed)
      };
    }

    function addProductRecord(data = {}) {
      const product = createBaseProduct({ ...data, id: data.id || (Date.now() + Math.floor(Math.random() * 1000)) });
      products.push(product);
      invalidateCalcCache();
      syncSelectedProducts();
      return product;
    }

    function updateProductRecord(id, updates = {}) {
      const index = products.findIndex((item) => item.id === id);
      if (index === -1) return null;
      products[index] = createBaseProduct({ ...products[index], ...updates, id });
      invalidateCalcCache();
      return products[index];
    }

    function syncSelectedProducts() {
      const validIds = new Set(products.map((item) => item.id));
      selectedProductIds = new Set([...selectedProductIds].filter((id) => validIds.has(id)));
    }

    function loadVisibleColumns() {
      const parsed = readJSONStorage(COLUMN_PREFS_KEY, {});
      return { ...DEFAULT_VISIBLE_COLUMNS, ...(parsed || {}) };
    }

    function saveVisibleColumns() {
      writeJSONStorage(COLUMN_PREFS_KEY, visibleColumns, { debounce: 120 });
    }

    function loadPanelVisibility() {
      const parsed = readJSONStorage(PANEL_PREFS_KEY, {});
      return { ...DEFAULT_PANEL_VISIBILITY, ...(parsed || {}) };
    }

    function savePanelVisibility() {
      writeJSONStorage(PANEL_PREFS_KEY, panelVisibility, { debounce: 120 });
    }

    function loadTableDensity() {
      const stored = localStorage.getItem(TABLE_DENSITY_KEY);
      if (!stored) return true;
      return stored === 'compact';
    }

    function saveTableDensity() {
      localStorage.setItem(TABLE_DENSITY_KEY, isCompactDensity ? 'compact' : 'comfortable');
    }

    function cloneDefaultSettings() {
      return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
    }

    function normalizeBracketLabel(brackets, index) {
      const current = brackets[index] || {};
      const prev = index > 0 ? brackets[index - 1] : null;
      const currentMax = current.max == null || current.max === '' ? Infinity : numberOrZero(current.max);
      const prevMax = prev ? numberOrZero(prev.max) : 0;
      if (index === 0) return `até ${fmt(currentMax)}`;
      if (!Number.isFinite(currentMax) || current.max == null || current.max === '') return `acima de ${fmt(prevMax + 0.01)}`;
      return `${fmt(prevMax + 0.01)} ~ ${fmt(currentMax)}`;
    }

    function normalizeSettings(raw) {
      const base = cloneDefaultSettings();
      const input = raw && typeof raw === 'object' ? raw : {};
      const rows = Array.isArray(input.shopeeBrackets) ? input.shopeeBrackets : base.shopeeBrackets;
      base.shopeeBrackets = rows.slice(0, 5).map((row, index) => ({
        max: index === 4 ? (row?.max == null || row?.max === '' ? null : numberOrZero(row.max)) : numberOrZero(row?.max ?? base.shopeeBrackets[index].max),
        rate: numberOrZero(row?.rate ?? base.shopeeBrackets[index].rate),
        fixed: numberOrZero(row?.fixed ?? base.shopeeBrackets[index].fixed)
      }));
      while (base.shopeeBrackets.length < 5) base.shopeeBrackets.push(cloneDefaultSettings().shopeeBrackets[base.shopeeBrackets.length]);
      base.mercadoLivre.classic.rate = numberOrZero(input?.mercadoLivre?.classic?.rate ?? base.mercadoLivre.classic.rate);
      base.mercadoLivre.classic.fixed = numberOrZero(input?.mercadoLivre?.classic?.fixed ?? base.mercadoLivre.classic.fixed);
      base.mercadoLivre.premium.rate = numberOrZero(input?.mercadoLivre?.premium?.rate ?? base.mercadoLivre.premium.rate);
      base.mercadoLivre.premium.fixed = numberOrZero(input?.mercadoLivre?.premium?.fixed ?? base.mercadoLivre.premium.fixed);
      base.tiktok.standard.rate = numberOrZero(input?.tiktok?.standard?.rate ?? base.tiktok.standard.rate);
      base.tiktok.standard.fixed = numberOrZero(input?.tiktok?.standard?.fixed ?? base.tiktok.standard.fixed);
      return base;
    }

    function loadAppSettings() {
      const raw = readJSONStorage(SETTINGS_KEY, null);
      return normalizeSettings(raw);
    }

    function persistAppSettings(next) {
      appSettings = normalizeSettings(next);
      invalidateCalcCache();
      writeJSONStorage(SETTINGS_KEY, appSettings, { debounce: 120 });
      renderProducts();
      calcPreview();
      updateSaveButtonState();
      return appSettings;
    }

    function getShopeeBrackets() {
      return normalizeSettings(appSettings).shopeeBrackets.map((row, index, arr) => ({
        ...row,
        label: normalizeBracketLabel(arr, index)
      }));
    }

    function ensureSettingsRows() {
      const holder = document.getElementById('settings-shopee-rows');
      if (!holder || holder.childElementCount) return;
      holder.innerHTML = Array.from({ length: 5 }, (_, index) => `
        <div class="grid grid-cols-[1.1fr,1fr,1fr] gap-3">
          <input id="settings-shopee-${index}-max" class="apple-input" type="text" inputmode="decimal" placeholder="${index === 4 ? 'Sem limite' : 'Até'}" />
          <input id="settings-shopee-${index}-rate" class="apple-input" type="number" step="0.1" min="0" placeholder="Taxa %" />
          <input id="settings-shopee-${index}-fixed" class="apple-input" type="text" inputmode="decimal" placeholder="Taxa fixa" />
        </div>
      `).join('');
    }

    function fillSettingsModal() {
      ensureSettingsRows();
      const settings = normalizeSettings(appSettings);
      settings.shopeeBrackets.forEach((row, index) => {
        document.getElementById(`settings-shopee-${index}-max`).value = row.max == null ? '' : formatMoneyInputValue(row.max);
        document.getElementById(`settings-shopee-${index}-rate`).value = row.rate ?? '';
        document.getElementById(`settings-shopee-${index}-fixed`).value = formatMoneyInputValue(row.fixed);
      });
      document.getElementById('settings-ml-classic-rate').value = settings.mercadoLivre.classic.rate;
      setInputMoneyValue('settings-ml-classic-fixed', settings.mercadoLivre.classic.fixed);
      document.getElementById('settings-ml-premium-rate').value = settings.mercadoLivre.premium.rate;
      setInputMoneyValue('settings-ml-premium-fixed', settings.mercadoLivre.premium.fixed);
      document.getElementById('settings-tiktok-rate').value = settings.tiktok.standard.rate;
      setInputMoneyValue('settings-tiktok-fixed', settings.tiktok.standard.fixed);
    }

    function openSettingsModal() {
      fillSettingsModal();
      const el = document.getElementById('settings-modal');
      el.classList.remove('hidden');
      el.classList.add('flex');
      focusFirstInContainer(el);
    }

    function closeSettingsModal() {
      const el = document.getElementById('settings-modal');
      el.classList.add('hidden');
      el.classList.remove('flex');
    }

    function saveSettingsFromModal() {
      ensureSettingsRows();
      const next = {
        shopeeBrackets: Array.from({ length: 5 }, (_, index) => ({
          max: index === 4 ? null : parseLocaleNumber(document.getElementById(`settings-shopee-${index}-max`).value),
          rate: parseLocaleNumber(document.getElementById(`settings-shopee-${index}-rate`).value),
          fixed: parseLocaleNumber(document.getElementById(`settings-shopee-${index}-fixed`).value)
        })),
        mercadoLivre: {
          classic: {
            rate: parseLocaleNumber(document.getElementById('settings-ml-classic-rate').value),
            fixed: parseLocaleNumber(document.getElementById('settings-ml-classic-fixed').value)
          },
          premium: {
            rate: parseLocaleNumber(document.getElementById('settings-ml-premium-rate').value),
            fixed: parseLocaleNumber(document.getElementById('settings-ml-premium-fixed').value)
          }
        },
        tiktok: {
          standard: {
            rate: parseLocaleNumber(document.getElementById('settings-tiktok-rate').value),
            fixed: parseLocaleNumber(document.getElementById('settings-tiktok-fixed').value)
          }
        }
      };
      persistAppSettings(next);
      closeSettingsModal();
      showToast('Configurações salvas.', 'success');
    }

    function resetSettingsToDefault() {
      fillSettingsModal();
      persistAppSettings(cloneDefaultSettings());
      fillSettingsModal();
      showToast('Configurações restauradas para o padrão.', 'info');
    }


    function normalizeDraft(draft) {
      if (!draft || typeof draft !== 'object') return null;
      return {
        draftId: typeof draft.draftId === 'string' && draft.draftId ? draft.draftId : `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        editId: '',
        idCustom: draft.idCustom ? String(draft.idCustom).trim() : '',
        nome: draft.nome ? String(draft.nome).trim() : '',
        sku: draft.sku ? String(draft.sku).trim() : '',
        custo: draft.custo ?? '',
        marketplace: ['shopee', 'mercadolivre', 'tiktok'].includes(draft.marketplace) ? draft.marketplace : 'shopee',
        modo: ['margem', 'preco', 'lucro'].includes(draft.modo) ? draft.modo : 'margem',
        margem: draft.margem ?? '',
        precoVendaFixo: draft.precoVendaFixo ?? '',
        lucroDesejado: draft.lucroDesejado ?? '',
        outros: draft.outros ?? '',
        full: draft.full ?? '',
        desconto: draft.desconto ?? '',
        imposto: draft.imposto ?? '',
        afiliados: draft.afiliados ?? '',
        roas: draft.roas ?? '',
        categoria: draft.categoria ? String(draft.categoria).trim() : '',
        listingType: ['classic', 'premium'].includes(draft.listingType) ? draft.listingType : 'classic',
        marketplaceRate: draft.marketplaceRate ?? '',
        marketplaceFixed: draft.marketplaceFixed ?? '',
        updatedAt: Number.isFinite(Number(draft.updatedAt)) ? Number(draft.updatedAt) : Date.now()
      };
    }

    function getDraftById(draftId) {
      return drafts.find((draft) => draft.draftId === draftId) || null;
    }

    function removeDraftById(draftId) {
      if (!draftId) return;
      drafts = drafts.filter((draft) => draft.draftId !== draftId);
      saveDrafts();
      renderDrafts();
    }

    function normalizeCompareValue(value) {
      return String(value ?? '').trim().toLowerCase();
    }

    function renderDraftCard(draft) {
      const title = draft.nome || 'Rascunho sem nome';
      const updated = new Date(draft.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const idChip = draft.idCustom ? `<span class="meta-chip"><span>ID</span><strong>${esc(draft.idCustom)}</strong></span>` : '';
      const skuChip = draft.sku ? `<span class="meta-chip"><span>SKU</span><strong>${esc(draft.sku)}</strong></span>` : '';
      const marketplaceChip = `<span class="meta-chip"><span>Marketplace</span><strong>${esc(getMarketplaceLabel(draft.marketplace || 'shopee'))}</strong></span>`;
      return `
        <article class="draft-card">
          <div class="draft-card-head">
            <div class="min-w-0">
              <h3 class="draft-card-title truncate">${esc(title)}</h3>
              <p class="mt-2 text-sm text-slate-500">Atualizado em ${updated}</p>
            </div>
            <span class="tag tag-neutral">Rascunho</span>
          </div>
          <div class="draft-card-meta">
            ${idChip}
            ${skuChip}
            ${marketplaceChip}
          </div>
          <div class="draft-card-footer">
            <p class="text-sm text-slate-500">Abra quando quiser para continuar o cadastro.</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" onclick="openDraft('${esc(draft.draftId)}')" class="btn btn-secondary !rounded-[16px] !px-4 !py-3">Continuar</button>
              <button type="button" onclick="deleteDraft('${esc(draft.draftId)}')" class="btn btn-danger !rounded-[16px] !px-4 !py-3">Excluir</button>
            </div>
          </div>
        </article>
      `;
    }

    function setModalSaveLabel(label) {
      document.querySelectorAll('[data-save-label]').forEach((btn) => {
        const textEl = btn.querySelector('.btn-text');
        if (textEl) textEl.textContent = label;
        else btn.textContent = label;
      });
    }

    function getRequiredFieldError(prod) {
      if (!prod.idCustom.trim()) return 'Preencha o ID do anúncio.';
      if (!prod.nome.trim()) return 'Preencha o nome do produto.';
      if (!prod.sku.trim()) return 'Preencha o SKU.';
      if (!prod.custo || prod.custo <= 0) return 'Preencha um custo válido.';
      if (prod.modo === 'margem' && (!Number.isFinite(prod.margem) || prod.margem <= 0)) return 'Informe a margem de lucro.';
      if (prod.modo === 'preco' && (!prod.precoVendaFixo || prod.precoVendaFixo <= 0)) return 'Informe o preço de venda.';
      if (prod.modo === 'lucro' && (!prod.lucroDesejado || prod.lucroDesejado <= 0)) return 'Informe o lucro desejado.';
      return '';
    }

    function updateSaveButtonState() {
      const btn = document.getElementById('modal-save-btn');
      if (!btn) return;
      const modo = document.querySelector('.modo-btn.modo-active')?.id?.replace('modo-', '') || 'margem';
      const prod = {
        nome: document.getElementById('prod-nome').value.trim(),
        custo: parseLocaleNumber(document.getElementById('prod-custo').value),
        modo,
        idCustom: document.getElementById('prod-id-custom').value.trim(),
        sku: document.getElementById('prod-sku').value.trim(),
        marketplace: document.getElementById('prod-marketplace').value,
        margem: parseLocaleNumber(document.getElementById('prod-margem').value) || 0,
        precoVendaFixo: parseLocaleNumber(document.getElementById('prod-preco-fixo').value) || 0,
        lucroDesejado: parseLocaleNumber(document.getElementById('prod-lucro-desejado').value) || 0,
        outros: parseLocaleNumber(document.getElementById('prod-outros').value) || 0,
        full: parseLocaleNumber(document.getElementById('prod-full').value) || 0,
        desconto: parseLocaleNumber(document.getElementById('prod-desconto').value) || 0,
        imposto: parseLocaleNumber(document.getElementById('prod-imposto').value) || 0,
        afiliados: parseLocaleNumber(document.getElementById('prod-afiliados').value) || 0,
        roas: parseLocaleNumber(document.getElementById('prod-roas').value) || 0,
        categoria: document.getElementById('prod-categoria').value.trim(),
        listingType: document.getElementById('prod-listing-type').value,
        marketplaceRate: parseLocaleNumber(document.getElementById('prod-marketplace-rate').value) || 0,
        marketplaceFixed: parseLocaleNumber(document.getElementById('prod-marketplace-fixed').value) || 0
      };

      const error = getRequiredFieldError(prod);
      btn.disabled = !!error;
      btn.title = error || '';
    }

    function renderDrafts() {
      const panel = document.getElementById('drafts-panel');
      const grid = document.getElementById('drafts-grid');
      const badge = document.getElementById('drafts-count-badge');
      const isEditingProduct = !!(document.getElementById('edit-id')?.value || '');
      if (!panel || !grid || !badge) return;
      if (isEditingProduct || !drafts.length || document.getElementById('modal')?.dataset.mode === 'edit') {
        panel.classList.add('hidden');
        grid.innerHTML = '';
        badge.textContent = '0 rascunhos';
        return;
      }
      panel.classList.remove('hidden');
      const ordered = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
      badge.textContent = pluralize(ordered.length, 'rascunho', 'rascunhos');
      grid.innerHTML = ordered.map((draft) => renderDraftCard(draft)).join('');
    }

    function normalizeProduct(prod) {
      if (!prod || typeof prod !== 'object') return null;
      return {
        id: Number.isFinite(Number(prod.id)) ? Number(prod.id) : Date.now() + Math.floor(Math.random() * 1000),
        nome: typeof prod.nome === 'string' ? prod.nome : '',
        custo: numberOrZero(prod.custo),
        modo: typeof prod.modo === 'string' ? prod.modo : 'margem',
        idCustom: typeof prod.idCustom === 'string' ? prod.idCustom : '',
        sku: typeof prod.sku === 'string' ? prod.sku : '',
        marketplace: ['shopee', 'mercadolivre', 'tiktok'].includes(prod.marketplace) ? prod.marketplace : 'shopee',
        margem: numberOrZero(prod.margem),
        precoVendaFixo: numberOrZero(prod.precoVendaFixo),
        lucroDesejado: numberOrZero(prod.lucroDesejado),
        outros: numberOrZero(prod.embalagem ?? prod.outros),
        full: numberOrZero(prod.full),
        desconto: numberOrZero(prod.desconto),
        imposto: numberOrZero(prod.imposto),
        afiliados: numberOrZero(prod.afiliados),
        roas: numberOrZero(prod.roas),
        categoria: typeof prod.categoria === 'string' ? prod.categoria : '',
        listingType: ['classic', 'premium'].includes(prod.listingType) ? prod.listingType : 'classic',
        marketplaceRate: numberOrZero(prod.marketplaceRate),
        marketplaceFixed: numberOrZero(prod.marketplaceFixed)
      };
    }

    function parseLocaleNumber(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      let raw = String(value ?? '').trim();
      if (!raw) return 0;
      raw = raw.replace(/R\$\s?/gi, '').replace(/\s+/g, '');
      if (raw.includes(',') && raw.includes('.')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
      } else if (raw.includes(',')) {
        raw = raw.replace(/\./g, '').replace(',', '.');
      } else if ((raw.match(/\./g) || []).length > 1) {
        raw = raw.replace(/\./g, '');
      }
      raw = raw.replace(/[^\d.-]/g, '');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }

    function numberOrZero(value) {
      return parseLocaleNumber(value);
    }

    function formatMoneyInputValue(value) {
      if (value === null || value === undefined || String(value).trim() === '') return '';
      return Number(parseLocaleNumber(value)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function maskMoneyValue(rawValue) {
      const raw = String(rawValue ?? '').trim();
      if (!raw) return '';
      const digits = raw.replace(/\D/g, '');
      if (!digits) return '';
      const value = Number(digits) / 100;
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function handleMoneyTyping(el) {
      if (!el) return;
      const masked = maskMoneyValue(el.value);
      el.value = masked;
      try {
        const end = el.value.length;
        el.setSelectionRange(end, end);
      } catch {}
    }

    function setInputMoneyValue(id, value) {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = formatMoneyInputValue(value);
    }

    function formatMoneyField(el) {
      if (!el) return;
      const raw = String(el.value ?? '').trim();
      if (!raw) {
        el.value = '';
        return;
      }
      el.value = formatMoneyInputValue(raw);
    }

    function handleSearchInput() {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        renderProducts();
      }, 260);
    }

    function getSessionDisplayName() {
      const username = getLocalSessionUser();
      if (!username || username === 'guest') return '';
      return username;
    }

    function updateSessionBadge() {
      const username = getSessionDisplayName();
      const modeText = !username ? 'Faça login para operar.' : 'Conta local ativa neste navegador';
      const avatarText = (username || 'PR').slice(0, 2).toUpperCase();

      const profileLabel = document.getElementById('profile-session-user');
      const profileMode = document.getElementById('profile-session-mode');
      const profileAvatar = document.getElementById('profile-session-avatar');
      const logoutBtn = document.getElementById('profile-logout-btn');
      if (profileLabel) profileLabel.textContent = username || 'Sem sessão';
      if (profileMode) profileMode.textContent = modeText;
      if (profileAvatar) profileAvatar.textContent = avatarText;
      if (logoutBtn) logoutBtn.classList.toggle('hidden', !username);

      const headerName = document.getElementById('header-profile-name');
      const headerSub = document.getElementById('header-profile-sub');
      const headerAvatar = document.getElementById('header-profile-avatar');
      const panelName = document.getElementById('profile-panel-name');
      const panelCopy = document.getElementById('profile-panel-copy');
      const panelAvatar = document.getElementById('profile-panel-avatar');

      if (headerName) headerName.textContent = username || 'Perfil';
      if (headerSub) headerSub.textContent = username ? 'Conta ativa' : 'Conta, ajustes e logout';
      if (headerAvatar) headerAvatar.textContent = avatarText;
      if (panelName) panelName.textContent = username || 'Sem sessão';
      if (panelCopy) panelCopy.textContent = username ? modeText : 'Abra perfil, ajustes e logout num lugar só, sem poluir a home.';
      if (panelAvatar) panelAvatar.textContent = avatarText;
    }

    function closeProfileMenu() {
      const wrap = document.getElementById('header-profile-menu');
      const trigger = document.getElementById('header-profile-trigger');
      if (!wrap) return;
      wrap.classList.remove('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function toggleProfileMenu(event) {
      if (event) event.stopPropagation();
      const wrap = document.getElementById('header-profile-menu');
      const trigger = document.getElementById('header-profile-trigger');
      if (!wrap) return;
      const willOpen = !wrap.classList.contains('open');
      closeProfileMenu();
      if (willOpen) {
        wrap.classList.add('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
      }
    }

    function openProfileModal() {
      closeProfileMenu();
      const el = document.getElementById('profile-modal');
      if (!el) return;
      el.classList.remove('hidden');
      el.classList.add('flex');
      focusFirstInContainer(el);
    }

    function closeProfileModal() {
      const el = document.getElementById('profile-modal');
      if (!el) return;
      el.classList.add('hidden');
      el.classList.remove('flex');
    }

    function openProfileModalFromMenu() {
      openProfileModal();
    }

    function openSettingsFromMenu() {
      closeProfileMenu();
      openSettingsModal();
    }

    function logoutFromMenu() {
      closeProfileMenu();
      logoutSimpleAccount();
    }

    function logoutFromProfileModal() {
      closeProfileModal();
      logoutSimpleAccount();
    }

    function animateMetricFeedback(target, tone = 'good') {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (!el) return;
      el.classList.remove('metric-pulse-good', 'metric-pulse-bad');
      void el.offsetWidth;
      el.classList.add(tone === 'bad' ? 'metric-pulse-bad' : 'metric-pulse-good');
      setTimeout(() => el.classList.remove('metric-pulse-good', 'metric-pulse-bad'), 650);
    }

    function setAnimatedText(target, textValue, tone = 'good') {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (!el) return;
      el.textContent = textValue;
      animateMetricFeedback(el, tone);
    }

    function setAnimatedHTML(target, html, tone = 'good') {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (!el) return;
      el.innerHTML = html;
      animateMetricFeedback(el, tone);
    }

    function setButtonLoading(btn, loading) {
      if (!btn) return;
      if (loading) {
        btn.dataset.prevHtml = btn.innerHTML;
        btn.classList.add('btn-loading');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span class="btn-text">Salvando...</span>';
      } else {
        btn.classList.remove('btn-loading');
        if (btn.dataset.prevHtml) {
          btn.innerHTML = btn.dataset.prevHtml;
          delete btn.dataset.prevHtml;
        }
        updateSaveButtonState();
      }
    }

    function getFocusableElements(root) {
      if (!root) return [];
      return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden') && el.offsetParent !== null);
    }

    function focusFirstInContainer(container) {
      if (!container) return;
      const root = container.querySelector('.modal-shell, .notice-shell, #confirm-shell, .access-panel, .access-shell') || container;
      const focusables = getFocusableElements(root);
      if (focusables.length) {
        setTimeout(() => focusables[0].focus(), 20);
      } else {
        root.setAttribute('tabindex', '-1');
        setTimeout(() => root.focus(), 20);
      }
    }

    function getActiveFocusTrapRoot() {
      const candidates = [
        document.querySelector('#confirm-popup:not(.hidden) #confirm-shell'),
        document.querySelector('#mentor-popup:not(.hidden) .modal-shell'),
        document.querySelector('#profile-modal:not(.hidden) .modal-shell'),
        document.querySelector('#settings-modal:not(.hidden) .modal-shell'),
        document.querySelector('#notice-popup:not(.hidden) .notice-shell'),
        document.querySelector('#modal-detail:not(.hidden) .modal-shell'),
        document.querySelector('#modal:not(.hidden) .modal-shell'),
        document.querySelector('#access-gate:not(.hidden) .access-panel')
      ];
      return candidates.find(Boolean) || null;
    }

    function trapFocusOnTab(event) {
      if (event.key !== 'Tab') return;
      const root = getActiveFocusTrapRoot();
      if (!root) return;
      const focusables = getFocusableElements(root);
      if (!focusables.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function esc(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function fmt(v) {
      return 'R$ ' + numberOrZero(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function pluralize(count, singular, plural) {
      return `${count} ${count === 1 ? singular : plural}`;
    }

    function setDeltaText(id, text, tone = 'neutral') {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.className = `dash-delta ${tone}`;
    }

    function rememberInlineInitial(el) {
      if (!el) return;
      el.dataset.initial = el.value;
    }

    function resetInlineField(el) {
      if (!el || typeof el.dataset.initial === 'undefined') return;
      el.value = el.dataset.initial;
    }

    function handleInlineKeydown(event, el) {
      if (event.key === 'Enter') {
        event.preventDefault();
        el.blur();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        resetInlineField(el);
        el.blur();
      }
    }

    function moveGridFocus(currentEl, direction) {
      const row = currentEl.closest('tr');
      if (!row) return;
      const rows = Array.from(document.querySelectorAll('#products-grid tr[data-product-id]'));
      const currentRowIndex = rows.indexOf(row);
      const currentCol = currentEl.getAttribute('data-grid-col');
      const colOrder = ['nome', 'marketplace', 'custo', 'margem'];
      const currentColIndex = colOrder.indexOf(currentCol);
      if (currentRowIndex === -1 || currentColIndex === -1) return;

      let nextRowIndex = currentRowIndex;
      let nextColIndex = currentColIndex;

      if (direction === 'right') nextColIndex += 1;
      if (direction === 'left') nextColIndex -= 1;
      if (direction === 'down') nextRowIndex += 1;
      if (direction === 'up') nextRowIndex -= 1;
      if (nextColIndex < 0 || nextColIndex >= colOrder.length) return;

      const nextRow = rows[nextRowIndex];
      if (!nextRow) return;

      const selector = `[data-grid-col="${colOrder[nextColIndex]}"]`;
      const nextField = nextRow.querySelector(selector);
      if (nextField) nextField.focus();
    }

    function handleGridNavigation(event, el) {
      const allowed = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'];
      if (!allowed.includes(event.key)) return;
      if (!(event.altKey || event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const map = {
        ArrowRight: 'right',
        ArrowLeft: 'left',
        ArrowDown: 'down',
        ArrowUp: 'up'
      };
      moveGridFocus(el, map[event.key]);
    }

    function showAutosaveStamp(message = 'Alteração salva automaticamente.') {
      const el = document.getElementById('autosave-indicator');
      if (!el) return;
      el.textContent = message;
      el.classList.add('autosave-flash');
      clearTimeout(showAutosaveStamp._timer);
      showAutosaveStamp._timer = setTimeout(() => {
        el.textContent = 'Auto-save ativo para edição inline.';
        el.classList.remove('autosave-flash');
      }, 1400);
    }

    function commitInlineUpdate(id, updates, feedback = 'Alteração salva automaticamente.') {
      const current = products.find((item) => item.id === id);
      if (!current) return false;
      const next = createBaseProduct({ ...current, ...updates, id });
      const validationError = validateProduct(next, id, '');
      if (validationError) {
        showToast(validationError, 'error');
        renderProducts();
        return false;
      }
      updateProductRecord(id, updates);
      saveProducts();
      if (!patchRenderedProductRow(id)) renderProducts();
      showAutosaveStamp(feedback);
      return true;
    }

    function saveInlineText(id, field, value, el) {
      const nextValue = String(value || '').trim();
      if (!nextValue) {
        showToast('Esse campo não pode ficar vazio.', 'error');
        resetInlineField(el);
        return;
      }
      if (el && el.dataset.initial === nextValue) return;
      commitInlineUpdate(id, { [field]: nextValue });
    }

    function saveInlineNumber(id, field, value, mode = null, el = null) {
      const parsed = parseLocaleNumber(value || 0);
      const current = products.find((item) => item.id === id);
      if (!current) return;
      if (Number(current[field] || 0) === Number(parsed || 0) && (!mode || current.modo === mode)) return;
      const updates = { [field]: parsed || 0 };
      if (mode) updates.modo = mode;
      commitInlineUpdate(id, updates);
    }

    function saveInlineMoney(id, field, value, el) {
      const parsed = parseLocaleNumber(value || 0) || 0;
      const current = products.find((item) => item.id === id);
      if (!current) return;
      if (Number(current[field] || 0) === Number(parsed)) {
        if (el) el.value = formatMoneyInputValue(parsed);
        return;
      }
      commitInlineUpdate(id, { [field]: parsed });
    }

    function saveInlineSelect(id, field, value) {
      const current = products.find((item) => item.id === id);
      if (!current) return;
      if ((current[field] || '') === value) return;
      commitInlineUpdate(id, { [field]: value });
    }

    function renderMarketplaceOptions(selected) {
      return ['shopee', 'mercadolivre', 'tiktok'].map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${esc(getMarketplaceLabel(value))}</option>`).join('');
    }


    function getBracket(preco) {
      const brackets = getShopeeBrackets();
      return brackets.find((b) => preco <= (b.max == null ? Infinity : numberOrZero(b.max))) || brackets[brackets.length - 1];
    }

    function resolveMarketplaceFeeConfig(prod, precoEfetivo) {
      const marketplace = prod.marketplace || 'shopee';
      const manualRate = numberOrZero(prod.marketplaceRate);
      const manualFixed = numberOrZero(prod.marketplaceFixed);

      if (marketplace === 'shopee') {
        const bracket = getBracket(precoEfetivo);
        return {
          rate: numberOrZero(bracket.rate) / 100,
          fixed: numberOrZero(bracket.fixed),
          label: bracket.label,
          bracket
        };
      }

      if (marketplace === 'mercadolivre') {
        const listingType = (prod.listingType === 'premium' ? 'premium' : 'classic');
        const preset = appSettings?.mercadoLivre?.[listingType] || DEFAULT_APP_SETTINGS.mercadoLivre[listingType];
        const ratePercent = manualRate > 0 ? manualRate : numberOrZero(preset.rate);
        const fixedFee = manualFixed > 0 ? manualFixed : numberOrZero(preset.fixed);
        const label = `${listingType === 'premium' ? 'Premium' : 'Clássico'}${manualRate > 0 || manualFixed > 0 ? ' • manual' : ''}`;
        return {
          rate: ratePercent / 100,
          fixed: fixedFee,
          label,
          bracket: { label }
        };
      }

      const preset = appSettings?.tiktok?.standard || DEFAULT_APP_SETTINGS.tiktok.standard;
      const ratePercent = manualRate > 0 ? manualRate : numberOrZero(preset.rate);
      const fixedFee = manualFixed > 0 ? manualFixed : numberOrZero(preset.fixed);
      const label = `TikTok padrão${manualRate > 0 || manualFixed > 0 ? ' • manual' : ''}`;
      return {
        rate: ratePercent / 100,
        fixed: fixedFee,
        label,
        bracket: { label }
      };
    }

    function getCalcCacheKey(prod) {
      return [
        prod.marketplace || 'shopee',
        prod.listingType || 'classic',
        numberOrZero(prod.marketplaceRate),
        numberOrZero(prod.marketplaceFixed),
        numberOrZero(prod.custo),
        numberOrZero(prod.margem),
        numberOrZero(prod.precoVendaFixo),
        numberOrZero(prod.lucroDesejado),
        numberOrZero(prod.outros),
        numberOrZero(prod.full),
        numberOrZero(prod.desconto),
        numberOrZero(prod.imposto),
        numberOrZero(prod.afiliados),
        numberOrZero(prod.roas),
        prod.modo || 'margem'
      ].join('|');
    }

    function getFeeConfigMemo(prod, precoEfetivo, feeMemo) {
      const mp = prod.marketplace || 'shopee';
      const bracketKey = mp === 'shopee'
        ? (getBracket(precoEfetivo)?.label || 'default')
        : `${mp}|${prod.listingType || 'classic'}|${numberOrZero(prod.marketplaceRate)}|${numberOrZero(prod.marketplaceFixed)}`;

      if (!feeMemo.has(bracketKey)) {
        feeMemo.set(bracketKey, resolveMarketplaceFeeConfig(prod, precoEfetivo));
      }
      return feeMemo.get(bracketKey);
    }

    function solveEffectivePrice(prod, baseCost, invariantRate, targetValue, mode) {
      let price = Math.max(numberOrZero(prod.custo) * 2.5, 15);
      const feeMemo = new Map();

      for (let i = 0; i < 40; i++) {
        const feeConfig = getFeeConfigMemo(prod, price, feeMemo);
        const modeRate = mode === 'margem' ? targetValue : 0;
        const targetProfit = mode === 'lucro' ? targetValue : 0;
        const divisor = 1 - feeConfig.rate - invariantRate - modeRate;
        if (divisor <= 0) return null;

        const nextPrice = (baseCost + feeConfig.fixed + targetProfit) / divisor;
        if (Math.abs(nextPrice - price) < 0.005) return nextPrice;
        price = nextPrice;
      }

      return price;
    }

    function calcProduct(prod) {
      const cacheKey = getCalcCacheKey(prod);
      if (calcCache.has(cacheKey)) return calcCache.get(cacheKey);

      const custo = numberOrZero(prod.custo);
      const margem = numberOrZero(prod.margem) / 100;
      const embalagem = numberOrZero(prod.outros);
      const full = numberOrZero(prod.full);
      const desconto = numberOrZero(prod.desconto) / 100;
      const imposto = numberOrZero(prod.imposto) / 100;
      const afiliadosRate = numberOrZero(prod.afiliados) / 100;
      const roas = numberOrZero(prod.roas);
      const adRate = roas > 0 ? 1 / roas : 0;
      const custoBase = custo + embalagem + full;
      const modo = prod.modo || 'margem';
      const invariantRate = imposto + adRate + afiliadosRate;

      function finalize(precoEfetivo) {
        const feeConfig = resolveMarketplaceFeeConfig(prod, precoEfetivo);
        const taxasShopee = precoEfetivo * feeConfig.rate + feeConfig.fixed;
        const impostoVal = precoEfetivo * imposto;
        const adCost = roas > 0 ? precoEfetivo / roas : 0;
        const afiliadosVal = precoEfetivo * afiliadosRate;
        const lucro = precoEfetivo - custo - embalagem - full - taxasShopee - impostoVal - adCost - afiliadosVal;
        const margemReal = precoEfetivo > 0 ? (lucro / precoEfetivo) * 100 : 0;
        const precoVenda = desconto > 0 ? precoEfetivo / (1 - desconto) : precoEfetivo;
        return {
          precoVenda,
          precoEfetivo,
          taxasShopee,
          impostoVal,
          adCost,
          afiliadosVal,
          bracket: feeConfig.bracket,
          marketplaceFeeLabel: feeConfig.label,
          lucro,
          margemReal,
          inviavel: false,
          taxasPendentes: false
        };
      }

      let result;

      if (modo === 'preco') {
        const precoVendaFixo = numberOrZero(prod.precoVendaFixo);
        result = precoVendaFixo <= 0
          ? { inviavel: true, taxasPendentes: false }
          : finalize(desconto > 0 ? precoVendaFixo * (1 - desconto) : precoVendaFixo);
      } else if (modo === 'lucro') {
        const solved = solveEffectivePrice(prod, custoBase, invariantRate, numberOrZero(prod.lucroDesejado), 'lucro');
        result = solved == null ? { inviavel: true, taxasPendentes: false } : finalize(solved);
      } else {
        const solved = solveEffectivePrice(prod, custoBase, invariantRate, margem, 'margem');
        result = solved == null ? { inviavel: true, taxasPendentes: false } : finalize(solved);
      }

      calcCache.set(cacheKey, result);
      return result;
    }

    function getHealthInfo(result) {

      if (!result || result.inviavel) {
        return {
          statusClass: 'tag-red',
          statusText: 'Cálculo inviável',
          healthText: 'Revise preço, margem ou custos.',
          diagnostico: 'A soma de custos e percentuais excedeu o limite do cálculo.',
          ringAngle: 20,
          ringColor: 'var(--red)',
          metricClass: 'metric-bad'
        };
      }
      if (result.taxasPendentes) {
        return {
          statusClass: 'tag-amber',
          statusText: 'Taxa pendente',
          healthText: 'Este marketplace ainda não tem taxa própria configurada.',
          diagnostico: 'As taxas desse marketplace ainda dependem de configuração manual.',
          ringAngle: Math.min(Math.max(result.margemReal, 0), 100) * 3.6,
          ringColor: 'var(--amber)',
          metricClass: result.margemReal >= 0 ? 'metric-warn' : 'metric-bad'
        };
      }
      if (result.margemReal >= 20) {
        return {
          statusClass: 'tag-green',
          statusText: 'Ótima margem',
          healthText: 'Há boa folga para promoções e variações de custo.',
          diagnostico: 'Resultado forte e estável.',
          ringAngle: Math.min(result.margemReal, 100) * 3.6,
          ringColor: 'var(--green)',
          metricClass: 'metric-good'
        };
      }
      if (result.margemReal >= 10) {
        return {
          statusClass: 'tag-blue',
          statusText: 'Margem boa',
          healthText: 'Resultado positivo, com espaço moderado para ajustes.',
          diagnostico: 'Bom equilíbrio entre preço e lucro.',
          ringAngle: Math.min(result.margemReal, 100) * 3.6,
          ringColor: 'var(--blue)',
          metricClass: 'metric-good'
        };
      }
      if (result.margemReal >= 5) {
        return {
          statusClass: 'tag-amber',
          statusText: 'Margem baixa',
          healthText: 'Qualquer desconto ou custo extra pode afetar o lucro.',
          diagnostico: 'Vale revisar preço, desconto ou custos adicionais.',
          ringAngle: Math.min(result.margemReal, 100) * 3.6,
          ringColor: 'var(--amber)',
          metricClass: 'metric-warn'
        };
      }
      return {
        statusClass: 'tag-red',
        statusText: 'Margem crítica',
        healthText: 'A venda ainda pode acontecer, mas o retorno está baixo demais.',
        diagnostico: 'Neste nível, pequenas variações já podem gerar prejuízo.',
        ringAngle: Math.max(result.margemReal, 0) * 3.6,
        ringColor: 'var(--red)',
        metricClass: result.margemReal >= 0 ? 'metric-warn' : 'metric-bad'
      };
    }


    function getMentorSignal(result) {
      if (!result || result.inviavel || result.lucro < 0 || result.margemReal < 5) {
        return { tone: 'danger', title: 'Zona de perigo', short: 'Operação em risco' };
      }
      if (result.margemReal < 10) {
        return { tone: 'warn', title: 'Operação apertada', short: 'Margem sensível' };
      }
      if (result.margemReal < 20) {
        return { tone: 'info', title: 'Operação viável', short: 'Dá para brigar' };
      }
      return { tone: 'success', title: 'Caminho livre', short: 'Potencial de escala' };
    }

    function formatPercent(value) {
      return `${numberOrZero(value).toFixed(1)}%`;
    }

    function mentorTask(title, detail, done = false, action = null) {
      return { title, detail, done: !!done, action: action || null };
    }

    function renderMentorTasks(tasks = []) {
      if (!Array.isArray(tasks) || !tasks.length) {
        return `
          <article class="mentor-task" data-done="false">
            <div class="mentor-task-check">!</div>
            <div class="mentor-task-content">
              <strong>Sem checklist ainda</strong>
              <p>Cadastre ou simule um produto para o Mentor montar a leitura tática.</p>
            </div>
          </article>
        `;
      }
      return tasks.map((task) => {
        const actionButton = task.action && task.action.type
          ? `<div class="mentor-task-actions"><button type="button" class="mentor-task-btn" onclick="runMentorTaskAction('${esc(task.action.type)}')">${esc(task.action.label || 'Aplicar')}</button></div>`
          : '';
        return `
          <article class="mentor-task" data-done="${task.done ? 'true' : 'false'}">
            <div class="mentor-task-check">${task.done ? '✓' : '!'}</div>
            <div class="mentor-task-content">
              <strong>${esc(task.title || '')}</strong>
              <p>${esc(task.detail || '')}</p>
              ${actionButton}
            </div>
          </article>
        `;
      }).join('');
    }

    function getDreRows(prod, result) {
      if (!prod || !result || result.inviavel) return [];
      const rows = [
        { label: 'Preço para vender', value: numberOrZero(result.precoEfetivo), tone: 'base' },
        { label: 'Custo do produto', value: numberOrZero(prod.custo), tone: 'cost' }
      ];
      if (numberOrZero(prod.outros) > 0) rows.push({ label: 'Embalagem', value: numberOrZero(prod.outros), tone: 'cost' });
      if (numberOrZero(prod.full) > 0) rows.push({ label: 'FULL', value: numberOrZero(prod.full), tone: 'cost' });
      if (!result.taxasPendentes && numberOrZero(result.taxasShopee) > 0) rows.push({ label: `Taxas ${getMarketplaceLabel(prod.marketplace || 'shopee')}`, value: numberOrZero(result.taxasShopee), tone: 'cost' });
      if (numberOrZero(result.impostoVal) > 0) rows.push({ label: 'Imposto', value: numberOrZero(result.impostoVal), tone: 'cost' });
      if (numberOrZero(result.afiliadosVal) > 0) rows.push({ label: 'Afiliados', value: numberOrZero(result.afiliadosVal), tone: 'cost' });
      if (numberOrZero(result.adCost) > 0) rows.push({ label: 'Ads / ROAS', value: numberOrZero(result.adCost), tone: 'cost' });
      rows.push({ label: 'Lucro líquido', value: Math.abs(numberOrZero(result.lucro)), tone: result.lucro >= 0 ? 'profit' : 'loss' });
      return rows;
    }

    function renderWaterfallChart(prod, result) {
      if (!prod || !result) return '<div class="dre-note">Preencha a simulação para gerar o DRE visual.</div>';
      if (result.inviavel) return '<div class="dre-note">Conta inviável. O gráfico fica liberado assim que o preço voltar para terreno positivo.</div>';
      const rows = getDreRows(prod, result);
      const base = Math.max(numberOrZero(result.precoEfetivo), 0.01);
      const html = rows.map((row) => {
        const width = row.tone === 'base' ? 100 : Math.max(8, Math.min(100, (Math.abs(numberOrZero(row.value)) / base) * 100));
        const valueLabel = row.tone === 'base'
          ? fmt(row.value)
          : row.tone === 'profit'
            ? fmt(row.value)
            : `- ${fmt(row.value)}`;
        return `
          <div class="dre-row">
            <div class="dre-meta">
              <span>${esc(row.label)}</span>
              <strong>${valueLabel}</strong>
            </div>
            <div class="dre-track">
              <div class="dre-fill is-${row.tone}" style="width:${width}%"></div>
            </div>
          </div>
        `;
      }).join('');
      const note = result.taxasPendentes
        ? `<div class="dre-note">Taxa oficial de ${esc(getMarketplaceLabel(prod.marketplace || 'shopee'))} ainda pendente na calculadora. O gráfico considera apenas os custos já parametrizados.</div>`
        : `<div class="dre-note">Quanto maior a faixa vermelha perto do preço vendido, menor a sua folga operacional.</div>`;
      return `<div class="dre-waterfall">${html}${note}</div>`;
    }

    function getWarSimulation(prod, result, dropValue) {
      const drop = numberOrZero(dropValue);
      if (!prod || !result || result.inviavel) return { ok: false, text: 'Preencha a simulação com um cenário viável antes de abrir a guerra de preços.' };
      if (drop <= 0) return { ok: false, text: 'Digite quanto pretende baixar para medir o impacto real no volume necessário.' };
      const discountFactor = 1 - (numberOrZero(prod.desconto) / 100);
      const targetEffective = Math.max(0.01, numberOrZero(result.precoEfetivo) - drop);
      const targetAnnounce = discountFactor > 0 ? targetEffective / discountFactor : targetEffective;
      const simulatedProduct = { ...prod, modo: 'preco', precoVendaFixo: targetAnnounce };
      const simulatedResult = calcProduct(simulatedProduct);
      if (simulatedResult.inviavel || simulatedResult.lucro <= 0 || result.lucro <= 0) {
        return {
          ok: false,
          text: `Se baixar ${fmt(drop)}, sua operação perde a linha. O lucro por unidade some ou fica negativo. Nessa condição, a guerra de preços vira suicídio comercial.`
        };
      }
      const extraVolume = ((result.lucro / simulatedResult.lucro) - 1) * 100;
      const verdict = extraVolume > 35
        ? 'A conta ficou pesada. Você vai precisar de muito volume só para empatar o lucro atual.'
        : extraVolume > 15
          ? 'Movimento sensível. Só vale brigar se a conversão e a recompra compensarem.'
          : 'Queda controlada. Ainda assim, monitore conversão e Buybox antes de entrar no automático.';
      return {
        ok: true,
        text: `Se baixar ${fmt(drop)}, o lucro por unidade cai de ${fmt(result.lucro)} para ${fmt(simulatedResult.lucro)}. Você precisará vender ${extraVolume.toFixed(1)}% a mais em volume para empatar com o lucro absoluto atual. ${verdict}`,
        simulatedResult,
        extraVolume
      };
    }

    function renderDetailDreAndWar(prod, result) {
      return `
        <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div class="soft-row-card">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-400">DRE visual</p>
                <h3 class="mt-1 text-base font-black text-slate-950">Gráfico de cascata</h3>
              </div>
              <span class="tag tag-neutral">Preço x custos x lucro</span>
            </div>
            <div class="mt-4">${renderWaterfallChart(prod, result)}</div>
          </div>
          <div class="soft-row-card">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-400">Guerra de preços</p>
                <h3 class="mt-1 text-base font-black text-slate-950">Modo E se...</h3>
              </div>
              <span class="tag tag-neutral">Buybox com razão</span>
            </div>
            <div class="mt-4 grid gap-3">
              <div>
                <label class="field-label" for="detail-war-discount">Baixar preço em (R$)</label>
                <input type="text" inputmode="decimal" id="detail-war-discount" class="apple-input" value="5,00" oninput="updateDetailWarGame()" />
              </div>
              <div id="detail-war-output" class="war-result">${esc(getWarSimulation(prod, result, 5).text)}</div>
            </div>
          </div>
        </section>
      `;
    }

    function getMentorInsight(prod, result) {
      const mp = getMarketplaceLabel(prod?.marketplace || 'shopee');
      const signal = getMentorSignal(result);
      if (!result || result.inviavel) {
        return {
          tone: signal.tone,
          title: 'Pare agora',
          badge: 'Conta inviável',
          sourceLabel: prod?.nome ? 'Produto em análise' : 'Prévia atual',
          text: 'Pare agora. A conta ficou inviável. Você está empilhando custo em cima de custo. Revise preço, promoção, FULL, imposto ou margem antes de publicar.',
          tasks: [
            mentorTask('Rever preço e margem', 'A conta não fechou. Corrija preço, markup ou lucro desejado antes de insistir.', false),
            mentorTask('Limpar custo escondido', 'Cheque FULL, imposto, afiliados, ROAS e embalagem. Um deles está quebrando a operação.', false),
            mentorTask('Segurar publicação', 'Não publique esse anúncio até a margem voltar para terreno seguro.', false)
          ]
        };
      }

      const parts = [];
      const tasks = [];
      const fixedFeeRatio = result.precoEfetivo > 0 ? (((result.bracket?.fixed || 0) / result.precoEfetivo) * 100) : 0;
      const lowTicket = result.precoEfetivo > 0 && result.precoEfetivo <= 79.99;
      const hasPromo = numberOrZero(prod?.desconto) > 0;
      const hasAds = numberOrZero(prod?.roas) > 0;
      const marginOk = result.margemReal >= 10;
      const adsOk = result.margemReal >= 20;

      if (result.lucro < 0) {
        parts.push('Pare agora. Você está pagando para trabalhar. Antes de pensar em giro, corrija preço, custo ou composição do kit.');
      } else if (result.margemReal < 5) {
        parts.push(`Você está trocando figurinha. Com essa margem de ${formatPercent(result.margemReal)}, qualquer erro operacional já vira prejuízo.`);
      } else if (result.margemReal < 10) {
        parts.push(`Operação apertada. A margem real em ${formatPercent(result.margemReal)} não te dá folga para desconto torto, devolução ou custo escondido.`);
      } else if (result.margemReal < 20) {
        parts.push(`Operação viável. Em ${mp}, você já consegue vender sem sangrar, mas ainda precisa disciplina comercial para não abrir promoção sem critério.`);
      } else {
        parts.push(`Excelente. A margem líquida em ${formatPercent(result.margemReal)} abre espaço para escala e te dá gordura para defender posicionamento.`);
      }

      tasks.push(
        mentorTask(
          'Blindar a margem',
          marginOk
            ? `Margem real em ${formatPercent(result.margemReal)}. Já existe folga para operar com mais segurança.`
            : `Margem real em ${formatPercent(result.margemReal)}. Ainda está curta para erro operacional ou desconto torto.`,
          marginOk
        )
      );

      if (hasPromo) {
        tasks.push(
          mentorTask(
            'Conferir a promoção ativa',
            `Você anuncia por ${fmt(result.precoVenda)} e vende por ${fmt(result.precoEfetivo)} depois dos ${numberOrZero(prod.desconto).toFixed(0)}% de desconto. O valor em rosa é o que cai na venda.`,
            result.precoEfetivo > 0,
            result.margemReal < 12 ? { type: 'removePromo', label: 'Remover promoção' } : null
          )
        );
      } else {
        tasks.push(
          mentorTask(
            'Decidir promoção com critério',
            adsOk
              ? 'Existe gordura para testar promoção controlada sem desmontar a margem.'
              : 'Sem folga robusta. Só abra promoção depois de fortalecer a margem ou montar kit.',
            adsOk
          )
        );
      }

      if (result.taxasPendentes) {
        parts.push(`Atenção: ${mp} ainda está sem taxa oficial cadastrada nesta calculadora. Use essa leitura como conservadora e valide antes de bater o martelo.`);
        tasks.push(mentorTask('Validar taxa do marketplace', `Em ${mp}, a taxa oficial ainda não foi cadastrada na ferramenta. Não trate essa margem como definitiva.`, false));
      } else {
        tasks.push(mentorTask('Taxa do marketplace validada', `Faixa ativa ${result.bracket?.label || '—'}. A taxa já entrou na conta da operação.`, true));
      }

      if (hasAds) {
        if (adsOk) parts.push(`Com ROAS alvo em ${numberOrZero(prod.roas).toFixed(1)}, temos gordura para Ads. Dá para entrar com tráfego sem desmontar a margem.`);
        else parts.push(`Seu ROAS está entrando na conta, mas a margem ainda não ficou folgada. Sem controle de ACOS, o tráfego pode comer o caixa.`);
        tasks.push(mentorTask('Controlar Ads e ACOS', adsOk ? `ROAS ${numberOrZero(prod.roas).toFixed(1)} entrou na conta e ainda sobra margem para escalar.` : `ROAS ${numberOrZero(prod.roas).toFixed(1)} já pesa na operação. Segure escala até a margem respirar melhor.`, adsOk));
      } else {
        if (adsOk) parts.push('Tem espaço para testar Ads com inteligência. Comece pequeno, monitore ACOS e não compre volume sem conferir conversão.');
        tasks.push(mentorTask('Decidir entrada em Ads', adsOk ? 'Há gordura para abrir campanha de crescimento e disputar primeira página com controle.' : 'Segure Ads por enquanto. Primeiro proteja margem e ticket.', adsOk, adsOk ? { type: 'roas30', label: 'Aplicar ROAS 30' } : null));
      }

      if ((prod?.full || 0) > 0 && result.lucro > 0) {
        const fullShare = result.lucro > 0 ? ((numberOrZero(prod.full) / Math.max(result.lucro, 0.01)) * 100) : 0;
        if (fullShare >= 40) parts.push('O Full está mordendo forte no resultado. Só vale insistir se ele estiver melhorando giro, prazo e conversão de verdade.');
      }

      if (fixedFeeRatio > 15 || lowTicket) {
        parts.push('Ticket baixo pede estratégia de kit. Diluir taxa fixa e custo operacional por unidade costuma ser o caminho mais rápido para destravar margem.');
        tasks.push(mentorTask('Montar kit ou combo', 'A taxa fixa e o ticket baixo estão comprimindo o lucro. Kit é a rota mais rápida para diluir custo e subir margem por pedido.', false, { type: 'kit3', label: 'Simular kit com 3 unidades' }));
      } else {
        tasks.push(mentorTask('Ticket e taxa fixa sob controle', 'A taxa fixa não está estrangulando a venda. Dá para defender posicionamento sem virar refém de desconto.', true));
      }

      if ((prod?.afiliados || 0) >= 8) {
        parts.push('Afiliados já viraram uma linha relevante do DRE. Se a comissão continuar alta, suba ticket ou enxugue a oferta para não virar refém da comissão.');
      }

      if ((prod?.imposto || 0) >= 10) {
        parts.push('O imposto já está pesado para ignorar no feeling. Sem ERP amarrado com estoque e nota, escala vira bagunça contábil.');
        tasks.push(mentorTask('Amarrar ERP, estoque e nota', 'Com imposto mais pesado, a operação precisa de ERP e rotina fiscal no trilho para escalar sem vazamento.', false));
      } else {
        parts.push('Se o plano é escalar, amarre a operação em ERP desde já. Bling ou Tiny deixam estoque, pedido e nota no trilho antes do caos aparecer.');
        tasks.push(mentorTask('Preparar estrutura para escalar', 'Se esse item for campeão, amarre ERP, estoque e nota antes do volume crescer.', false));
      }

      return {
        tone: signal.tone,
        title: signal.title,
        badge: signal.short,
        sourceLabel: prod?.nome ? 'Produto / prévia atual' : 'Prévia atual',
        text: parts.join(' '),
        tasks
      };
    }

    function getCurrentPreviewProduct() {
      const modo = document.querySelector('.modo-btn.modo-active')?.id?.replace('modo-', '') || 'margem';
      return {
        nome: document.getElementById('prod-nome').value.trim(),
        marketplace: document.getElementById('prod-marketplace').value,
        custo: parseLocaleNumber(document.getElementById('prod-custo').value) || 0,
        modo,
        margem: parseLocaleNumber(document.getElementById('prod-margem').value) || 0,
        precoVendaFixo: parseLocaleNumber(document.getElementById('prod-preco-fixo').value) || 0,
        lucroDesejado: parseLocaleNumber(document.getElementById('prod-lucro-desejado').value) || 0,
        outros: parseLocaleNumber(document.getElementById('prod-outros').value) || 0,
        full: parseLocaleNumber(document.getElementById('prod-full').value) || 0,
        desconto: parseLocaleNumber(document.getElementById('prod-desconto').value) || 0,
        imposto: parseLocaleNumber(document.getElementById('prod-imposto').value) || 0,
        afiliados: parseLocaleNumber(document.getElementById('prod-afiliados').value) || 0,
        roas: parseLocaleNumber(document.getElementById('prod-roas').value) || 0,
        categoria: document.getElementById('prod-categoria').value.trim(),
        listingType: document.getElementById('prod-listing-type').value,
        marketplaceRate: parseLocaleNumber(document.getElementById('prod-marketplace-rate').value) || 0,
        marketplaceFixed: parseLocaleNumber(document.getElementById('prod-marketplace-fixed').value) || 0
      };
    }

    function setMentorInline(prod, result) {
      const badge = document.getElementById('mentor-inline-badge');
      const badgeText = document.getElementById('mentor-inline-badge-text');
      const copy = document.getElementById('mentor-inline-text');
      if (!badge || !badgeText || !copy) return;
      if (!prod || !result) {
        badge.dataset.tone = 'neutral';
        badgeText.textContent = 'Aguardando dados';
        copy.textContent = 'Preencha a simulação e o Mentor aponta risco de margem, espaço para Ads e necessidade de kit.';
        return;
      }
      const insight = getMentorInsight(prod, result);
      badge.dataset.tone = insight.tone;
      badgeText.textContent = insight.badge;
      copy.textContent = insight.text;
    }

    function getDashboardMentorInsight(list) {
      const valid = list.filter((item) => item && item._r && !item._r.inviavel);
      if (!list.length) {
        return {
          tone: 'neutral',
          title: 'Aguardando operação',
          sourceLabel: 'Carteira atual',
          text: 'Sem produto em tela. Cadastre ou filtre itens para o Mentor ler a carteira.',
          tasks: [
            mentorTask('Cadastrar pelo menos 1 produto', 'Sem produto na mesa não existe leitura de margem, taxa ou potencial de escala.', false),
            mentorTask('Definir marketplace e custo', 'Comece pela base: custo limpo, taxa correta e objetivo de margem.', false)
          ]
        };
      }
      if (!valid.length) {
        return {
          tone: 'danger',
          title: 'Carteira sem viabilidade',
          sourceLabel: 'Carteira atual',
          text: 'Os itens visíveis estão inviáveis. Pare a operação, revise custo, promoção e taxa antes de publicar mais produto.',
          tasks: [
            mentorTask('Parar publicação', 'Tem item em tela sem viabilidade. Corrija a base antes de aumentar catálogo.', false),
            mentorTask('Revisar custos e taxas', 'Preço, FULL, promoção, comissão e imposto estão destruindo a conta.', false)
          ]
        };
      }
      const avgMargin = valid.reduce((sum, item) => sum + item._r.margemReal, 0) / valid.length;
      const negatives = valid.filter((item) => item._r.lucro < 0).length;
      const pendings = list.filter((item) => item._r.taxasPendentes).length;
      const withAdsRoom = valid.filter((item) => item._r.margemReal >= 20).length;
      const lowTicket = valid.filter((item) => item._r.precoEfetivo <= 79.99).length;

      const parts = [];
      const tasks = [];
      let tone = 'info';
      let title = 'Operação em leitura';

      if (negatives > 0 || avgMargin < 5) {
        tone = 'danger';
        title = 'Zona de perigo';
        parts.push(`Você tem ${pluralize(negatives, 'produto no prejuízo', 'produtos no prejuízo')} ou margem média crítica. Antes de crescer catálogo, corrija a base.`);
      } else if (avgMargin < 10) {
        tone = 'warn';
        title = 'Operação apertada';
        parts.push(`A margem média em ${formatPercent(avgMargin)} ainda é curta. Você está vendendo, mas sem muita blindagem para erro operacional.`);
      } else if (avgMargin < 20) {
        tone = 'info';
        title = 'Operação viável';
        parts.push(`A carteira está respirando. A margem média em ${formatPercent(avgMargin)} já permite giro, mas ainda pede disciplina em desconto e logística.`);
      } else {
        tone = 'success';
        title = 'Caminho livre para escala';
        parts.push(`Boa carteira. A margem média em ${formatPercent(avgMargin)} mostra folga real para promo controlada e investimento em tráfego.`);
      }

      tasks.push(mentorTask('Proteger margem média da carteira', avgMargin >= 10 ? `Margem média em ${formatPercent(avgMargin)}. A base já respira.` : `Margem média em ${formatPercent(avgMargin)}. Ainda é pouco para erro operacional.`, avgMargin >= 10));
      tasks.push(mentorTask('Eliminar itens que estão sangrando', negatives === 0 ? 'Nenhum item visível está no prejuízo.' : `${pluralize(negatives, 'item está', 'itens estão')} com lucro negativo ou perto disso.`, negatives === 0));
      tasks.push(mentorTask('Separar campeões para Ads', withAdsRoom > 0 ? `${pluralize(withAdsRoom, 'item tem', 'itens têm')} gordura para Ads e disputa de Buybox.` : 'Nenhum item visível ficou com folga real para mídia paga.', withAdsRoom > 0));
      tasks.push(mentorTask('Montar kits nos tickets baixos', lowTicket > 0 ? `${pluralize(lowTicket, 'item de ticket baixo pede', 'itens de ticket baixo pedem')} kit ou combo para diluir taxa fixa.` : 'Os tickets visíveis não estão sendo esmagados pela taxa fixa.', lowTicket === 0));
      tasks.push(mentorTask('Amarrar gestão em ERP', pendings > 0 ? `${pluralize(pendings, 'produto está', 'produtos estão')} sem taxa oficial cadastrada. Sem processo, essa leitura vira chute.` : 'Com taxa validada, o próximo passo é organizar ERP, estoque e fiscal para escalar.', pendings === 0));

      if (withAdsRoom > 0) parts.push(`${pluralize(withAdsRoom, 'item tem', 'itens têm')} gordura para Ads. Priorize os campeões de conversão e ataque Buybox com orçamento controlado.`);
      if (lowTicket > 0) parts.push(`${pluralize(lowTicket, 'item de ticket baixo pede', 'itens de ticket baixo pedem')} kit ou combo para diluir taxa fixa e melhorar lucro por pedido.`);
      if (pendings > 0) parts.push(`${pluralize(pendings, 'produto está', 'produtos estão')} em marketplace sem taxa oficial cadastrada. Não trate essa margem como verdade absoluta.`);
      parts.push('Se a ideia é escalar catálogo sem perder mão em estoque e nota, já coloca ERP no centro da operação.');

      return { tone, title, sourceLabel: 'Carteira atual', text: parts.join(' '), tasks };
    }

    function updateMentorDashboard(list) {
      const signal = document.getElementById('mentor-overview-signal');
      const title = document.getElementById('mentor-overview-title');
      const text = document.getElementById('mentor-overview-text');
      if (!signal || !title || !text) return;
      const insight = getDashboardMentorInsight(list || []);
      signal.dataset.tone = insight.tone;
      title.textContent = insight.title;
      text.textContent = `${insight.text} ${buildMentorProfileTail()}`.trim();
    }

    function openMentorPopup(insight, context = { source: 'dashboard', productId: null }) {
      mentorContext = { source: context?.source || 'dashboard', productId: context?.productId ?? null };
      const popup = document.getElementById('mentor-popup');
      if (!popup || !insight) return;
      document.getElementById('mentor-popup-signal').dataset.tone = insight.tone || 'neutral';
      document.getElementById('mentor-popup-title').textContent = insight.title || 'O Mentor de Escala';
      document.getElementById('mentor-popup-copy').textContent = `${insight.text || ''} ${buildMentorProfileTail()}`.trim();
      const source = document.getElementById('mentor-popup-source');
      if (source) source.textContent = insight.sourceLabel || 'Leitura atual';
      const list = document.getElementById('mentor-popup-questlist');
      if (list) list.innerHTML = renderMentorTasks(insight.tasks || []);
      popup.classList.remove('hidden');
      popup.classList.add('flex');
      focusFirstInContainer(popup);
    }

    function closeMentorPopup() {
      const popup = document.getElementById('mentor-popup');
      if (!popup) return;
      popup.classList.add('hidden');
      popup.classList.remove('flex');
    }

    function openMentorAssistant() {
      const formModal = document.getElementById('modal');
      const detailModal = document.getElementById('modal-detail');
      if (detailModal && !detailModal.classList.contains('hidden') && currentDetailProductId !== null) {
        runMentorAnalysis('detail', currentDetailProductId);
        return;
      }
      if (formModal && !formModal.classList.contains('hidden')) {
        const prod = getCurrentPreviewProduct();
        if (!prod.custo || prod.custo <= 0) {
          showToast('Preencha a simulação antes de chamar o Mentor.', 'info');
          return;
        }
        openMentorPopup(getMentorInsight(prod, calcProduct(prod)), { source: 'preview', productId: null });
        return;
      }
      runMentorAnalysis('dashboard');
    }

    function runMentorAnalysis(source = 'dashboard', productId = null) {
      if (source === 'dashboard') {
        const q = (document.getElementById('search').value || '').toLowerCase().trim();
        const sort = document.getElementById('sort').value;
        let list = products
          .filter((p) => activeMarketplace === 'todos' || (p.marketplace || 'shopee') === activeMarketplace)
          .filter((p) => [p.nome, p.categoria || '', p.idCustom || '', p.sku || '', getMarketplaceLabel((p.marketplace || 'shopee')).toLowerCase()].join(' ').toLowerCase().includes(q))
          .map((p) => ({ ...p, _r: calcProduct(p) }));
        if (sort === 'nome') list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        else if (sort === 'custo_asc') list.sort((a, b) => a.custo - b.custo);
        else if (sort === 'preco_asc') list.sort((a, b) => (a._r.precoVenda || 0) - (b._r.precoVenda || 0));
        else if (sort === 'lucro_desc') list.sort((a, b) => (b._r.lucro || 0) - (a._r.lucro || 0));
        else if (sort === 'margem_desc') list.sort((a, b) => (b._r.margemReal || 0) - (a._r.margemReal || 0));
        openMentorPopup(getDashboardMentorInsight(list), { source: 'dashboard', productId: null });
        return;
      }
      if (source === 'detail' && productId !== null) {
        const prod = products.find((item) => item.id === productId);
        if (!prod) return;
        openMentorPopup(getMentorInsight(prod, calcProduct(prod)), { source: 'detail', productId: prod.id });
        return;
      }
      const prod = getCurrentPreviewProduct();
      if (!prod.custo || prod.custo <= 0) {
        showToast('Preencha a simulação antes de chamar o Mentor.', 'info');
        return;
      }
      openMentorPopup(getMentorInsight(prod, calcProduct(prod)), { source: 'preview', productId: null });
    }

    function getFormState() {
      return {
        editId: document.getElementById('edit-id').value || '',
        draftId: document.getElementById('draft-id').value || '',
        idCustom: document.getElementById('prod-id-custom').value.trim(),
        nome: document.getElementById('prod-nome').value.trim(),
        sku: document.getElementById('prod-sku').value.trim(),
        custo: document.getElementById('prod-custo').value,
        marketplace: document.getElementById('prod-marketplace').value,
        modo: document.querySelector('.modo-btn.modo-active')?.id?.replace('modo-', '') || 'margem',
        margem: document.getElementById('prod-margem').value,
        precoVendaFixo: document.getElementById('prod-preco-fixo').value,
        lucroDesejado: document.getElementById('prod-lucro-desejado').value,
        outros: document.getElementById('prod-outros').value,
        full: document.getElementById('prod-full').value,
        desconto: document.getElementById('prod-desconto').value,
        imposto: document.getElementById('prod-imposto').value,
        afiliados: document.getElementById('prod-afiliados').value,
        roas: document.getElementById('prod-roas').value,
        categoria: document.getElementById('prod-categoria').value.trim(),
        listingType: document.getElementById('prod-listing-type').value,
        marketplaceRate: parseLocaleNumber(document.getElementById('prod-marketplace-rate').value) || 0,
        marketplaceFixed: parseLocaleNumber(document.getElementById('prod-marketplace-fixed').value) || 0
      };
    }

    function setFormState(state = {}) {
      document.getElementById('edit-id').value = state.editId || '';
      document.getElementById('draft-id').value = state.draftId || '';
      document.getElementById('prod-id-custom').value = state.idCustom || '';
      document.getElementById('prod-nome').value = state.nome || '';
      document.getElementById('prod-sku').value = state.sku || '';
      setInputMoneyValue('prod-custo', state.custo);
      document.getElementById('prod-marketplace').value = state.marketplace || (activeMarketplace !== 'todos' ? activeMarketplace : 'shopee');
      document.getElementById('prod-margem').value = state.margem ?? '';
      setInputMoneyValue('prod-preco-fixo', state.precoVendaFixo);
      setInputMoneyValue('prod-lucro-desejado', state.lucroDesejado);
      setInputMoneyValue('prod-outros', state.outros);
      setInputMoneyValue('prod-full', state.full);
      document.getElementById('prod-desconto').value = state.desconto ?? '';
      document.getElementById('prod-imposto').value = state.imposto ?? '';
      document.getElementById('prod-afiliados').value = state.afiliados ?? '';
      document.getElementById('prod-roas').value = state.roas ?? '';
      document.getElementById('prod-categoria').value = state.categoria || '';
      document.getElementById('prod-listing-type').value = state.listingType || 'classic';
      document.getElementById('prod-marketplace-rate').value = state.marketplaceRate ?? '';
      setInputMoneyValue('prod-marketplace-fixed', state.marketplaceFixed);
      updateMarketplaceFields();
      setModo(state.modo || 'margem');
      calcPreview();
    }

    function serializeFormState() {
      return JSON.stringify(getFormState());
    }

    function setModalSnapshot() {
      modalSnapshot = serializeFormState();
    }

    function hasUnsavedModalChanges() {
      const modal = document.getElementById('modal');
      if (modal.classList.contains('hidden')) return false;
      return serializeFormState() !== modalSnapshot;
    }

    function hasMeaningfulDraft(state) {
      if (!state || state.editId) return false;
      const values = [state.idCustom, state.nome, state.sku, state.custo, state.precoVendaFixo, state.lucroDesejado, state.outros, state.full, state.desconto, state.imposto, state.afiliados, state.roas, state.categoria, state.marketplaceRate, state.marketplaceFixed];
      if (values.some((value) => String(value ?? '').trim() !== '')) return true;
      return String(state.margem ?? '').trim() !== '' && String(state.margem).trim() !== '20';
    }

    function saveFormDraft() {
      const state = getFormState();
      if (state.editId) return null;
      if (!hasMeaningfulDraft(state)) {
        if (state.draftId) removeDraftById(state.draftId);
        return null;
      }
      const draft = normalizeDraft({ ...state, draftId: state.draftId || `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, updatedAt: Date.now() });
      const idx = drafts.findIndex((item) => item.draftId === draft.draftId);
      if (idx >= 0) drafts[idx] = draft;
      else drafts.unshift(draft);
      saveDrafts();
      renderDrafts();
      document.getElementById('draft-id').value = draft.draftId;
      return draft.draftId;
    }

    function clearFormDraft() {
      const currentDraftId = document.getElementById('draft-id')?.value || '';
      if (currentDraftId) removeDraftById(currentDraftId);
      const draftInput = document.getElementById('draft-id');
      if (draftInput) draftInput.value = '';
    }

    function shouldShowNoticePopup() {
      try {
        const raw = JSON.parse(localStorage.getItem(NOTICE_KEY) || '{}');
        return raw.version !== APP_VERSION;
      } catch {
        return true;
      }
    }

    function showNoticePopup() {
      const el = document.getElementById('notice-popup');
      el.classList.remove('hidden');
      el.classList.add('flex');
      focusFirstInContainer(el);
    }

    function closeNoticePopup(markSeen = true) {
      const el = document.getElementById('notice-popup');
      el.classList.add('hidden');
      el.classList.remove('flex');
      if (markSeen) {
        localStorage.setItem(NOTICE_KEY, JSON.stringify({ version: APP_VERSION, at: Date.now() }));
      }
    }

    function closeConfirmPopup(result = false) {
      const popup = document.getElementById('confirm-popup');
      if (!popup) return;
      popup.classList.add('hidden');
      popup.classList.remove('flex');
      const resolver = confirmResolver;
      confirmResolver = null;
      if (typeof resolver === 'function') resolver(result);
    }

    function showConfirmPopup({
      title = 'Confirmar ação',
      message = '',
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      tone = 'primary'
    } = {}) {
      return new Promise((resolve) => {
        const popup = document.getElementById('confirm-popup');
        const shell = document.getElementById('confirm-shell');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const okBtn = document.getElementById('confirm-ok-btn');

        if (confirmResolver) {
          confirmResolver(false);
          confirmResolver = null;
        }

        shell.dataset.tone = tone === 'danger' ? 'danger' : 'primary';
        titleEl.textContent = title;
        messageEl.textContent = message;
        cancelBtn.textContent = cancelText;
        okBtn.textContent = confirmText;
        okBtn.className = `btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'} sm:w-auto`;

        cancelBtn.onclick = () => closeConfirmPopup(false);
        okBtn.onclick = () => closeConfirmPopup(true);

        confirmResolver = resolve;
        popup.classList.remove('hidden');
        popup.classList.add('flex');
        requestAnimationFrame(() => okBtn.focus());
      });
    }

    function handleFormDraftInput() {
      if (document.getElementById('modal').classList.contains('hidden')) return;
      const currentDraftId = document.getElementById('draft-id').value;
      if (!currentDraftId) return;
      saveFormDraft();
    }

    async function ensureCanSwitchModal() {
      const modal = document.getElementById('modal');
      if (modal.classList.contains('hidden')) return true;
      if (!hasUnsavedModalChanges()) return true;
      const isEdit = !!document.getElementById('edit-id').value;
      const ok = await showConfirmPopup({
        title: 'Trocar de ficha?',
        message: isEdit
          ? 'Existe uma ficha aberta com alterações não salvas. Deseja trocar mesmo assim?'
          : 'Existe uma ficha aberta com alterações não salvas. Deseja enviar esta ficha para a pasta de rascunhos e continuar?',
        confirmText: isEdit ? 'Trocar ficha' : 'Salvar rascunho e continuar',
        cancelText: 'Voltar',
        tone: isEdit ? 'primary' : 'danger'
      });
      if (!ok) return false;
      if (!isEdit && hasMeaningfulDraft(getFormState())) {
        saveFormDraft();
        await closeModal(true, true);
      } else {
        await closeModal(true, false);
      }
      return true;
    }

    async function openDraft(draftId) {
      if (!(await ensureCanSwitchModal())) return;
      const draft = getDraftById(draftId);
      if (!draft) {
        showToast('Rascunho não encontrado.', 'error');
        return;
      }
      resetForm();
      document.getElementById('modal-title').textContent = 'Continuar rascunho';
      setModalSaveLabel('Criar produto');
      setFormState({ ...draft, editId: '', draftId: draft.draftId });
      document.getElementById('modal').dataset.mode = isEdit ? 'edit' : 'create';
      const draftsPanel = document.getElementById('drafts-panel');
      if (draftsPanel) draftsPanel.classList.toggle('hidden', isEdit);
      renderDrafts();
      document.getElementById('modal').classList.remove('hidden');
      document.getElementById('modal').classList.add('flex');
      setModalSnapshot();
      updateSaveButtonState();
      focusFirstInContainer(document.getElementById('modal'));
      document.getElementById('prod-id-custom').focus();
    }

    async function deleteDraft(draftId) {
      const draft = getDraftById(draftId);
      if (!draft) return;
      const ok = await showConfirmPopup({
        title: 'Excluir rascunho?',
        message: `Excluir o rascunho "${draft.nome || 'sem nome'}"?`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        tone: 'danger'
      });
      if (!ok) return;
      removeDraftById(draftId);
      showToast('Rascunho removido.', 'info');
    }

    function clearSearch() {

      document.getElementById('search').value = '';
      renderProducts();
      document.getElementById('search').focus();
    }

    function setSearchClearVisibility() {
      const searchValue = document.getElementById('search').value.trim();
      const clearBtn = document.getElementById('search-clear');
      clearBtn.classList.toggle('hidden', !searchValue);
      clearBtn.classList.toggle('flex', !!searchValue);
    }

    function calcPreview() {
      const custo = parseLocaleNumber(document.getElementById('prod-custo').value) || 0;
      const previewEmpty = document.getElementById('preview-empty');
      const previewCard = document.getElementById('preview-card');

      if (custo <= 0) {
        previewCard.classList.add('hidden');
        previewEmpty.classList.remove('hidden');
        updatePreviewWaterfall(null, null);
        updateWarGame();
        updateSaveButtonState();
        return;
      }

      previewEmpty.classList.add('hidden');
      previewCard.classList.remove('hidden');

      const modo = document.querySelector('.modo-btn.modo-active')?.id?.replace('modo-', '') || 'margem';
      const prod = {
        custo,
        modo,
        marketplace: document.getElementById('prod-marketplace').value,
        margem: parseLocaleNumber(document.getElementById('prod-margem').value) || 0,
        precoVendaFixo: parseLocaleNumber(document.getElementById('prod-preco-fixo').value) || 0,
        lucroDesejado: parseLocaleNumber(document.getElementById('prod-lucro-desejado').value) || 0,
        outros: parseLocaleNumber(document.getElementById('prod-outros').value) || 0,
        full: parseLocaleNumber(document.getElementById('prod-full').value) || 0,
        desconto: parseLocaleNumber(document.getElementById('prod-desconto').value) || 0,
        imposto: parseLocaleNumber(document.getElementById('prod-imposto').value) || 0,
        afiliados: parseLocaleNumber(document.getElementById('prod-afiliados').value) || 0,
        roas: parseLocaleNumber(document.getElementById('prod-roas').value) || 0,
        categoria: document.getElementById('prod-categoria').value.trim(),
        listingType: document.getElementById('prod-listing-type').value,
        marketplaceRate: parseLocaleNumber(document.getElementById('prod-marketplace-rate').value) || 0,
        marketplaceFixed: parseLocaleNumber(document.getElementById('prod-marketplace-fixed').value) || 0
      };

      const r = calcProduct(prod);
      const health = getHealthInfo(r);
      const temDesconto = prod.desconto > 0;

      const ring = document.getElementById('prev-ring');
      ring.style.setProperty('--ring-angle', `${Math.max(0, Math.min(360, health.ringAngle || 0))}deg`);
      ring.style.background = `conic-gradient(${health.ringColor} 0deg, ${health.ringColor} ${Math.max(0, Math.min(360, health.ringAngle || 0))}deg, rgba(148, 163, 184, 0.16) ${Math.max(0, Math.min(360, health.ringAngle || 0))}deg, rgba(148, 163, 184, 0.16) 360deg)`;

      document.getElementById('prev-status').className = `tag ${health.statusClass}`;
      document.getElementById('prev-status').textContent = health.statusText;
      document.getElementById('prev-health-text').textContent = health.healthText;
      document.getElementById('prev-diagnostico').textContent = health.diagnostico;
      document.getElementById('prev-bracket').textContent = r.taxasPendentes ? 'Taxas a configurar' : (r.bracket?.label || '—');
      document.getElementById('prev-custo').textContent = fmt(custo);
      document.getElementById('prev-outros').textContent = prod.outros > 0 ? '- ' + fmt(prod.outros) : fmt(0);

      const fullRow = document.getElementById('prev-full-row');
      if (prod.full > 0) {
        fullRow.classList.remove('hidden');
        document.getElementById('prev-full').textContent = '- ' + fmt(prod.full);
      } else {
        fullRow.classList.add('hidden');
      }

      document.getElementById('prev-preco-label').textContent = 'PREÇO PARA ANUNCIAR';
      document.getElementById('prev-preco-vender-label').textContent = 'PREÇO PARA VENDER';
      document.getElementById('prev-taxa-label').textContent = r.taxasPendentes
        ? 'Taxa do marketplace'
        : `Taxas Shopee (${(r.bracket.rate * 100).toFixed(0)}% + ${fmt(r.bracket.fixed)})`;
      document.getElementById('prev-taxas').textContent = r.taxasPendentes ? 'a configurar' : '- ' + fmt(r.taxasShopee);

      const impostoRow = document.getElementById('prev-imposto-row');
      if (prod.imposto > 0) {
        impostoRow.classList.remove('hidden');
        document.getElementById('prev-imposto-label').textContent = `Imposto (${prod.imposto}%)`;
        document.getElementById('prev-imposto').textContent = '- ' + fmt(r.impostoVal);
      } else {
        impostoRow.classList.add('hidden');
      }

      const adsRow = document.getElementById('prev-ads-row');
      if (prod.roas > 0) {
        adsRow.classList.remove('hidden');
        document.getElementById('prev-ads-label').textContent = `ROAS ${prod.roas}`;
        document.getElementById('prev-ads').textContent = '- ' + fmt(r.adCost);
      } else {
        adsRow.classList.add('hidden');
      }

      const afiliadosRow = document.getElementById('prev-afiliados-row');
      if (prod.afiliados > 0) {
        afiliadosRow.classList.remove('hidden');
        document.getElementById('prev-afiliados-label').textContent = `Afiliados (${prod.afiliados}%)`;
        document.getElementById('prev-afiliados').textContent = '- ' + fmt(r.afiliadosVal);
      } else {
        afiliadosRow.classList.add('hidden');
      }

      const promoInfo = document.getElementById('prev-promo-info');
      if (temDesconto && !r.inviavel) {
        promoInfo.classList.add('hidden');
      } else {
        promoInfo.classList.add('hidden');
      }

      if (r.inviavel) {
        setAnimatedText('prev-preco', 'Inviável', 'bad');
        setAnimatedText('prev-preco-vender', '—', 'bad');
        setAnimatedText('prev-lucro', '—', 'bad');
        document.getElementById('prev-lucro').className = 'text-xl font-black text-red-600';
        document.getElementById('prev-margem-real').textContent = '0%';
        document.getElementById('prev-margem-real').className = 'metric-ring-value';
        updatePreviewWaterfall(prod, r);
        updateWarGame();
        updateCompareCurrentForm(prod);
        setMentorInline(prod, r);
        updateSaveButtonState();
        return;
      }

      setAnimatedText('prev-preco', fmt(r.precoVenda), r.lucro >= 0 ? 'good' : 'bad');
      setAnimatedText('prev-preco-vender', fmt(r.precoEfetivo), r.lucro >= 0 ? 'good' : 'bad');
      setAnimatedText('prev-lucro', fmt(r.lucro), r.lucro >= 0 ? 'good' : 'bad');
      document.getElementById('prev-lucro').className = `text-xl font-black ${r.lucro >= 0 ? 'text-emerald-700' : 'text-red-600'}`;
      setAnimatedText('prev-margem-real', `${r.margemReal.toFixed(1)}%`, r.margemReal >= 12 ? 'good' : 'bad');
      document.getElementById('prev-margem-real').className = `metric-ring-value ${health.metricClass}`;
      updatePreviewWaterfall(prod, r);
      updateWarGame();
      updateCompareCurrentForm(prod);
      setMentorInline(prod, r);
      updateSaveButtonState();
    }

    function updatePreviewWaterfall(prod, result) {
      const el = document.getElementById('preview-waterfall');
      if (!el) return;
      el.innerHTML = renderWaterfallChart(prod, result);
    }

    function updateWarGame() {
      const output = document.getElementById('war-output');
      const input = document.getElementById('war-discount');
      if (!output || !input) return;
      const prod = getCurrentPreviewProduct();
      const result = calcProduct(prod);
      const sim = getWarSimulation(prod, result, input.value);
      output.textContent = sim.text;
      output.classList.toggle('pulse-danger', sim.margin < 5);
      output.classList.toggle('pulse-danger', sim.margin < 5);
    }

    function updateDetailWarGame() {
      const output = document.getElementById('detail-war-output');
      const input = document.getElementById('detail-war-discount');
      if (!output || !input || currentDetailProductId === null) return;
      const prod = products.find((item) => item.id === currentDetailProductId);
      if (!prod) return;
      const sim = getWarSimulation(prod, calcProduct(prod), input.value);
      output.textContent = sim.text;
    }

    function extractCompetitorInfo(raw) {
      const source = String(raw || '').trim();
      const marketplace = /mercadolivre|mercado\s*livre/i.test(source)
        ? 'mercadolivre'
        : /tiktok/i.test(source)
          ? 'tiktok'
          : /shopee/i.test(source)
            ? 'shopee'
            : '';
      const priceMatch = source.match(/R\$\s*([\d\.\,]+)/i) || source.match(/(?:^|\s)(\d{1,3}(?:\.\d{3})*(?:,\d{2}))/);
      let titleGuess = '';
      let isUrl = /^https?:\/\//i.test(source);
      if (isUrl) {
        try {
          const url = new URL(source);
          const candidate = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
          titleGuess = candidate.replace(/[-_]+/g, ' ').replace(/\.html?$/i, '').replace(/item/gi, '').trim();
        } catch {}
      }
      return { marketplace, price: priceMatch ? parseLocaleNumber(priceMatch[1]) : 0, titleGuess, isUrl };
    }

    function updateSpyProducts(list = products) {
      const select = document.getElementById('spy-product-select');
      if (!select) return;
      const options = ['<option value="">Selecione um produto</option>'];
      list.forEach((item) => {
        options.push(`<option value="${item.id}">${esc(item.nome)}${item.sku ? ` · ${esc(item.sku)}` : ''}</option>`);
      });
      select.innerHTML = options.join('');
    }


    function updateCompareProducts(list = products) {
      const select = document.getElementById('compare-product-select');
      if (!select) return;
      const current = select.value;
      const options = ['<option value="">Selecione um produto</option>'];
      list.forEach((item) => {
        options.push(`<option value="${item.id}">${esc(item.nome)}${item.sku ? ` · ${esc(item.sku)}` : ''}</option>`);
      });
      select.innerHTML = options.join('');
      if (current && list.some((item) => String(item.id) === String(current))) select.value = current;
    }

    function getProductForComparison() {
      const selectedId = document.getElementById('compare-product-select')?.value || '';
      if (selectedId) {
        const found = products.find((item) => String(item.id) === String(selectedId));
        if (found) return found;
      }
      const modal = document.getElementById('modal');
      if (modal && !modal.classList.contains('hidden')) {
        const prod = getCurrentPreviewProduct();
        if (prod && prod.custo > 0) return prod;
      }
      return null;
    }

    function updateCompareCurrentForm(prod) {
      const modal = document.getElementById('modal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (!prod || !prod.custo || prod.custo <= 0) return;
      runCompareChannels(prod, true);
    }

    function runCompareChannels(prodOverride = null, silent = false) {
      const base = prodOverride || getProductForComparison();
      const empty = document.getElementById('compare-output-empty');
      const output = document.getElementById('compare-output');
      const balance = document.getElementById('compare-balance');
      if (!empty || !output || !balance) return;
      if (!base) {
        output.classList.add('hidden');
        balance.classList.add('hidden');
        empty.classList.remove('hidden');
        if (!silent) showToast('Selecione um produto ou preencha a ficha atual para comparar canais.', 'info');
        return;
      }
      const baseForChannels = {
        ...base,
        marketplaceRate: 0,
        marketplaceFixed: 0
      };
      const channels = [
        { key: 'shopee', label: 'Shopee', product: { ...baseForChannels, marketplace: 'shopee' } },
        { key: 'mercadolivre', label: `Mercado Livre${base.listingType === 'premium' ? ' Premium' : ' Clássico'}`, product: { ...baseForChannels, marketplace: 'mercadolivre', listingType: base.listingType || 'classic' } },
        { key: 'tiktok', label: 'TikTok Shop', product: { ...baseForChannels, marketplace: 'tiktok' } }
      ].map((item) => ({ ...item, result: calcProduct(item.product) }));
      const valid = channels.filter((item) => !item.result.inviavel);
      const targetLucro = base.modo === 'lucro' && numberOrZero(base.lucroDesejado) > 0
        ? numberOrZero(base.lucroDesejado)
        : Math.max(...valid.map((item) => numberOrZero(item.result.lucro)), 0);
      const balancedPrices = channels.map((item) => ({
        ...item,
        balanced: calcProduct({ ...item.product, modo: 'lucro', lucroDesejado: Math.max(targetLucro, 0.01) })
      }));
      output.innerHTML = balancedPrices.map((item) => {
        const tone = item.result.inviavel ? 'text-red-600' : item.result.lucro >= 0 ? 'text-emerald-700' : 'text-red-600';
        const note = item.result.inviavel
          ? 'Conta não fecha neste canal com os dados atuais.'
          : `Lucro líquido de ${fmt(item.result.lucro)} com margem ${formatPercent(item.result.margemReal)}.`;
        return `
          <article class="compare-channel-card">
            <span class="tag ${item.result.inviavel ? 'tag-red' : item.result.margemReal >= 12 ? 'tag-green' : item.result.margemReal >= 5 ? 'tag-amber' : 'tag-red'}">${esc(item.label)}</span>
            <div class="compare-price ${tone}">${item.result.inviavel ? 'Inviável' : fmt(item.result.precoEfetivo)}</div>
            <div class="compare-meta">
              <span>${note}</span>
              <span>Preço para anúncio: ${item.result.inviavel ? '—' : fmt(item.result.precoVenda)}</span>
              <span>Preço para equilibrar o mesmo lucro: ${item.balanced.inviavel ? '—' : fmt(item.balanced.precoVenda)}</span>
            </div>
          </article>`;
      }).join('');
      empty.classList.add('hidden');
      output.classList.remove('hidden');
      const equilibrium = balancedPrices.filter((item) => !item.balanced.inviavel).reduce((max, item) => Math.max(max, item.balanced.precoVenda), 0);
      const best = valid.sort((a,b) => b.result.lucro - a.result.lucro)[0];
      balance.innerHTML = `<p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-white/60">Preço sugerido para equilibrar</p><h4 class="mt-2 text-2xl font-black tracking-tight">${equilibrium > 0 ? fmt(equilibrium) : '—'}</h4><p class="mt-2 text-sm leading-6 text-white/80">Esse valor tenta segurar um lucro parecido nos canais viáveis. Hoje o melhor retorno está em <strong>${best ? esc(best.label) : '—'}</strong>.</p>`;
      balance.classList.remove('hidden');
      animateMetricFeedback(balance, equilibrium > 0 ? 'good' : 'bad');
    }

    function runSpyAnalysis() {
      const select = document.getElementById('spy-product-select');
      const sourceEl = document.getElementById('spy-source');
      const priceEl = document.getElementById('spy-price');
      const categoryEl = document.getElementById('spy-category');
      const output = document.getElementById('spy-output');
      if (!select || !sourceEl || !priceEl || !categoryEl || !output) return;
      const productId = Number(select.value);
      const product = products.find((item) => item.id === productId);
      if (!product) {
        output.classList.remove('hidden');
        output.innerHTML = 'Selecione um produto seu para o painel comparar contra o concorrente.';
        return;
      }
      const extracted = extractCompetitorInfo(sourceEl.value);
      const competitorPrice = numberOrZero(parseLocaleNumber(priceEl.value) || extracted.price);
      const competitorCategory = categoryEl.value.trim() || '';
      if (competitorPrice <= 0) {
        output.classList.remove('hidden');
        output.innerHTML = 'Cole um texto com preço ou informe manualmente o valor do concorrente. O scan aqui é assistido: scraping real do anúncio ainda depende de backend por causa de CORS.';
        return;
      }
      const discountFactor = 1 - (numberOrZero(product.desconto) / 100);
      const announcePrice = discountFactor > 0 ? competitorPrice / discountFactor : competitorPrice;
      const simulated = calcProduct({ ...product, modo: 'preco', precoVendaFixo: announcePrice });
      const gap = simulated.inviavel ? null : simulated.precoEfetivo - competitorPrice;
      const riskTone = simulated.inviavel || simulated.lucro <= 0 ? 'tag-red' : simulated.margemReal < 5 ? 'tag-red' : simulated.margemReal < 12 ? 'tag-amber' : 'tag-green';
      const action = simulated.inviavel || simulated.lucro <= 0
        ? 'Não iguale no braço. Monte kit, suba ticket ou melhore compra.'
        : simulated.margemReal < 5
          ? 'Margem crítica. Só compensa igualar se a oferta estiver girando caixa por estratégia maior.'
          : simulated.margemReal < 12
            ? 'Dá para operar, mas com rédea curta em Ads, cupom e logística.'
            : 'Existe espaço para disputar com inteligência, sem se jogar em guerra burra.';
      output.classList.remove('hidden');
      output.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
          <span class="tag ${riskTone}">${extracted.marketplace ? esc(getMarketplaceLabel(extracted.marketplace)) : 'Canal não detectado'}</span>
          <span class="tag tag-neutral">Preço observado ${fmt(competitorPrice)}</span>
          ${competitorCategory ? `<span class="tag tag-neutral">${esc(competitorCategory)}</span>` : ''}
        </div>
        ${extracted.titleGuess ? `<p class="mt-3 text-sm font-semibold text-slate-800">Título inferido: ${esc(extracted.titleGuess)}</p>` : ''}
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div><strong>Se você igualar:</strong> ${simulated.inviavel ? 'conta inviável' : `${fmt(simulated.precoEfetivo)} com lucro de ${fmt(simulated.lucro)}`}</div>
          <div><strong>Gap contra o rival:</strong> ${gap === null ? '—' : (gap >= 0 ? `+ ${fmt(gap)}` : `- ${fmt(Math.abs(gap))}`)}</div>
        </div>
        <p class="mt-3">${action}</p>`;
      animateMetricFeedback(output, simulated.inviavel || simulated.lucro <= 0 ? 'bad' : 'good');
    }

    function handleSmartPaste(event) {
      if (document.getElementById('modal').classList.contains('hidden')) return;
      const pasted = (event.clipboardData || window.clipboardData)?.getData('text') || '';
      if (!pasted || !pasted.includes('\t')) return;
      const row = pasted.trim().split(/\r?\n/)[0].split('\t').map((item) => item.trim()).filter((item, idx, arr) => !(idx === arr.length - 1 && item === ''));
      if (row.length < 3) return;
      event.preventDefault();
      const current = getFormState();
      const patch = {};
      if (row.length >= 5) {
        patch.idCustom = row[0];
        patch.nome = row[1];
        patch.sku = row[2];
        patch.custo = row[3];
        patch.categoria = row[4];
      } else if (row.length === 4) {
        patch.idCustom = row[0];
        patch.nome = row[1];
        patch.sku = row[2];
        patch.custo = row[3];
      } else {
        patch.nome = row[0];
        patch.sku = row[1];
        patch.custo = row[2];
      }
      setFormState({ ...current, ...patch });
      showToast('Linha do Excel colada automaticamente.', 'success');
    }

    function resetForm() {
      [
        'edit-id', 'draft-id', 'prod-id-custom', 'prod-nome', 'prod-sku', 'prod-custo', 'prod-margem', 'prod-preco-fixo',
        'prod-lucro-desejado', 'prod-outros', 'prod-full', 'prod-desconto', 'prod-imposto', 'prod-afiliados', 'prod-roas', 'prod-categoria', 'prod-marketplace-rate', 'prod-marketplace-fixed'
      ].forEach((id) => {
        document.getElementById(id).value = '';
      });
      document.getElementById('prod-marketplace').value = activeMarketplace !== 'todos' ? activeMarketplace : 'shopee';
      document.getElementById('prod-listing-type').value = 'classic';
      updateMarketplaceFields();
      setModo('margem');
      document.getElementById('preview-card').classList.add('hidden');
      document.getElementById('preview-empty').classList.remove('hidden');
      updatePreviewWaterfall(null, null);
      updateWarGame();
      setMentorInline(null, null);
      setModalSaveLabel('Criar produto');
      modalSnapshot = '';
      updateSaveButtonState();
    }

    async function openModal(id = null) {
      if (!(await ensureCanSwitchModal())) return;
      resetForm();
      const isEdit = id !== null;

      if (isEdit) {
        const p = products.find((x) => x.id === id);
        if (!p) return;
        document.getElementById('modal-title').textContent = 'Editar produto';
        setModalSaveLabel('Salvar alterações');
        setFormState({
          editId: id,
          draftId: '',
          nome: p.nome,
          custo: p.custo,
          idCustom: p.idCustom || '',
          sku: p.sku || '',
          marketplace: p.marketplace || 'shopee',
          modo: p.modo || 'margem',
          margem: p.margem || '',
          precoVendaFixo: p.precoVendaFixo || '',
          lucroDesejado: p.lucroDesejado || '',
          outros: p.outros || '',
          full: p.full || '',
          desconto: p.desconto || '',
          imposto: p.imposto || '',
          afiliados: p.afiliados || '',
          roas: p.roas || '',
          categoria: p.categoria || '',
          listingType: p.listingType || 'classic',
          marketplaceRate: p.marketplaceRate || '',
          marketplaceFixed: p.marketplaceFixed || ''
        });
      } else {
        document.getElementById('modal-title').textContent = 'Novo produto';
        setModalSaveLabel('Criar produto');
        document.getElementById('prod-margem').value = '20';
        calcPreview();
      }

      document.getElementById('modal').dataset.mode = isEdit ? 'edit' : 'create';
      const draftsPanel = document.getElementById('drafts-panel');
      if (draftsPanel) draftsPanel.classList.toggle('hidden', isEdit);
      renderDrafts();
      document.getElementById('modal').classList.remove('hidden');
      document.getElementById('modal').classList.add('flex');
      setModalSnapshot();
      updateSaveButtonState();
      document.getElementById('prod-id-custom').focus();
    }

    async function closeModal(force = false, preserveDraft = true) {
      const editId = document.getElementById('edit-id').value;
      const currentState = getFormState();
      const hasChanges = hasUnsavedModalChanges();
      const hasDraftId = !!currentState.draftId;
      const hasDraftData = hasMeaningfulDraft(currentState);

      if (!force && hasChanges) {
        const ok = await showConfirmPopup({
          title: 'Fechar ficha?',
          message: editId
            ? 'Existem alterações não salvas nesta ficha. Deseja fechar mesmo assim?'
            : 'Esta ficha ainda não foi salva. Deseja fechar e enviar para a pasta de rascunhos?',
          confirmText: editId ? 'Fechar sem salvar' : 'Salvar nos rascunhos',
          cancelText: 'Continuar editando',
          tone: editId ? 'primary' : 'danger'
        });
        if (!ok) return;
      }

      if (editId || !preserveDraft) {
        clearFormDraft();
      } else if (hasDraftId) {
        if (hasChanges) {
          saveFormDraft();
          showToast('Rascunho atualizado.', 'info');
        }
      } else if (hasDraftData) {
        saveFormDraft();
        showToast('Rascunho salvo na pasta de rascunhos.', 'info');
      } else {
        clearFormDraft();
      }

      document.getElementById('modal').classList.add('hidden');
      document.getElementById('modal').classList.remove('flex');
      resetForm();
    }

    function findDuplicateRecord(prod, currentProductId = null, currentDraftId = '') {
      const nomeKey = normalizeCompareValue(prod.nome);
      const idKey = normalizeCompareValue(prod.idCustom);
      const skuKey = normalizeCompareValue(prod.sku);

      const targetMarketplace = prod.marketplace || 'shopee';
      const existingProduct = products.find((item) => item.id !== currentProductId && (
        (idKey && normalizeCompareValue(item.idCustom) === idKey) ||
        ((nomeKey && normalizeCompareValue(item.nome) === nomeKey) && (item.marketplace || 'shopee') === targetMarketplace) ||
        ((skuKey && normalizeCompareValue(item.sku) === skuKey) && (item.marketplace || 'shopee') === targetMarketplace)
      ));
      if (existingProduct) {
        if (idKey && normalizeCompareValue(existingProduct.idCustom) === idKey) return `Já existe um anúncio salvo com este ID: ${existingProduct.idCustom}.`;
        if (nomeKey && normalizeCompareValue(existingProduct.nome) === nomeKey && (existingProduct.marketplace || 'shopee') === targetMarketplace) return `Já existe um anúncio com este nome em ${getMarketplaceLabel(targetMarketplace)}.`;
        if (skuKey && normalizeCompareValue(existingProduct.sku) === skuKey && (existingProduct.marketplace || 'shopee') === targetMarketplace) return `Já existe um anúncio com este SKU em ${getMarketplaceLabel(targetMarketplace)}.`;
      }

      const existingDraft = drafts.find((item) => item.draftId !== currentDraftId && (
        (idKey && normalizeCompareValue(item.idCustom) === idKey) ||
        ((nomeKey && normalizeCompareValue(item.nome) === nomeKey) && (item.marketplace || 'shopee') === targetMarketplace) ||
        ((skuKey && normalizeCompareValue(item.sku) === skuKey) && (item.marketplace || 'shopee') === targetMarketplace)
      ));
      if (existingDraft) {
        if (idKey && normalizeCompareValue(existingDraft.idCustom) === idKey) return `Já existe um rascunho com este ID: ${existingDraft.idCustom}.`;
        if (nomeKey && normalizeCompareValue(existingDraft.nome) === nomeKey && (existingDraft.marketplace || 'shopee') === targetMarketplace) return `Já existe um rascunho com este nome em ${getMarketplaceLabel(targetMarketplace)}.`;
        if (skuKey && normalizeCompareValue(existingDraft.sku) === skuKey && (existingDraft.marketplace || 'shopee') === targetMarketplace) return `Já existe um rascunho com este SKU em ${getMarketplaceLabel(targetMarketplace)}.`;
      }

      return '';
    }

    function validateProduct(prod, currentProductId = null, currentDraftId = '') {
      const requiredError = getRequiredFieldError(prod);
      if (requiredError) return requiredError;
      if (prod.desconto < 0 || prod.desconto > 80) return 'A promoção deve ficar entre 0% e 80%.';
      if (prod.imposto < 0 || prod.imposto > 50) return 'Imposto deve ficar entre 0% e 50%.';
      if (prod.afiliados < 0 || prod.afiliados > 50) return 'Afiliados devem ficar entre 0% e 50%.';
      if (prod.full < 0) return 'FULL não pode ser negativo.';
      const duplicateError = findDuplicateRecord(prod, currentProductId, currentDraftId);
      if (duplicateError) return duplicateError;
      return '';
    }

    async function saveProduct() {
      if (isSavingProduct) return;
      const modo = document.querySelector('.modo-btn.modo-active')?.id?.replace('modo-', '') || 'margem';
      const prod = {
        nome: document.getElementById('prod-nome').value.trim(),
        custo: parseLocaleNumber(document.getElementById('prod-custo').value),
        modo,
        idCustom: document.getElementById('prod-id-custom').value.trim(),
        sku: document.getElementById('prod-sku').value.trim(),
        marketplace: document.getElementById('prod-marketplace').value,
        margem: parseLocaleNumber(document.getElementById('prod-margem').value) || 0,
        precoVendaFixo: parseLocaleNumber(document.getElementById('prod-preco-fixo').value) || 0,
        lucroDesejado: parseLocaleNumber(document.getElementById('prod-lucro-desejado').value) || 0,
        outros: parseLocaleNumber(document.getElementById('prod-outros').value) || 0,
        full: parseLocaleNumber(document.getElementById('prod-full').value) || 0,
        desconto: parseLocaleNumber(document.getElementById('prod-desconto').value) || 0,
        imposto: parseLocaleNumber(document.getElementById('prod-imposto').value) || 0,
        afiliados: parseLocaleNumber(document.getElementById('prod-afiliados').value) || 0,
        roas: parseLocaleNumber(document.getElementById('prod-roas').value) || 0,
        categoria: document.getElementById('prod-categoria').value.trim(),
        listingType: document.getElementById('prod-listing-type').value,
        marketplaceRate: parseLocaleNumber(document.getElementById('prod-marketplace-rate').value) || 0,
        marketplaceFixed: parseLocaleNumber(document.getElementById('prod-marketplace-fixed').value) || 0
      };

      const editId = document.getElementById('edit-id').value;
      const currentProductId = editId ? parseInt(editId, 10) : null;
      const currentDraftId = document.getElementById('draft-id').value || '';
      const validationError = validateProduct(prod, currentProductId, currentDraftId);
      if (validationError) {
        showToast(validationError, 'error');
        return;
      }

      if (editId) {
        updateProductRecord(parseInt(editId, 10), prod);
        showToast('Produto atualizado.', 'success');
      } else {
        addProductRecord(prod);
        showToast('Produto salvo.', 'success');
      }

      const saveBtn = document.getElementById('modal-save-btn');
      isSavingProduct = true;
      setButtonLoading(saveBtn, true);

      await new Promise((resolve) => setTimeout(resolve, 420));

      saveProducts();
      renderProducts();
      clearFormDraft();
      closeModal(true, false);

      isSavingProduct = false;
      setButtonLoading(saveBtn, false);
    }

    async function deleteProduct(id) {

      const prod = products.find((p) => p.id === id);
      if (!prod) return;
      const ok = await showConfirmPopup({
        title: 'Remover produto?',
        message: `Remover o produto "${prod.nome}"?`,
        confirmText: 'Remover',
        cancelText: 'Cancelar',
        tone: 'danger'
      });
      if (!ok) return;
      products = products.filter((p) => p.id !== id);
      selectedProductIds.delete(id);
      saveProducts();
      renderProducts();
      showToast('Produto removido.', 'info');
    }

    function getVisibleProducts() {
      const q = (document.getElementById('search').value || '').toLowerCase().trim();
      const sort = document.getElementById('sort').value;

      let list = products
        .filter((p) => activeMarketplace === 'todos' || (p.marketplace || 'shopee') === activeMarketplace)
        .filter((p) => [p.nome, p.categoria || '', p.idCustom || '', p.sku || '', getMarketplaceLabel((p.marketplace || 'shopee')).toLowerCase()].join(' ').toLowerCase().includes(q))
        .map((p) => ({ ...p, _r: calcProduct(p) }));

      if (sort === 'nome') list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      else if (sort === 'custo_asc') list.sort((a, b) => a.custo - b.custo);
      else if (sort === 'preco_asc') list.sort((a, b) => (a._r.precoEfetivo || 0) - (b._r.precoEfetivo || 0));
      else if (sort === 'lucro_desc') list.sort((a, b) => (b._r.lucro || 0) - (a._r.lucro || 0));
      else if (sort === 'margem_desc') list.sort((a, b) => (b._r.margemReal || 0) - (a._r.margemReal || 0));

      return list;
    }

    function renderProductsNow() {
      setSearchClearVisibility();
      updateMarketplaceCounters();
      syncSelectedProducts();

      const list = getVisibleProducts();
      const families = getProductFamilies(list);
      lastVisibleProductIds = list.map((item) => item.id);
      const tbody = document.getElementById('products-grid');
      const familyTbody = document.getElementById('product-families-grid');
      const empty = document.getElementById('empty-state');
      const tableWrap = document.getElementById('products-table-wrap');
      const familyWrap = document.getElementById('product-families-wrap');

      if (list.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="grid-empty-cell">Nada encontrado nesta visão. Ajuste filtros ou salve um item no cadastro express.</td></tr>';
        if (familyTbody) familyTbody.innerHTML = '<tr><td colspan="8" class="grid-empty-cell">Nenhum produto base encontrado nesta visão.</td></tr>';
        empty.classList.remove('hidden');
        if (tableWrap) tableWrap.classList.add('hidden');
        if (familyWrap) familyWrap.classList.add('hidden');
      } else {
        empty.classList.add('hidden');
        if (tbody) tbody.innerHTML = list.map((p, index) => renderProductRow(p, index)).join('');
        if (familyTbody) familyTbody.innerHTML = families.map((family) => renderFamilyRow(family)).join('');
      }

      const productsBtn = document.getElementById('workspace-view-products-btn');
      const listingsBtn = document.getElementById('workspace-view-listings-btn');
      const familiesWrapToggle = document.getElementById('product-families-wrap');
      const listingsWrapToggle = document.getElementById('products-table-wrap');
      if (productsBtn) productsBtn.classList.toggle('active', currentWorkspaceView === 'products');
      if (listingsBtn) listingsBtn.classList.toggle('active', currentWorkspaceView === 'listings');
      if (familiesWrapToggle) familiesWrapToggle.classList.toggle('hidden', currentWorkspaceView !== 'products' || list.length === 0);
      if (listingsWrapToggle) listingsWrapToggle.classList.toggle('hidden', currentWorkspaceView !== 'listings' || list.length === 0);
      applyColumnVisibility();
      updateSelectAllVisibleState();
      updateBulkBar(list);
      updateDashboard(list, families);
      updateQuickSummary(list, families);
      updateMentorDashboard(list);
      updateSpyProducts(list);
    }

    function renderProducts() {
      if (renderState.rafId) return;
      renderState.rafId = requestAnimationFrame(() => {
        renderState.rafId = 0;
        renderProductsNow();
      });
    }

    function scheduleDashboardRefresh() {
      clearTimeout(renderState.dashboardTimer);
      renderState.dashboardTimer = setTimeout(() => {
        const list = getVisibleProducts();
        const families = getProductFamilies(list);
        updateDashboard(list, families);
        updateQuickSummary(list, families);
        updateMentorDashboard(list);
        updateSpyProducts(list);
      }, 120);
    }

    function patchRenderedProductRow(id) {
      const tbody = document.getElementById('products-grid');
      if (!tbody) return false;

      const currentList = getVisibleProducts();
      const rowIndex = currentList.findIndex((item) => item.id === id);
      const existingRow = tbody.querySelector(`tr[data-product-id="${id}"]`);

      if (rowIndex === -1 || !existingRow) return false;

      const temp = document.createElement('tbody');
      temp.innerHTML = renderProductRow(currentList[rowIndex], rowIndex).trim();
      const nextRow = temp.firstElementChild;
      if (!nextRow) return false;

      existingRow.replaceWith(nextRow);
      applyColumnVisibility();
      updateSelectAllVisibleState();
      updateBulkBar(currentList);
      scheduleDashboardRefresh();
      return true;
    }

    function renderProductRow(p, index) {

      const r = p._r;
      const isSelected = selectedProductIds.has(p.id);
      const selectedAttr = isSelected ? 'checked' : '';
      const marketLabel = getMarketplaceLabel(p.marketplace || 'shopee');
      const lucroClass = r.inviavel ? 'neutral' : (r.lucro >= 0 ? 'good' : 'bad');
      const margemClass = r.inviavel ? 'neutral' : (r.margemReal >= 12 ? 'good' : r.margemReal >= 5 ? 'warn' : 'bad');
      const statusClass = r.inviavel ? 'bad' : (r.taxasPendentes ? 'warn' : (r.margemReal >= 12 ? 'good' : r.margemReal >= 5 ? 'warn' : 'bad'));
      const statusText = r.inviavel ? 'Inviável' : (r.taxasPendentes ? 'Taxa pendente' : (r.margemReal >= 12 ? 'Saudável' : r.margemReal >= 5 ? 'Atenção' : 'Crítico'));
      const priceText = r.inviavel ? 'Inviável' : fmt(r.precoEfetivo);
      const lucroText = r.inviavel ? '—' : fmt(r.lucro);
      const margemText = r.inviavel ? '—' : `${r.margemReal.toFixed(1)}%`;
      const targetValue = numberOrZero(p.margem);
      const extraMeta = [
        p.idCustom ? `<span class="row-meta-chip">ID ${esc(p.idCustom)}</span>` : '',
        p.sku ? `<span class="row-meta-chip">SKU ${esc(p.sku)}</span>` : '',
        p.categoria ? `<span class="row-meta-chip">${esc(p.categoria)}</span>` : '',
        numberOrZero(p.desconto) > 0 ? `<span class="row-meta-chip">-${numberOrZero(p.desconto).toFixed(1).replace('.0','')}%</span>` : ''
      ].filter(Boolean).join('');

      return `
        <tr data-product-id="${p.id}" class="${isSelected ? 'is-selected' : ''}">
          <td>
            <input type="checkbox" class="grid-checkbox" aria-label="Selecionar ${esc(p.nome)}" ${selectedAttr} onclick="event.stopPropagation()" onchange="toggleProductSelection(${p.id}, this.checked)" />
          </td>
          <td data-col="product">
            <div class="row-product-cell">
              <input type="text" class="inline-cell" value="${esc(p.nome)}" aria-label="Nome do produto ${esc(p.nome || `Item ${index + 1}`)}" data-grid-col="nome" data-product-id="${p.id}" onfocus="rememberInlineInitial(this)" onkeydown="handleInlineKeydown(event, this); handleGridNavigation(event, this)" onblur="saveInlineText(${p.id}, 'nome', this.value, this)" />
              <div class="row-meta">${extraMeta || `<span class="row-meta-chip">Item #${index + 1}</span>`}</div>
            </div>
          </td>
          <td data-col="marketplace">
            <select class="inline-select row-marketplace" aria-label="Marketplace do produto ${esc(p.nome || `Item ${index + 1}`)}" data-grid-col="marketplace" data-product-id="${p.id}" onfocus="rememberInlineInitial(this)" onkeydown="handleGridNavigation(event, this)" onchange="saveInlineSelect(${p.id}, 'marketplace', this.value)">${renderMarketplaceOptions(p.marketplace || 'shopee')}</select>
          </td>
          <td data-col="custo" class="grid-num">
            <input type="text" inputmode="decimal" class="inline-money compact" value="${esc(formatMoneyInputValue(p.custo))}" aria-label="Custo do produto ${esc(p.nome || `Item ${index + 1}`)}" data-grid-col="custo" data-product-id="${p.id}" onfocus="rememberInlineInitial(this)" oninput="handleMoneyTyping(this)" onkeydown="handleInlineKeydown(event, this); handleGridNavigation(event, this)" onblur="saveInlineMoney(${p.id}, 'custo', this.value, this)" />
          </td>
          <td data-col="target" class="grid-num">
            <input type="number" min="0" step="0.1" class="inline-number compact" value="${esc(targetValue.toFixed(1).replace('.0',''))}" aria-label="Meta de margem do produto ${esc(p.nome || `Item ${index + 1}`)}" data-grid-col="margem" data-product-id="${p.id}" onfocus="rememberInlineInitial(this)" onkeydown="handleInlineKeydown(event, this); handleGridNavigation(event, this)" onblur="saveInlineNumber(${p.id}, 'margem', this.value, 'margem', this)" />
          </td>
          <td data-col="preco" class="grid-num">${priceText}</td>
          <td data-col="lucro" class="grid-num"><span class="row-status ${lucroClass}">${lucroText}</span></td>
          <td data-col="margem" class="grid-num"><span class="row-status ${margemClass}">${margemText}</span></td>
          <td data-col="status"><span class="row-status ${statusClass}">${statusText}</span></td>
          <td>
            <div class="row-actions">
              <button type="button" class="row-action-btn" onclick="openDetail(${p.id})" title="Ver leitura">
                <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.7"/></svg>
              </button>
              <button type="button" class="row-action-btn" onclick="openModal(${p.id})" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true"><path d="M4 20h4.2L18 10.2 13.8 6 4 15.8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m11.8 8 4.2 4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
              </button>
              <button type="button" class="row-action-btn danger" onclick="deleteProduct(${p.id})" title="Remover">
                <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4" aria-hidden="true"><path d="M5 7h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m8 7 .7 10.2a1.6 1.6 0 0 0 1.6 1.5h3.4a1.6 1.6 0 0 0 1.6-1.5L16 7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }

    function closeColumnsMenu() {
      const menu = document.getElementById('columns-menu');
      if (menu) menu.classList.add('hidden');
    }

    function toggleColumnsMenu() {
      const menu = document.getElementById('columns-menu');
      if (!menu) return;
      menu.classList.toggle('hidden');
    }

    function updateColumnToggle(column, checked) {
      visibleColumns[column] = checked;
      saveVisibleColumns();
      applyColumnVisibility();
      renderProducts();
    }

    function applyColumnVisibility() {
      document.querySelectorAll('[data-col]').forEach((el) => {
        const key = el.getAttribute('data-col');
        if (!key) return;
        const visible = visibleColumns[key] !== false;
        el.classList.toggle('hidden-col', !visible);
      });
      document.querySelectorAll('[data-column-toggle]').forEach((input) => {
        const key = input.getAttribute('data-column-toggle');
        input.checked = visibleColumns[key] !== false;
      });
      const btn = document.getElementById('columns-menu-btn');
      if (btn) {
        const hidden = Object.values(visibleColumns).filter((value) => value === false).length;
        btn.textContent = hidden ? `Colunas (${hidden} ocultas)` : 'Colunas visíveis';
      }
    }

    function applyPanelVisibility() {
      const map = { compare: 'compare-panel', mentor: 'mentor-panel', spy: 'spy-panel' };
      Object.entries(map).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('section-hidden', panelVisibility[key] === false);
        const btn = document.getElementById(`toggle-panel-${key}`);
        if (btn) btn.classList.toggle('is-off', panelVisibility[key] === false);
      });
    }

    function togglePanelVisibility(key) {
      panelVisibility[key] = !(panelVisibility[key] !== false);
      savePanelVisibility();
      applyPanelVisibility();
    }

    function applyTableDensity() {
      document.body.classList.toggle('table-density-compact', isCompactDensity);
      document.body.classList.toggle('table-density-comfortable', !isCompactDensity);
      const btn = document.getElementById('density-toggle-btn');
      if (btn) btn.textContent = isCompactDensity ? 'Densidade compacta' : 'Densidade confortável';
    }

    function toggleTableDensity() {
      isCompactDensity = !isCompactDensity;
      saveTableDensity();
      applyTableDensity();
    }

    function updateSelectAllVisibleState() {
      const headerToggle = document.getElementById('select-all-visible');
      if (!headerToggle) return;
      if (!lastVisibleProductIds.length) {
        headerToggle.checked = false;
        headerToggle.indeterminate = false;
        return;
      }
      const selectedVisible = lastVisibleProductIds.filter((id) => selectedProductIds.has(id)).length;
      headerToggle.checked = selectedVisible > 0 && selectedVisible === lastVisibleProductIds.length;
      headerToggle.indeterminate = selectedVisible > 0 && selectedVisible < lastVisibleProductIds.length;
    }

    function updateBulkBar(list = []) {
      const bar = document.getElementById('bulk-bar');
      const count = document.getElementById('bulk-count');
      const copy = document.getElementById('bulk-copy-text');
      const selectedCount = selectedProductIds.size;
      if (!bar || !count || !copy) return;
      if (currentWorkspaceView !== 'listings') { bar.classList.add('hidden'); return; }
      if (!selectedCount) {
        bar.classList.add('hidden');
        return;
      }
      bar.classList.remove('hidden');
      const visibleSelected = list.filter((item) => selectedProductIds.has(item.id)).length;
      count.textContent = `${selectedCount} ${selectedCount === 1 ? 'produto selecionado' : 'produtos selecionados'}`;
      copy.textContent = `${visibleSelected} visíveis nesta tela. Deixe vazio o que não quiser mexer e aplique em massa só nos itens marcados.`;
    }

    function toggleProductSelection(id, checked) {
      if (checked) selectedProductIds.add(id);
      else selectedProductIds.delete(id);
      renderProducts();
    }

    function toggleAllVisibleFromHeader(checked) {
      if (checked) selectVisibleProducts();
      else clearSelectedProducts();
    }

    function selectVisibleProducts() {
      lastVisibleProductIds.forEach((id) => selectedProductIds.add(id));
      renderProducts();
    }

    function clearSelectedProducts() {
      selectedProductIds.clear();
      renderProducts();
    }

    function getQuickEntryData() {
      return {
        nome: (document.getElementById('quick-nome')?.value || '').trim(),
        custo: parseLocaleNumber(document.getElementById('quick-custo')?.value || 0),
        marketplace: document.getElementById('quick-marketplace')?.value || (activeMarketplace !== 'todos' ? activeMarketplace : 'shopee'),
        margem: parseLocaleNumber(document.getElementById('quick-margem')?.value || 20) || 20
      };
    }

    function clearQuickEntry(focusName = true) {
      if (document.getElementById('quick-nome')) document.getElementById('quick-nome').value = '';
      if (document.getElementById('quick-custo')) document.getElementById('quick-custo').value = '';
      if (document.getElementById('quick-margem')) document.getElementById('quick-margem').value = '20';
      if (document.getElementById('quick-marketplace')) document.getElementById('quick-marketplace').value = activeMarketplace !== 'todos' ? activeMarketplace : 'shopee';
      if (focusName && document.getElementById('quick-nome')) document.getElementById('quick-nome').focus();
    }

    function buildQuickProduct(data) {
      return createBaseProduct({
        nome: data.nome,
        custo: data.custo,
        marketplace: data.marketplace,
        margem: data.margem,
        modo: 'margem'
      });
    }

    function saveQuickProduct() {
      const data = getQuickEntryData();
      const prod = buildQuickProduct(data);
      const validationError = validateProduct(prod, null, '');
      if (validationError) {
        showToast(validationError, 'error');
        return;
      }
      addProductRecord(prod);
      saveProducts();
      renderProducts();
      clearQuickEntry();
      showToast('Produto salvo no cadastro express.', 'success');
    }

    async function openQuickAdvanced() {
      const data = getQuickEntryData();
      if (!data.nome || numberOrZero(data.custo) <= 0) {
        showToast('Preencha nome e custo antes de abrir a ficha avançada.', 'info');
        return;
      }
      await openModal();
      setFormState({
        nome: data.nome,
        custo: data.custo,
        marketplace: data.marketplace,
        margem: data.margem,
        modo: 'margem'
      });
      document.getElementById('prod-nome').focus();
    }

    function applyBulkEdit() {
      if (!selectedProductIds.size) {
        showToast('Selecione pelo menos um produto para editar em massa.', 'info');
        return;
      }
      const marketplace = document.getElementById('bulk-marketplace')?.value || '';
      const listingType = document.getElementById('bulk-listing-type')?.value || '';
      const margemRaw = (document.getElementById('bulk-margem')?.value || '').trim();
      const rateRaw = (document.getElementById('bulk-rate')?.value || '').trim();
      const fixedRaw = (document.getElementById('bulk-fixed')?.value || '').trim();
      const descontoRaw = (document.getElementById('bulk-desconto')?.value || '').trim();

      if (!marketplace && !listingType && !margemRaw && !rateRaw && !fixedRaw && !descontoRaw) {
        showToast('Defina ao menos um campo antes de aplicar a edição em massa.', 'info');
        return;
      }

      const margem = parseLocaleNumber(margemRaw || 0);
      const rate = parseLocaleNumber(rateRaw || 0);
      const fixed = parseLocaleNumber(fixedRaw || 0);
      const desconto = parseLocaleNumber(descontoRaw || 0);

      products = products.map((item) => {
        if (!selectedProductIds.has(item.id)) return item;
        const updated = { ...item };
        if (marketplace) updated.marketplace = marketplace;
        if (listingType) updated.listingType = listingType;
        if (margemRaw) {
          updated.modo = 'margem';
          updated.margem = margem;
        }
        if (rateRaw) updated.marketplaceRate = rate;
        if (fixedRaw) updated.marketplaceFixed = fixed;
        if (descontoRaw) updated.desconto = desconto;
        return createBaseProduct(updated);
      });

      saveProducts();
      renderProducts();
      ['bulk-marketplace','bulk-listing-type','bulk-margem','bulk-rate','bulk-fixed','bulk-desconto'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') el.value = '';
        else el.value = '';
      });
      showToast(`Edição em massa aplicada em ${selectedProductIds.size} produtos.`, 'success');
    }

    function updateQuickSummary(list, families = []) {
      const summary = document.getElementById('results-summary');
      const tags = document.getElementById('quick-summary-tags');
      const valid = list.filter((p) => !p._r.inviavel);
      const pending = list.filter((p) => p._r.taxasPendentes).length;
      const discountCount = list.filter((p) => numberOrZero(p.desconto) > 0).length;
      const negative = valid.filter((p) => p._r.lucro < 0).length;
      const healthy = valid.filter((p) => p._r.margemReal >= 20).length;
      const familyCount = families.length || getProductFamilies(list).length;

      summary.textContent = currentWorkspaceView === 'products'
        ? `${familyCount} ${familyCount === 1 ? 'produto base' : 'produtos base'}${activeMarketplace !== 'todos' ? ` em ${getMarketplaceLabel(activeMarketplace)}` : ''}.`
        : `${list.length} ${list.length === 1 ? 'anúncio' : 'anúncios'}${activeMarketplace !== 'todos' ? ` em ${getMarketplaceLabel(activeMarketplace)}` : ''}.`;

      const parts = [];
      parts.push(`<span class="tag tag-neutral">${currentWorkspaceView === 'products' ? familyCount : list.length} em tela</span>`);
      if (currentWorkspaceView === 'products') parts.push(`<span class="tag tag-blue">${list.length} canais vinculados</span>`);
      if (healthy > 0) parts.push(`<span class="tag tag-green">${healthy} com ótima margem</span>`);
      if (discountCount > 0) parts.push(`<span class="tag tag-blue">${discountCount} em promoção</span>`);
      if (pending > 0) parts.push(`<span class="tag tag-amber">${pending} com taxa pendente</span>`);
      if (negative > 0) parts.push(`<span class="tag tag-red">${negative} no prejuízo</span>`);
      if (!parts.length) parts.push('<span class="tag tag-neutral">Sem dados ainda</span>');
      tags.innerHTML = parts.join('');
    }

    function updateDashboard(list, families = []) {
      const familyCount = families.length || getProductFamilies(list).length;
      setAnimatedText('dash-total', String(currentWorkspaceView === 'products' ? familyCount : products.length), 'good');
      const totalFiltered = currentWorkspaceView === 'products' ? familyCount : list.length;
      document.getElementById('dash-total-sub').textContent = activeMarketplace === 'todos'
        ? `${totalFiltered} nesta visão`
        : `${totalFiltered} visíveis em ${getMarketplaceLabel(activeMarketplace)}`;

      const allCalculated = products.map((p) => ({ ...p, _calc: calcProduct(p) }));
      const validAll = allCalculated.filter((p) => !p._calc.inviavel);
      const criticalCount = list.filter((p) => !p._r.inviavel && p._r.margemReal < 5).length;
      setDeltaText('dash-total-delta', criticalCount ? `${criticalCount} item(ns) críticos na visão atual.` : 'Sem itens críticos na visão atual.', criticalCount ? 'warn' : 'good');

      const valid = list.filter((p) => !p._r.inviavel);
      if (!valid.length) {
        setAnimatedText('dash-avg-margin', '0%', 'bad');
        setAnimatedText('dash-avg-profit', 'R$ 0,00', 'bad');
        setAnimatedText('dash-avg-price', 'R$ 0,00', 'bad');
        setDeltaText('dash-avg-margin-delta', 'Sem comparação ainda.', 'neutral');
        setDeltaText('dash-avg-profit-delta', 'Sem comparação ainda.', 'neutral');
        setDeltaText('dash-avg-price-delta', 'Sem comparação ainda.', 'neutral');
        updateCompareProducts(list);
        return;
      }
      const avg = (arr) => arr.reduce((sum, value) => sum + value, 0) / arr.length;
      const avgMargin = avg(valid.map((p) => p._r.margemReal));
      const avgProfit = avg(valid.map((p) => p._r.lucro));
      const avgPrice = avg(valid.map((p) => p._r.precoEfetivo));
      const avgMarginAll = validAll.length ? avg(validAll.map((p) => p._calc.margemReal)) : avgMargin;
      const avgProfitAll = validAll.length ? avg(validAll.map((p) => p._calc.lucro)) : avgProfit;
      const avgPriceAll = validAll.length ? avg(validAll.map((p) => p._calc.precoEfetivo)) : avgPrice;
      const marginDiff = avgMargin - avgMarginAll;
      const profitDiff = avgProfit - avgProfitAll;
      const priceDiff = avgPrice - avgPriceAll;
      setAnimatedText('dash-avg-margin', `${avgMargin.toFixed(1)}%`, avgMargin >= 12 ? 'good' : avgMargin >= 5 ? 'warn' : 'bad');
      setAnimatedText('dash-avg-profit', fmt(avgProfit), avgProfit >= 0 ? 'good' : 'bad');
      setAnimatedText('dash-avg-price', fmt(avgPrice), 'good');
      setDeltaText('dash-avg-margin-delta', `${marginDiff >= 0 ? '▲' : '▼'} ${Math.abs(marginDiff).toFixed(1)} p.p. vs base total`, marginDiff >= 0 ? 'good' : 'bad');
      setDeltaText('dash-avg-profit-delta', `${profitDiff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(profitDiff))} vs média da carteira`, profitDiff >= 0 ? 'good' : 'bad');
      setDeltaText('dash-avg-price-delta', `${priceDiff >= 0 ? '▲' : '▼'} ${fmt(Math.abs(priceDiff))} vs preço médio geral`, Math.abs(priceDiff) < 1 ? 'neutral' : priceDiff >= 0 ? 'good' : 'warn');
      updateCompareProducts(list);
    }

    function updateMarketplaceCounters() {
      const counts = {
        todos: products.length,
        shopee: products.filter((p) => (p.marketplace || 'shopee') === 'shopee').length,
        mercadolivre: products.filter((p) => (p.marketplace || 'shopee') === 'mercadolivre').length,
        tiktok: products.filter((p) => (p.marketplace || 'shopee') === 'tiktok').length
      };
      Object.entries(counts).forEach(([key, value]) => {
        const el = document.getElementById(`count-${key}`);
        if (el) el.textContent = value;
      });
    }

    function getMarketplaceLabel(mp) {
      return {
        todos: 'Todos',
        shopee: 'Shopee',
        mercadolivre: 'Mercado Livre',
        tiktok: 'TikTok Shop'
      }[mp] || 'Marketplace';
    }

    function setModo(modo) {
      ['margem', 'preco', 'lucro'].forEach((m) => {
        document.getElementById(`modo-${m}`).classList.remove('modo-active');
        document.getElementById(`input-modo-${m}`).classList.add('hidden');
      });
      document.getElementById(`modo-${modo}`).classList.add('modo-active');
      document.getElementById(`input-modo-${modo}`).classList.remove('hidden');
      calcPreview();
      handleFormDraftInput();
    }

    function setMarketplace(mp) {
      activeMarketplace = mp;
      ['todos', 'shopee', 'mercadolivre', 'tiktok'].forEach((id) => {
        const btn = document.getElementById(`tab-${id}`);
        btn.classList.toggle('active', id === mp);
      });
      updateTaxSection();
      const quickMarketplace = document.getElementById('quick-marketplace');
      if (quickMarketplace && mp !== 'todos') quickMarketplace.value = mp;
      renderProducts();
    }

    function updateTaxSection() {
      const section = document.getElementById('taxes-section');
      const panel = document.getElementById('tabela-panel');
      const arrow = document.getElementById('tabela-arrow');
      const title = document.getElementById('tabela-title');
      const subtitle = document.getElementById('tabela-subtitle');
      const shopeeContent = document.getElementById('tabela-shopee-content');
      const emptyContent = document.getElementById('tabela-marketplace-empty');
      const emptyTitle = document.getElementById('tabela-empty-title');
      const emptyText = document.getElementById('tabela-empty-text');

      if (!section || !panel || !arrow || !title || !subtitle || !shopeeContent || !emptyContent || !emptyTitle || !emptyText) return;

      if (activeMarketplace === 'todos') {
        section.classList.add('hidden');
        panel.classList.add('hidden');
        arrow.style.transform = 'rotate(0deg)';
        return;
      }

      section.classList.remove('hidden');
      const label = getMarketplaceLabel(activeMarketplace);
      title.textContent = `Tabela de taxas ${label}`;
      subtitle.textContent = '';
      subtitle.classList.add('hidden');

      if (activeMarketplace === 'shopee') {
        shopeeContent.classList.remove('hidden');
        emptyContent.classList.add('hidden');
        return;
      }

      shopeeContent.classList.add('hidden');
      emptyContent.classList.remove('hidden');
      emptyTitle.textContent = `Taxas de ${label}`;
      emptyText.textContent = `As taxas oficiais de ${label} ainda não foram cadastradas nesta calculadora.`;
    }

    function toggleTabela() {
      const panel = document.getElementById('tabela-panel');
      const arrow = document.getElementById('tabela-arrow');
      panel.classList.toggle('hidden');
      arrow.style.transform = panel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    function backdropClose(e, id) {
      if (e.target.id !== id) return;
      if (id === 'notice-popup') closeNoticePopup(true);
      if (id === 'modal-detail') closeDetail();
      if (id === 'mentor-popup') closeMentorPopup();
      if (id === 'profile-modal') closeProfileModal();
    }

    function openDetail(id) {
      currentDetailProductId = id;
      const prod = products.find((p) => p.id === id);
      if (!prod) return;
      const r = calcProduct(prod);
      const health = getHealthInfo(r);
      const marketplace = getMarketplaceLabel(prod.marketplace || 'shopee');

      document.getElementById('detail-title').textContent = prod.nome;

      const idChip = prod.idCustom ? `
        <span class="meta-chip">
          <span>ID</span>
          <strong>${esc(prod.idCustom)}</strong>
          <button type="button" class="meta-chip-copy" onclick="copyToClipboard('${esc(prod.idCustom).replace(/'/g, "\'")}', 'ID copiado.')" title="Copiar ID">
            <svg viewBox="0 0 24 24" fill="none" class="h-3.5 w-3.5" aria-hidden="true">
              <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/>
              <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </button>
        </span>` : '';
      const skuChip = prod.sku ? `<span class="meta-chip"><span>SKU</span><strong>${esc(prod.sku)}</strong></span>` : '';
      const categoryChip = prod.categoria ? `<span class="meta-chip"><strong>${esc(prod.categoria)}</strong></span>` : '';
      const promoChip = prod.desconto > 0 ? `<span class="tag tag-neutral">-${prod.desconto}%</span>` : '';

      let html = `<div class="space-y-5">`;
      html += `<div class="flex flex-wrap gap-2">
        ${idChip}
        ${skuChip}
        <span class="tag tag-orange">${marketplace}</span>
        ${categoryChip}
        ${promoChip}
      </div>`;


      html += `
        <section class="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.15fr)]">
          <div class="soft-row-card">
            <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-400">Custos</p>
            <div class="mt-3 space-y-1">
              <div class="summary-row pt-0"><span>Custo do produto</span><strong>${fmt(prod.custo)}</strong></div>
              <div class="summary-row"><span>Embalagem</span><strong>${prod.outros > 0 ? '- ' + fmt(prod.outros) : fmt(0)}</strong></div>
              ${prod.full > 0 ? `<div class="summary-row"><span>FULL</span><strong class="text-red-500">- ${fmt(prod.full)}</strong></div>` : ''}
              ${prod.imposto > 0 ? `<div class="summary-row"><span>Imposto (${prod.imposto}%)</span><strong class="text-red-500">- ${fmt(r.impostoVal)}</strong></div>` : ''}
              ${prod.afiliados > 0 ? `<div class="summary-row"><span>Afiliados (${prod.afiliados}%)</span><strong class="text-red-500">- ${fmt(r.afiliadosVal)}</strong></div>` : ''}
              ${prod.roas > 0 ? `<div class="summary-row"><span>ROAS ${prod.roas}</span><strong class="text-red-500">- ${fmt(r.adCost)}</strong></div>` : ''}
            </div>
          </div>

          <div class="soft-row-card detail-results-card">
            <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-400">Resultado</p>
            ${r.inviavel ? `
              <div class="mt-4 rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">Esta configuração ficou inviável. Revise custos, margem ou preço.</div>
            ` : `
              <div class="mt-3 space-y-2">
                <div class="detail-result-row pt-0">
                  <span class="result-label-blue">PREÇO PARA ANUNCIAR</span>
                  <strong class="result-value-blue">${fmt(r.precoVenda)}</strong>
                </div>
                <div class="detail-result-row">
                  <span class="result-label-pink">PREÇO PARA VENDER</span>
                  <strong class="result-value-pink">${fmt(r.precoEfetivo)}</strong>
                </div>
                <div class="summary-row"><span>Lucro líquido</span><strong class="${r.lucro >= 0 ? 'text-emerald-700' : 'text-red-600'}">${fmt(r.lucro)}</strong></div>
                <div class="summary-row"><span>Margem real</span><strong class="${r.margemReal >= 10 ? 'text-emerald-700' : r.margemReal >= 5 ? 'text-amber-600' : 'text-red-600'}">${r.margemReal.toFixed(2)}%</strong></div>
                ${prod.modo === 'margem' ? `<div class="summary-row"><span>Margem desejada</span><strong>${numberOrZero(prod.margem).toFixed(1)}%</strong></div>` : ''}
              </div>
            `}
          </div>
        </section>
      `;

      html += renderDetailDreAndWar(prod, r);

      if (!r.inviavel && !r.taxasPendentes) {
        html += `
          <section class="soft-row-card">
            <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-400">Taxas Shopee</p>
            <div class="mt-3 space-y-1">
              <div class="summary-row pt-0"><span>Faixa ativa</span><strong>${r.bracket.label}</strong></div>
              <div class="summary-row"><span>Comissão (${(r.bracket.rate * 100).toFixed(0)}% × ${fmt(r.precoEfetivo)})</span><strong class="text-red-500">- ${fmt(r.precoEfetivo * r.bracket.rate)}</strong></div>
              <div class="summary-row"><span>Taxa fixa</span><strong class="text-red-500">- ${fmt(r.bracket.fixed)}</strong></div>
              <div class="summary-row"><span>Total de taxas Shopee</span><strong class="text-red-500">- ${fmt(r.taxasShopee)}</strong></div>
            </div>
          </section>
        `;
      }

      if (!r.inviavel && r.taxasPendentes) {
        html += `
          <section class="soft-row-card">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="tag ${health.statusClass}">${health.statusText}</span>
              <p class="text-sm font-semibold text-slate-500">Taxas específicas deste marketplace ainda não foram cadastradas.</p>
            </div>
          </section>
        `;
      }

      const mentor = getMentorInsight(prod, r);

      html += `
        <section class="soft-row-card">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-400">Assistente</p>
              <h3 class="mt-1 text-base font-black text-slate-950">O Mentor de Escala</h3>
            </div>
            <button onclick="runMentorAnalysis('detail', ${prod.id})" class="btn btn-secondary sm:w-auto">Análise do Mentor</button>
          </div>
          <div class="mt-4 flex flex-col gap-3">
            <div class="mentor-badge" data-tone="${esc(mentor.tone)}">
              <span class="mentor-badge-dot"></span>
              <span>${esc(mentor.badge)}</span>
            </div>
            <p class="mentor-copy">${esc(mentor.text)}</p>
          </div>
        </section>

        <div class="detail-actions">
          <button onclick="closeDetail()" class="btn btn-secondary sm:w-auto">Fechar</button>
          <button onclick="closeDetail(); openModal(${prod.id})" class="btn btn-primary sm:w-auto">Editar</button>
        </div>
      `;
      html += `</div>`;

      document.getElementById('detail-body').innerHTML = html;
      document.getElementById('modal-detail').classList.remove('hidden');
      document.getElementById('modal-detail').classList.add('flex');
      focusFirstInContainer(document.getElementById('modal-detail'));
    }

    function closeDetail() {
      currentDetailProductId = null;
      document.getElementById('modal-detail').classList.add('hidden');
      document.getElementById('modal-detail').classList.remove('flex');
    }

    function exportarCSV() {
      if (!products.length) {
        showToast('Não há produtos para exportar.', 'info');
        return;
      }
      const rows = products.map((p) => {
        const r = calcProduct(p);
        return {
          id: p.idCustom || '',
          nome: p.nome || '',
          sku: p.sku || '',
          marketplace: getMarketplaceLabel(p.marketplace || 'shopee'),
          custo: numberOrZero(p.custo).toFixed(2).replace('.', ','),
          preco_venda: numberOrZero(r.precoVenda).toFixed(2).replace('.', ','),
          preco_efetivo: numberOrZero(r.precoEfetivo).toFixed(2).replace('.', ','),
          lucro: numberOrZero(r.lucro).toFixed(2).replace('.', ','),
          margem_real: numberOrZero(r.margemReal).toFixed(2).replace('.', ','),
          categoria: p.categoria || '',
          anuncio: p.listingType === 'premium' ? 'Premium' : 'Clássico'
        };
      });
      const headers = Object.keys(rows[0]);
      const csvLines = [headers.join(';')].concat(rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(';')));
      const csv = csvLines.join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      a.href = url;
      a.download = `precificador-marketplaces-${date}.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 150);
      showToast('CSV exportado com sucesso.', 'success');
    }

    function exportarJSON() {
      if (products.length === 0) {
        showToast('Não há produtos para exportar.', 'info');
        return;
      }
      const data = JSON.stringify(products, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      a.href = url;
      a.download = `precificador-marketplaces-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup exportado com sucesso.', 'success');
    }

    function importarJSON(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data)) throw new Error('Formato inválido');
          const incoming = data.map(normalizeProduct).filter(Boolean);

          if (products.length > 0) {
            const replaceAll = await showConfirmPopup({
              title: 'Importar backup',
              message: `Você já tem ${pluralize(products.length, 'produto cadastrado', 'produtos cadastrados')}.

Deseja substituir tudo pelos dados do arquivo?`,
              confirmText: 'Substituir tudo',
              cancelText: 'Somar backup',
              tone: 'primary'
            });
            if (replaceAll) {
              products = incoming;
            } else {
              const idsExistentes = new Set(products.map((p) => p.id));
              incoming.forEach((p) => {
                if (!idsExistentes.has(p.id)) {
                  products.push(p);
                  idsExistentes.add(p.id);
                }
              });
            }
          } else {
            products = incoming;
          }

          saveProducts();
          renderProducts();
          showToast(`${pluralize(incoming.length, 'produto importado', 'produtos importados')} com sucesso.`, 'success');
        } catch {
          showToast('Arquivo inválido. Use um backup exportado por esta calculadora.', 'error');
        }
        event.target.value = '';
      };
      reader.readAsText(file);
    }

    function showToast(message, type = 'info') {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
      toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
      toast.setAttribute('aria-atomic', 'true');
      toast.innerHTML = `
        <div class="rounded-2xl border border-white/10 bg-white/10 p-2 text-white/90">
          <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5" aria-hidden="true">
            <path d="M12 8.5v4.2m0 3.3h.01M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-bold">${type === 'error' ? 'Atenção' : type === 'success' ? 'Pronto' : 'Aviso'}</p>
          <p class="mt-1 text-sm leading-5 text-white/80">${esc(message)}</p>
        </div>
      `;
      stack.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'toastOut .22s ease forwards';
        setTimeout(() => toast.remove(), 220);
      }, 2800);
    }


    function copyToClipboard(value, successMessage = 'Copiado.') {
      const text = String(value || '').trim();
      if (!text) return;

      const fallbackCopy = () => {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
          showToast(successMessage, 'success');
        } catch {
          showToast('Não foi possível copiar agora.', 'error');
        }
        document.body.removeChild(area);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => showToast(successMessage, 'success'))
          .catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    }



    const LOCAL_ACCOUNTS_KEY = 'precificador_local_accounts_v1';
    const LOCAL_SESSION_KEY = 'precificador_local_session_v1';
    const GUEST_MODE_KEY = 'precificador_guest_mode_v1';
    const CHECKOUT_PENDING_KEY = 'precificador_checkout_pending_v1';
    const CAKTO_CHECKOUT_URL = 'https://pay.cakto.com.br/iygsxsi_817473';
    const STATIC_PAYWALL_LABEL = 'Acesso mensal';
    const DEFAULT_PAYWALL_PRICE = 79.9;

    function readLocalAccounts() {
      try {
        const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }

    function writeLocalAccounts(list) {
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(list));
    }

    function getLocalSessionUser() {
      return (localStorage.getItem(LOCAL_SESSION_KEY) || '').trim();
    }

    function setLocalSessionUser(username) {
      localStorage.setItem(LOCAL_SESSION_KEY, username);
    }

    function clearLocalSessionUser() {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      localStorage.removeItem(GUEST_MODE_KEY);
      localStorage.removeItem(CHECKOUT_PENDING_KEY);
    }

    async function sha256Hex(value) {
      const data = new TextEncoder().encode(String(value || ''));
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function isGuestMode() {
      return localStorage.getItem(GUEST_MODE_KEY) === '1';
    }

    function enterGuestMode() {
      setAccessStatus('gate-auth-status', 'O modo convidado está desativado nesta versão.', 'error');
    }

    function updateMarketplaceFields() {
      const marketplace = document.getElementById('prod-marketplace')?.value || 'shopee';
      const showMarketplaceConfig = marketplace === 'mercadolivre' || marketplace === 'tiktok';
      const showListingType = marketplace === 'mercadolivre';
      document.getElementById('field-marketplace-rate')?.classList.toggle('hidden', !showMarketplaceConfig);
      document.getElementById('field-marketplace-fixed')?.classList.toggle('hidden', !showMarketplaceConfig);
      document.getElementById('field-listing-type')?.classList.toggle('hidden', !showListingType);
      document.getElementById('marketplace-fee-help')?.classList.toggle('hidden', !showMarketplaceConfig);
    }

    function setAccessStatus(targetId, message = '', tone = '') {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.textContent = message;
      el.className = `access-status${tone ? ` ${tone}` : ''}`;
    }

    function setAccessTab(mode) {
      const isLogin = mode !== 'register';
      document.getElementById('gate-tab-login').classList.toggle('active', isLogin);
      document.getElementById('gate-tab-register').classList.toggle('active', !isLogin);
      document.getElementById('gate-login-form').classList.toggle('hidden', !isLogin);
      document.getElementById('gate-register-form').classList.toggle('hidden', isLogin);
      setAccessStatus('gate-auth-status', '');
    }

    function showGateStep(step) {
      ['gate-auth-step', 'gate-paywall-step'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', id !== step);
      });
    }

    async function registerSimpleAccount() {
      const username = (document.getElementById('gate-register-user').value || '').trim().toLowerCase();
      const password = document.getElementById('gate-register-pass').value || '';
      const confirmPassword = document.getElementById('gate-register-pass-confirm').value || '';

      if (username.length < 3) {
        setAccessStatus('gate-auth-status', 'Use um login com pelo menos 3 caracteres.', 'error');
        return;
      }
      if (password.length < 4) {
        setAccessStatus('gate-auth-status', 'Use uma senha com pelo menos 4 caracteres.', 'error');
        return;
      }
      if (password !== confirmPassword) {
        setAccessStatus('gate-auth-status', 'As senhas não batem.', 'error');
        return;
      }

      const accounts = readLocalAccounts();
      if (accounts.some((item) => item.username === username)) {
        setAccessStatus('gate-auth-status', 'Esse login já existe neste navegador.', 'error');
        return;
      }

      const passwordHash = await sha256Hex(password);
      accounts.push({ username, passwordHash, createdAt: Date.now() });
      writeLocalAccounts(accounts);
      setLocalSessionUser(username);
      updateSessionBadge();
      document.getElementById('gate-login-user').value = username;
      document.getElementById('gate-login-pass').value = '';
      setAccessTab('login');
      document.getElementById('gate-register-pass').value = '';
      document.getElementById('gate-register-pass-confirm').value = '';
      setAccessStatus('gate-auth-status', 'Cadastro criado com sucesso.', 'success');
      unlockApp({ message: 'Cadastro criado e acesso liberado.' });
    }

    async function loginSimpleAccount() {
      const username = (document.getElementById('gate-login-user').value || '').trim().toLowerCase();
      const password = document.getElementById('gate-login-pass').value || '';
      const accounts = readLocalAccounts();
      const account = accounts.find((item) => item.username === username);

      if (!account) {
        setAccessStatus('gate-auth-status', 'Login não encontrado neste navegador.', 'error');
        return;
      }

      const passwordHash = await sha256Hex(password);
      if (passwordHash !== account.passwordHash) {
        setAccessStatus('gate-auth-status', 'Senha incorreta.', 'error');
        return;
      }

      setLocalSessionUser(username);
      updateSessionBadge();
      setAccessStatus('gate-auth-status', 'Login validado.', 'success');
      unlockApp({ message: 'Login realizado com sucesso.' });
    }

    function logoutSimpleAccount() {
      clearLocalSessionUser();
      updateSessionBadge();
      document.getElementById('gate-login-pass').value = '';
      setAccessTab('login');
      showGateStep('gate-auth-step');
      document.getElementById('access-gate').classList.remove('hidden');
      document.body.classList.add('access-locked');
      setAccessStatus('gate-auth-status', 'Conta desconectada. Faça login novamente.', 'success');
    }

    async function fetchJson(url, options = {}) {
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(payload.message || 'Não foi possível concluir esta etapa.');
      }

      return payload;
    }

    
    async function afterLoginGate() {
      updateSessionBadge();
      unlockApp({ message: 'Acesso liberado.' });
    }

    
    async function refreshPaywallPrice() {
      const priceEl = document.getElementById('gate-price');
      const labelEl = document.getElementById('gate-price-label');
      if (priceEl) priceEl.textContent = fmt(DEFAULT_PAYWALL_PRICE);
      if (labelEl) labelEl.textContent = STATIC_PAYWALL_LABEL;
    }

    
    async function verifyPaidSession(silent = false) {
      return false;
    }

    function unlockApp(data = {}) {
      updateSessionBadge();
      document.getElementById('access-gate').classList.add('hidden');
      document.body.classList.remove('access-locked');
      localStorage.removeItem(CHECKOUT_PENDING_KEY);
      const params = new URLSearchParams(window.location.search);
      if (params.has('cakto_return') || params.has('order_id') || params.has('refId') || params.has('ref_id') || params.has('payment_cancelled')) {
        params.delete('cakto_return');
        params.delete('order_id');
        params.delete('refId');
        params.delete('ref_id');
        params.delete('payment_cancelled');
        const clean = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash || ''}`;
        history.replaceState({}, '', clean);
      }
      if (typeof showToast === 'function') {
        showToast(data.message || 'Acesso liberado.', 'success');
      }
    }

    
    async function startCaktoCheckout() {
      setAccessStatus('gate-auth-status', 'O paywall está desativado nesta versão.', 'error');
    }

    
    async function checkCaktoStatus(silent = false) {
      setAccessStatus('gate-auth-status', 'O paywall está desativado nesta versão.', 'error');
      return false;
    }

    async function bootAccessGate() {
      updateSessionBadge();
      await refreshPaywallPrice();
      if (isGuestMode() || getLocalSessionUser() === 'guest') {
        clearLocalSessionUser();
        updateSessionBadge();
      }
      const username = getLocalSessionUser();
      if (!username) {
        showGateStep('gate-auth-step');
        return;
      }
      const loginUser = document.getElementById('gate-login-user');
      if (loginUser) loginUser.value = username;
      document.getElementById('access-gate')?.classList.add('hidden');
      document.body.classList.remove('access-locked');
      localStorage.removeItem(CHECKOUT_PENDING_KEY);
    }


    document.addEventListener('keydown', (e) => {
      trapFocusOnTab(e);
      const active = document.activeElement;
      const isTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);

      if (e.key === 'Escape') {
        if (!document.getElementById('profile-modal').classList.contains('hidden')) {
          closeProfileModal();
          return;
        }
        if (!document.getElementById('settings-modal').classList.contains('hidden')) {
          closeSettingsModal();
          return;
        }
        if (!document.getElementById('confirm-popup').classList.contains('hidden')) {
          closeConfirmPopup(false);
          return;
        }
        if (!document.getElementById('mentor-popup').classList.contains('hidden')) {
          closeMentorPopup();
          return;
        }
        closeModal();
        closeDetail();
      }

      if (!isTyping && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openModal();
      }

      if (!isTyping && e.key === '/') {
        e.preventDefault();
        document.getElementById('search').focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !document.getElementById('modal').classList.contains('hidden')) {
        e.preventDefault();
        saveProduct();
      }
      if (e.key === 'Escape') {
        closeProfileMenu();
      }
    });

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('header-profile-menu');
      if (wrap && !wrap.contains(e.target)) closeProfileMenu();
      const columnsWrap = document.getElementById('columns-menu-wrap');
      if (columnsWrap && !columnsWrap.contains(e.target)) closeColumnsMenu();
    });


    FORM_FIELD_IDS.concat(['prod-marketplace']).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        handleFormDraftInput();
        updateSaveButtonState();
      });
      el.addEventListener('change', () => {
        handleFormDraftInput();
        updateSaveButtonState();
      });
    });

    ['profile-erp','profile-stage','profile-logistics','profile-ads','profile-ticket','profile-pain','profile-mp-shopee','profile-mp-mercadolivre','profile-mp-tiktok','profile-mp-site'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        saveProfile(getProfileFormData());
        updateProfileUI();
        renderProducts();
      });
    });

    MONEY_FIELD_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        handleMoneyTyping(el);
        calcPreview();
      });
      el.addEventListener('blur', () => {
        formatMoneyField(el);
        calcPreview();
      });
      el.addEventListener('change', () => {
        formatMoneyField(el);
        calcPreview();
      });
    });

    const warDiscountInput = document.getElementById('war-discount');
    if (warDiscountInput) {
      warDiscountInput.addEventListener('input', () => {
        handleMoneyTyping(warDiscountInput);
        updateWarGame();
      });
      warDiscountInput.addEventListener('blur', () => {
        formatMoneyField(warDiscountInput);
        updateWarGame();
      });
      warDiscountInput.value = formatMoneyInputValue(warDiscountInput.value || 5);
    }

    const spyPriceInput = document.getElementById('spy-price');
    if (spyPriceInput) {
      spyPriceInput.addEventListener('input', () => handleMoneyTyping(spyPriceInput));
      spyPriceInput.addEventListener('blur', () => formatMoneyField(spyPriceInput));
    }

    const profileTicketInput = document.getElementById('profile-ticket');
    if (profileTicketInput) {
      profileTicketInput.addEventListener('input', () => handleMoneyTyping(profileTicketInput));
      profileTicketInput.addEventListener('blur', () => formatMoneyField(profileTicketInput));
    }

    const quickCostInput = document.getElementById('quick-custo');
    if (quickCostInput) {
      quickCostInput.addEventListener('input', () => handleMoneyTyping(quickCostInput));
      quickCostInput.addEventListener('blur', () => formatMoneyField(quickCostInput));
    }

    const bulkFixedInput = document.getElementById('bulk-fixed');
    if (bulkFixedInput) {
      bulkFixedInput.addEventListener('input', () => handleMoneyTyping(bulkFixedInput));
      bulkFixedInput.addEventListener('blur', () => formatMoneyField(bulkFixedInput));
    }

    ['quick-nome','quick-custo','quick-marketplace','quick-margem'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveQuickProduct();
        }
      });
    });

    const prefersDarkScheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (prefersDarkScheme) {
      prefersDarkScheme.addEventListener?.('change', (event) => {
        if (!localStorage.getItem(THEME_KEY)) {
          currentTheme = event.matches ? 'dark' : 'light';
          applyTheme();
        }
      });
    }

    clearQuickEntry(false);

    const modalEl = document.getElementById('modal');
    if (modalEl) modalEl.addEventListener('paste', handleSmartPaste);

    setTimeout(() => {
      if (shouldShowNoticePopup()) showNoticePopup();
    }, 320);

    updateProfileUI();
    applyTheme();
    applyTableDensity();
    applyPanelVisibility();
    applyColumnVisibility();
    renderDrafts();
    updateTaxSection();
    setWorkspaceView(currentWorkspaceView);
    renderProducts();
    calcPreview();
    updateSaveButtonState();
    updateSessionBadge();
    updateCompareProducts();
    bootAccessGate();
  
