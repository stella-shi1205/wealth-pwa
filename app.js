/* ========== 理财管家 - app.js ========== */
const App = (() => {
  'use strict';

  const DB_NAME = 'WealthTrackerDB';
  const DB_VER = 1;
  const STORE = 'products';
  let db = null;
  let editingId = null;
  let confirmCallback = null;

  // ========== IndexedDB ==========
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          s.createIndex('endDate', 'endDate', { unique: false });
          s.createIndex('bank', 'bank', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e);
    });
  }

  function dbGetAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e);
    });
  }

  function dbGet(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e);
    });
  }

  function dbPut(item) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e);
    });
  }

  function dbDelete(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e);
    });
  }

  function dbClear() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e);
    });
  }

  // ========== Helpers ==========
  function daysBetween(d1, d2) {
    const ms = new Date(d2).getTime() - new Date(d1).getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  function daysFromNow(dateStr) {
    return daysBetween(new Date().toISOString().slice(0, 10), dateStr);
  }

  function formatMoney(n) {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  function formatDate(d) {
    if (!d) return '-';
    return d.replace(/-/g, '/');
  }

  function isExpired(endDate) {
    return daysFromNow(endDate) < 0;
  }

  function isExpiringSoon(endDate, days) {
    const d = daysFromNow(endDate);
    return d >= 0 && d <= (days || 7);
  }

  function calcExpectedProfit(amount, rate, start, end) {
    const days = daysBetween(start, end);
    return amount * (rate / 100) * (days / 365);
  }

  function calcActualProfit(amount, rate, start, end) {
    if (!rate) return null;
    const days = daysBetween(start, end);
    return amount * (rate / 100) * (days / 365);
  }

  // ========== Toast ==========
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ========== Navigation ==========
  function switchPage(name, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (name === 'overview') renderOverview();
    if (name === 'history') renderHistory();
    if (name === 'home') renderHome();
  }

  // ========== Render Home ==========
  async function renderHome() {
    const products = await dbGetAll();
    const active = products.filter(p => !isExpired(p.endDate));
    const expired = products.filter(p => isExpired(p.endDate));

    // Stats
    const totalAmount = active.reduce((s, p) => s + p.amount, 0);
    const totalExpected = active.reduce((s, p) => s + calcExpectedProfit(p.amount, p.rate, p.startDate, p.endDate), 0);
    const expiringCount = active.filter(p => isExpiringSoon(p.endDate, 7)).length;

    document.getElementById('stats-row').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${formatMoney(totalAmount)}</div>
        <div class="stat-label">持有总额（元）</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">${formatMoney(totalExpected)}</div>
        <div class="stat-label">预期总收益（元）</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${active.length}</div>
        <div class="stat-label">持有产品数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${expiringCount > 0 ? 'orange' : ''}">${expiringCount}</div>
        <div class="stat-label">7天内到期</div>
      </div>
    `;

    // Alert
    const alertArea = document.getElementById('alert-area');
    if (expiringCount > 0) {
      alertArea.innerHTML = `
        <div class="alert-banner">
          <span class="alert-icon">🔔</span>
          <span>有 <strong>${expiringCount}</strong> 款产品将在 7 天内到期，请注意安排资金！</span>
        </div>
      `;
    } else {
      alertArea.innerHTML = '';
    }

    // Active list
    const listEl = document.getElementById('active-list');
    if (active.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏦</div>
          <p>暂无持有中的理财产品</p>
          <p style="font-size:.8rem;margin-top:4px">点击右下角 + 添加</p>
        </div>
      `;
      return;
    }

    active.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    listEl.innerHTML = active.map(p => {
      const days = daysFromNow(p.endDate);
      const daysClass = days < 0 ? 'over' : days <= 7 ? 'warn' : '';
      const daysText = days < 0 ? `已到期${Math.abs(days)}天` : days === 0 ? '今日到期' : `${days}天后到期`;
      const itemClass = days <= 7 ? (days < 0 ? 'expired' : 'expiring') : '';
      const profit = calcExpectedProfit(p.amount, p.rate, p.startDate, p.endDate);

      return `
        <div class="product-item ${itemClass}" onclick="App.editProduct(${p.id})">
          <div class="pi-top">
            <span class="pi-name">${esc(p.name)}</span>
            <span class="pi-bank">${esc(p.bank)}</span>
          </div>
          <div class="pi-amount">¥${formatMoney(p.amount)}</div>
          <div class="pi-meta">
            <span class="pi-rate">年化 ${p.rate}%</span>
            <span>起息 ${formatDate(p.startDate)}</span>
            <span>到期 ${formatDate(p.endDate)}</span>
            <span class="pi-days ${daysClass}">${daysText}</span>
          </div>
          <div class="pi-actions" onclick="event.stopPropagation()">
            <button onclick="App.editProduct(${p.id})" title="编辑">✏️</button>
            <button onclick="App.deleteProduct(${p.id})" title="删除">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ========== Render Overview ==========
  async function renderOverview() {
    const products = await dbGetAll();
    const active = products.filter(p => !isExpired(p.endDate));
    const expired = products.filter(p => isExpired(p.endDate));

    // Bank distribution pie chart
    const bankMap = {};
    active.forEach(p => {
      bankMap[p.bank] = (bankMap[p.bank] || 0) + p.amount;
    });
    const bankData = Object.entries(bankMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
    renderPieChart('chart-bank', bankData, '各银行资产分布');

    // Profit bar chart
    const profitData = active.map(p => ({
      name: p.name.length > 6 ? p.name.slice(0, 6) + '…' : p.name,
      profit: Math.round(calcExpectedProfit(p.amount, p.rate, p.startDate, p.endDate) * 100) / 100
    }));
    renderBarChart('chart-profit', profitData, '各产品预期收益（元）');
  }

  // ========== Render History ==========
  async function renderHistory() {
    const products = await dbGetAll();
    const expired = products.filter(p => isExpired(p.endDate));

    const listEl = document.getElementById('history-list');
    if (expired.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>暂无已到期产品</p>
        </div>
      `;
      return;
    }

    expired.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
    listEl.innerHTML = expired.map(p => {
      const profit = p.actualRate != null
        ? calcActualProfit(p.amount, p.actualRate, p.startDate, p.endDate)
        : calcExpectedProfit(p.amount, p.rate, p.startDate, p.endDate);
      const profitClass = profit >= 0 ? 'positive' : 'negative';
      const rateLabel = p.actualRate != null ? `实际 ${p.actualRate}%` : `预期 ${p.rate}%`;

      return `
        <div class="history-item" onclick="App.editProduct(${p.id})">
          <div class="hi-info">
            <div class="hi-name">${esc(p.name)}</div>
            <div class="hi-detail">${esc(p.bank)} · ${rateLabel} · ${formatDate(p.startDate)} → ${formatDate(p.endDate)}</div>
          </div>
          <div class="hi-profit ${profitClass}">+¥${formatMoney(profit)}</div>
        </div>
      `;
    }).join('');
  }

  // ========== Charts (Pure SVG) ==========
  function renderPieChart(containerId, data, title) {
    const container = document.getElementById(containerId);
    if (data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无数据</p></div>';
      return;
    }

    const total = data.reduce((s, d) => s + d.value, 0);
    const colors = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#c026d3', '#ea580c'];
    const w = 320, h = 260;
    const cx = 120, cy = 130, r = 90;
    let cumAngle = -Math.PI / 2;
    let paths = '';
    let legendItems = '';

    data.forEach((d, i) => {
      const angle = (d.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(cumAngle);
      const y1 = cy + r * Math.sin(cumAngle);
      const x2 = cx + r * Math.cos(cumAngle + angle);
      const y2 = cy + r * Math.sin(cumAngle + angle);
      const large = angle > Math.PI ? 1 : 0;
      const color = colors[i % colors.length];

      if (data.length === 1) {
        paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.85"/>`;
      } else {
        paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${color}" opacity="0.85" stroke="#fff" stroke-width="1"/>`;
      }

      const pct = ((d.value / total) * 100).toFixed(1);
      legendItems += `
        <rect x="240" y="${30 + i * 28}" width="12" height="12" rx="2" fill="${color}"/>
        <text x="258" y="${41 + i * 28}" font-size="11" fill="#1e293b">${esc(d.name)}</text>
        <text x="258" y="${53 + i * 28}" font-size="10" fill="#64748b">¥${formatMoney(d.value)} (${pct}%)</text>
      `;

      cumAngle += angle;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:100%">
        ${paths}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="11" fill="#64748b">总计</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="14" font-weight="700" fill="#1e293b">¥${formatMoney(total)}</text>
        ${legendItems}
      </svg>
    `;
  }

  function renderBarChart(containerId, data, title) {
    const container = document.getElementById(containerId);
    if (data.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>暂无数据</p></div>';
      return;
    }

    const maxVal = Math.max(...data.map(d => d.profit), 1);
    const barH = 24, gap = 8, labelW = 80, marginL = 10, marginR = 60;
    const svgH = Math.max(200, data.length * (barH + gap) + 30);
    const svgW = 320;
    const chartW = svgW - labelW - marginR;

    let bars = '';
    data.forEach((d, i) => {
      const y = 10 + i * (barH + gap);
      const barW = Math.max(2, (d.profit / maxVal) * chartW);
      const color = '#2563eb';
      bars += `
        <text x="${labelW - 4}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="10" fill="#64748b">${esc(d.name)}</text>
        <rect x="${labelW + marginL}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}" opacity="0.8"/>
        <text x="${labelW + marginL + barW + 4}" y="${y + barH / 2 + 4}" font-size="10" fill="#1e293b" font-weight="600">¥${formatMoney(d.profit)}</text>
      `;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:100%">
        ${bars}
      </svg>
    `;
  }

  // ========== Form ==========
  function showForm(item) {
    editingId = item ? item.id : null;
    document.getElementById('form-title').textContent = item ? '编辑产品' : '添加产品';
    document.getElementById('form-submit-btn').textContent = item ? '更新' : '保存';
    document.getElementById('f-id').value = item ? item.id : '';
    document.getElementById('f-name').value = item ? item.name : '';
    document.getElementById('f-bank').value = item ? item.bank : '';
    document.getElementById('f-amount').value = item ? item.amount : '';
    document.getElementById('f-start').value = item ? item.startDate : '';
    document.getElementById('f-end').value = item ? item.endDate : '';
    document.getElementById('f-rate').value = item ? item.rate : '';
    document.getElementById('f-actual-rate').value = (item && item.actualRate != null) ? item.actualRate : '';
    document.getElementById('f-notes').value = item ? (item.notes || '') : '';
    document.getElementById('modal-form').classList.add('show');
  }

  function closeForm() {
    document.getElementById('modal-form').classList.remove('show');
    editingId = null;
  }

  async function saveProduct(e) {
    e.preventDefault();
    const item = {
      name: document.getElementById('f-name').value.trim(),
      bank: document.getElementById('f-bank').value.trim(),
      amount: parseFloat(document.getElementById('f-amount').value),
      startDate: document.getElementById('f-start').value,
      endDate: document.getElementById('f-end').value,
      rate: parseFloat(document.getElementById('f-rate').value),
      actualRate: document.getElementById('f-actual-rate').value ? parseFloat(document.getElementById('f-actual-rate').value) : null,
      notes: document.getElementById('f-notes').value.trim(),
      createdAt: editingId ? undefined : new Date().toISOString()
    };

    if (new Date(item.endDate) <= new Date(item.startDate)) {
      toast('到期日必须晚于起息日');
      return;
    }

    if (editingId) {
      const existing = await dbGet(editingId);
      item.id = editingId;
      item.createdAt = existing.createdAt;
      await dbPut(item);
      toast('产品已更新');
    } else {
      await dbPut(item);
      toast('产品已添加');
    }

    closeForm();
    renderHome();
  }

  async function editProduct(id) {
    const item = await dbGet(id);
    if (item) showForm(item);
  }

  // ========== Delete ==========
  function deleteProduct(id) {
    showConfirm('确定要删除这款产品吗？', async () => {
      await dbDelete(id);
      toast('已删除');
      renderHome();
    });
  }

  // ========== Confirm Modal ==========
  function showConfirm(msg, callback) {
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('modal-confirm').classList.add('show');
    confirmCallback = callback;
    document.getElementById('confirm-ok-btn').onclick = () => {
      closeConfirm();
      if (confirmCallback) confirmCallback();
    };
  }

  function closeConfirm() {
    document.getElementById('modal-confirm').classList.remove('show');
    confirmCallback = null;
  }

  // ========== Export / Import ==========
  async function showExport() {
    const products = await dbGetAll();
    if (products.length === 0) {
      toast('暂无数据可导出');
      return;
    }
    const json = JSON.stringify(products, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `理财管家_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('数据已导出');
  }

  function triggerImport() {
    document.getElementById('import-file').click();
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('格式错误');
      showConfirm(`将导入 ${data.length} 条记录，是否覆盖当前数据？`, async () => {
        await dbClear();
        for (const item of data) {
          delete item.id; // Let autoIncrement assign new IDs
          await dbPut(item);
        }
        toast(`成功导入 ${data.length} 条记录`);
        renderHome();
      });
    } catch (err) {
      toast('导入失败：文件格式不正确');
    }
    e.target.value = '';
  }

  // ========== Clear ==========
  function clearExpired() {
    showConfirm('确定要删除所有已到期产品吗？', async () => {
      const products = await dbGetAll();
      const expired = products.filter(p => isExpired(p.endDate));
      for (const p of expired) await dbDelete(p.id);
      toast(`已清除 ${expired.length} 条记录`);
      renderHome();
    });
  }

  function clearAll() {
    showConfirm('确定要删除所有数据吗？此操作不可恢复！', async () => {
      await dbClear();
      toast('所有数据已清除');
      renderHome();
    });
  }

  // ========== PWA Registration ==========
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ========== Init ==========
  async function init() {
    await openDB();
    registerSW();
    await renderHome();
  }

  // ========== Public API ==========
  return {
    init, switchPage, showForm, closeForm, saveProduct,
    editProduct, deleteProduct, showConfirm, closeConfirm,
    showExport, triggerImport, handleImport, clearExpired, clearAll
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);