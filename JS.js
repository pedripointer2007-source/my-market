// ==========================================
// CONFIGURACIÓN DE SUPABASE Y AUTENTICACIÓN
// ==========================================

// Asegúrate de inicializar tu cliente de Supabase con tus credenciales
const supabaseUrl = 'https://daizqjgoxizapeoatmou.supabase.co';
const supabaseKey = 'sb_publishable_Qs2v39dvDNqNn4hKqb2l7g_GEJOyNhN';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Variable global para almacenar el usuario actual
let currentUser = null;

// ==========================================
// FUNCIÓN DE REGISTRO COMPLETA
// ==========================================
async function registrarUsuario(email, password, fullName) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      console.error("Error en el registro:", error.message);
      alert(error.message);
      return { success: false, error: error.message };
    }

    alert("¡Registro exitoso! Por favor verifica tu cuenta o inicia sesión.");
    return { success: false, data: data }; // O success: true según tu flujo de confirmación por correo
  } catch (err) {
    console.error("Error inesperado en el registro:", err);
    return { success: false, error: err };
  }
}

// ==========================================
// FUNCIÓN DE INICIO DE SESIÓN
// ==========================================
async function iniciarSesion(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      console.error("Error al iniciar sesión:", error.message);
      alert("Credenciales incorrectas o usuario no registrado.");
      return;
    }

    currentUser = data.user;
    console.log("Sesión iniciada correctamente:", currentUser);
    
    // Aquí puedes llamar a funciones posteriores, por ejemplo, asegurar el perfil o cargar la interfaz
    await ensureSellerProfile();
    
  } catch (err) {
    console.error("Error inesperado al iniciar sesión:", err);
  }
}

// ==========================================
// GESTIÓN DE PERFIL Y PRODUCTOS (`JS_3.js`)
// ==========================================
async function ensureSellerProfile() {
  if (!currentUser) return;

  // Verificar si el perfil ya existe en la tabla pública 'users'
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // Si por alguna razón el trigger falló o no existe, se puede hacer un upsert de respaldo
    const { error: insertError } = await supabase
      .from('users')
      .upsert({
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || 'Usuario'
      });

    if (insertError) {
      console.error("Error al asegurar el perfil del vendedor:", insertError.message);
    }
  }
}

async function publicarProducto(productData, imageFile) {
  // 1. Validar sesión activa
  if (!currentUser) {
    alert("Debes iniciar sesión para publicar un producto.");
    return;
  }

  // 2. Validar imagen obligatoria si no es edición
  if (!imageFile) {
    alert("La imagen del producto es obligatoria.");
    return;
  }

  // 3. Validar tamaño y formato de imagen (Ej: Máx 5MB)
  if (imageFile.size > 5 * 1024 * 1024) {
    alert("La imagen supera el límite de 5 MB.");
    return;
  }

  if (!imageFile.type.startsWith('image/')) {
    alert("El archivo seleccionado no es un formato de imagen válido.");
    return;
  }

  try {
    // Asegurar que el perfil exista antes de insertar
    await ensureSellerProfile();

    // Lógica para subir la imagen a Supabase Storage (ejemplo simplificado)
    const fileExt = imageFile.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, imageFile);

    if (uploadError) {
      throw new Error("Error al subir la imagen: " + uploadError.message);
    }

    // Obtener URL pública de la imagen
    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    // Insertar el producto en la base de datos vinculando el seller_id con el usuario actual
    const { data, error: insertError } = await supabase
      .from('products')
      .insert([
        {
          seller_id: currentUser.id,
          category_id: productData.category_id,
          title: productData.title,
          description: productData.description,
          price: productData.price,
          currency: productData.currency,
          stock: productData.stock,
          condition_type: productData.condition_type,
          location: productData.location,
          status: 'active',
          image_url: publicUrlData.publicUrl,
          phone: productData.phone,
          seller_phone: productData.seller_phone
        }
      ]);

    if (insertError) {
      throw new Error("Error al guardar el producto: " + insertError.message);
    }

    alert("¡Producto publicado con éxito!");

  } catch (err) {
    console.error("Fallo en la publicación:", err.message);
    alert(err.message);
  }
}

function mostrarModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function cerrarModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function actualizarSesion() {
  const loginBtn = document.getElementById('login-btn');
  const profileBtn = document.getElementById('profile-btn');
  if (!loginBtn || !profileBtn) return;
  loginBtn.innerHTML = currentUser ? '<i class="fa-solid fa-right-from-bracket"></i> <span>Cerrar sesión</span>' : '<i class="fa-solid fa-user"></i> <span>Iniciar sesión</span>';
  profileBtn.classList.toggle('hidden', !currentUser);
}

