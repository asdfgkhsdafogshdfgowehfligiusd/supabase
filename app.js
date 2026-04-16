// ========================================
// CONFIGURACION DE SUPABASE
// ========================================

const SUPABASE_URL = 'https://qndvlqbtmkkugvuvgrug.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuZHZscWJ0bWtrdWd2dXZncnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDQ4NjcsImV4cCI6MjA5MTg4MDg2N30.3xFk0JcsCV205f0Zit_18kp7DSX6S5BSeBWTQxgzqv8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// ESTADO DE LA APLICACION
// ========================================

let files = [];
let currentUser = null;
let currentFileId = null;

// ========================================
// INICIALIZACION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    initDragAndDrop();
    await checkAuth();
    await loadFiles();
    updateAuthUI();
});

// ========================================
// CARGAR ARCHIVOS DESDE SUPABASE
// ========================================

async function loadFiles() {
    try {
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .order('upload_date', { ascending: false });

        if (error) throw error;

        files = data || [];
        renderFiles();

        if (files.length > 0) {
            showMyFiles();
        }
    } catch (error) {
        console.error('Error cargando archivos:', error);
    }
}

// ========================================
// DRAG AND DROP
// ========================================

function initDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        }, false);
    });
    
    uploadArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const droppedFiles = dt.files;
    handleFiles(droppedFiles);
}

// ========================================
// MANEJO DE ARCHIVOS
// ========================================

function handleFileSelect(event) {
    const selectedFiles = event.target.files;
    handleFiles(selectedFiles);
}

async function handleFiles(fileList) {
    if (fileList.length === 0) return;
    
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const uploadedFilesEl = document.getElementById('uploadedFiles');
    
    uploadProgress.style.display = 'block';
    
    let processed = 0;
    const total = fileList.length;
    
    for (const file of fileList) {
        try {
            const fileId = generateId();
            const storagePath = `${fileId}_${file.name}`;
            
            // Subir archivo a Supabase Storage
            const { error: storageError } = await supabase
                .storage
                .from('uploads')
                .upload(storagePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });
            
            if (storageError) throw storageError;
            
            // Guardar metadata en la base de datos
            const { data: fileData, error: dbError } = await supabase
                .from('files')
                .insert([{
                    id: fileId,
                    name: file.name,
                    size: file.size,
                    type: file.type || 'application/octet-stream',
                    storage_path: storagePath,
                    user_id: currentUser?.id || null
                }])
                .select()
                .single();
            
            if (dbError) throw dbError;
            
            files.unshift(fileData);
            
            processed++;
            const percent = Math.round((processed / total) * 100);
            progressFill.style.width = percent + '%';
            progressPercent.textContent = percent + '%';
            uploadedFilesEl.textContent = `${processed} de ${total} archivos`;
            
        } catch (error) {
            console.error('Error subiendo archivo:', error);
            showToast('Error subiendo ' + file.name);
            processed++;
        }
    }
    
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        progressFill.style.width = '0%';
        showMyFiles();
        renderFiles();
        showToast('Archivos subidos correctamente');
    }, 500);
    
    document.getElementById('fileInput').value = '';
}

