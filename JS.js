// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = 'https://daizqjgoxizapeoatmou.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_Qs2v39dvDNqNn4hKqb2l7g_GEJOyNhN';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. VARIABLES DE ESTADO
// ==========================================
let cart = JSON.parse(localStorage.getItem('mymarket_cart')) || [];
let productsList = [];
let categoriesList = [];
let currentUser = null;
let currentCategoryFilter = 'all';

// ==========================================
// 3. NOTIFICACIONES Y UI
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}"></i> ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const cartSidebar = document.getElementById('cart-sidebar');

// ==========================================
// 4. CARGAR CATEGORÍAS Y PRODUCTOS
// ==========================================
async function fetchCategories() {
    const { data, error } = await supabaseClient.from('categories').select('*').order('name');
    if (error) {
        console.error('Error cargando categorías:', error);
        return;
    }
    categoriesList = data || [];
    renderCategoryNavbar();
    populateCategorySelects();
}

function renderCategoryNavbar() {
    const container = document.getElementById('category-nav-container');
    if (!container) return;

    let html = `<button class="cat-chip ${currentCategoryFilter === 'all' ? 'active' : ''}" data-category="all">Todos</button>`;
    categoriesList.forEach(cat => {
        const activeClass = currentCategoryFilter == cat.id ? 'active' : '';
        html += `<button class="cat-chip ${activeClass}" data-category="${cat.id}">${escapeHtml(cat.name)}</button>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.cat-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCategoryFilter = e.target.dataset.category;
            filterAndRenderProducts();
        });
    });
}

function populateCategorySelects() {
    const select = document.getElementById('product-category');
    if (!select) return;
    select.innerHTML = '';
    categoriesList.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
}

async function fetchProducts() {
    const container = document.getElementById('products-container');
    container.innerHTML = '<p>Cargando productos...</p>';

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        showToast('Error al cargar productos', 'error');
        console.error(error);
        container.innerHTML = '<p>Error al cargar el catálogo.</p>';
        return;
    }

    productsList = data || [];
    filterAndRenderProducts();
}

function filterAndRenderProducts() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    
    const filtered = productsList.filter(prod => {
        const matchesQuery = String(prod.title || '').toLowerCase().includes(query);
        const matchesCategory = currentCategoryFilter === 'all' || String(prod.category_id) === String(currentCategoryFilter);
        return matchesQuery && matchesCategory;
    });

    renderProducts(filtered);
}

function renderProducts(products) {
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    if (products.length === 0) {
        container.innerHTML = '<p>No hay productos disponibles en esta categoría.</p>';
        return;
    }

    products.forEach(prod => {
        const isOwner = currentUser && currentUser.id === prod.seller_id;
        const stockStatusBadge = prod.stock > 0 
            ? `<span class="badge-stock stock-ok">Quedan ${prod.stock} un.</span>` 
            : `<span class="badge-stock stock-out">Agotado</span>`;

        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${escapeHtml(prod.image_url || 'https://via.placeholder.com/200')}" alt="${escapeHtml(prod.title || 'Producto')}" onclick="openProductPreview(${prod.id})">
                ${stockStatusBadge}
            </div>
            <h3 class="product-title">${escapeHtml(prod.title || 'Producto sin nombre')}</h3>
            <div class="product-meta">
                <div class="product-price">${escapeHtml(prod.currency || 'NIO')} ${Number(prod.price || 0).toFixed(2)}</div>
                <div class="product-stock">${escapeHtml(prod.condition_type || 'Sin condición')} • ${escapeHtml(prod.location || 'Sin ubicación')}</div>
            </div>
            <div class="product-actions">
                <button class="btn-primary" onclick="addToCart(${prod.id})" ${prod.stock <= 0 || prod.status !== 'active' ? 'disabled' : ''}>Agregar al carrito</button>
                <button class="btn-secondary" onclick="openProductPreview(${prod.id})">Ver</button>
            </div>
            ${isOwner ? `
            <div class="owner-actions" style="margin-top: 8px; display: flex; gap: 5px;">
                <button class="btn-secondary" style="flex: 1; background: #f39c12; color: white;" onclick="openEditProduct(${prod.id})"><i class="fa-solid fa-pen"></i> Editar</button>
                <button class="btn-secondary" style="flex: 1; background: #e74c3c; color: white;" onclick="deleteProduct(${prod.id})"><i class="fa-solid fa-trash"></i> Eliminar</button>
            </div>` : ''}
        `;
        container.appendChild(div);
    });
}

