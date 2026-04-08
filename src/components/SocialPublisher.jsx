import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';

const SocialPublisher = ({ user, clinicId }) => {
    const [caption, setCaption] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState(['tiktok', 'instagram']);
    const [mediaUrl, setMediaUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [posts, setPosts] = useState([]);
    const [connectedPlatforms, setConnectedPlatforms] = useState([]);
    const [editingPostId, setEditingPostId] = useState(null);

    // Platform specific configurations
    const [platformConfigs, setPlatformConfigs] = useState({
        facebook: { type: 'feed', title: '' },
        instagram: { type: 'reel' },
        tiktok: { type: 'video' }
    });

    // View, Date & Filters
    const [viewMode, setViewMode] = useState('calendar'); // 'list' or 'calendar'
    const [viewDate, setViewDate] = useState(new Date());
    const [statusFilter, setStatusFilter] = useState('all');
    const [platformFilter, setPlatformFilter] = useState('all');

    // Post Detail Modal
    const [viewingPost, setViewingPost] = useState(null);

    // active preview tab
    const [activePreview, setActivePreview] = useState('instagram');

    // Cloudinary Config
    const cloudName = "dlkky5xuo";
    const uploadPreset = "CRM_ORGANIZATOR";
    const folder = "CRM_ANDO";

    const [showGallery, setShowGallery] = useState(false);

    useEffect(() => {
        fetchPosts();
        fetchConnectedPlatforms();
        
        if (!document.getElementById('cloudinary-script')) {
            const script = document.createElement('script');
            script.id = 'cloudinary-script';
            script.src = "https://widget.cloudinary.com/v2.0/global/all.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, [clinicId]);

    const getUniqueMedia = () => {
        const urls = posts.map(p => p.cloudinary_url).filter(Boolean);
        return [...new Set(urls)];
    };

    const fetchPosts = async () => {
        if (!clinicId) return;
        const { data, error } = await supabase
            .from('social_posts')
            .select('*')
            .eq('profile_id', clinicId)
            .order('scheduled_at', { ascending: false });
        if (!error) setPosts(data);
    };

    const fetchConnectedPlatforms = async () => {
        if (!clinicId) return;
        try {
            const { data: tiktokData } = await supabase.from('social_platforms').select('*').eq('profile_id', clinicId);
            const { data: metaData } = await supabase.from('meta_social_accounts').select('*').eq('clinic_id', clinicId).eq('is_active', true);
            const combined = [
                ...(tiktokData || []).map(p => ({ platform: 'tiktok', user_name: p.platform_user_name || 'TikTok User' })),
                ...(metaData || []).map(p => ({ platform: p.platform === 'messenger' ? 'facebook' : p.platform, user_name: p.name || 'Meta Page' }))
            ];
            setConnectedPlatforms(combined);
        } catch (err) { console.error(err); }
    };

    const handleUpload = () => {
        if (!window.cloudinary) return alert("Cargando...");
        window.cloudinary.openUploadWidget({
            cloudName, uploadPreset, folder,
            sources: ["local", "url", "camera", "google_drive"],
            multiple: false,
            clientAllowedFormats: ["png", "jpg", "jpeg", "mp4", "mov"],
            maxFileSize: 50000000,
        }, (error, result) => {
            if (!error && result?.event === "success") setMediaUrl(result.info.secure_url);
        });
    };

    const handleSchedule = async (isImmediate = false) => {
        if (!mediaUrl) return alert("Sube multimedia.");
        if (!isImmediate && !scheduledAt) return alert("Selecciona fecha.");
        if (selectedPlatforms.length === 0) return alert("Selecciona plataformas.");

        setLoading(true);
        try {
            const finalScheduledAt = isImmediate ? new Date().toISOString() : new Date(scheduledAt).toISOString();
            const payload = {
                profile_id: clinicId,
                cloudinary_url: mediaUrl,
                caption,
                scheduled_at: finalScheduledAt,
                platforms: selectedPlatforms,
                status: 'pending',
                metadata: { ...platformConfigs, isVideo: mediaUrl.includes('.mp4') }
            };
            if (editingPostId) await supabase.from('social_posts').update(payload).eq('id', editingPostId);
            else {
                await supabase.from('social_posts').insert([payload]);
                if (isImmediate) supabase.functions.invoke('process-social-queue').catch(() => {});
            }
            setCaption(''); setScheduledAt(''); setMediaUrl(''); setEditingPostId(null); fetchPosts();
        } catch (err) { alert(err.message); } finally { setLoading(false); }
    };

    const handleDeletePost = async (id) => {
        if (!confirm("¿Eliminar?")) return;
        const { error } = await supabase.from('social_posts').delete().eq('id', id);
        if (!error) { fetchPosts(); setViewingPost(null); }
    };

    const handleEditPost = (post) => {
        setCaption(post.caption);
        setScheduledAt(new Date(post.scheduled_at).toISOString().slice(0, 16));
        setMediaUrl(post.cloudinary_url);
        setSelectedPlatforms(post.platforms);
        if (post.metadata) setPlatformConfigs(post.metadata);
        setEditingPostId(post.id);
        setViewingPost(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const updateConfig = (plat, key, val) => {
        setPlatformConfigs(prev => ({ ...prev, [plat]: { ...prev[plat], [key]: val } }));
    };

    const getPlatformIcon = (p) => p === 'tiktok' ? '📱' : p === 'instagram' ? '📸' : '👤';

    // FILTERING LOGIC
    const filteredPosts = posts.filter(p => {
        const matchesStatus = statusFilter === 'all' 
            || (statusFilter === 'published' && (p.status === 'published' || p.status === 'partially_published'))
            || (statusFilter === 'pending' && (p.status === 'pending' || p.status === 'processing'))
            || (statusFilter === 'failed' && p.status === 'failed');
        const matchesPlatform = platformFilter === 'all' || p.platforms?.includes(platformFilter);
        return matchesStatus && matchesPlatform;
    });

    const CalendarView = () => {
        const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
        const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Juv', 'Vie', 'Sáb'];
        const monthName = viewDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        const calendarDays = [];
        for (let i = 0; i < firstDay; i++) calendarDays.push(null);
        for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

        return (
            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ textTransform: 'capitalize' }}>🗓️ {monthName}</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} style={{ padding: '5px 15px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', cursor: 'pointer' }}>◀ Ant</button>
                        <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} style={{ padding: '5px 15px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', cursor: 'pointer' }}>Sig ▶</button>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                    {dayNames.map(d => <div key={d} style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.8rem', opacity: 0.5 }}>{d}</div>)}
                    {calendarDays.map((day, idx) => {
                        const dayPosts = filteredPosts.filter(p => {
                            const d = new Date(p.scheduled_at);
                            return day && d.getDate() === day && d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
                        });
                        return (
                            <div key={idx} style={{ minHeight: '120px', background: day ? 'rgba(255,255,255,0.02)' : 'transparent', border: day ? '1px solid var(--glass-border)' : 'none', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {day && <span style={{ fontSize: '0.8rem', fontWeight: 900, opacity: 0.3 }}>{day}</span>}
                                {dayPosts.map(p => (
                                    <div key={p.id} onClick={() => setViewingPost(p)} style={{ background: 'var(--primary)', color: '#fff', borderRadius: '6px', padding: '4px 6px', fontSize: '0.6rem', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        {p.platforms?.map(plat => <span key={plat}>{getPlatformIcon(plat)}</span>)}
                                        {p.caption?.substring(0, 10)}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // --- MODALS RENDERED WITH PORTAL ---
    const renderModals = (isDark) => {
        return createPortal(
            <>
                {showGallery && (
                    <div style={{ position: 'fixed', top: '20px', bottom: '20px', left: '20px', right: '20px', background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 0.98)', backdropFilter: 'blur(60px)', zIndex: 999999, display: 'flex', flexDirection: 'column', color: isDark ? '#fff' : '#1e293b', animation: 'fadeIn 0.2s', borderRadius: '40px', overflow: 'hidden', boxShadow: '0 50px 100px rgba(0,0,0,0.3)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                        <div style={{ padding: '20px 40px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isDark ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255,255,255,0.5)' }}>
                            <div>
                                <h1 style={{ margin: 0, fontWeight: 900, fontSize: '1.3rem', letterSpacing: '-0.5px' }}>📂 Librería Multimedia</h1>
                                <p style={{ margin: '2px 0 0 0', opacity: 0.5, fontWeight: 600, fontSize: '0.75rem' }}>Archivos para tus redes sociales</p>
                            </div>
                            <button onClick={() => setShowGallery(false)} style={{ background: '#FF4757', color: '#fff', border: 'none', padding: '10px 25px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem', boxShadow: '0 5px 15px rgba(255, 71, 87, 0.2)' }}>Cerrar Galería ✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '30px 40px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
                                {getUniqueMedia().map((url, i) => (
                                    <div key={i} style={{ position: 'relative', borderRadius: '15px', overflow: 'hidden', background: isDark ? '#000' : '#f1f5f9', cursor: 'pointer', height: '180px', boxShadow: `0 10px 20px ${isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.05)'}`, transition: 'all 0.3s' }} onClick={() => { setMediaUrl(url); setShowGallery(false); }}>
                                        {url.includes('.mp4') ? (
                                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: isDark ? '#fff' : '#1e293b' }}>
                                                <span style={{ fontSize: '1.8rem' }}>📹</span>
                                                <b style={{ marginTop: '5px', fontSize: '0.65rem', opacity: 0.5 }}>VIDEO MP4</b>
                                            </div>
                                        ) : (
                                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(99, 102, 241, 0.1)', opacity: 0, transition: '0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                                            <div style={{ padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', fontWeight: 800, fontSize: '0.65rem' }}>USAR ARCHIVO</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {viewingPost && (
                    <div style={{ position: 'fixed', top: '20px', bottom: '20px', left: '20px', right: '20px', background: isDark ? '#000' : '#f8fafc', zIndex: 999999, display: 'grid', gridTemplateColumns: '1.4fr 1fr', animation: 'fadeIn 0.2s', borderRadius: '40px', overflow: 'hidden', boxShadow: `0 50px 100px ${isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.1)'}`, border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'}` }}>
                        <div style={{ background: isDark ? '#000' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <button onClick={() => setViewingPost(null)} style={{ position: 'absolute', top: '30px', left: '30px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', border: 'none', color: isDark ? '#fff' : '#1e293b', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800, backdropFilter: 'blur(10px)', fontSize: '0.75rem' }}>← SALIR DE VISTA</button>
                            {viewingPost.cloudinary_url?.includes('.mp4') ? (
                                <video src={viewingPost.cloudinary_url} controls autoPlay style={{ maxWidth: '85%', maxHeight: '85%', borderRadius: '10px' }} />
                            ) : (
                                <img src={viewingPost.cloudinary_url} style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
                            )}
                        </div>
                        <div style={{ background: isDark ? '#0d0d0d' : '#fff', borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, padding: '40px 40px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ marginBottom: '30px' }}>
                                <div style={{ marginBottom: '10px' }}>
                                    <span style={{ padding: '6px 15px', borderRadius: '30px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', background: viewingPost.status === 'published' ? '#4ade80' : viewingPost.status === 'failed' ? '#FF4757' : 'var(--primary)', color: '#fff' }}>
                                        {viewingPost.status}
                                    </span>
                                </div>
                                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: isDark ? '#fff' : '#1e293b', margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>Resumen de Publicación</h1>
                                <p style={{ fontSize: '0.85rem', opacity: 0.4, fontWeight: 600, color: isDark ? '#fff' : '#475569' }}>Agendado para: {new Date(viewingPost.scheduled_at).toLocaleString()}</p>
                            </div>

                            <div style={{ marginBottom: '30px' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', color: isDark ? '#fff' : '#1e293b' }}>Descripción del Post</label>
                                <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: isDark ? '#fff' : '#334155', opacity: 0.9, background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', padding: '20px', borderRadius: '20px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, whiteSpace: 'pre-wrap' }}>
                                    {viewingPost.caption || 'Ningún texto configurado.'}
                                </div>
                            </div>

                            <div style={{ marginBottom: '30px' }}>
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, opacity: 0.3, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', color: isDark ? '#fff' : '#1e293b' }}>Canales Activos</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {viewingPost.platforms?.map(plat => (
                                        <div key={plat} style={{ padding: '10px 18px', background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 800, border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`, color: isDark ? '#fff' : '#334155' }}>
                                            {getPlatformIcon(plat)} {plat.toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {viewingPost.error_message && (
                                <div style={{ marginBottom: '30px' }}>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, color: '#FF4757', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>🚨 Informe Técnico de Error</label>
                                    <div style={{ fontSize: '0.8rem', color: '#FF4757', background: 'rgba(255, 71, 87, 0.08)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 71, 87, 0.15)', fontWeight: 600, lineHeight: 1.4 }}>
                                        {viewingPost.error_message}
                                    </div>
                                </div>
                            )}

                            <div style={{ flex: 1 }}></div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                {viewingPost.status !== 'published' ? (
                                    <>
                                        <button onClick={() => handleEditPost(viewingPost)} style={{ flex: 2, padding: '15px', background: isDark ? '#fff' : 'var(--primary)', color: isDark ? '#000' : '#fff', borderRadius: '12px', fontWeight: 900, fontSize: '0.9rem', border: 'none', cursor: 'pointer' }}>✏️ EDITAR AHORA</button>
                                        <button onClick={() => handleDeletePost(viewingPost.id)} style={{ flex: 1, padding: '15px', background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(239, 68, 68, 0.2)'}`, color: '#FF4757', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>🗑️ BORRAR</button>
                                    </>
                                ) : (
                                    <div style={{ width: '100%', padding: '18px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderRadius: '15px', textAlign: 'center', fontSize: '1rem', fontWeight: 900, border: '1px solid rgba(74, 222, 128, 0.2)' }}>✓ PUBLICADO CON ÉXITO</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </>,
            document.body
        );
    };

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    return (
        <div className="social-publisher-container">
            {renderModals(isDark)}
            
            <h2 className="section-title">🚀 Social Hub - Publicador Automático</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px', marginTop: '30px' }}>
                {/* EDITOR */}
                <div className="glass-panel" style={{ padding: '25px' }}>
                    <h3>🆕 Crear Publicación</h3>
                    <div style={{ marginBottom: '20px', marginTop: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 700 }}>1. Multimedia</label>
                        {!mediaUrl ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div onClick={handleUpload} style={{ border: '2px dashed var(--glass-border)', borderRadius: '15px', padding: '15px', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', fontSize: '0.8rem' }}>☁️ Subir</div>
                                <div onClick={() => setShowGallery(true)} style={{ border: '2px dashed var(--glass-border)', borderRadius: '15px', padding: '15px', textAlign: 'center', cursor: 'pointer', background: 'rgba(99,102,241,0.05)', fontSize: '0.8rem' }}>🖼️ Librería</div>
                            </div>
                        ) : (
                            <div onClick={() => setViewingPost({ cloudinary_url: mediaUrl, caption: 'Vista previa de archivo subido', platforms: [], status: 'draft', scheduled_at: new Date() })} style={{ position: 'relative', borderRadius: '15px', overflow: 'hidden', height: '120px', cursor: 'pointer', border: '1px solid var(--glass-border)' }}>
                                {mediaUrl.includes('.mp4') ? (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', fontSize: '1.5rem' }}>📹</div>
                                ) : (
                                    <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', opacity: 0, transition: '0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 800 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>CLIC PARA AMPLIAR</div>
                                <button onClick={(e) => { e.stopPropagation(); setMediaUrl(''); }} style={{ position: 'absolute', top: '5px', right: '5px', background: '#ef4444', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.6rem', zIndex: 10 }}>Eliminar</button>
                            </div>
                        )}
                    </div>
                    <textarea className="custom-file-input" style={{ width: '100%', height: '80px', marginBottom: '15px', fontSize: '0.85rem' }} placeholder="Texto / Copy..." value={caption} onChange={e => setCaption(e.target.value)} />
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '0.8rem' }}>Canales Seleccionados</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['tiktok', 'instagram', 'facebook'].map(p => {
                                const isSelected = selectedPlatforms.includes(p);
                                const connected = connectedPlatforms.find(cp => cp.platform === p);
                                return <button key={p} onClick={() => connected && setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.05)', color: isSelected ? '#fff' : 'var(--text-main)', opacity: connected ? 1 : 0.3, fontSize: '0.75rem', fontWeight: 700 }}>{getPlatformIcon(p)} {p}</button>
                            })}
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        {selectedPlatforms.includes('facebook') && (
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, marginBottom: '5px' }}>👤 Facebook</label>
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                    {[{ id: 'feed', label: 'Feed' }, { id: 'reel', label: 'Reel' }].map(opt => (
                                        <button key={opt.id} onClick={() => updateConfig('facebook', 'type', opt.id)} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: platformConfigs.facebook.type === opt.id ? 'var(--primary)' : 'rgba(0,0,0,0.04)', color: platformConfigs.facebook.type === opt.id ? '#fff' : 'var(--text-main)', fontSize: '0.7rem', fontWeight: 700 }}>{opt.label}</button>
                                    ))}
                                </div>
                                {mediaUrl.includes('.mp4') && <input className="custom-file-input" style={{ width: '100%', height: '30px', fontSize: '0.75rem' }} placeholder="Título del Video" value={platformConfigs.facebook.title} onChange={e => updateConfig('facebook', 'title', e.target.value)} />}
                            </div>
                        )}
                        {selectedPlatforms.includes('instagram') && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, marginBottom: '5px' }}>📸 Instagram</label>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {[{ id: 'feed', label: 'Feed' }, { id: 'reel', label: 'Reel' }].map(opt => (
                                        <button key={opt.id} onClick={() => updateConfig('instagram', 'type', opt.id)} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: platformConfigs.instagram.type === opt.id ? 'var(--primary)' : 'rgba(0,0,0,0.04)', color: platformConfigs.instagram.type === opt.id ? '#fff' : 'var(--text-main)', fontSize: '0.7rem', fontWeight: 700 }}>{opt.label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <input type="datetime-local" className="custom-file-input" style={{ width: '100%', marginBottom: '15px', height: '35px', fontSize: '0.75rem' }} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                    <button className="btn-process" style={{ width: '100%', padding: '12px', fontSize: '0.9rem' }} onClick={() => handleSchedule(true)} disabled={loading}>🚀 Publicar Ahora</button>
                </div>

                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '0.8rem', marginBottom: '15px', opacity: 0.6 }}>📱 Vista Previa</h3>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '15px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: '3px', borderRadius: '8px' }}>
                        {['instagram', 'tiktok', 'facebook'].map(plat => (
                            <button key={plat} onClick={() => setActivePreview(plat)} style={{ flex: 1, padding: '5px', borderRadius: '6px', border: 'none', background: activePreview === plat ? 'var(--primary)' : 'transparent', color: activePreview === plat ? '#fff' : 'var(--text-main)', opacity: activePreview === plat ? 1 : 0.6, fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}>{plat.toUpperCase()}</button>
                        ))}
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div onClick={() => mediaUrl && setViewingPost({ cloudinary_url: mediaUrl, caption, platforms: [activePreview], status: 'preview', scheduled_at: scheduledAt || new Date() })} style={{ width: '230px', height: '420px', background: '#000', borderRadius: '30px', border: '6px solid #222', position: 'relative', overflow: 'hidden', boxShadow: '0 15px 30px rgba(0,0,0,0.3)', cursor: mediaUrl ? 'pointer' : 'default' }}>
                            {/* MEDIA BACKGROUND FOR VERTICAL CONTENT (Tiktok/Reels) */}
                            {(activePreview === 'tiktok' || platformConfigs[activePreview]?.type === 'reel') ? (
                                <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
                                    {mediaUrl ? (
                                        mediaUrl.includes('.mp4') ? (
                                            <video src={mediaUrl} autoPlay muted loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <img src={mediaUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '0.7rem' }}>Sin Multimedia</div>
                                    )}
                                    {/* TIKTOK OVERLAY MOCKUP */}
                                    <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', padding: '20px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                                        <div style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px' }}>@TuCanal</div>
                                        <div style={{ color: '#fff', fontSize: '0.7rem', opacity: 0.9, lineHeight: 1.3, maxHeight: '60px', overflow: 'hidden' }}>{caption || 'Escribe un copy...'}</div>
                                    </div>
                                </div>
                            ) : (
                                /* FEED STYLE (Instagram/Facebook Feed) */
                                <div style={{ height: '100%', background: isDark ? '#1a1a1a' : '#fff', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)' }}></div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: isDark ? '#fff' : '#000' }}>TuCanal</div>
                                    </div>
                                    <div style={{ width: '100%', height: '200px', background: isDark ? '#000' : '#f1f5f9' }}>
                                        {mediaUrl ? (
                                            mediaUrl.includes('.mp4') ? (
                                                <video src={mediaUrl} muted loop autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <img src={mediaUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            )
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: '0.7rem' }}>Sin Multimedia</div>
                                        )}
                                    </div>
                                    <div style={{ padding: '10px' }}>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '1rem' }}>❤️</span>
                                            <span style={{ fontSize: '1rem' }}>💬</span>
                                            <span style={{ fontSize: '1rem' }}>✈️</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '2px', color: isDark ? '#fff' : '#000' }}>TuCanal</div>
                                        <div style={{ fontSize: '0.7rem', lineHeight: 1.4, color: isDark ? '#fff' : '#334155', opacity: 0.9 }}>{caption || 'Escribe un copy...'}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* PLANNING SECTION */}
            <div className="glass-panel" style={{ marginTop: '40px', padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>📅 Planificación de Contenido</h2>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '10px' }}>
                                <button onClick={() => setViewMode('calendar')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: viewMode === 'calendar' ? 'var(--primary)' : 'transparent', color: viewMode === 'calendar' ? '#fff' : 'var(--text-main)', fontSize: '0.8rem', fontWeight: 700 }}>Calendario</button>
                                <button onClick={() => setViewMode('list')} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: viewMode === 'list' ? 'var(--primary)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--text-main)', fontSize: '0.8rem', fontWeight: 700 }}>Lista</button>
                            </div>
                            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '10px' }}>
                                {['all', 'tiktok', 'instagram', 'facebook'].map(p => (
                                    <button key={p} onClick={() => setPlatformFilter(p)} title={p === 'all' ? 'Ver Todas' : `Filtrar ${p}`} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: platformFilter === p ? '#fff' : 'transparent', color: platformFilter === p ? '#000' : 'var(--text-main)', fontSize: '0.75rem', fontWeight: 800 }}>{p === 'all' ? 'Todas' : getPlatformIcon(p)}</button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '10px' }}>
                                {[{ id: 'all', l: 'Todos' }, { id: 'published', l: '✅' }, { id: 'pending', l: '🕒' }, { id: 'failed', l: '❌' }].map(s => (
                                    <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{ padding: '6px 15px', borderRadius: '8px', border: 'none', background: statusFilter === s.id ? '#fff' : 'transparent', color: statusFilter === s.id ? '#000' : 'var(--text-main)', fontSize: '0.75rem', fontWeight: 800 }}>{s.l}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '30px' }}>
                    {viewMode === 'calendar' ? <CalendarView /> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                            {filteredPosts.map(p => (
                                <div key={p.id} className="card-v4" onClick={() => setViewingPost(p)} style={{ padding: '15px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div style={{ width: '50px', height: '50px', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                                            {!p.cloudinary_url?.includes('.mp4') && <img src={p.cloudinary_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{p.caption?.substring(0, 30)}...</div>
                                            <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>{p.platforms?.map(plat => <span key={plat}>{getPlatformIcon(plat)}</span>)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: '0.55rem', padding: '2px 6px', borderRadius: '5px', background: p.status === 'published' ? '#4ade80' : p.status === 'failed' ? '#f87171' : 'var(--primary)', color: '#fff', fontWeight: 800 }}>{p.status}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SocialPublisher;
