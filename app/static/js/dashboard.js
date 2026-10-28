let allProducts = [];
let allCategories = [];

async function loadData() {
  const [productsRes, categoriesRes] = await Promise.all([
    fetch('/api/catalog/products'),
    fetch('/api/catalog/categories')
  ]);
  allProducts = await productsRes.json();
  allCategories = await categoriesRes.json();

  renderStats();
  renderFilters();
  renderProducts(allProducts);
}

function renderStats() {
  document.getElementById('stats').textContent =
    `${allProducts.length} products · ${allCategories.length} categories`;
}

function renderFilters() {
  const container = document.getElementById('categoryFilters');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.textContent = 'All';
  allBtn.onclick = () => renderProducts(allProducts);
  container.appendChild(allBtn);

  allCategories.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat.name;
    btn.onclick = () => {
      const filtered = allProducts.filter(p => p.category === cat.name);
      renderProducts(filtered);
    };
    container.appendChild(btn);
  });
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '';

  if (products.length === 0) {
    grid.textContent = 'No products yet.';
    return;
  }

  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-name"></div>
      <div class="product-price"></div>
      <div class="product-store"></div>
    `;
    card.querySelector('.product-name').textContent = p.name;
    card.querySelector('.product-price').textContent = `R${p.price.toFixed(2)}`;
    card.querySelector('.product-store').textContent = p.store_name || '';
    grid.appendChild(card);
  });
}

loadData();
