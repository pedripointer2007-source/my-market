// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
// Reemplaza con tus credenciales de Supabase (Project Settings -> API)
const SUPABASE_URL = 'https://daizqjgoxizapeoatmou.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_Qs2v39dvDNqNn4hKqb2l7g_GEJOyNhN';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. VARIABLES DE ESTADO
// ==========================================
let cart = JSON.parse(localStorage.getItem('mymarket_cart')) || [];
let productsList = [];
let currentUser = null;

// ==========================================
// 3. FUNCIONES DE INTERFAZ Y NOTIFICACIONES
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

// Control del Carrito (Sidebar)
const cartSidebar = document.getElementById('cart-sidebar');

// ==========================================
// 4. LÓGICA DE PRODUCTOS (SUPABASE)
// ==========================================
async function fetchProducts() {
    const container = document.getElementById('products-container');
    container.innerHTML = '<p>Cargando productos...</p>';

    let { data, error } = await supabaseClient.from('products').select('*').eq('status', 'active').order('created_at', { ascending: false });
    if (error && error.message.includes('created_at')) {
        const fallback = await supabaseClient.from('products').select('*').eq('status', 'active');
        data = fallback.data;
        error = fallback.error;
    }

    if (error) {
        showToast('Error al cargar productos', 'error');
        console.error(error);
        return;
    }

    productsList = data || [];
    renderProducts(productsList);
}

function renderProducts(products) {
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    if (products.length === 0) {
        container.innerHTML = '<p>No hay productos disponibles por el momento.</p>';
        return;
    }

    products.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div class="product-image-wrapper">
                <img src="${escapeHtml(prod.image_url || 'https://via.placeholder.com/200')}" alt="${escapeHtml(prod.title || 'Producto')}" onclick="openProductPreview(${prod.id})">
            </div>
            <h3 class="product-title">${escapeHtml(prod.title || 'Producto sin nombre')}</h3>
            <div class="product-meta">
                <div class="product-price">${escapeHtml(prod.currency || 'NIO')} ${Number(prod.price || 0).toFixed(2)}</div>
                <div class="product-stock">${escapeHtml(prod.condition_type || 'Sin condición')} • ${escapeHtml(prod.location || 'Sin ubicación')}</div>
            </div>
            <div class="product-actions">
                <button class="btn-primary" onclick="addToCart(${prod.id})">Agregar al carrito</button>
                <button class="btn-secondary" onclick="openProductPreview(${prod.id})">Ver producto</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==========================================
// 5. LÓGICA DEL CARRITO
// ==========================================
function addToCart(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
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
    document.getElementById('cart-count').innerText = cart.reduce((acc, item) => acc + item.qty, 0);
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalVal = document.getElementById('cart-total-val');
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
    saveCart(); // Actualiza el contador en el header
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    setupInterface();
    restoreSession();
    fetchProducts();
    saveCart(); // Inicializa el contador del carrito al recargar
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
    document.getElementById('sell-btn').addEventListener('click', () => {
        if (!currentUser) {
            showToast('Inicia sesión para vender un producto', 'error');
            openModal('login-modal');
            return;
        }
        openModal('sell-modal');
    });
    document.getElementById('search-btn').addEventListener('click', filterProducts);
    document.getElementById('search-input').addEventListener('input', filterProducts);
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
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') document.querySelectorAll('.modal.active').forEach(modal => closeModal(modal.id));
    });

    document.getElementById('login-form').addEventListener('submit', signInUser);
    document.getElementById('register-form').addEventListener('submit', registerUser);
    document.getElementById('show-register-btn').addEventListener('click', showRegisterForm);
    document.getElementById('show-login-btn').addEventListener('click', showLoginForm);
    document.getElementById('sell-form').addEventListener('submit', publishProduct);
    document.getElementById('payment-form').addEventListener('submit', completeOrder);
    document.getElementById('product-image').addEventListener('change', previewUploadedImage);
}

function filterProducts() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const filtered = productsList.filter(product => String(product.title || '').toLowerCase().includes(query));
    renderProducts(filtered);
}

async function signInUser(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    button.disabled = false;

    if (error) {
        showToast(`No se pudo iniciar sesión: ${error.message}`, 'error');
        return;
    }
    currentUser = data.user;
    updateAuthButton();
    closeModal('login-modal');
    showToast('Sesión iniciada correctamente');
}

async function signOutUser() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        showToast(`No se pudo cerrar sesión: ${error.message}`, 'error');
        return;
    }
    currentUser = null;
    updateAuthButton();
    showToast('Sesión cerrada');
}

function updateAuthButton() {
    const button = document.getElementById('login-btn');
    button.innerHTML = currentUser
        ? '<i class="fa-solid fa-right-from-bracket"></i> <span>Cerrar sesión</span>'
        : '<i class="fa-solid fa-user"></i> <span>Iniciar sesión</span>';
}

async function restoreSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error('Error al recuperar sesión:', error);
        return;
    }
    currentUser = data.session?.user || null;
    updateAuthButton();
}

