import React, { useState, useEffect } from "react";

const MetaConnectModal = ({ isOpen, onClose, accessToken, onSave }) => {
    const [step, setStep] = useState(1); // 1: Business, 2: Assets
    const [businesses, setBusinesses] = useState([]);
    const [selectedBusiness, setSelectedBusiness] = useState(null);
    const [adAccounts, setAdAccounts] = useState([]);
    const [wabas, setWabas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [selectedAdAccounts, setSelectedAdAccounts] = useState([]);
    const [selectedWabas, setSelectedWabas] = useState([]);

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

            // Si el anterior falla, intentar con owned_ad_accounts
            let finalAds = adData.data || [];
            if (finalAds.length === 0) {
                const adOwnedResp = await fetch(`https://graph.facebook.com/v18.0/${businessId}/owned_ad_accounts?fields=name,account_id,id&access_token=${accessToken}`);
                const adOwnedData = await adOwnedResp.json();
                finalAds = adOwnedData.data || [];
            }

            setAdAccounts(finalAds);

            // Fetch WABAs
            const wabaResp = await fetch(`https://graph.facebook.com/v18.0/${businessId}/whatsapp_business_accounts?fields=name,id&access_token=${accessToken}`);
            const wabaData = await wabaResp.json();
            setWabas(wabaData.data || []);

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
            // Preparamos los datos para guardar
            // Para cada WABA, podríamos querer sus números de teléfono
            const wabasWithPhones = await Promise.all(selectedWabas.map(async (waba) => {
                const resp = await fetch(`https://graph.facebook.com/v18.0/${waba.id}/phone_numbers?fields=display_phone_number,id,verified_name&access_token=${accessToken}`);
                const data = await resp.json();
                return { ...waba, phone_numbers: data.data || [] };
            }));

            await onSave({
                business: selectedBusiness,
                adAccounts: adAccounts.filter(a => selectedAdAccounts.includes(a.id)),
                wabas: wabasWithPhones
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
                                        {wabas.length === 0 ? <p className="text-muted">No hay cuentas WABA disponibles.</p> : wabas.map(w => (
                                            <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedWabas.some(item => item.id === w.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedWabas([...selectedWabas, w]);
                                                        else setSelectedWabas(selectedWabas.filter(item => item.id !== w.id));
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.9rem' }}>{w.name}</span>
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
