import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function WhatsappCampaigns({ clinicId }) {
    const [templates, setTemplates] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchingTemplates, setFetchingTemplates] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [newCampaignName, setNewCampaignName] = useState("");
    const [leads, setLeads] = useState([]);
    const [selectedLeads, setSelectedLeads] = useState([]);
    const [activeTab, setActiveTab] = useState("campaigns"); // "campaigns" or "templates"
    const [executing, setExecuting] = useState(null); // campaignId being sent

    const fetchData = async () => {
        if (!clinicId) return;
        setLoading(true);
        try {
            const { data: tData } = await supabase.from('whatsapp_templates').select('*').eq('clinic_id', clinicId);
            setTemplates(tData || []);

            const { data: cData } = await supabase.from('whatsapp_campaigns').select('*, whatsapp_templates(*)').eq('clinic_id', clinicId).order('created_at', { ascending: false });
            setCampaigns(cData || []);

            const { data: lData } = await supabase.from('crm_leads').select('*').limit(500); // Simplification: get some leads
            setLeads(lData || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [clinicId]);

    const handleSyncTemplates = async () => {
        setFetchingTemplates(true);
        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'fetch-templates' }
            });
            
            if (error) {
                // Try to extract message from the function response body
                let errorMsg = error.message;
                try {
                    const body = await error.context.json();
                    if (body.error) errorMsg = body.error;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            alert(`✅ ${data.count} plantillas sincronizadas.`);
            fetchData();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setFetchingTemplates(false);
        }
    };

    const handleCreateCampaign = async (e) => {
        e.preventDefault();
        if (!selectedTemplate || !newCampaignName) return alert("Faltan datos");

        try {
            const { data, error } = await supabase.from('whatsapp_campaigns').insert({
                clinic_id: clinicId,
                name: newCampaignName,
                template_id: selectedTemplate.id,
                status: 'draft',
                total_recipients: selectedLeads.length
            }).select().single();

            if (error) throw error;
            setCampaigns([data, ...campaigns]);
            setNewCampaignName("");
            setSelectedLeads([]);
            alert("Campaña creada como borrador.");
        } catch (err) {
            alert(err.message);
        }
    };

    const handleSendCampaign = async (campaign) => {
        if (!confirm(`¿Estás seguro de enviar esta campaña a ${campaign.total_recipients} destinatarios?`)) return;

        setExecuting(campaign.id);
        try {
            // Get recipients details
            const { data: logs } = await supabase.from('whatsapp_campaign_logs').select('lead_id').eq('campaign_id', campaign.id);
            const alreadySentIds = logs?.map(l => l.lead_id) || [];
            
            // For now, we reuse the selectedLeads if it's a draft, or we should have stored them.
            // In a real scenario, we'd query the targets. 
            // Let's assume for the MVP we send to all "Nuevo" status leads if it's the first time.
            const { data: targets } = await supabase.from('crm_leads').select('id, celular, nombres_completos').eq('estado', 'Nuevo').limit(campaign.total_recipients);
            
            const recipients = targets.map(t => ({
                phone: t.celular,
                leadId: t.id,
                name: t.nombres_completos
            }));

            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: { action: 'send-campaign', campaignId: campaign.id, recipients }
            });

            if (error) throw error;
            alert(`Campaña finalizada. Enviados: ${data.sent}, Fallidos: ${data.failed}`);
            fetchData();
        } catch (err) {
            alert(err.message);
        } finally {
            setExecuting(null);
        }
    };

    return (
        <div className="whatsapp-campaigns-container fade-in">
            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <div>
                    <h2 style={{ margin: 0 }}>🚀 Campañas de WhatsApp</h2>
                    <p className="text-muted">Envía mensajes masivos usando plantillas autorizadas por Meta.</p>
                </div>
                <button className="btn-process" onClick={handleSyncTemplates} disabled={fetchingTemplates}>
                    {fetchingTemplates ? "Sincronizando..." : "🔄 Sincronizar Plantillas"}
                </button>
            </div>

            <div className="tabs-pro" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button className={activeTab === 'campaigns' ? 'active' : ''} onClick={() => setActiveTab('campaigns')}>Campañas</button>
                <button className={activeTab === 'templates' ? 'active' : ''} onClick={() => setActiveTab('templates')}>Plantillas Disponibles ({templates.length})</button>
            </div>

            {activeTab === 'campaigns' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '25px' }}>
                    <div className="campaign-list">
                        <h3 style={{ marginBottom: '15px' }}>Mis Campañas</h3>
                        {campaigns.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--glass-bg)', borderRadius: '15px', border: '1px dashed var(--glass-border)' }}>
                                No has creado campañas aún.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {campaigns.map(c => (
                                    <div key={c.id} className="card-v4" style={{ padding: '20px', borderRadius: '15px', background: 'var(--card-bg)', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 5px 0' }}>{c.name}</h4>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Plantilla: <strong>{c.whatsapp_templates?.name}</strong> • 
                                                Estado: <span className={`status-pill ${c.status}`} style={{ fontSize: '0.7rem' }}>{c.status}</span>
                                            </div>
                                            <div style={{ marginTop: '10px', display: 'flex', gap: '15px' }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Destinatarios</div>
                                                    <strong>{c.total_recipients}</strong>
                                                </div>
                                                <div style={{ textAlign: 'center', color: 'var(--success)' }}>
                                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Enviados</div>
                                                    <strong>{c.sent_count}</strong>
                                                </div>
                                                <div style={{ textAlign: 'center', color: 'var(--danger)' }}>
                                                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Fallidos</div>
                                                    <strong>{c.failed_count}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            {c.status === 'draft' && (
                                                <button className="btn-process" onClick={() => handleSendCampaign(c)} disabled={executing === c.id}>
                                                    {executing === c.id ? "Enviando..." : "🚀 Iniciar Envío"}
                                                </button>
                                            )}
                                            {c.status === 'completed' && (
                                                <button className="btn-secondary" style={{ fontSize: '0.8rem' }}>Ver Reporte</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="create-campaign-sidebar">
                        <div className="card" style={{ padding: '20px', background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid var(--primary)', borderRadius: '15px' }}>
                            <h3 style={{ margin: '0 0 15px 0' }}>Nueva Campaña</h3>
                            <form onSubmit={handleCreateCampaign} className="premium-form-v">
                                <div className="form-group">
                                    <label>Nombre de la Campaña</label>
                                    <input type="text" value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} placeholder="Ej: Promo Abril" required />
                                </div>
                                <div className="form-group">
                                    <label>Seleccionar Plantilla Meta</label>
                                    <select value={selectedTemplate?.id || ""} onChange={e => setSelectedTemplate(templates.find(t => t.id === e.target.value))} required>
                                        <option value="">-- Elige una --</option>
                                        {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Enviar a prospectos con estado:</label>
                                    <select disabled>
                                        <option>Nuevos (Automático)</option>
                                    </select>
                                    <small className="text-muted">Por ahora se enviará a todos los prospectos en estado "Nuevo".</small>
                                </div>
                                <button type="submit" className="btn-process" style={{ width: '100%', marginTop: '10px' }}>
                                    Crear Borrador
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'templates' && (
                <div className="templates-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {templates.map(t => (
                        <div key={t.id} className="card" style={{ padding: '15px', borderRadius: '12px', background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <strong style={{ fontSize: '0.9rem' }}>{t.name}</strong>
                                <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}>{t.language}</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8, background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', minHeight: '80px' }}>
                                {t.components.find(c => c.type === 'BODY')?.text}
                            </div>
                            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <small className="text-muted">{t.category}</small>
                                <span className={`status-pill ${t.status?.toLowerCase()}`} style={{ fontSize: '0.6rem' }}>{t.status}</span>
                            </div>
                        </div>
                    ))}
                    {templates.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center' }}>
                            No hay plantillas sincronizadas. Haz clic en "Sincronizar Plantillas".
                        </div>
                    )}
                </div>
            )}

            <style>{`
                .whatsapp-campaigns-container { padding: 20px; }
                .tabs-pro button { background: none; border: none; padding: 10px 20px; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
                .tabs-pro button.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: bold; }
                .status-pill.draft { background: rgba(156, 163, 175, 0.1); color: #9ca3af; }
                .status-pill.sending { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
                .status-pill.completed { background: rgba(16, 185, 129, 0.1); color: #10b981; }
                .status-pill.failed { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                .status-pill.approved { background: rgba(16, 185, 129, 0.1); color: #10b981; }
            `}</style>
        </div>
    );
}
