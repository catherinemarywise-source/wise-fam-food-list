/**
 * FreshBasket — Collaborative Family Grocery Web App
 * Real-time sync with Supabase JS v2 & LocalStorage Fallback
 */

// ==========================================================================
// 1. SUPABASE CONFIGURATION (Replace with your actual Supabase credentials)
// ==========================================================================
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_KEY';

// ==========================================================================
// 2. STATE MANAGEMENT & DOM ELEMENTS
// ==========================================================================
let supabaseClient = null;
let isSupabaseConfigured = false;
let groceryItems = [];
let activeFilter = 'all';
let activeCategory = 'ALL';
let searchQuery = '';

// DOM Elements
const groceryForm = document.getElementById('groceryForm');
const itemInput = document.getElementById('itemInput');
const qtyInput = document.getElementById('qtyInput');
const categorySelect = document.getElementById('categorySelect');
const groceryListEl = document.getElementById('groceryList');
const emptyStateEl = document.getElementById('emptyState');
const emptyTitleEl = document.getElementById('emptyTitle');
const emptyMessageEl = document.getElementById('emptyMessage');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

const statTotalEl = document.getElementById('statTotal');
const statRemainingEl = document.getElementById('statRemaining');
const statCompletedEl = document.getElementById('statCompleted');
const itemsSummaryText = document.getElementById('itemsSummaryText');
const syncStatusText = document.getElementById('syncStatusText');
const configBanner = document.getElementById('configBanner');
const dismissBannerBtn = document.getElementById('dismissBannerBtn');

const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const filterTabs = document.getElementById('filterTabs');
const categoryPills = document.getElementById('categoryPills');
const toastContainer = document.getElementById('toastContainer');

// Category icons map
const categoryIcons = {
  'Produce': '🥬',
  'Dairy': '🧀',
  'Bakery': '🍞',
  'Pantry': '🥫',
  'Meat': '🥩',
  'Frozen': '🧊',
  'Beverages': '🧃',
  'Household': '🧼',
  'Other': '📦'
};

// LocalStorage Keys
const LOCAL_STORAGE_KEY = 'freshbasket_groceries_v1';

// ==========================================================================
// 3. INITIALIZATION & SUPABASE / LOCALSTORAGE SETUP
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  setupEventListeners();
  loadItems();
});

function initSupabase() {
  const isValidUrl = SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_URL.startsWith('http');
  const isValidKey = SUPABASE_KEY && SUPABASE_KEY !== 'YOUR_SUPABASE_KEY';

  if (isValidUrl && isValidKey && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      isSupabaseConfigured = true;
      syncStatusText.textContent = 'Supabase Sync Active';
      configBanner.style.display = 'none';
      subscribeToRealtime();
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      setupFallbackMode();
    }
  } else {
    setupFallbackMode();
  }
}

function setupFallbackMode() {
  isSupabaseConfigured = false;
  syncStatusText.textContent = 'Local Mode (Offline)';
  if (configBanner) configBanner.style.display = 'flex';
}

// Subscribe to Supabase Postgres Changes for Table 'groceries'
function subscribeToRealtime() {
  if (!supabaseClient) return;

  const channel = supabaseClient
    .channel('public:groceries')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'groceries' },
      (payload) => {
        handleRealtimePayload(payload);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showToast('Real-time connection established!', 'success');
      }
    });
}

function handleRealtimePayload(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT') {
    if (!groceryItems.some(i => i.id === newRow.id)) {
      groceryItems.unshift(newRow);
      renderUI();
      showToast(`New item added: ${newRow.title}`, 'info');
    }
  } else if (eventType === 'UPDATE') {
    const idx = groceryItems.findIndex(i => i.id === oldRow.id);
    if (idx !== -1) {
      groceryItems[idx] = newRow;
      renderUI();
    }
  } else if (eventType === 'DELETE') {
    groceryItems = groceryItems.filter(i => i.id !== oldRow.id);
    renderUI();
  }
}

