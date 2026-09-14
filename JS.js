// ==========================================
// CONFIGURACIÓN DE SUPABASE Y AUTENTICACIÓN
// ==========================================

const supabaseUrl = 'https://daizqjgoxizapeoatmou.supabase.co';
const supabaseKey = 'sb_publishable_Qs2v39dvDNqNn4hKqb2l7g_GEJOyNhN';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let productsCache = [];
let cartItems = JSON.parse(localStorage.getItem('mymarket_cart') || '[]');

// ==========================================
// FUNCIÓN DE ASEGURAR PERFIL (Resuelve errores con Google Auth)
// ==========================================
async function ensureSellerProfile() {
  if (!currentUser) return;

  try {
    const fullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email.split('@')[0];

    const { error: upsertError } = await supabaseClient
      .from('users')
      .upsert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: fullName
      }, { onConflict: 'id' });

    if (upsertError) {
      console.error("Error al asegurar el perfil del vendedor:", upsertError.message);
    }
  } catch (err) {
    console.error("Excepción en ensureSellerProfile:", err);
  }
}

// ==========================================
// REGISTRO Y AUTENTICACIÓN
// ==========================================
async function registrarUsuario(email, password, fullName) {
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { full_name: fullName }
      }
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("¡Registro exitoso! Por favor verifica tu cuenta o inicia sesión.");
  } catch (err) {
    console.error("Error inesperado en el registro:", err);
  }
}

async function iniciarSesion(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      alert("Credenciales incorrectas o usuario no registrado.");
      return;
    }

    currentUser = data.user;
    await ensureSellerProfile();
    actualizarSesion();
  } catch (err) {
    console.error("Error inesperado al iniciar sesión:", err);
  }
}

