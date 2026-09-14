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
}

function renderizarProductos(productos = []) {
  const contenedor = document.getElementById('products-container');
  if (!contenedor) return;

  const visibles = productos.filter(producto => producto.status === 'active' || producto.seller_id === currentUser?.id);
  contenedor.innerHTML = visibles.length ? visibles.map(producto => {
    const esPropietario = currentUser && producto.seller_id === currentUser.id;
    const disponible = producto.status === 'active' && Number(producto.stock) > 0;
    return `
      <article class="product-card">
        <div class="product-image-wrapper">
          <img src="${escapeHtml(producto.image_url || 'https://via.placeholder.com/200')}" alt="${escapeHtml(producto.title)}">
        </div>
        <h3 class="product-title">${escapeHtml(producto.title || 'Producto')}</h3>
        <div class="product-price">${escapeHtml(producto.currency || 'NIO')} ${Number(producto.price || 0).toFixed(2)}</div>
        <div class="product-stock">${Number(producto.stock || 0)} disponibles${producto.status !== 'active' ? ' • No disponible' : ''}</div>
        <button class="btn-primary" data-add-product="${producto.id}" ${disponible ? '' : 'disabled'}>Agregar al carrito</button>
        ${esPropietario ? `
          <div class="owner-actions" style="display:flex; gap:8px; margin-top:10px;">
            <button class="secondary-btn" style="flex:1; padding:6px; font-size:.8rem;" data-edit-product="${producto.id}">Editar</button>
            <button class="secondary-btn" style="flex:1; padding:6px; font-size:.8rem; color:#ef4444; border-color:#ef4444;" data-delete-product="${producto.id}">Eliminar</button>
          </div>` : ''}
      </article>`;
  }).join('') : '<p>No hay productos disponibles.</p>';

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
  const producto = productsCache.find(item => item.id === id);
  if (!producto || Number(producto.stock) < 1) return;
  
  const existente = cartItems.find(item => item.id === id);
  if (existente) existente.qty += 1;
  else cartItems.push({ ...producto, qty: 1 });
  
  localStorage.setItem('mymarket_cart', JSON.stringify(cartItems));
  alert('Producto agregado al carrito.');
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
  
  if (currentUser) {
    await ensureSellerProfile();
  }
  
  actualizarSesion();
  await cargarCategorias();
  await cargarProductos();

  document.getElementById('login-btn')?.addEventListener('click', async () => {
    if (currentUser) {
      await supabaseClient.auth.signOut();
      currentUser = null;
      actualizarSesion();
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
    actualizarSesion();
    cerrarModal('login-modal');
  });

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