// ==========================================================================
// 4. DATA CRUD OPERATIONS
// ==========================================================================
async function loadItems() {
  if (isSupabaseConfigured && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('groceries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      groceryItems = data || [];
    } catch (err) {
      console.error('Error fetching groceries from Supabase:', err);
      showToast('Error connecting to Supabase. Loaded local data.', 'warning');
      loadFromLocalStorage();
    }
  } else {
    loadFromLocalStorage();
  }
  renderUI();
}

function loadFromLocalStorage() {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (saved) {
    try {
      groceryItems = JSON.parse(saved);
    } catch (e) {
      groceryItems = getInitialSeedData();
    }
  } else {
    groceryItems = getInitialSeedData();
    saveToLocalStorage();
  }
}

function saveToLocalStorage() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(groceryItems));
}

function getInitialSeedData() {
  return [
    { id: '1', title: 'Organic Whole Milk', quantity: '2 Cartons', category: 'Dairy', completed: false, created_at: new Date().toISOString() },
    { id: '2', title: 'Fresh Bananas & Apples', quantity: '1 Bunch', category: 'Produce', completed: false, created_at: new Date().toISOString() },
    { id: '3', title: 'Sourdough Bread', quantity: '1 Loaf', category: 'Bakery', completed: true, created_at: new Date().toISOString() },
    { id: '4', title: 'Rolled Oats & Granola', quantity: '1 Box', category: 'Pantry', completed: false, created_at: new Date().toISOString() }
  ];
}

// Add Item
async function addItem(title, quantity, category) {
  const newItem = {
    id: Date.now().toString(),
    title: title.trim(),
    quantity: quantity.trim() || '1',
    category: category,
    completed: false,
    created_at: new Date().toISOString()
  };

  // Optimistic UI update
  groceryItems.unshift(newItem);
  renderUI();
  saveToLocalStorage();

  if (isSupabaseConfigured && supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('groceries')
        .insert([{
          title: newItem.title,
          quantity: newItem.quantity,
          category: newItem.category,
          completed: newItem.completed
        }])
        .select();

      if (error) throw error;
      if (data && data[0]) {
        // Replace temp item with Supabase returned item
        const index = groceryItems.findIndex(i => i.id === newItem.id);
        if (index !== -1) groceryItems[index] = data[0];
        renderUI();
      }
    } catch (err) {
      console.error('Error inserting item to Supabase:', err);
      showToast('Saved locally (Supabase insert issue)', 'warning');
    }
  }

  showToast(`Added "${newItem.title}"`, 'success');
}

// Toggle Completed Status
async function toggleCompleted(id) {
  const item = groceryItems.find(i => i.id === id);
  if (!item) return;

  item.completed = !item.completed;
  renderUI();
  saveToLocalStorage();

  if (isSupabaseConfigured && supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('groceries')
        .update({ completed: item.completed })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating status in Supabase:', err);
    }
  }
}

// Delete Single Item
async function deleteItem(id) {
  const item = groceryItems.find(i => i.id === id);
  groceryItems = groceryItems.filter(i => i.id !== id);
  renderUI();
  saveToLocalStorage();

  if (isSupabaseConfigured && supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('groceries')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error deleting item from Supabase:', err);
    }
  }

  if (item) showToast(`Removed "${item.title}"`, 'info');
}

// Clear All Completed Items
async function clearCompletedItems() {
  const completedIds = groceryItems.filter(i => i.completed).map(i => i.id);
  if (completedIds.length === 0) return;

  groceryItems = groceryItems.filter(i => !i.completed);
  renderUI();
  saveToLocalStorage();

  if (isSupabaseConfigured && supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('groceries')
        .delete()
        .eq('completed', true);

      if (error) throw error;
    } catch (err) {
      console.error('Error clearing completed in Supabase:', err);
    }
  }

  showToast(`Cleared ${completedIds.length} completed item(s)`, 'info');
}