// ==========================================
// PUBLICAR PRODUCTO
// ==========================================
async function publicarProducto(productData, imageFile, productId = null) {
  if (!currentUser) {
    alert("Debes iniciar sesión para publicar un producto.");
    mostrarModal('login-modal');
    return;
  }

  if (!imageFile && !productId) {
    alert("La imagen del producto es obligatoria.");
    return;
  }

  try {
    // 1. Forzar la creación del perfil y esperar a que termine obligatoriamente
    const fullName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email.split('@')[0];
    const { error: profileError } = await supabaseClient
      .from('users')
      .upsert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: fullName
      }, { onConflict: 'id' });

    if (profileError) {
      console.error("Error asegurando perfil:", profileError.message);
    }

    let imageUrl = productData.image_url || '';
    const productoAnterior = productId ? productsCache.find(producto => producto.id === productId) : null;
    if (!imageFile && productoAnterior) imageUrl = productoAnterior.image_url || '';

    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const filePath = `products/${currentUser.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabaseClient.storage.from('product-images').upload(filePath, imageFile, { upsert: false });
      if (uploadError) throw new Error("Error al subir la imagen: " + uploadError.message);
      imageUrl = supabaseClient.storage.from('product-images').getPublicUrl(filePath).data.publicUrl;
    }

    const payload = {
      category_id: productData.category_id,
      title: productData.title,
      description: productData.description || '',
      price: productData.price,
      currency: productData.currency,
      stock: productData.stock,
      condition_type: productData.condition_type,
      location: productData.location,
      status: productData.status || 'active',
      phone: productData.phone,
      seller_phone: productData.seller_phone
    };
    if (imageUrl) payload.image_url = imageUrl;

    const request = productId
      ? supabaseClient.from('products').update(payload).eq('id', productId).eq('seller_id', currentUser.id)
      : supabaseClient.from('products').insert([{ ...payload, seller_id: currentUser.id }]);
    const { error: saveError } = await request;
    if (saveError) throw new Error(`Error al ${productId ? 'actualizar' : 'guardar'} el producto: ${saveError.message}`);

    alert(productId ? "¡Producto actualizado con éxito!" : "¡Producto publicado con éxito!");
    cerrarModal('sell-modal');
    document.getElementById('sell-form').reset();
    document.getElementById('product-id-hidden').value = '';
    document.getElementById('sell-modal-title').innerText = 'Publicar producto';
    await cargarProductos();

  } catch (err) {
    console.error("Fallo en la publicación:", err.message);
    alert(err.message);
  }
}

// ==========================================
// UTILIDADES Y MODALES
// ==========================================
function mostrarModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function cerrarModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function actualizarSesion() {
  const loginBtn = document.getElementById('login-btn');
  const profileBtn = document.getElementById('profile-btn');
  if (!loginBtn || !profileBtn) return;

  loginBtn.innerHTML = currentUser 
    ? '<i class="fa-solid fa-right-from-bracket"></i> <span>Cerrar sesión</span>' 
    : '<i class="fa-solid fa-user"></i> <span>Iniciar sesión</span>';
  profileBtn.classList.toggle('hidden', !currentUser);
  document.getElementById('notifications-btn')?.classList.toggle('hidden', !currentUser);
}

async function cargarProductos() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }
  productsCache = data || [];
  renderizarProductos(productsCache);
}

function agregarAlCarrito(id) {
  if (!currentUser) {
    alert('Debes iniciar sesión para comprar.');
    mostrarModal('login-modal');
    return;
  }
  reservarUnidadYAgregar(id);
}

async function reservarUnidadYAgregar(id) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) {
    currentUser = null;
    actualizarSesion();
    alert('Tu sesión expiró. Inicia sesión para comprar.');
    mostrarModal('login-modal');
    return;
  }

  const producto = productsCache.find(item => item.id === id);
  if (!producto || producto.status !== 'active' || Number(producto.stock) < 1) {
    alert('Producto sin stock o no disponible.');
    return;
  }

  const stockActual = Number(producto.stock);
  const { error } = await supabaseClient
    .from('products')
    .update({ stock: stockActual - 1 })
    .eq('id', id)
    .eq('stock', stockActual)
    .eq('status', 'active');

  if (error) {
    console.error('Error reservando stock:', error);
    await cargarProductos();
    alert(`No se pudo agregar al carrito: ${error.message}`);
    return;
  }

  producto.stock = stockActual - 1;
  const existente = cartItems.find(item => item.id === id);
  if (existente) existente.qty += 1;
  else cartItems.push({ ...producto, qty: 1 });
  guardarCarritoDelUsuario();
  actualizarCarritoUI();
  renderizarProductos(productsCache);
}

function guardarCarritoDelUsuario() {
  const key = currentUser ? `mymarket_cart_${currentUser.id}` : 'mymarket_cart';
  localStorage.setItem(key, JSON.stringify(cartItems));
}

function actualizarCarritoUI() {
  const totalItems = cartItems.reduce((total, item) => total + Number(item.qty || 0), 0);
  const total = cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const badge = document.getElementById('cart-count');
  const itemsContainer = document.getElementById('cart-items-container');
  const totalElement = document.getElementById('cart-total-val');
  if (badge) badge.textContent = totalItems;
  if (totalElement) totalElement.textContent = total.toFixed(2);
  if (itemsContainer) {
    itemsContainer.innerHTML = cartItems.length ? cartItems.map(item => `
      <div class="cart-item">
        <div class="cart-item-details">
          <div class="cart-item-title">${escapeHtml(item.title)}</div>
          <div class="cart-item-price">${item.qty} x ${escapeHtml(item.currency || 'NIO')} ${Number(item.price || 0).toFixed(2)}</div>
        </div>
        <button class="remove-item-btn" data-remove-cart="${item.id}">Eliminar</button>
      </div>`).join('') : '<p>Tu carrito está vacío.</p>';
    itemsContainer.querySelectorAll('[data-remove-cart]').forEach(button => button.addEventListener('click', () => quitarDelCarrito(Number(button.dataset.removeCart))));
  }
}

function abrirWhatsApp(phone, buyerName, productTitle) {
  let rawPhone = String(phone || '').trim();

  if (!rawPhone || rawPhone === 'undefined' || rawPhone === 'null' || rawPhone === '') {
    alert('Este producto no tiene un número de WhatsApp registrado.');
    return;
  }

  // 1. Limpiar todo lo que no sea número (elimina espacios, guiones, paréntesis y el signo +)
  let digits = rawPhone.replace(/\D/g, '');

  // 2. Si tiene 8 dígitos (número local de Nicaragua), anteponer el código de país 505
  if (digits.length === 8) {
    digits = '505' + digits;
  }

  if (digits.length < 8) {
    alert('El número de teléfono del vendedor no es válido.');
    return;
  }

  const message = encodeURIComponent(`Hola ${buyerName || ''}, estoy interesado en tu producto "${productTitle}" publicado en MyMarket.`);

  // 3. Usar el formato universal que abre la app en Android y WhatsApp Web en PC de forma segura
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${digits}&text=${message}`;
  
  // Forzar apertura en nueva pestaña/app
  window.open(whatsappUrl, '_blank');
}