async function publishProduct(event) {
    event.preventDefault();
    if (!currentUser) {
        showToast('Inicia sesión para publicar productos', 'error');
        closeModal('sell-modal');
        return;
    }

    const imageFile = document.getElementById('product-image').files[0];
    const phone = document.getElementById('product-phone').value.trim();
    if (!imageFile || !phone) {
        showToast('La imagen y el teléfono son obligatorios', 'error');
        return;
    }
    if (!imageFile.type.startsWith('image/')) {
        showToast('Selecciona un archivo de imagen válido', 'error');
        return;
    }
    if (imageFile.size > 5 * 1024 * 1024) {
        showToast('La imagen no puede superar 5 MB', 'error');
        return;
    }

    let imageUrl;
    try {
        imageUrl = await compressImageToDataUrl(imageFile);
    } catch (error) {
        showToast(error.message, 'error');
        return;
    }

    const product = {
        title: document.getElementById('product-title').value.trim(),
        price: Number(document.getElementById('product-price').value),
        currency: document.getElementById('product-currency').value,
        condition_type: document.getElementById('product-condition').value.trim(),
        location: document.getElementById('product-location').value.trim(),
        image_url: imageUrl,
        seller_phone: phone,
        seller_id: currentUser.id,
        status: 'active'
    };
    const { error } = await supabaseClient.from('products').insert([product]);
    if (error) {
        console.error('Error al publicar producto:', error);
        const detail = error.code ? ` [${error.code}]` : '';
        let hint = '';
        if (error.code === '42703') hint = ' Revisa que existan seller_phone, seller_id e image_url en products.';
        if (error.code === '42501') hint = ' Revisa las políticas INSERT de la tabla products en Supabase.';
        if (error.code === '22001') hint = ' image_url es demasiado corto; cambia esa columna a tipo text.';
        showToast(`No se pudo publicar${detail}: ${error.message}.${hint}`, 'error');
        return;
    }
    document.getElementById('sell-form').reset();
    document.getElementById('product-image-preview').classList.add('hidden');
    document.getElementById('product-image-preview').removeAttribute('src');
    closeModal('sell-modal');
    showToast('Producto publicado correctamente');
    await fetchProducts();
}

function previewUploadedImage(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('product-image-preview');
    if (!file) {
        preview.removeAttribute('src');
        preview.classList.add('hidden');
        return;
    }
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
}

function sanitizeFileName(fileName) {
    return fileName.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
}

function compressImageToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const reader = new FileReader();
        reader.onload = () => { image.src = reader.result; };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        image.onload = () => {
            const maxSize = 320;
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.45));
        };
        image.onerror = () => reject(new Error('El archivo no contiene una imagen válida.'));
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
                <p>${escapeHtml(product.description || 'Producto disponible en MyMarket.')}</p>
                <div class="detail-grid">
                    <div><strong>Precio</strong><br>${escapeHtml(product.currency || 'NIO')} ${Number(product.price || 0).toFixed(2)}</div>
                    <div><strong>Condición</strong><br>${escapeHtml(product.condition_type || 'No especificada')}</div>
                    <div><strong>Ubicación</strong><br>${escapeHtml(product.location || 'No especificada')}</div>
                    <div><strong>Teléfono</strong><br>${escapeHtml(product.seller_phone || 'No disponible')}</div>
                </div>
                <div class="detail-contact">
                    <span>Contacta al vendedor por WhatsApp</span>
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
    showToast('Pedido recibido. Nos pondremos en contacto contigo.');
}

async function registerUser(event) {
    event.preventDefault();
    const button = event.submitter;
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const password = document.getElementById('register-password').value;
    const confirmation = document.getElementById('register-password-confirm').value;

    if (password !== confirmation) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }

    button.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });

        if (error) {
            showToast(getRegistrationErrorMessage(error), 'error');
            return;
        }

        document.getElementById('register-form').reset();
        if (data.session) {
            currentUser = data.user;
            updateAuthButton();
            closeModal('login-modal');
            showToast('Cuenta creada e inicio de sesión realizado');
            return;
        }

        showLoginForm();
        showToast('Cuenta creada. Revisa tu correo para confirmar la cuenta.');
    } catch (error) {
        console.error('Error inesperado al crear cuenta:', error);
        showToast('No se pudo conectar con el servicio de cuentas. Intenta nuevamente.', 'error');
    } finally {
        button.disabled = false;
    }
}

function getRegistrationErrorMessage(error) {
    const message = String(error.message || '').toLowerCase();

    if (message.includes('user already registered') || message.includes('already been registered')) {
        return 'Este correo ya tiene una cuenta. Inicia sesión.';
    }
    if (message.includes('password should be at least') || message.includes('password is too short')) {
        return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (message.includes('invalid email')) {
        return 'Escribe un correo electrónico válido.';
    }
    if (message.includes('signup is disabled')) {
        return 'El registro está deshabilitado en Supabase. Activa Allow new users to sign up en Authentication > Settings.';
    }
    if (message.includes('email provider is disabled')) {
        return 'El proveedor de correo está deshabilitado en Supabase. Actívalo en Authentication > Providers > Email.';
    }

    return `No se pudo crear la cuenta: ${error.message || 'error desconocido'}`;
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