// ==========================================
// 5. GESTIÓN DE PRODUCTOS (CREAR, EDITAR, ELIMINAR)
// ==========================================
async function publishProduct(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast('Inicia sesión para publicar productos', 'error');
        return;
    }

    const productId = document.getElementById('product-id-hidden').value;
    const imageFile = document.getElementById('product-image').files[0];
    const phone = document.getElementById('product-phone').value.trim();
    
    let imageUrl = null;
    const existingProduct = productId ? productsList.find(p => p.id == productId) : null;
    if (existingProduct) {
        imageUrl = existingProduct.image_url;
    }

    if (imageFile) {
        if (!imageFile.type.startsWith('image/')) {
            showToast('Selecciona un archivo de imagen válido', 'error');
            return;
        }
        if (imageFile.size > 5 * 1024 * 1024) {
            showToast('La imagen no puede superar 5 MB', 'error');
            return;
        }
        try {
            imageUrl = await compressImageToDataUrl(imageFile);
        } catch (error) {
            showToast(error.message, 'error');
            return;
        }
    }

    if (!imageUrl && !productId) {
        showToast('La imagen del producto es obligatoria', 'error');
        return;
    }

    const productData = {
        title: document.getElementById('product-title').value.trim(),
        category_id: Number(document.getElementById('product-category').value),
        price: Number(document.getElementById('product-price').value),
        currency: document.getElementById('product-currency').value,
        stock: Number(document.getElementById('product-stock').value),
        status: document.getElementById('product-status').value,
        condition_type: document.getElementById('product-condition').value.trim(),
        location: document.getElementById('product-location').value.trim(),
        phone: phone,
        seller_phone: phone,
        seller_id: currentUser.id,
        image_url: imageUrl
    };

    let error;
    if (productId) {
        const res = await supabaseClient.from('products').update(productData).eq('id', productId);
        error = res.error;
    } else {
        const res = await supabaseClient.from('products').insert([productData]);
        error = res.error;
    }

    if (error) {
        console.error('Error al guardar producto:', error);
        showToast(`No se pudo guardar: ${error.message}`, 'error');
        return;
    }

    closeModal('sell-modal');
    showToast(productId ? 'Producto actualizado con éxito' : 'Producto publicado correctamente');
    await fetchProducts();
}

function openEditProduct(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('sell-modal-title').textContent = 'Editar producto';
    document.getElementById('product-id-hidden').value = product.id;
    document.getElementById('product-title').value = product.title || '';
    document.getElementById('product-category').value = product.category_id || '';
    document.getElementById('product-price').value = product.price || 0;
    document.getElementById('product-currency').value = product.currency || 'NIO';
    document.getElementById('product-stock').value = product.stock || 1;
    document.getElementById('product-status').value = product.status || 'active';
    document.getElementById('product-condition').value = product.condition_type || 'Usado';
    document.getElementById('product-location').value = product.location || '';
    document.getElementById('product-phone').value = product.seller_phone || product.phone || '';
    
    const preview = document.getElementById('product-image-preview');
    if (product.image_url) {
        preview.src = product.image_url;
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }

    openModal('sell-modal');
}

async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;

    const { error } = await supabaseClient.from('products').delete().eq('id', productId);
    if (error) {
        showToast(`No se pudo eliminar: ${error.message}`, 'error');
        return;
    }

    showToast('Producto eliminado');
    await fetchProducts();
}

// ==========================================
// 6. PERFIL DE USUARIO
// ==========================================
async function loadUserProfile() {
    if (!currentUser) return;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('profile-name').value = data.full_name || '';
        document.getElementById('profile-phone').value = data.phone || '';
        if (data.avatar_url) {
            document.getElementById('profile-avatar-preview').src = data.avatar_url;
        }
    }
}

async function saveUserProfile(event) {
    event.preventDefault();
    if (!currentUser) return;

    const avatarFile = document.getElementById('profile-avatar-file').files[0];
    let avatarUrl = document.getElementById('profile-avatar-preview').src;

    if (avatarFile) {
        try {
            avatarUrl = await compressImageToDataUrl(avatarFile, 150);
        } catch (e) {
            showToast('Error procesando imagen de perfil', 'error');
            return;
        }
    }

    const profileData = {
        id: currentUser.id,
        full_name: document.getElementById('profile-name').value.trim(),
        phone: document.getElementById('profile-phone').value.trim(),
        avatar_url: avatarUrl,
        is_online: true,
        updated_at: new Date()
    };

    const { error } = await supabaseClient.from('profiles').upsert(profileData);
    if (error) {
        showToast(`Error actualizando perfil: ${error.message}`, 'error');
        return;
    }

    closeModal('profile-modal');
    showToast('Perfil actualizado con éxito');
}

