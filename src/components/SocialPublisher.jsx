
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const SocialPublisher = ({ user, clinicId }) => {
    const [caption, setCaption] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState(['tiktok', 'instagram']);
    const [mediaUrl, setMediaUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [posts, setPosts] = useState([]);

    // Cloudinary Config
    const cloudName = "dlkky5xuo";
    const uploadPreset = "CRM_ORGANIZATOR";
    const folder = "CRM_ANDO";

    useEffect(() => {
        fetchPosts();
        
        // Cargar el script de Cloudinary dinámicamente
        const script = document.createElement('script');
        script.src = "https://widget.cloudinary.com/v2.0/global/all.js";
        script.async = true;
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    const fetchPosts = async () => {
        if (!clinicId) return;
        const { data, error } = await supabase
            .from('social_posts')
            .select('*')
            .eq('profile_id', clinicId)
            .order('scheduled_at', { ascending: false });
        if (!error) setPosts(data);
    };

    const handleUpload = () => {
        if (!window.cloudinary) {
            alert("El cargador de Cloudinary todavía se está cargando. Intenta de nuevo en un segundo.");
            return;
        }

        window.cloudinary.openUploadWidget(
            {
                cloudName: cloudName,
                uploadPreset: uploadPreset,
                folder: folder,
                sources: ["local", "url", "camera", "google_drive"],
                multiple: false,
                clientAllowedFormats: ["png", "jpg", "jpeg", "mp4", "mov"],
                maxFileSize: 50000000, // 50MB
            },
            (error, result) => {
                if (!error && result && result.event === "success") {
                    console.log("Subida exitosa:", result.info);
                    setMediaUrl(result.info.secure_url);
                }
            }
        );
    };

    const handleSchedule = async (e) => {
        e.preventDefault();
        if (!mediaUrl) return alert("Por favor sube un video o imagen primero.");
        if (!scheduledAt) return alert("Selecciona una fecha y hora.");
        if (selectedPlatforms.length === 0) return alert("Selecciona al menos una plataforma.");

        setLoading(true);
        try {
            const { error } = await supabase
                .from('social_posts')
                .insert([{
                    profile_id: clinicId,
                    cloudinary_url: mediaUrl,
                    caption: caption,
                    scheduled_at: new Date(scheduledAt).toISOString(),
                    platforms: selectedPlatforms,
                    status: 'pending'
                }]);

            if (error) throw error;
            
            alert("✅ Publicación programada con éxito.");
            setCaption('');
            setScheduledAt('');
            setMediaUrl('');
            fetchPosts();
        } catch (err) {
            alert("Error al programar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const togglePlatform = (p) => {
        if (selectedPlatforms.includes(p)) setSelectedPlatforms(selectedPlatforms.filter(x => x !== p));
        else setSelectedPlatforms([...selectedPlatforms, p]);
    };

    return (
        <div className="social-publisher-container">
            <h2 className="section-title">🚀 Social Hub - Publicador Automático</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '20px' }}>
                {/* Formulario de Creación */}
                <div className="glass-panel" style={{ padding: '25px' }}>
                    <h3 style={{ marginBottom: '20px' }}>Programar Nueva Publicación</h3>
                    
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600 }}>1. Sube tu Multimedia</label>
                        {!mediaUrl ? (
                            <div 
                                onClick={handleUpload}
                                style={{ 
                                    border: '2px dashed var(--glass-border)', 
                                    borderRadius: '12px', 
                                    padding: '40px', 
                                    textAlign: 'center', 
                                    cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.02)'
                                }}
                            >
                                <span style={{ fontSize: '2rem' }}>☁️</span>
                                <p style={{ margin: '10px 0 0 0', opacity: 0.6 }}>Haz clic para subir (Cloudinary)</p>
                            </div>
                        ) : (
                            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
                                {mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov') ? (
                                    <video src={mediaUrl} controls style={{ width: '100%', borderRadius: '12px' }} />
                                ) : (
                                    <img src={mediaUrl} alt="Preview" style={{ width: '100%', borderRadius: '12px' }} />
                                )}
                                <button 
                                    onClick={() => setMediaUrl('')}
                                    style={{ position: 'absolute', top: '10px', right: '10px', background: '#f87171', border: 'none', borderRadius: '50%', width: '30px', height: '30px', color: 'white', cursor: 'pointer' }}
                                >×</button>
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600 }}>2. Escribe el Copy / Pie de Foto</label>
                        <textarea 
                            className="custom-file-input"
                            style={{ width: '100%', height: '100px', padding: '12px', resize: 'none' }}
                            placeholder="¿Qué quieres decir hoy?"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                        />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600 }}>3. Selecciona Plataformas</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {['tiktok', 'instagram', 'facebook'].map(p => (
                                <button 
                                    key={p}
                                    onClick={() => togglePlatform(p)}
                                    className={selectedPlatforms.includes(p) ? "btn-process" : "btn-secondary"}
                                    style={{ flex: 1, textTransform: 'capitalize' }}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: '25px' }}>
                        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600 }}>4. Fecha y Hora de Publicación</label>
                        <input 
                            type="datetime-local" 
                            className="custom-file-input"
                            style={{ width: '100%' }}
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                        />
                    </div>

                    <button 
                        className="btn-process" 
                        style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}
                        onClick={handleSchedule}
                        disabled={loading}
                    >
                        {loading ? "Programando..." : "🕒 Programar Publicación"}
                    </button>
                </div>

                {/* Lista de Publicaciones */}
                <div className="glass-panel" style={{ padding: '25px' }}>
                    <h3 style={{ marginBottom: '20px' }}>Cola de Publicaciones</h3>
                    <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {posts.length === 0 ? (
                            <p style={{ opacity: 0.5 }}>No hay publicaciones programadas.</p>
                        ) : posts.map(post => (
                            <div key={post.id} className="card-v4" style={{ padding: '15px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ display: 'flex', gap: '15px' }}>
                                    <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
                                        {post.cloudinary_url.includes('.mp4') ? (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📹</div>
                                        ) : (
                                            <img src={post.cloudinary_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem', fontWeight: 500 }}>{post.caption?.substring(0, 50)}...</p>
                                        <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                            {post.platforms.map(p => (
                                                <span key={p} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)' }}>{p}</span>
                                            ))}
                                        </div>
                                        <small style={{ opacity: 0.6 }}>📅 {new Date(post.scheduled_at).toLocaleString()}</small>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ 
                                            fontSize: '0.7rem', 
                                            padding: '4px 8px', 
                                            borderRadius: '12px',
                                            background: post.status === 'published' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                                            color: post.status === 'published' ? '#4ade80' : '#fbbf24'
                                        }}>
                                            {post.status.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SocialPublisher;
