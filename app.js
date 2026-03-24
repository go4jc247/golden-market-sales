/* Golden International Market — Sale Page App */

let allData = null;
let activeCategory = 'all';
let deferredInstallPrompt = null;

// ── PWA Install Prompt ──────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtn').classList.add('visible');
});

document.getElementById('installBtn')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('installBtn').classList.remove('visible');
  }
  deferredInstallPrompt = null;
});

// ── Offline Toast ───────────────────────────────
window.addEventListener('online',  () => document.getElementById('offlineToast').classList.remove('show'));
window.addEventListener('offline', () => document.getElementById('offlineToast').classList.add('show'));

// ── Service Worker ──────────────────────────────
if ('serviceWorker' in navigator) {
  // Derive base path so SW works on both GitHub Pages (/golden-market-sales/) and custom domain (/)
  const swPath = new URL('sw.js', document.baseURI).pathname;
  navigator.serviceWorker.register(swPath).catch(() => {});
}

// ── Load Data ───────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('data.json');
    allData = await res.json();
    render();
  } catch (err) {
    document.getElementById('featuredGrid').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <p>Could not load sale items. Please try again.</p>
      </div>`;
    document.getElementById('allGrid').innerHTML = '';
  }
}

// ── Render ──────────────────────────────────────
function render() {
  if (!allData) return;

  renderHeader();
  renderFilters();
  renderItems();
  renderHours();
  renderReviews();
}

function renderHeader() {
  const { store } = allData;
  document.getElementById('storeName').textContent = store.name;
  const taglineEl = document.getElementById('storeTagline');
  if (taglineEl) taglineEl.textContent = store.tagline;

  const updated = new Date(store.updated);
  const fmt = updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('updatedDate').textContent = `Updated ${fmt}`;
  document.title = `${store.name} — Weekly Sales`;
}

function renderFilters() {
  const bar = document.getElementById('filterInner');
  bar.innerHTML = '';
  allData.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (cat.id === activeCategory ? ' active' : '');
    btn.innerHTML = `<span class="cat-emoji">${cat.emoji}</span>${cat.name}`;
    btn.addEventListener('click', () => {
      activeCategory = cat.id;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderItems();
    });
    bar.appendChild(btn);
  });
}

function renderItems() {
  const items = activeCategory === 'all'
    ? allData.items
    : allData.items.filter(i => i.category === activeCategory);

  const featured = items.filter(i => i.featured);
  const rest = items.filter(i => !i.featured);

  const featuredGrid = document.getElementById('featuredGrid');
  const allGrid = document.getElementById('allGrid');
  const featuredSection = document.getElementById('featuredSection');
  const allSection = document.getElementById('allSection');

  if (featured.length === 0) {
    featuredSection.style.display = 'none';
  } else {
    featuredSection.style.display = '';
    featuredGrid.innerHTML = featured.map(cardHTML).join('');
  }

  if (items.length === 0) {
    allGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🔍</div>
        <p>No sale items in this category right now.</p>
      </div>`;
    allSection.querySelector('.section-label').textContent = '';
  } else {
    allSection.querySelector('.section-label').innerHTML =
      rest.length > 0
        ? `<span>More Deals</span>`
        : `<span>All Sale Items</span>`;
    allGrid.innerHTML = (featured.length > 0 ? rest : items).map(cardHTML).join('');
  }
}

function cardHTML(item) {
  const discount = Math.round((1 - item.sale_price / item.original_price) * 100);
  const saleDollars = Math.floor(item.sale_price);
  const saleCents = String(Math.round((item.sale_price % 1) * 100)).padStart(2, '0');

  const imageHTML = item.image_url
    ? `<img src="${item.image_url}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';

  return `
    <div class="item-card${item.featured ? ' featured' : ''}">
      <div class="item-image" style="background: ${item.color}22;">
        ${imageHTML}
        <span class="emoji-fallback"${item.image_url ? ' style="display:none"' : ''}>${item.emoji}</span>
        <span class="discount-badge">${discount}% OFF</span>
        ${item.featured ? '<span class="featured-badge">⭐ Feature</span>' : ''}
      </div>
      <div class="item-body">
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.description}</div>
        <div class="price-row">
          <div>
            <div class="price-sale"><sup>$</sup>${saleDollars}<sup>${saleCents}</sup></div>
            <div class="price-unit">${item.unit}</div>
          </div>
          <div class="price-right">
            <div class="price-original">Was $${item.original_price.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderHours() {
  const { store } = allData;
  document.getElementById('storeAddress').innerHTML =
    `<a href="https://maps.google.com/?q=${encodeURIComponent(store.address)}" target="_blank" rel="noopener">${store.address}</a>`;
  document.getElementById('storePhone').innerHTML =
    `<a href="tel:${store.phone.replace(/\D/g,'')}">${store.phone}</a>`;

  const list = document.getElementById('hoursList');
  list.innerHTML = store.hours.map(h => `
    <li class="${h.hours === 'Closed' ? 'closed' : ''}">
      <span class="day">${h.days}</span>
      <span class="time">${h.hours}</span>
    </li>`).join('');
}

// ── Reviews (mock — replace with Google Places API) ──
const MOCK_REVIEWS = [
  { author: "Maria T.", rating: 5, text: "Amazing selection of international products. The freshest produce I've found in the area!", time: "2 weeks ago" },
  { author: "James R.", rating: 5, text: "Best prices around and the staff are always so friendly and helpful.", time: "1 month ago" },
  { author: "Priya S.", rating: 5, text: "Finally a store that carries authentic ingredients from back home. Highly recommend!", time: "3 weeks ago" },
  { author: "David L.", rating: 4, text: "Great variety and good prices. Love seeing the weekly specials — always something new.", time: "2 months ago" }
];

function renderReviews() {
  const container = document.getElementById('reviewsGrid');
  if (!container) return;

  container.innerHTML = MOCK_REVIEWS.map(r => `
    <div class="review-card">
      <div class="review-header">
        <div class="reviewer-avatar">${r.author.charAt(0)}</div>
        <div>
          <div class="reviewer-name">${r.author}</div>
          <div class="review-time">${r.time}</div>
        </div>
        <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
      </div>
      <p class="review-text">${r.text}</p>
    </div>`).join('');
}

// ── Init ────────────────────────────────────────
loadData();