// ==========================================
// 7. CARRITO DE COMPRAS
// ==========================================
function addToCart(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;

    const existingItem = cart.find(item => item.id === productId);
    const currentQtyInCart = existingItem ? existingItem.qty : 0;

    if (currentQtyInCart >= product.stock) {
        showToast('No hay más unidades disponibles en stock', 'error');
        return;
    }

    if (existingItem) {
        existingItem.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    saveCart();
    renderCart();
    showToast('Producto agregado al carrito');
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    renderCart();
}

function saveCart() {
    localStorage.setItem('mymarket_cart', JSON.stringify(cart));
    const badge = document.getElementById('cart-count');
    if (badge) badge.innerText = cart.reduce((acc, item) => acc + item.qty, 0);
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalVal = document.getElementById('cart-total-val');
    if (!container || !totalVal) return;

    container.innerHTML = '';
    let total = 0;

    cart.forEach(item => {
        total += item.price * item.qty;
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-details">
                <div class="cart-item-title">${escapeHtml(item.title || 'Producto')}</div>
                <div class="cart-item-price">${item.qty} x ${escapeHtml(item.currency || 'NIO')} ${Number(item.price || 0).toFixed(2)}</div>
            </div>
            <button class="remove-item-btn" onclick="removeFromCart(${item.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(div);
    });

    totalVal.innerText = total.toFixed(2);
    saveCart();
}

// ==========================================
// 8. INICIALIZACIÓN Y EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    setupInterface();
    await restoreSession();
    await fetchCategories();
    await fetchProducts();
    saveCart();
});

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function setupInterface() {
    document.getElementById('cart-btn').addEventListener('click', () => {
        cartSidebar.classList.add('active');
        renderCart();
    });
    document.getElementById('close-cart').addEventListener('click', () => cartSidebar.classList.remove('active'));

    document.getElementById('login-btn').addEventListener('click', async () => {
        if (currentUser) {
            await signOutUser();
        } else {
            showLoginForm();
            openModal('login-modal');
        }
    });

    document.getElementById('profile-btn').addEventListener('click', async () => {
        await loadUserProfile();
        openModal('profile-modal');
    });

    document.getElementById('sell-btn').addEventListener('click', () => {
        if (!currentUser) {
            showToast('Inicia sesión para vender un producto', 'error');
            openModal('login-modal');
            return;
        }
        document.getElementById('sell-modal-title').textContent = 'Publicar producto';
        document.getElementById('sell-form').reset();
        document.getElementById('product-id-hidden').value = '';
        document.getElementById('product-image-preview').classList.add('hidden');
        openModal('sell-modal');
    });

    document.getElementById('search-btn').addEventListener('click', filterAndRenderProducts);
    document.getElementById('search-input').addEventListener('input', filterAndRenderProducts);
    
    document.getElementById('checkout-btn').addEventListener('click', () => {
        if (!cart.length) {
            showToast('Tu carrito está vacío', 'error');
            return;
        }
        openModal('payment-modal');
    });

    document.querySelectorAll('[data-close-modal]').forEach(button => {
        button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) closeModal(modal.id);
        });
    });

    document.getElementById('login-form').addEventListener('submit', signInUser);
    document.getElementById('register-form').addEventListener('submit', registerUser);
    document.getElementById('show-register-btn').addEventListener('click', showRegisterForm);
    document.getElementById('show-login-btn').addEventListener('click', showLoginForm);
    document.getElementById('sell-form').addEventListener('submit', publishProduct);
    document.getElementById('profile-form').addEventListener('submit', saveUserProfile);
    document.getElementById('payment-form').addEventListener('submit', completeOrder);
    
    const imgInput = document.getElementById('product-image');
    if (imgInput) imgInput.addEventListener('change', (e) => previewImage(e, 'product-image-preview'));

    const avatarInput = document.getElementById('profile-avatar-file');
    if (avatarInput) avatarInput.addEventListener('change', (e) => previewImage(e, 'profile-avatar-preview'));
}