// ==========================================================================
// 5. RENDER UI & DOM MANIPULATION
// ==========================================================================
function renderUI() {
  updateStats();
  
  // Filter items
  const filtered = groceryItems.filter(item => {
    const matchesFilter = 
      activeFilter === 'all' ? true :
      activeFilter === 'active' ? !item.completed :
      activeFilter === 'completed' ? item.completed : true;

    const matchesCategory = 
      activeCategory === 'ALL' ? true : item.category === activeCategory;

    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesCategory && matchesSearch;
  });

  // Clear current list
  groceryListEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyStateEl.style.display = 'flex';
    if (groceryItems.length === 0) {
      emptyTitleEl.textContent = 'Your Basket is Empty!';
      emptyMessageEl.textContent = 'Add your first item using the form above to get started with your family grocery list.';
    } else {
      emptyTitleEl.textContent = 'No Items Found';
      emptyMessageEl.textContent = 'No grocery items match your current filter or search terms.';
    }
  } else {
    emptyStateEl.style.display = 'none';
    filtered.forEach(item => {
      const card = createItemCard(item);
      groceryListEl.appendChild(card);
    });
  }

  // Update clear button state
  const hasCompleted = groceryItems.some(i => i.completed);
  clearCompletedBtn.disabled = !hasCompleted;
}

function createItemCard(item) {
  const card = document.createElement('div');
  card.className = `item-card ${item.completed ? 'completed' : ''}`;
  card.dataset.id = item.id;

  const categoryEmoji = categoryIcons[item.category] || '📦';

  card.innerHTML = `
    <div class="item-main">
      <div class="custom-checkbox" aria-label="Toggle completed state">
        <i class="fa-solid fa-check"></i>
      </div>
      <div class="item-details">
        <div class="item-title-row">
          <span class="item-title">${escapeHtml(item.title)}</span>
          ${item.quantity ? `<span class="item-qty">${escapeHtml(item.quantity)}</span>` : ''}
        </div>
        <span class="category-badge badge-${escapeHtml(item.category)}">
          ${categoryEmoji} ${escapeHtml(item.category)}
        </span>
      </div>
    </div>
    <div class="item-actions">
      <button class="delete-btn" aria-label="Delete item">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;

  // Event Listeners for Checkbox and Delete
  const checkbox = card.querySelector('.custom-checkbox');
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCompleted(item.id);
  });

  const deleteBtn = card.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteItem(item.id);
  });

  return card;
}

function updateStats() {
  const total = groceryItems.length;
  const completed = groceryItems.filter(i => i.completed).length;
  const remaining = total - completed;

  statTotalEl.textContent = total;
  statRemainingEl.textContent = remaining;
  statCompletedEl.textContent = completed;

  itemsSummaryText.textContent = `${remaining} item${remaining === 1 ? '' : 's'} remaining`;
}

// ==========================================================================
// 6. EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  // Form submission
  groceryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = itemInput.value;
    const qty = qtyInput.value;
    const cat = categorySelect.value;

    if (!title.trim()) return;

    addItem(title, qty, cat);
    itemInput.value = '';
    qtyInput.value = '1';
    itemInput.focus();
  });

  // Filter Tabs
  filterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;

    filterTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    activeFilter = btn.dataset.filter;
    renderUI();
  });

  // Category Pills
  categoryPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;

    categoryPills.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    activeCategory = btn.dataset.category;
    renderUI();
  });

  // Search Input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    renderUI();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderUI();
  });

  // Clear Completed Button
  clearCompletedBtn.addEventListener('click', () => {
    clearCompletedItems();
  });

  // Dismiss Banner Button
  if (dismissBannerBtn) {
    dismissBannerBtn.addEventListener('click', () => {
      configBanner.style.display = 'none';
    });
  }
}

// ==========================================================================
// 7. UTILITY FUNCTIONS
// ==========================================================================
function showToast(message, type = 'info') {
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconClass = 
    type === 'success' ? 'fa-circle-check' :
    type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