async function enviarPedidoAVendedores(event) {
  event.preventDefault();
  if (!currentUser) {
    alert('Debes iniciar sesión para confirmar el pedido.');
    mostrarModal('login-modal');
    return;
  }
  if (!cartItems.length) {
    alert('Tu carrito está vacío.');
    return;
  }

  const buyerName = document.getElementById('payment-name').value.trim();
  const buyerPhone = document.getElementById('payment-phone').value.trim();
  const buyerAddress = document.getElementById('payment-address').value.trim();
  const notifications = cartItems.map(item => ({
    seller_id: item.seller_id,
    buyer_id: currentUser.id,
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    buyer_address: buyerAddress,
    product_id: item.id,
    product_title: item.title,
    quantity: Number(item.qty || 1),
    total: Number(item.price || 0) * Number(item.qty || 1),
    whatsapp_url: crearEnlaceWhatsApp(buyerPhone, buyerName, item.title),
    notification_type: 'seller_order',
    status: 'unread'
  }));

  const buyerNotifications = cartItems.map(item => ({
    seller_id: item.seller_id,
    buyer_id: currentUser.id,
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    buyer_address: buyerAddress,
    product_id: item.id,
    product_title: item.title,
    quantity: Number(item.qty || 1),
    total: Number(item.price || 0) * Number(item.qty || 1),
    whatsapp_url: crearEnlaceWhatsApp(item.seller_phone || item.phone, buyerName, item.title),
    notification_type: 'buyer_confirmation',
    status: 'unread'
  }));

  const { error } = await supabaseClient.from('notifications').insert([...notifications, ...buyerNotifications]);
  if (error) {
    console.error('Error enviando pedido a vendedores:', error);
    for (const item of cartItems) await devolverUnidadAlStock(item.id, item.qty);
    await cargarProductos();
    if (error.code === 'PGRST205') {
      alert('Falta crear la tabla notifications en Supabase. Ejecuta el archivo notifications.sql incluido en el proyecto y vuelve a intentarlo.');
    } else {
      alert(`No se pudo enviar el pedido: ${error.message}`);
    }
    return;
  }

  cartItems = [];
  guardarCarritoDelUsuario();
  actualizarCarritoUI();
  document.getElementById('payment-form').reset();
  document.getElementById('cart-sidebar').classList.remove('active');
  cerrarModal('payment-modal');
  alert('Pedido enviado. Los vendedores recibieron tus datos y podrán contactarte por WhatsApp.');
}

async function cargarNotificacionesVendedor() {
  const list = document.getElementById('seller-notifications-list');
  if (!list || !currentUser) return;
  const { data, error } = await supabaseClient.from('notifications').select('*').eq('seller_id', currentUser.id).order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = '<p>No se pudieron cargar los pedidos recibidos.</p>';
    console.error(error);
    return;
  }
  list.innerHTML = data?.length ? data.map(notification => `
    <article class="seller-notification ${notification.status === 'unread' ? 'unread' : ''}">
      <strong>${escapeHtml(notification.product_title)}</strong>
      <span>${notification.quantity} unidad(es) • Total: ${Number(notification.total || 0).toFixed(2)}</span>
      <span>Comprador: ${escapeHtml(notification.buyer_name)}</span>
      <span>Teléfono: ${escapeHtml(notification.buyer_phone)}</span>
      <span>Dirección: ${escapeHtml(notification.buyer_address)}</span>
      ${notification.whatsapp_url ? `<a class="notification-whatsapp" href="${escapeHtml(notification.whatsapp_url)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Contactar por WhatsApp</a>` : ''}
    </article>`).join('') : '<p>No hay pedidos recibidos.</p>';
}

async function cargarBandejaNotificaciones() {
  if (!currentUser) return;
  const list = document.getElementById('notifications-list');
  const { data, error } = await supabaseClient.from('notifications').select('*').or(`seller_id.eq.${currentUser.id},buyer_id.eq.${currentUser.id}`).order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = '<p>No se pudieron cargar las notificaciones.</p>';
    return;
  }
  
  list.innerHTML = data?.length ? data.map(notification => {
    const isBuyer = notification.buyer_id === currentUser.id && notification.notification_type === 'buyer_confirmation';
    const whatsapp = notification.whatsapp_url ? `<a class="notification-whatsapp" href="${escapeHtml(notification.whatsapp_url)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : '';
    return `
      <article class="inbox-notification ${notification.status === 'unread' ? 'unread' : ''}" data-notification-id="${notification.id}">
        <div class="notification-info" style="flex: 1;">
          <strong>${isBuyer ? 'Pedido enviado' : 'Nuevo pedido recibido'}</strong>
          <span>${escapeHtml(notification.product_title)} • ${notification.quantity} unidad(es)</span>
          <span>Total: ${Number(notification.total || 0).toFixed(2)}</span>
          ${isBuyer ? whatsapp : `<span>Comprador: ${escapeHtml(notification.buyer_name)}</span><span>Teléfono: ${escapeHtml(notification.buyer_phone)}</span><span>Dirección: ${escapeHtml(notification.buyer_address)}</span>${whatsapp}`}
        </div>
        <button class="btn-delete-notification" type="button" title="Eliminar notificación" data-delete-notif="${notification.id}" style="background: none; border: none; cursor: pointer; color: #ef4444; padding: 5px; display: flex; align-items: center; gap: 4px; font-size: 0.85rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          <span>Eliminar</span>
        </button>
      </article>`;
  }).join('') : '<p>No tienes notificaciones.</p>';

  // Asignar eventos de clic a los botones de eliminar dentro de la bandeja
  list.querySelectorAll('[data-delete-notif]').forEach(button => {
    button.addEventListener('click', async (e) => {
      const notifId = Number(e.currentTarget.dataset.deleteNotif);
      const articleNode = e.currentTarget.closest('.inbox-notification');
      await eliminarNotificacion(notifId, articleNode);
    });
  });

  const unread = (data || []).filter(item => item.status === 'unread');
  if (unread.length) await supabaseClient.from('notifications').update({ status: 'read' }).in('id', unread.map(item => item.id));
  actualizarContadorNotificaciones(data || []);
}

