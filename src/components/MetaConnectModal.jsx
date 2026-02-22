import React, { useState, useEffect } from "react";

const MetaConnectModal = ({ isOpen, onClose, accessToken, onSave }) => {
    const [step, setStep] = useState(1); // 1: Business, 2: Assets
    const [businesses, setBusinesses] = useState([]);
    const [selectedBusiness, setSelectedBusiness] = useState(null);
    const [adAccounts, setAdAccounts] = useState([]);
    const [wabas, setWabas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pages, setPages] = useState([]);
    const [instagramAccounts, setInstagramAccounts] = useState([]);
    const [selectedAdAccounts, setSelectedAdAccounts] = useState([]);
    const [selectedWabas, setSelectedWabas] = useState([]);
    const [selectedPages, setSelectedPages] = useState([]);
    const [selectedInstagrams, setSelectedInstagrams] = useState([]);

    useEffect(() => {
        if (isOpen && accessToken) {
            fetchBusinesses();
        }
    }, [isOpen, accessToken]);

    const fetchBusinesses = async () => {
        setLoading(true);
        try {
            const resp = await fetch(`https://graph.facebook.com/v18.0/me/businesses?access_token=${accessToken}`);
            const data = await resp.json();
            if (data.error) throw new Error(data.error.message);
            setBusinesses(data.data || []);
        } catch (err) {
            alert("Error al cargar negocios: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchAssets = async (businessId) => {
        setLoading(true);
        try {
            // Fetch Ad Accounts
            const adResp = await fetch(`https://graph.facebook.com/v18.0/${businessId}/client_ad_accounts?fields=name,account_id,id&access_token=${accessToken}`);
            const adData = await adResp.json();
            if (adData.error) console.error("Error fetching client_ad_accounts:", adData.error);

            // Si el anterior falla o viene vacío, intentar con owned_ad_accounts
            let finalAds = adData.data || [];
            if (finalAds.length === 0) {
                const adOwnedResp = await fetch(`https://graph.facebook.com/v18.0/${businessId}/owned_ad_accounts?fields=name,account_id,id&access_token=${accessToken}`);
                const adOwnedData = await adOwnedResp.json();
                if (adOwnedData.error) console.error("Error fetching owned_ad_accounts:", adOwnedData.error);
                finalAds = adOwnedData.data || [];
            }

            setAdAccounts(finalAds);

            // Fetch WABAs
            try {
                console.log(`Fetching WABAs for business: ${businessId}...`);
                const wabaResp = await fetch(`https://graph.facebook.com/v18.0/${businessId}/whatsapp_business_accounts?fields=name,id,status&access_token=${accessToken}`);
                const wabaData = await wabaResp.json();

                let currentWabas = [];
                if (!wabaData.error) {
                    const clientWabaResp = await fetch(`https://graph.facebook.com/v18.0/${businessId}/client_whatsapp_business_accounts?fields=name,id,status&access_token=${accessToken}`);
                    const clientWabaData = await clientWabaResp.json();
                    currentWabas = [...(wabaData.data || []), ...(clientWabaData.data || [])];
                } else {
                    console.warn("WhatsApp no disponible via Business ID:", wabaData.error.message);
                }

                if (currentWabas.length === 0) {
                    const userWabaResp = await fetch(`https://graph.facebook.com/v18.0/me/whatsapp_business_accounts?fields=name,id,status&access_token=${accessToken}`);
                    const userWabaData = await userWabaResp.json();
                    currentWabas = userWabaData.data || [];
                }

                // Cargar teléfonos
                const wabasWithPhones = await Promise.all(currentWabas.map(async (waba) => {
                    try {
                        const pResp = await fetch(`https://graph.facebook.com/v18.0/${waba.id}/phone_numbers?fields=display_phone_number,id,verified_name,quality_rating&access_token=${accessToken}`);
                        const pData = await pResp.json();
                        return { ...waba, phone_numbers: pData.data || [] };
                    } catch (e) { return { ...waba, phone_numbers: [] }; }
                }));

                setWabas(wabasWithPhones);
            } catch (wabaErr) {
                console.error("Error obteniendo WABAs:", wabaErr);
                setWabas([]);
            }

            // Fetch Facebook Pages
            console.log("Fetching Pages...");
            const pagesResp = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=name,id,access_token,category,picture&access_token=${accessToken}`);
            const pagesData = await pagesResp.json();
            const finalPages = pagesData.data || [];
            setPages(finalPages);

            // Fetch Instagram Accounts linked to those pages
            console.log("Fetching Instagram Accounts...");
            const igAccounts = [];
            for (const page of finalPages) {
                try {
                    const igResp = await fetch(`https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${accessToken}`);
                    const igData = await igResp.json();
                    if (igData.instagram_business_account) {
                        igAccounts.push({
                            ...igData.instagram_business_account,
                            page_id: page.id,
                            page_name: page.name
                        });
                    }
                } catch (e) {
                    console.error("Error fetching IG for page " + page.id, e);
                }
            }
            setInstagramAccounts(igAccounts);

            setStep(2);
        } catch (err) {
            alert("Error al cargar activos: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({
                business: selectedBusiness,
                adAccounts: adAccounts.filter(a => selectedAdAccounts.includes(a.id)),
                wabas: selectedWabas,
                pages: pages.filter(p => selectedPages.includes(p.id)),
                instagrams: instagramAccounts.filter(ig => selectedInstagrams.includes(ig.id))
            });
            onClose();
        } catch (err) {
            alert("Error al guardar: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <div className="modal-content glass-panel" style={{ maxWidth: '600px', width: '90%', padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0 }}>{step === 1 ? 'Seleccionar Negocio' : 'Seleccionar Activos'}</h2>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <div className="spinner"></div>
                        <p style={{ marginTop: '15px' }}>Cargando datos de Meta...</p>
                    </div>
                ) : (
                    <>
                        {step === 1 && (
                            <div className="business-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {businesses.length === 0 ? (
                                    <p className="text-muted">No se encontraron negocios vinculados a esta cuenta.</p>
                                ) : (
                                    businesses.map(b => (
                                        <div
                                            key={b.id}
                                            className="card-v4"
                                            style={{ padding: '15px', cursor: 'pointer', border: '1px solid var(--glass-border)' }}
                                            onClick={() => { setSelectedBusiness(b); fetchAssets(b.id); }}
                                        >
                                            <strong>🏢 {b.name}</strong>
                                            <small style={{ display: 'block', opacity: 0.6 }}>ID: {b.id}</small>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <h4 style={{ marginBottom: '10px' }}>💳 Cuentas Publicitarias</h4>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {adAccounts.length === 0 ? <p className="text-muted">No hay cuentas Ads disponibles.</p> : adAccounts.map(acc => (
                                            <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedAdAccounts.includes(acc.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedAdAccounts([...selectedAdAccounts, acc.id]);
                                                        else setSelectedAdAccounts(selectedAdAccounts.filter(id => id !== acc.id));
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.9rem' }}>{acc.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ marginBottom: '10px' }}>💬 Cuentas de WhatsApp Business</h4>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {wabas.length === 0 ? (
                                            <div style={{ padding: '10px', background: 'rgba(255,165,0,0.1)', borderRadius: '8px', border: '1px solid orange' }}>
                                                <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay cuentas WABA disponibles.</p>
                                                <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', opacity: 0.8 }}>
                                                    💡 Tips: Asegúrate de que el Business Manager seleccionado sea el correcto y de haber otorgado permisos de "WhatsApp Business Management" al conectar.
                                                </p>
                                            </div>
                                        ) : (
                                            wabas.map(w => (
                                                <div key={w.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                        <strong style={{ fontSize: '0.9rem' }}>📁 {w.name}</strong>
                                                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '10px', background: 'rgba(var(--primary-rgb), 0.2)' }}>{w.status}</span>
                                                    </div>

                                                    {w.phone_numbers && w.phone_numbers.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                            {w.phone_numbers.map(phone => (
                                                                <label key={phone.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', cursor: 'pointer' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedWabas.some(item => item.id === w.id && item.phone_id === phone.id)}
                                                                        onChange={(e) => {
                                                                            if (e.target.checked) {
                                                                                setSelectedWabas([...selectedWabas, { ...w, phone_id: phone.id, display_phone: phone.display_phone_number || phone.verified_name }]);
                                                                            } else {
                                                                                setSelectedWabas(selectedWabas.filter(item => !(item.id === w.id && item.phone_id === phone.id)));
                                                                            }
                                                                        }}
                                                                    />
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>📞 {phone.display_phone_number || 'Número de Prueba'}</span>
                                                                        <small style={{ fontSize: '0.65rem', opacity: 0.7 }}>{phone.verified_name || 'Sin nombre verificado'}</small>
                                                                    </div>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>No hay números disponibles en esta cuenta.</p>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ marginBottom: '10px' }}>📘 Páginas de Facebook (Messenger)</h4>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {pages.length === 0 ? <p className="text-muted">No hay páginas disponibles.</p> : pages.map(page => (
                                            <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPages.includes(page.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedPages([...selectedPages, page.id]);
                                                        else setSelectedPages(selectedPages.filter(id => id !== page.id));
                                                    }}
                                                />
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {page.picture?.data?.url && <img src={page.picture.data.url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />}
                                                    <span style={{ fontSize: '0.9rem' }}>{page.name}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ marginBottom: '10px' }}>📸 Cuentas de Instagram Business</h4>
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {instagramAccounts.length === 0 ? (
                                            <p className="text-muted" style={{ fontSize: '0.8rem' }}>No se encontraron cuentas de Instagram Business vinculadas.</p>
                                        ) : instagramAccounts.map(ig => (
                                            <label key={ig.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedInstagrams.includes(ig.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedInstagrams([...selectedInstagrams, ig.id]);
                                                        else setSelectedInstagrams(selectedInstagrams.filter(id => id !== ig.id));
                                                    }}
                                                />
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '100px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {ig.profile_picture_url && <img src={ig.profile_picture_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />}
                                                        <span style={{ fontSize: '0.9rem' }}>@{ig.username}</span>
                                                    </div>
                                                    <small style={{ fontSize: '0.7rem', opacity: 0.6 }}>({ig.page_name})</small>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <button className="btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>Atrás</button>
                                    <button className="btn-process" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
                                        {saving ? 'Guardando...' : '🔗 Vincular Activos Seleccionados'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MetaConnectModal;
