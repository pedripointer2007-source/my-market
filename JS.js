// ==========================================
// CONFIGURACIÓN DE SUPABASE Y AUTENTICACIÓN
// ==========================================

// Asegúrate de inicializar tu cliente de Supabase con tus credenciales
// const supabaseUrl = 'TU_SUPABASE_URL';
// const supabaseKey = 'TU_SUPABASE_ANON_KEY';
// const supabase = supabase.createClient(supabaseUrl, supabaseKey);

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