async function actualizarContadorNotificaciones(notifications = null) {
  if (!currentUser) return;
  let rows = notifications;
  if (!rows) {
    const result = await supabaseClient.from('notifications').select('id,status').or(`seller_id.eq.${currentUser.id},buyer_id.eq.${currentUser.id}`);
    rows = result.data || [];
  }
  const count = rows.filter(item => item.status === 'unread').length;
  const badge = document.getElementById('notifications-count');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}

function quitarDelCarrito(id) {
  const item = cartItems.find(product => product.id === id);
  if (!item) return;
  devolverUnidadAlStock(id, item.qty);
  cartItems = cartItems.filter(product => product.id !== id);
  guardarCarritoDelUsuario();
  actualizarCarritoUI();
}

async function devolverUnidadAlStock(id, cantidad) {
  const producto = productsCache.find(item => item.id === id);
  if (!producto) return;
  const nuevoStock = Number(producto.stock) + Number(cantidad);
  await supabaseClient.from('products').update({ stock: nuevoStock }).eq('id', id);
  producto.stock = nuevoStock;
  renderizarProductos(productsCache);
}

async function eliminarProducto(productId) {
  if (!currentUser || !confirm('¿Estás seguro de que deseas eliminar este producto?')) return;
  const { error } = await supabaseClient.from('products').delete().eq('id', productId).eq('seller_id', currentUser.id);
  if (error) {
    alert('No se pudo eliminar el producto: ' + error.message);
    return;
  }
  alert('Producto eliminado correctamente.');
  await cargarProductos();
}

