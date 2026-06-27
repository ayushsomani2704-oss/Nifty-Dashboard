let stockData = [];
let sectorData = [];
let currentSegment = 'largecap';
let currentFilter = 'all';
let currentView = 'stocks';
let sortColumn = 'score';
let sortDirection = 'desc';

function getDailyVariation(seed) {
    const today = new Date();
    const dayHash = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const combined = (dayHash * 31 + seed * 17) % 10000;
    return (combined / 10000 - 0.5) * 2;
}

function generateDailyData() {
    const segment = ALL_SEGMENTS[currentSegment];
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);

    stockData = segment.stocks.map((stock, index) => {
        const variation = getDailyVariation(index + dayOfYear + currentSegment.length * 100);
        const priceChange = variation * 3.5;
        const price = +(stock.basePrice * (1 + priceChange / 100)).toFixed(2);
        const change = +priceChange.toFixed(2);

        const peVariation = 1 + getDailyVariation(index * 3 + dayOfYear) * 0.05;
        const pbVariation = 1 + getDailyVariation(index * 5 + dayOfYear) * 0.03;
        const roeVariation = 1 + getDailyVariation(index * 7 + dayOfYear) * 0.02;

        const pe = +(stock.pe * peVariation).toFixed(1);
        const pb = +(stock.pb * pbVariation).toFixed(2);
        const roe = +(stock.roe * roeVariation).toFixed(1);
        const de = stock.de;
        const divYield = stock.divYield;
        const sectorPe = SECTOR_PE[stock.sector] || 25;
        const peVsSector = +(((pe - sectorPe) / sectorPe) * 100).toFixed(1);

        const { score, recommendation } = calculateRecommendation(pe, pb, roe, de, divYield, sectorPe);

        return { symbol: stock.symbol, name: stock.name, sector: stock.sector, price, change, pe, pb, roe, de, divYield, sectorPe, peVsSector, score, recommendation };
    });

    const seen = new Set();
    stockData = stockData.filter(s => {
        if (seen.has(s.symbol)) return false;
        seen.add(s.symbol);
        return true;
    });
}

function calculateRecommendation(pe, pb, roe, de, divYield, sectorPe) {
    let score = 0;

    if (pe < 20) score += 2;
    else if (pe <= 35) score += 1;
    else score -= 1;

    const peVsSectorPct = ((pe - sectorPe) / sectorPe) * 100;
    if (peVsSectorPct < -20) score += 2;
    else if (peVsSectorPct < 0) score += 1;
    else if (peVsSectorPct > 30) score -= 1;

    if (pb < 3) score += 2;
    else if (pb <= 5) score += 1;
    else score -= 1;

    if (roe > 18) score += 2;
    else if (roe >= 10) score += 1;
    else score -= 1;

    if (de < 0.5) score += 2;
    else if (de <= 1.5) score += 1;
    else score -= 1;

    if (divYield > 2) score += 2;
    else if (divYield >= 1) score += 1;
    else score -= 1;

    let recommendation;
    if (score >= 6) recommendation = 'buy';
    else if (score >= 2) recommendation = 'hold';
    else recommendation = 'sell';

    return { score, recommendation };
}

function generateSectorData() {
    const sectorMap = {};
    stockData.forEach(stock => {
        if (!sectorMap[stock.sector]) sectorMap[stock.sector] = [];
        sectorMap[stock.sector].push(stock);
    });

    sectorData = Object.keys(sectorMap).map(sector => {
        const stocks = sectorMap[sector];
        const avg = (arr, key) => +(arr.reduce((s, st) => s + st[key], 0) / arr.length).toFixed(2);
        const sectorPe = SECTOR_PE[sector] || 25;
        const buyCount = stocks.filter(s => s.recommendation === 'buy').length;
        const holdCount = stocks.filter(s => s.recommendation === 'hold').length;
        const sellCount = stocks.filter(s => s.recommendation === 'sell').length;

        let sectorRec;
        if (buyCount > holdCount && buyCount > sellCount) sectorRec = 'buy';
        else if (sellCount > buyCount && sellCount > holdCount) sectorRec = 'sell';
        else sectorRec = 'hold';

        return {
            sector, sectorPe,
            avgPe: +avg(stocks, 'pe'),
            avgRoe: +avg(stocks, 'roe'),
            avgDe: +avg(stocks, 'de'),
            avgDivYield: +avg(stocks, 'divYield'),
            avgScore: +avg(stocks, 'score'),
            buyCount, holdCount, sellCount,
            totalStocks: stocks.length,
            sectorRec, stocks
        };
    });

    sectorData.sort((a, b) => b.avgScore - a.avgScore);
}