function renderizarProductos(productos = []) {
  const contenedor = document.getElementById('products-container');
  if (!contenedor) return;
  contenedor.innerHTML = productos.length ? productos.map(producto => `
    <article class="product-card">
      <div class="product-image-wrapper"><img src="${escapeHtml(producto.image_url || 'https://via.placeholder.com/200')}" alt="${escapeHtml(producto.title)}"></div>
      <h3 class="product-title">${escapeHtml(producto.title || 'Producto')}</h3>
      <div class="product-price">${escapeHtml(producto.currency || 'NIO')} ${Number(producto.price || 0).toFixed(2)}</div>
      <div class="product-stock">${Number(producto.stock || 0)} disponibles</div>
      <button class="btn-primary" data-add-product="${producto.id}" ${Number(producto.stock) > 0 ? '' : 'disabled'}>Agregar al carrito</button>
    </article>`).join('') : '<p>No hay productos disponibles.</p>';
  contenedor.querySelectorAll('[data-add-product]').forEach(button => button.addEventListener('click', () => agregarAlCarrito(Number(button.dataset.addProduct))));
}

async function cargarProductos() {
  const { data, error } = await supabase.from('products').select('*').eq('status', 'active').order('created_at', { ascending: false });
  if (error) { console.error(error); alert(`No se pudieron cargar los productos: ${error.message}`); return; }
  productsCache = data || [];
  renderizarProductos(productsCache);
}

function agregarAlCarrito(id) {
  if (!currentUser) { alert('Debes iniciar sesión para comprar.'); mostrarModal('login-modal'); return; }
  const producto = productsCache.find(item => item.id === id);
  if (!producto || Number(producto.stock) < 1) return;
  const existente = cartItems.find(item => item.id === id);
  if (existente) existente.qty += 1;
  else cartItems.push({ ...producto, qty: 1 });
  localStorage.setItem('mymarket_cart', JSON.stringify(cartItems));
}

let productsCache = [];
let cartItems = JSON.parse(localStorage.getItem('mymarket_cart') || '[]');

document.addEventListener('DOMContentLoaded', async () => {
  const session = await supabase.auth.getSession();
  currentUser = session.data.session?.user || null;
  actualizarSesion();
  document.getElementById('login-btn')?.addEventListener('click', () => currentUser ? supabase.auth.signOut().then(() => { currentUser = null; actualizarSesion(); }) : mostrarModal('login-modal'));
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => cerrarModal(button.dataset.closeModal)));
  document.getElementById('login-form')?.addEventListener('submit', async event => { event.preventDefault(); await iniciarSesion(document.getElementById('login-email').value, document.getElementById('login-password').value); currentUser = (await supabase.auth.getUser()).data.user; actualizarSesion(); cerrarModal('login-modal'); });
  document.getElementById('register-form')?.addEventListener('submit', async event => { event.preventDefault(); await registrarUsuario(document.getElementById('register-email').value, document.getElementById('register-password').value, 'Usuario'); });
  document.getElementById('cart-btn')?.addEventListener('click', () => { if (!currentUser) { mostrarModal('login-modal'); return; } document.getElementById('cart-sidebar').classList.add('active'); });
  document.getElementById('close-cart')?.addEventListener('click', () => document.getElementById('cart-sidebar').classList.remove('active'));
  document.getElementById('sell-btn')?.addEventListener('click', () => currentUser ? mostrarModal('sell-modal') : mostrarModal('login-modal'));
  document.getElementById('search-btn')?.addEventListener('click', filtrarProductos);
  document.getElementById('search-input')?.addEventListener('input', filtrarProductos);
  document.getElementById('checkout-btn')?.addEventListener('click', () => currentUser ? mostrarModal('payment-modal') : mostrarModal('login-modal'));
  document.getElementById('profile-btn')?.addEventListener('click', () => mostrarModal('profile-modal'));
  document.getElementById('show-register-btn')?.addEventListener('click', () => { document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.remove('hidden'); });
  document.getElementById('show-login-btn')?.addEventListener('click', () => { document.getElementById('register-form').classList.add('hidden'); document.getElementById('login-form').classList.remove('hidden'); });
  document.getElementById('sell-form')?.addEventListener('submit', event => {
    event.preventDefault();
    publicarProducto({
      title: document.getElementById('product-title').value.trim(),
      category_id: Number(document.getElementById('product-category').value),
      price: Number(document.getElementById('product-price').value),
      currency: document.getElementById('product-currency').value,
      stock: Number(document.getElementById('product-stock').value),
      condition_type: document.getElementById('product-condition').value,
      location: document.getElementById('product-location').value.trim(),
      phone: document.getElementById('product-phone').value.trim(),
      seller_phone: document.getElementById('product-phone').value.trim()
    }, document.getElementById('product-image').files[0]);
  });
  document.getElementById('payment-form')?.addEventListener('submit', event => { event.preventDefault(); alert('Pedido recibido correctamente.'); closeModal('payment-modal'); });
  await cargarProductos();
});

function filtrarProductos() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  renderizarProductos(productsCache.filter(producto => String(producto.title || '').toLowerCase().includes(query)));
}