function abrirModalEdicion(productId) {
  const producto = productsCache.find(product => product.id === productId);
  if (!producto || producto.seller_id !== currentUser?.id) return;
  document.getElementById('sell-modal-title').innerText = 'Editar producto';
  document.getElementById('product-id-hidden').value = producto.id;
  document.getElementById('product-title').value = producto.title || '';
  document.getElementById('product-category').value = producto.category_id || '';
  document.getElementById('product-price').value = producto.price || 0;
  document.getElementById('product-currency').value = producto.currency || 'NIO';
  document.getElementById('product-stock').value = producto.stock || 1;
  document.getElementById('product-status').value = producto.status || 'active';
  document.getElementById('product-condition').value = producto.condition_type || 'Usado';
  document.getElementById('product-location').value = producto.location || '';
  document.getElementById('product-phone').value = producto.phone || producto.seller_phone || '';
  const preview = document.getElementById('product-image-preview');
  if (producto.image_url) { preview.src = producto.image_url; preview.classList.remove('hidden'); }
  mostrarModal('sell-modal');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

async function cargarCategorias() {
  const select = document.getElementById('product-category');
  const navigation = document.getElementById('category-nav-container');
  if (!select) return;

  const defaultCategories = [
    { id: 1, name: 'Electrónica' },
    { id: 2, name: 'Moda' },
    { id: 3, name: 'Hogar' },
    { id: 4, name: 'Deportes' },
    { id: 5, name: 'Juguetes' }
  ];

  let categories = defaultCategories;
  try {
    const { data } = await supabaseClient.from('categories').select('id, name').order('name');
    if (data?.length) categories = data;
  } catch (error) {
    console.warn('Usando categorías locales por defecto');
  }

  select.innerHTML = categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');

  if (navigation) {
    navigation.innerHTML = `<button class="cat-chip active" data-category="all">Todos</button>`;
    categories.forEach(cat => {
      navigation.insertAdjacentHTML('beforeend', `<button class="cat-chip" data-category="${cat.id}">${escapeHtml(cat.name)}</button>`);
    });
  }
}

// ==========================================
// EVENT LISTENERS DE INICIO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const sessionData = await supabaseClient.auth.getSession();
  currentUser = sessionData.data.session?.user || null;
  cartItems = currentUser
    ? JSON.parse(localStorage.getItem(`mymarket_cart_${currentUser.id}`) || '[]')
    : [];
  
  if (currentUser) {
    await ensureSellerProfile();
  }
  
  actualizarSesion();
  actualizarCarritoUI();
  await cargarCategorias();
  await cargarProductos();

  document.getElementById('login-btn')?.addEventListener('click', async () => {
    if (currentUser) {
      await supabaseClient.auth.signOut();
      currentUser = null;
      cartItems = [];
      actualizarSesion();
      actualizarCarritoUI();
      alert('Sesión cerrada.');
    } else {
      mostrarModal('login-modal');
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => cerrarModal(button.dataset.closeModal));
  });

  document.getElementById('login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    await iniciarSesion(
      document.getElementById('login-email').value, 
      document.getElementById('login-password').value
    );
    currentUser = (await supabaseClient.auth.getUser()).data.user;
    cartItems = JSON.parse(localStorage.getItem(`mymarket_cart_${currentUser.id}`) || '[]');
    actualizarSesion();
    actualizarCarritoUI();
    cerrarModal('login-modal');
  });

  document.getElementById('cart-btn')?.addEventListener('click', () => {
    if (!currentUser) {
      alert('Debes iniciar sesión para ver tu carrito.');
      mostrarModal('login-modal');
      return;
    }
    actualizarCarritoUI();
    document.getElementById('cart-sidebar')?.classList.add('active');
  });
  document.getElementById('close-cart')?.addEventListener('click', () => document.getElementById('cart-sidebar')?.classList.remove('active'));
  document.getElementById('checkout-btn')?.addEventListener('click', () => {
    if (!currentUser) {
      mostrarModal('login-modal');
      return;
    }
    if (!cartItems.length) {
      alert('Tu carrito está vacío.');
      return;
    }
    mostrarModal('payment-modal');
  });
  document.getElementById('payment-form')?.addEventListener('submit', enviarPedidoAVendedores);
  document.getElementById('notifications-btn')?.addEventListener('click', async () => {
    await cargarBandejaNotificaciones();
    mostrarModal('notifications-modal');
  });
  await actualizarContadorNotificaciones();

  document.getElementById('register-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    await registrarUsuario(
      document.getElementById('register-email').value, 
      document.getElementById('register-password').value, 
      'Usuario'
    );
  });

  document.getElementById('sell-btn')?.addEventListener('click', () => {
    if (currentUser) {
      document.getElementById('sell-form').reset();
      document.getElementById('product-id-hidden').value = '';
      document.getElementById('sell-modal-title').innerText = 'Publicar producto';
      document.getElementById('product-image-preview')?.classList.add('hidden');
      mostrarModal('sell-modal');
    }
    else {
      alert('Debes iniciar sesión para vender.');
      mostrarModal('login-modal');
    }
  });

  document.getElementById('show-register-btn')?.addEventListener('click', () => {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  });

  document.getElementById('show-login-btn')?.addEventListener('click', () => {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });

  document.getElementById('sell-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const productId = document.getElementById('product-id-hidden').value;
    publicarProducto({
      title: document.getElementById('product-title').value.trim(),
      category_id: Number(document.getElementById('product-category').value),
      price: Number(document.getElementById('product-price').value),
      currency: document.getElementById('product-currency').value,
      stock: Number(document.getElementById('product-stock').value),
      status: document.getElementById('product-status').value,
      condition_type: document.getElementById('product-condition').value,
      location: document.getElementById('product-location').value.trim(),
      phone: document.getElementById('product-phone').value.trim(),
      seller_phone: document.getElementById('product-phone').value.trim()
    }, document.getElementById('product-image').files[0], productId ? Number(productId) : null);
  });
});