// --- RENDERING ---

function renderTable() {
    const tbody = document.getElementById('stock-tbody');
    let filtered = currentFilter === 'all' ? stockData : stockData.filter(s => s.recommendation === currentFilter);

    filtered.sort((a, b) => {
        let valA = a[sortColumn], valB = b[sortColumn];
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    tbody.innerHTML = filtered.map(stock => {
        const peClass = stock.peVsSector < 0 ? 'pe-below' : stock.peVsSector > 30 ? 'pe-above' : 'pe-inline';
        const peArrow = stock.peVsSector < 0 ? '▼' : stock.peVsSector > 0 ? '▲' : '●';
        return `
        <tr class="${stock.recommendation}-row">
            <td><strong>${stock.symbol}</strong></td>
            <td>${stock.name}</td>
            <td><span class="sector-tag">${stock.sector}</span></td>
            <td>${stock.price.toLocaleString('en-IN')}</td>
            <td class="${stock.change >= 0 ? 'change-positive' : 'change-negative'}">${stock.change >= 0 ? '+' : ''}${stock.change}%</td>
            <td>${stock.pe}</td>
            <td>${stock.sectorPe}</td>
            <td class="${peClass}"><span class="pe-indicator">${peArrow} ${stock.peVsSector > 0 ? '+' : ''}${stock.peVsSector}%</span></td>
            <td>${stock.pb}</td>
            <td>${stock.roe}</td>
            <td>${stock.de}</td>
            <td>${stock.divYield}</td>
            <td>${stock.score}</td>
            <td><span class="rec-badge rec-${stock.recommendation}">${stock.recommendation.toUpperCase()}</span></td>
        </tr>`;
    }).join('');
}

function updateSummary() {
    const segment = ALL_SEGMENTS[currentSegment];
    document.getElementById('buy-count').textContent = stockData.filter(s => s.recommendation === 'buy').length;
    document.getElementById('hold-count').textContent = stockData.filter(s => s.recommendation === 'hold').length;
    document.getElementById('sell-count').textContent = stockData.filter(s => s.recommendation === 'sell').length;

    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
    const indexVariation = getDailyVariation(999 + dayOfYear + currentSegment.length * 50) * 2;
    const indexValue = +(segment.indexBase * (1 + indexVariation / 100)).toFixed(0);
    document.getElementById('index-value').textContent = indexValue.toLocaleString('en-IN');
    document.getElementById('index-label').textContent = segment.name;

    document.getElementById('last-updated').textContent =
        `Last Updated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function renderSectorSummaryTable() {
    const tbody = document.getElementById('sector-summary-tbody');
    tbody.innerHTML = sectorData.map((sec, idx) => {
        const peClass = sec.avgPe < sec.sectorPe ? 'pe-below' : sec.avgPe > sec.sectorPe * 1.3 ? 'pe-above' : 'pe-inline';
        return `
        <tr class="${sec.sectorRec}-row">
            <td><strong>${idx + 1}</strong></td>
            <td><strong>${sec.sector}</strong></td>
            <td>${sec.sectorPe}</td>
            <td class="${peClass}">${sec.avgPe}</td>
            <td>${sec.avgRoe}%</td>
            <td>${sec.avgDe}</td>
            <td>${sec.avgDivYield}%</td>
            <td><strong>${sec.avgScore}</strong></td>
            <td class="buy-text">${sec.buyCount}</td>
            <td class="hold-text">${sec.holdCount}</td>
            <td class="sell-text">${sec.sellCount}</td>
            <td><span class="rec-badge rec-${sec.sectorRec}">${sec.sectorRec.toUpperCase()}</span></td>
        </tr>`;
    }).join('');
}

function populateSectorDropdown() {
    const dropdown = document.getElementById('sector-dropdown');
    const existing = dropdown.querySelectorAll('option:not(:first-child)');
    existing.forEach(o => o.remove());

    sectorData.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec.sector;
        const icon = sec.sectorRec === 'buy' ? '▲' : sec.sectorRec === 'sell' ? '▼' : '●';
        opt.textContent = `${icon} ${sec.sector} (Score: ${sec.avgScore} | ${sec.sectorRec.toUpperCase()})`;
        dropdown.appendChild(opt);
    });
}

function onSectorSelect() {
    const selected = document.getElementById('sector-dropdown').value;
    const bucketsDiv = document.getElementById('sector-buckets');

    if (!selected) { bucketsDiv.style.display = 'none'; return; }
    bucketsDiv.style.display = '';

    const sec = sectorData.find(s => s.sector === selected);
    if (!sec) return;

    const buyStocks = sec.stocks.filter(s => s.recommendation === 'buy').sort((a, b) => b.score - a.score);
    const holdStocks = sec.stocks.filter(s => s.recommendation === 'hold').sort((a, b) => b.score - a.score);
    const sellStocks = sec.stocks.filter(s => s.recommendation === 'sell').sort((a, b) => b.score - a.score);

    document.getElementById('sector-buy-count').textContent = buyStocks.length;
    document.getElementById('sector-hold-count').textContent = holdStocks.length;
    document.getElementById('sector-sell-count').textContent = sellStocks.length;

    document.getElementById('sector-buy-list').innerHTML = renderBucketStocks(buyStocks, sec.sectorPe);
    document.getElementById('sector-hold-list').innerHTML = renderBucketStocks(holdStocks, sec.sectorPe);
    document.getElementById('sector-sell-list').innerHTML = renderBucketStocks(sellStocks, sec.sectorPe);
}

function renderBucketStocks(stocks, sectorPe) {
    if (stocks.length === 0) return '<div class="bucket-empty">No stocks in this bucket</div>';
    return `
        <table class="bucket-table">
            <thead><tr><th>Symbol</th><th>Price (₹)</th><th>P/E</th><th>Sector P/E</th><th>vs Sector</th><th>P/B</th><th>ROE %</th><th>D/E</th><th>Div %</th><th>Score</th></tr></thead>
            <tbody>
                ${stocks.map(st => {
                    const peClass = st.peVsSector < 0 ? 'pe-below' : st.peVsSector > 30 ? 'pe-above' : 'pe-inline';
                    return `<tr>
                        <td><strong>${st.symbol}</strong><br><span class="stock-subname">${st.name}</span></td>
                        <td>${st.price.toLocaleString('en-IN')}</td>
                        <td>${st.pe}</td>
                        <td>${sectorPe}</td>
                        <td class="${peClass}">${st.peVsSector > 0 ? '+' : ''}${st.peVsSector}%</td>
                        <td>${st.pb}</td>
                        <td>${st.roe}</td>
                        <td>${st.de}</td>
                        <td>${st.divYield}</td>
                        <td><strong>${st.score}</strong></td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

// --- NAVIGATION ---

function switchSegment(segment) {
    currentSegment = segment;
    document.querySelectorAll('.segment-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.segment === segment);
    });
    document.getElementById('segment-desc').textContent = ALL_SEGMENTS[segment].desc;
    currentFilter = 'all';
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
    });
    document.getElementById('sector-dropdown').value = '';
    document.getElementById('sector-buckets').style.display = 'none';

    generateDailyData();
    generateSectorData();
    updateSummary();

    if (currentView === 'stocks') {
        renderTable();
    } else {
        renderSectorSummaryTable();
        populateSectorDropdown();
    }
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });

    document.getElementById('stock-view').style.display = view === 'stocks' ? '' : 'none';
    document.getElementById('sector-view').style.display = view === 'sector' ? '' : 'none';

    if (view === 'sector') {
        renderSectorSummaryTable();
        populateSectorDropdown();
    }
}

function filterStocks(filter) {
    currentFilter = filter;
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTable();
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = (column === 'score' || column === 'roe' || column === 'divYield') ? 'desc' : 'asc';
    }
    renderTable();
}

function refreshData() {
    document.getElementById('stock-tbody').innerHTML = '<tr><td colspan="14" class="loading">Refreshing data...</td></tr>';
    setTimeout(() => {
        generateDailyData();
        generateSectorData();
        updateSummary();
        if (currentView === 'stocks') renderTable();
        else { renderSectorSummaryTable(); populateSectorDropdown(); onSectorSelect(); }
    }, 500);
}

// Initialize
generateDailyData();
generateSectorData();
updateSummary();
renderTable();

setInterval(refreshData, 300000);