function generateId() {
    return 'bf_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// ========================================
// RENDERIZADO DE ARCHIVOS
// ========================================

function renderFiles() {
    const filesGrid = document.getElementById('filesGrid');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filteredFiles = files.filter(file => 
        file.name.toLowerCase().includes(searchTerm)
    );
    
    if (filteredFiles.length === 0) {
        filesGrid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    filesGrid.innerHTML = filteredFiles.map(file => `
        <div class="file-card" data-id="${file.id}">
            <div class="file-card-header">
                <div class="file-icon ${getFileTypeClass(file.type)}">
                    ${getFileIcon(file.type)}
                </div>
                <div class="file-info">
                    <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                    <div class="file-meta">${formatFileSize(file.size)} - ${formatDate(file.upload_date)}</div>
                </div>
            </div>
            <div class="file-card-actions">
                <button class="btn btn-primary btn-sm" onclick="openDownloadModal('${file.id}')">
                    Descargar
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openShareModal('${file.id}')">
                    Compartir
                </button>
                <button class="btn btn-ghost btn-sm" onclick="deleteFile('${file.id}')" title="Eliminar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="M19 6V20C19 21.1 18.1 22 17 22H7C5.9 22 5 21.1 5 20V6M8 6V4C8 2.9 8.9 2 10 2H14C15.1 2 16 2.9 16 4V6"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function filterFiles() {
    renderFiles();
}

function getFileTypeClass(mimeType) {
    if (!mimeType) return '';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return '';
}

function getFileIcon(mimeType) {
    if (!mimeType) return getDefaultIcon();
    
    if (mimeType.startsWith('image/')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
        </svg>`;
    }
    
    if (mimeType.startsWith('video/')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23,7 16,12 23,17 23,7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>`;
    }
    
    if (mimeType.startsWith('audio/')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
        </svg>`;
    }
    
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19C22 20.1 21.1 21 20 21H4C2.9 21 2 20.1 2 19V5C2 3.9 2.9 3 4 3H9L11 6H20C21.1 6 22 6.9 22 8V19Z"/>
        </svg>`;
    }
    
    return getDefaultIcon();
}

function getDefaultIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z"/>
        <polyline points="14,2 14,8 20,8"/>
    </svg>`;
}

// ========================================
// UTILIDADES
// ========================================

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} dias`;
    
    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// NAVEGACION
// ========================================

function showMyFiles() {
    document.getElementById('heroSection').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('featuresSection').style.display = 'none';
    document.getElementById('filesSection').style.display = 'block';
    
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('.nav-link')[1]?.classList.add('active');
    
    renderFiles();
    closeMobileMenu();
}

function showHome() {
    document.getElementById('heroSection').style.display = 'flex';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('featuresSection').style.display = 'block';
    document.getElementById('filesSection').style.display = 'none';
    
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('.nav-link')[0]?.classList.add('active');
    
    closeMobileMenu();
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('active');
}

function closeMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.remove('active');
}

// ========================================
// MODAL DE DESCARGA
// ========================================

function openDownloadModal(fileId) {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    
    currentFileId = fileId;
    
    document.getElementById('modalFileName').textContent = file.name;
    document.getElementById('modalFileSize').textContent = formatFileSize(file.size);
    document.getElementById('modalDownloads').textContent = file.downloads || 0;
    document.getElementById('modalDate').textContent = formatDate(file.upload_date);
    
    document.getElementById('downloadModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDownloadModal() {
    document.getElementById('downloadModal').classList.remove('active');
    document.body.style.overflow = '';
    currentFileId = null;
}

async function downloadFile() {
    if (!currentFileId) return;
    
    const file = files.find(f => f.id === currentFileId);
    if (!file) return;
    
    try {
        // Incrementar contador de descargas
        await supabase
            .from('files')
            .update({ downloads: (file.downloads || 0) + 1 })
            .eq('id', file.id);
        
        file.downloads = (file.downloads || 0) + 1;
        document.getElementById('modalDownloads').textContent = file.downloads;
        
        // Obtener URL publica del archivo
        const { data } = supabase
            .storage
            .from('uploads')
            .getPublicUrl(file.storage_path);
        
        if (data?.publicUrl) {
            window.open(data.publicUrl, '_blank');
        }
        
        showToast('Descarga iniciada');
        closeDownloadModal();
        
    } catch (error) {
        console.error('Error descargando:', error);
        showToast('Error al descargar');
    }
}

function copyDownloadLink() {
    if (!currentFileId) return;
    
    const file = files.find(f => f.id === currentFileId);
    if (!file) return;
    
    const { data } = supabase
        .storage
        .from('uploads')
        .getPublicUrl(file.storage_path);
    
    if (data?.publicUrl) {
        navigator.clipboard.writeText(data.publicUrl).then(() => {
            showToast('Enlace copiado');
        });
    }
}

// ========================================
// MODAL DE COMPARTIR
// ========================================

function openShareModal(fileId) {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    
    currentFileId = fileId;
    
    document.getElementById('shareFileName').textContent = file.name;
    
    const { data } = supabase
        .storage
        .from('uploads')
        .getPublicUrl(file.storage_path);
    
    document.getElementById('shareLink').value = data?.publicUrl || '';
    
    document.getElementById('shareModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
    document.body.style.overflow = '';
    currentFileId = null;
}

function copyShareLink() {
    const input = document.getElementById('shareLink');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Enlace copiado');
    });
}

function shareTwitter() {
    const url = document.getElementById('shareLink').value;
    const file = files.find(f => f.id === currentFileId);
    const text = file ? `Descarga ${file.name} desde BLAZEFILE` : 'Descarga desde BLAZEFILE';
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
}

function shareFacebook() {
    const url = document.getElementById('shareLink').value;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
}

function shareWhatsApp() {
    const url = document.getElementById('shareLink').value;
    const file = files.find(f => f.id === currentFileId);
    const text = file ? `Descarga ${file.name} desde BLAZEFILE: ${url}` : `Descarga desde BLAZEFILE: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareTelegram() {
    const url = document.getElementById('shareLink').value;
    const file = files.find(f => f.id === currentFileId);
    const text = file ? `Descarga ${file.name} desde BLAZEFILE` : 'Descarga desde BLAZEFILE';
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

// ========================================
// ELIMINAR ARCHIVO
// ========================================

async function deleteFile(fileId) {
    if (!confirm('Estas seguro de que quieres eliminar este archivo?')) return;
    
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    
    try {
        // Eliminar de Storage
        await supabase
            .storage
            .from('uploads')
            .remove([file.storage_path]);
        
        // Eliminar de la base de datos
        await supabase
            .from('files')
            .delete()
            .eq('id', fileId);
        
        files = files.filter(f => f.id !== fileId);
        renderFiles();
        showToast('Archivo eliminado');
        
        if (files.length === 0) {
            showHome();
        }
        
    } catch (error) {
        console.error('Error eliminando:', error);
        showToast('Error al eliminar');
    }
}

// ========================================
// AUTENTICACION
// ========================================

async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
}

function showLoginModal() {
    document.getElementById('loginModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    closeMobileMenu();
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
    document.body.style.overflow = '';
}

function showRegisterModal() {
    document.getElementById('registerModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    closeMobileMenu();
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.remove('active');
    document.body.style.overflow = '';
}

function switchToRegister() {
    closeLoginModal();
    showRegisterModal();
}

function switchToLogin() {
    closeRegisterModal();
    showLoginModal();
}

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        updateAuthUI();
        closeLoginModal();
        showToast('Bienvenido de vuelta');
        await loadFiles();
        
    } catch (error) {
        console.error('Error login:', error);
        showToast(error.message || 'Error al iniciar sesion');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { name: name }
            }
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        updateAuthUI();
        closeRegisterModal();
        showToast('Cuenta creada exitosamente');
        
    } catch (error) {
        console.error('Error registro:', error);
        showToast(error.message || 'Error al registrarse');
    }
}

function updateAuthUI() {
    const headerActions = document.querySelector('.header-actions');
    
    if (currentUser) {
        const userName = currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'Usuario';
        headerActions.innerHTML = `
            <span style="color: var(--text-secondary); font-size: 14px;">Hola, ${escapeHtml(userName)}</span>
            <button class="btn btn-ghost" onclick="logout()">Cerrar sesion</button>
        `;
    } else {
        headerActions.innerHTML = `
            <button class="btn btn-ghost" onclick="showLoginModal()">Iniciar Sesion</button>
            <button class="btn btn-primary" onclick="showRegisterModal()">Registrarse</button>
        `;
    }
}

async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    updateAuthUI();
    showToast('Has cerrado sesion');
}

// ========================================
// TOAST NOTIFICACIONES
// ========================================

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Cerrar modales con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDownloadModal();
        closeShareModal();
        closeLoginModal();
        closeRegisterModal();
    }
});