// ==========================================
// RENDERIZAR PRODUCTOS (Con botón "Ver producto" y gestión de dueño)
// ==========================================
function renderizarProductos(productos = []) {
  const contenedor = document.getElementById('products-container');
  if (!contenedor) return;

  contenedor.innerHTML = productos.length ? productos.map(producto => {
    const esPropietario = currentUser && producto.seller_id === currentUser.id;
    return `
      <article class="product-card">
        <div class="product-image-wrapper">
          <img src="${escapeHtml(producto.image_url || 'https://via.placeholder.com/200')}" alt="${escapeHtml(producto.title)}">
        </div>
        <h3 class="product-title">${escapeHtml(producto.title || 'Producto')}</h3>
        <div class="product-price">${escapeHtml(producto.currency || 'NIO')} ${Number(producto.price || 0).toFixed(2)}</div>
        <div class="product-stock">${Number(producto.stock || 0)} disponibles</div>
        
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
          <button class="secondary-btn" style="width: 100%; background: #f1f5f9; border-color: #cbd5e1;" data-view-product="${producto.id}">Ver producto</button>
          <button class="btn-primary" data-add-product="${producto.id}" ${Number(producto.stock) > 0 ? '' : 'disabled'}>Agregar al carrito</button>
        </div>
        
        ${esPropietario ? `
          <div class="owner-actions" style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="secondary-btn" style="flex: 1; padding: 6px; font-size: 0.8rem;" data-edit-product="${producto.id}">Editar</button>
            <button class="secondary-btn" style="flex: 1; padding: 6px; font-size: 0.8rem; color: #ef4444; border-color: #ef4444;" data-delete-product="${producto.id}">Eliminar</button>
          </div>
        ` : ''}
      </article>`;
  }).join('') : '<p>No hay productos disponibles.</p>';

  // Event Listeners
  contenedor.querySelectorAll('[data-view-product]').forEach(button => {
    button.addEventListener('click', () => abrirModalVistaPrevia(Number(button.dataset.viewProduct)));
  });

  contenedor.querySelectorAll('[data-add-product]').forEach(button => {
    button.addEventListener('click', () => agregarAlCarrito(Number(button.dataset.addProduct)));
  });

  contenedor.querySelectorAll('[data-edit-product]').forEach(button => {
    button.addEventListener('click', () => abrirModalEdicion(Number(button.dataset.editProduct)));
  });

  contenedor.querySelectorAll('[data-delete-product]').forEach(button => {
    button.addEventListener('click', () => eliminarProducto(Number(button.dataset.deleteProduct)));
  });
}

// ==========================================
// ABRIR MODAL DE DETALLES Y WHATSAPP
// ==========================================
function abrirModalVistaPrevia(productId) {
  const producto = productsCache.find(p => p.id === productId);
  if (!producto) return;

  const contenidoModal = document.getElementById('product-preview-content');
  if (!contenidoModal) return;

  const telefonoLimpio = (producto.seller_phone || producto.phone || '').replace(/\D/g, '');
  const mensajeWhats = encodeURIComponent(`Hola, estoy interesado en tu producto "${producto.title}" publicado en MyMarket.`);
  const enlaceWhatsApp = telefonoLimpio ? `https://wa.me/${telefonoLimpio}?text=${mensajeWhats}` : '#';

  contenidoModal.innerHTML = `
    <div style="text-align: center; margin-bottom: 15px;">
      <img src="${escapeHtml(producto.image_url || 'https://via.placeholder.com/300')}" alt="${escapeHtml(producto.title)}" style="max-height: 250px; max-width: 100%; object-fit: contain; border-radius: 8px;">
    </div>
    <h2 style="font-size: 1.25rem; margin-bottom: 10px; color: #0f172a;">${escapeHtml(producto.title)}</h2>
    <div style="font-size: 1.5rem; font-weight: bold; color: #d97706; margin-bottom: 12px;">
      ${escapeHtml(producto.currency || 'NIO')} ${Number(producto.price || 0).toFixed(2)}
    </div>
    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem; color: #334155;">
      <p style="margin-bottom: 6px;"><strong>Condición:</strong> ${escapeHtml(producto.condition_type || 'No especificada')}</p>
      <p style="margin-bottom: 6px;"><strong>Ubicación:</strong> ${escapeHtml(producto.location || 'No especificada')}</p>
      <p style="margin-bottom: 6px;"><strong>Stock disponible:</strong> ${Number(producto.stock || 0)} unidades</p>
      <p style="margin-top: 8px;"><strong>Descripción:</strong><br>${escapeHtml(producto.description || 'Sin descripción detallada.')}</p>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${telefonoLimpio ? `
        <a href="${enlaceWhatsApp}" target="_blank" class="pay-btn" style="background-color: #22c55e; color: white; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold; padding: 12px; border-radius: 8px;">
          <i class="fa-brands fa-whatsapp" style="font-size: 1.2rem;"></i> Contactar al vendedor por WhatsApp
        </a>
      ` : `
        <p style="color: #ef4444; font-size: 0.85rem; text-align: center;">Este vendedor no registró un número de teléfono válido.</p>
      `}
      <button class="secondary-btn" type="button" onclick="cerrarModal('product-preview-modal')" style="width: 100%;">Cerrar</button>
    </div>
  `;

  mostrarModal('product-preview-modal');
}