async function signInUser(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        showToast(`No se pudo iniciar sesión: ${error.message}`, 'error');
        return;
    }
    currentUser = data.user;
    updateAuthUI();
    closeModal('login-modal');
    showToast('Sesión iniciada correctamente');
    await fetchProducts();
}

async function signOutUser() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    updateAuthUI();
    showToast('Sesión cerrada');
    await fetchProducts();
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const profileBtn = document.getElementById('profile-btn');
    
    if (currentUser) {
        loginBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> <span>Cerrar sesión</span>';
        profileBtn.classList.remove('hidden');
    } else {
        loginBtn.innerHTML = '<i class="fa-solid fa-user"></i> <span>Iniciar sesión</span>';
        profileBtn.classList.add('hidden');
    }
}

async function restoreSession() {
    const { data } = await supabaseClient.auth.getSession();
    currentUser = data.session?.user || null;
    updateAuthUI();
}

function previewImage(event, previewId) {
    const file = event.target.files[0];
    const preview = document.getElementById(previewId);
    if (!preview) return;
    
    if (!file) {
        preview.classList.add('hidden');
        return;
    }
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

function compressImageToDataUrl(file, maxSize = 320) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const reader = new FileReader();
        reader.onload = () => { image.src = reader.result; };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        image.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        image.onerror = () => reject(new Error('Archivo de imagen inválido.'));
        reader.readAsDataURL(file);
    });
}

function openProductPreview(productId) {
    const product = productsList.find(item => item.id === productId);
    if (!product) return;

    const phone = normalizePhone(product.seller_phone || product.phone || '');
    const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, estoy interesado en tu producto: ${product.title}`)}` : '';
    
    document.getElementById('product-preview-content').innerHTML = `
        <div class="product-detail-body">
            <div class="detail-preview"><img src="${escapeHtml(product.image_url || 'https://via.placeholder.com/500')}" alt="${escapeHtml(product.title || 'Producto')}"></div>
            <div class="detail-info">
                <h4>${escapeHtml(product.title || 'Producto')}</h4>
                <p>${escapeHtml(product.description || 'Sin descripción detallada.')}</p>
                <div class="detail-grid">
                    <div><strong>Precio</strong><br>${escapeHtml(product.currency || 'NIO')} ${Number(product.price || 0).toFixed(2)}</div>
                    <div><strong>Disponibles</strong><br>${product.stock} unidades</div>
                    <div><strong>Condición</strong><br>${escapeHtml(product.condition_type || 'No especificada')}</div>
                    <div><strong>Ubicación</strong><br>${escapeHtml(product.location || 'No especificada')}</div>
                </div>
                <div class="detail-contact">
                    <span>Contactar al vendedor</span>
                    ${whatsappUrl ? `<a class="contact-btn" href="${whatsappUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : '<span class="contact-btn inactive">Sin teléfono</span>'}
                </div>
            </div>
        </div>`;
    openModal('product-preview-modal');
}

function normalizePhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('505') ? digits : `505${digits}`;
}

function completeOrder(event) {
    event.preventDefault();
    cart = [];
    saveCart();
    renderCart();
    cartSidebar.classList.remove('active');
    closeModal('payment-modal');
    event.target.reset();
    showToast('Pedido recibido correctamente. El vendedor se pondrá en contacto.');
}

async function registerUser(event) {
    event.preventDefault();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const password = document.getElementById('register-password').value;
    const confirmation = document.getElementById('register-password-confirm').value;

    if (password !== confirmation) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        showToast(`No se pudo crear la cuenta: ${error.message}`, 'error');
        return;
    }

    document.getElementById('register-form').reset();
    if (data.session) {
        currentUser = data.user;
        updateAuthUI();
        closeModal('login-modal');
        showToast('Cuenta creada e iniciada sesión');
        return;
    }

    showLoginForm();
    showToast('Cuenta creada correctamente. Inicia sesión.');
}

function showRegisterForm() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('show-register-btn').classList.add('hidden');
    document.getElementById('show-login-btn').classList.remove('hidden');
    document.querySelector('#login-modal .modal-header h3').textContent = 'Crear cuenta';
}

function showLoginForm() {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('show-login-btn').classList.add('hidden');
    document.getElementById('show-register-btn').classList.remove('hidden');
    document.querySelector('#login-modal .modal-header h3').textContent = 'Iniciar sesión';
}