// ==========================================
// FILTRADO POR CATEGORÍAS
// ==========================================
document.addEventListener('click', event => {
  const chip = event.target.closest('.cat-chip');
  if (!chip) return;

  document.querySelectorAll('.cat-chip').forEach(btn => btn.classList.remove('active'));
  chip.classList.add('active');

  const categoriaId = chip.dataset.category;

  if (categoriaId === 'all') {
    renderizarProductos(productsCache);
  } else {
    const productosFiltrados = productsCache.filter(p => Number(p.category_id) === Number(categoriaId));
    renderizarProductos(productosFiltrados);
  }
});

// ==========================================
// GESTIÓN DEL MODAL DE PERFIL DE USUARIO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const profileBtn = document.getElementById('profile-btn');
  const profileForm = document.getElementById('profile-form');

  if (profileBtn) {
    profileBtn.addEventListener('click', async () => {
      if (!currentUser) {
        alert('Debes iniciar sesión.');
        mostrarModal('login-modal');
        return;
      }

      try {
        const { data: userData, error } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (userData) {
          document.getElementById('profile-name').value = userData.full_name || '';
          document.getElementById('profile-phone').value = userData.phone || '';
        } else {
          document.getElementById('profile-name').value = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '';
          document.getElementById('profile-phone').value = '';
        }
      } catch (err) {
        console.error("Error al cargar perfil:", err);
      }

      mostrarModal('profile-modal');
      await cargarNotificacionesVendedor();
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) return;

      const nuevoNombre = document.getElementById('profile-name').value.trim();
      const nuevoTelefono = document.getElementById('profile-phone').value.trim();
      const avatarFile = document.getElementById('profile-avatar-file').files[0];

      try {
        let avatarUrl = null;

        if (avatarFile) {
          const fileExt = avatarFile.name.split('.').pop();
          const fileName = `avatars/${currentUser.id}-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabaseClient.storage
            .from('product-images')
            .upload(fileName, avatarFile);

          if (!uploadError) {
            const { data: urlData } = supabaseClient.storage
              .from('product-images')
              .getPublicUrl(fileName);
            avatarUrl = urlData.publicUrl;
          }
        }

        const updatePayload = {
          full_name: nuevoNombre,
          phone: nuevoTelefono
        };

        const { error: updateError } = await supabaseClient
          .from('users')
          .update(updatePayload)
          .eq('id', currentUser.id);

        if (updateError) throw updateError;

        alert('¡Perfil actualizado con éxito!');
        cerrarModal('profile-modal');
      } catch (err) {
        console.error("Error al actualizar perfil:", err.message);
        alert("No se pudo actualizar el perfil: " + err.message);
      }
    });
  }
});

// ==========================================
// VISTA PREVIA DE LA FOTO DE PERFIL LOCAL
// ==========================================
const avatarFileInput = document.getElementById('profile-avatar-file');
if (avatarFileInput) {
  avatarFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const previewImg = document.getElementById('profile-avatar-preview');
      if (previewImg) {
        previewImg.src = URL.createObjectURL(file);
      }
    }
  });
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  actualizarSesion();
  actualizarContadorNotificaciones();
  if (typeof productsCache !== 'undefined') renderizarProductos(productsCache);
});

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        alert("Has cerrado sesión correctamente.");
      } catch (err) {
        console.error("Error al cerrar sesión:", err.message);
        alert("No se pudo cerrar sesión: " + err.message);
      }
    });
  }
});

// ==========================================
// UTILIDAD DE FORMATEO DE PRECIOS
// ==========================================
function formatearPrecioInput(inputElement) {
  inputElement.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^\d]/g, '');
    if (!value) {
      e.target.value = '';
      return;
    }
    let num = Number(value) / 100;
    e.target.value = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function limpiarPrecioANumero(valorStr) {
  if (!valorStr) return 0;
  const limpio = String(valorStr).replace(/,/g, '');
  return parseFloat(limpio) || 0;
}

document.addEventListener('DOMContentLoaded', () => {
  const priceInput = document.getElementById('product-price');
  if (priceInput) {
    formatearPrecioInput(priceInput);
  }
});

document.getElementById('sell-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const productId = document.getElementById('product-id-hidden').value;
  
  const rawPhone = document.getElementById('profile-phone').value.trim();
// Si el usuario no puso el +, puedes concatenarle el código de país correspondiente (ej: +505)
const cleanPhone = rawPhone.startsWith('+') ? rawPhone : `+505${rawPhone}`;

  const rawPriceValue = document.getElementById('product-price').value;
  const numericPrice = limpiarPrecioANumero(rawPriceValue);

  publicarProducto({
    title: document.getElementById('product-title').value.trim(),
    category_id: Number(document.getElementById('product-category').value),
    price: numericPrice,
    currency: document.getElementById('product-currency').value,
    stock: Number(document.getElementById('product-stock').value),
    status: document.getElementById('product-status').value,
    condition_type: document.getElementById('product-condition').value,
    location: document.getElementById('product-location').value.trim(),
    phone: cleanPhone,
    seller_phone: cleanPhone
  }, document.getElementById('product-image').files[0], productId ? Number(productId) : null);
});

function abrirModalEdicion(productId) {
  const producto = productsCache.find(product => product.id === productId);
  if (!producto || producto.seller_id !== currentUser?.id) return;
  
  document.getElementById('sell-modal-title').innerText = 'Editar producto';
  document.getElementById('product-id-hidden').value = producto.id;
  document.getElementById('product-title').value = producto.title || '';
  document.getElementById('product-category').value = producto.category_id || '';
  
  if (producto.price) {
    document.getElementById('product-price').value = Number(producto.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else {
    document.getElementById('product-price').value = '0.00';
  }

  document.getElementById('product-currency').value = producto.currency || 'NIO';
  document.getElementById('product-stock').value = producto.stock || 1;
  document.getElementById('product-status').value = producto.status || 'active';
  document.getElementById('product-condition').value = producto.condition_type || 'Usado';
  document.getElementById('product-location').value = producto.location || '';
  
  const fullPhone = producto.phone || producto.seller_phone || '';
  if (fullPhone.startsWith('+')) {
    const spaceIndex = fullPhone.indexOf(' ');
    if (spaceIndex > -1) {
      const code = fullPhone.substring(0, spaceIndex);
      const numberPart = fullPhone.substring(spaceIndex + 1);
      document.getElementById('country-code-select').value = code;
      document.getElementById('product-phone').value = numberPart;
    } else {
      document.getElementById('product-phone').value = fullPhone;
    }
  } else {
    document.getElementById('product-phone').value = fullPhone;
  }

  const preview = document.getElementById('product-image-preview');
  if (producto.image_url) { 
    preview.src = producto.image_url; 
    preview.classList.remove('hidden'); 
  } else {
    preview.classList.add('hidden');
  }
  mostrarModal('sell-modal');
}

// ==========================================
// ELIMINACIÓN DE NOTIFICACIONES (Corregido con validación RLS de Supabase)
// ==========================================
async function eliminarNotificacion(notificationId, elementNode) {
    try {
        if (!currentUser) return;

        // Se agrega la condición .or() para cumplir con las políticas RLS y permitir el borrado en Supabase
        const { error } = await supabaseClient
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .or(`seller_id.eq.${currentUser.id},buyer_id.eq.${currentUser.id}`);

        if (error) throw error;

        if (elementNode) {
            elementNode.style.transition = 'all 0.3s ease';
            elementNode.style.opacity = '0';
            elementNode.style.transform = 'translateX(20px)';
            setTimeout(() => {
                elementNode.remove();
                
                // Si la lista queda vacía, mostrar el mensaje por defecto
                const listContainer = document.getElementById('notifications-list');
                if (listContainer && listContainer.children.length === 0) {
                    listContainer.innerHTML = '<p>No tienes notificaciones.</p>';
                }
            }, 300);
        }
        
        // Actualizar de inmediato el contador de notificaciones de la barra superior
        await actualizarContadorNotificaciones();
    } catch (error) {
        console.error('Error al eliminar la notificación:', error.message);
        alert('No se pudo eliminar la notificación.');
    }
}
