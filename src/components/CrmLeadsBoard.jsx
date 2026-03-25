import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const ESTADOS = [
    { id: "Nuevo", title: "🆕 Nuevos", color: "var(--primary)" },
    { id: "Mensaje Enviado", title: "💬 Mensaje Enviado", color: "#3b82f6" },
    { id: "Llamado", title: "📞 Llamados", color: "#f59e0b" },
    { id: "Agendado", title: "✅ Agendados", color: "var(--success)" },
    { id: "No Interesado", title: "❌ No Interesados", color: "var(--danger)" }
];

export default function CrmLeadsBoard({ user, activeAgenda }) {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [vendedores, setVendedores] = useState([]);
    const [selectedLeads, setSelectedLeads] = useState([]);
    const [massAssignVendedor, setMassAssignVendedor] = useState("");
    const [draggedLead, setDraggedLead] = useState(null);

    const isManager = user.role === "superuser" || user.role === "owner" || user.role === "admin";

    const fetchData = async () => {
        if (!activeAgenda) return;
        setLoading(true);
        try {
            // 1. Fetch Vendedores (Admins can assign to them)
            if (isManager) {
                const { data: vData } = await supabase.from('profiles').select('full_name, username').eq('is_active', true);
                if (vData) setVendedores(vData);
            }

            // 2. Fetch Leads for this Agenda
            let query = supabase.from('crm_leads').select('*').eq('agenda_id', activeAgenda.id).order('created_at', { ascending: false });

            // Agents only see their own assigned leads
            if (!isManager) {
                query = query.eq('vendedor_asignado', user.full_name || user.username);
            }

            const { data, error } = await query;
            if (error) throw error;
            setLeads(data || []);
            setSelectedLeads([]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // refresh every 30s
        return () => clearInterval(interval);
    }, [activeAgenda, user]);

    const updateLeadStatus = async (leadId, newStatus) => {
        try {
            // Optimistic update
            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: newStatus } : l));
            const { error } = await supabase.from('crm_leads').update({ estado: newStatus }).eq('id', leadId);
            if (error) {
                alert("Error al actualizar estado");
                fetchData(); // revert on error
            }
        } catch (e) { console.error(e); }
    };

    const handleMassAssign = async () => {
        if (!massAssignVendedor) return alert("Selecciona un vendedor");
        if (selectedLeads.length === 0) return alert("Selecciona prospectos para asignar");

        try {
            setLoading(true);
            const { error } = await supabase
                .from('crm_leads')
                .update({ vendedor_asignado: massAssignVendedor })
                .in('id', selectedLeads);

            if (error) throw error;
            alert(`✅ ${selectedLeads.length} prospectos asignados a ${massAssignVendedor}`);
            fetchData();
        } catch (e) {
            console.error(e);
            alert("Error al asignar prospectos masivamente");
            setLoading(false);
        }
    };

    const handleDragStart = (e, lead) => {
        setDraggedLead(lead);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image transparency trick
        setTimeout(() => e.target.style.opacity = "0.5", 0);
    };

    const handleDragEnd = (e) => {
        e.target.style.opacity = "1";
        setDraggedLead(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e, targetStatus) => {
        e.preventDefault();
        if (draggedLead && draggedLead.estado !== targetStatus) {
            updateLeadStatus(draggedLead.id, targetStatus);

            // If dropping into Llamado or Mensaje Enviado, tracking action automatically
            if (targetStatus === 'Mensaje Enviado' && draggedLead.celular) {
                window.open(`https://wa.me/57${draggedLead.celular.replace(/\D/g, '')}?text=Hola+${encodeURIComponent(draggedLead.nombres_completos)}`, '_blank');
            }
        }
        setDraggedLead(null);
    };

    const toggleSelection = (id) => {
        setSelectedLeads(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const selectAllNew = () => {
        const nuevos = leads.filter(l => l.estado === 'Nuevo' && (!l.vendedor_asignado || l.vendedor_asignado === "")).map(l => l.id);
        setSelectedLeads(nuevos);
    };

    return (
        <div className="crm-leads-board animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🎯 Tablero de Seguimiento (Leads)
                    </h2>
                    <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)' }}>
                        Gestiona y monitorea los prospectos cargados masivamente.
                    </p>
                </div>

                {isManager && (
                    <div style={{ background: 'var(--glass-bg)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Asignación Masiva:</span>
                        <button className="btn-secondary" onClick={selectAllNew} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Seleccionar "Nuevos" Sin Asignar
                        </button>
                        <select className="custom-file-input" style={{ width: 'auto', padding: '6px', fontSize: '0.8rem' }} value={massAssignVendedor} onChange={e => setMassAssignVendedor(e.target.value)}>
                            <option value="">-- Elige Vendedor --</option>
                            {vendedores.map((v, i) => <option key={i} value={v.full_name || v.username}>{v.full_name || v.username}</option>)}
                        </select>
                        <button className="btn-process" onClick={handleMassAssign} disabled={selectedLeads.length === 0 || !massAssignVendedor} style={{ padding: '6px 15px', fontSize: '0.8rem' }}>
                            Asignar ({selectedLeads.length})
                        </button>
                    </div>
                )}
            </div>

            <div className="kanban-board-pro" style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '20px', minHeight: '600px' }}>
                {ESTADOS.map(col => {
                    const colLeads = leads.filter(l => l.estado === col.id);
                    return (
                        <div
                            key={col.id}
                            className="kanban-column-pro"
                            style={{ minWidth: '300px', flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '15px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column' }}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, col.id)}
                        >
                            <div className="column-header-pro" style={{ borderBottom: `2px solid ${col.color}`, paddingBottom: '10px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{col.title}</h3>
                                <span style={{ background: col.color, color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    {colLeads.length}
                                </span>
                            </div>

                            <div className="column-content-pro" style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                                {colLeads.map(lead => (
                                    <div
                                        key={lead.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, lead)}
                                        onDragEnd={handleDragEnd}
                                        style={{
                                            background: 'var(--card-bg)',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            marginBottom: '10px',
                                            border: `1px solid ${selectedLeads.includes(lead.id) ? 'var(--primary)' : 'var(--glass-border)'}`,
                                            cursor: 'grab',
                                            boxShadow: selectedLeads.includes(lead.id) ? '0 0 0 2px var(--primary)' : 'none',
                                            transition: 'all 0.2s',
                                            opacity: draggedLead?.id === lead.id ? 0.5 : 1
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {isManager && lead.estado === 'Nuevo' && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLeads.includes(lead.id)}
                                                        onChange={() => toggleSelection(lead.id)}
                                                        style={{ cursor: 'pointer', accentColor: 'var(--primary)', transform: 'scale(1.2)' }}
                                                    />
                                                )}
                                                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{lead.nombres_completos}</h4>
                                            </div>
                                            {lead.vendedor_asignado && (
                                                <span title={lead.vendedor_asignado} style={{ fontSize: '0.7rem', background: 'var(--input-bg)', padding: '2px 6px', borderRadius: '4px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    👤 {lead.vendedor_asignado.split(' ')[0]}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {lead.tipo_servicio && <span>🏷️ {lead.tipo_servicio}</span>}
                                            {lead.celular && <span>📱 {lead.celular}</span>}
                                        </div>

                                        <div style={{ display: 'flex', gap: '5px', marginTop: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                                            {lead.celular && (
                                                <button
                                                    onClick={() => window.open(`https://wa.me/57${lead.celular.replace(/\D/g, '')}?text=Hola+${encodeURIComponent(lead.nombres_completos)}`, '_blank')}
                                                    style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'center', transition: 'transform 0.1s' }}
                                                    title="WhatsApp"
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    💬 WA
                                                </button>
                                            )}
                                            {lead.celular && (
                                                <button
                                                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'center', transition: 'transform 0.1s' }}
                                                    title="Llamar"
                                                    onClick={() => updateLeadStatus(lead.id, 'Llamado')}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    📞 Call
                                                </button>
                                            )}
                                            {lead.email && (
                                                <button
                                                    style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'center', transition: 'transform 0.1s' }}
                                                    title="Email"
                                                    onClick={() => updateLeadStatus(lead.id, 'Mensaje Enviado')}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    📧 Mail
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {colLeads.length === 0 && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                                        Arrastra prospectos aquí
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <style>{`
                .kanban-board-pro::-webkit-scrollbar { height: 8px; }
                .kanban-board-pro::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 10px; }
                .kanban-column-pro::-webkit-scrollbar { width: 4px; }
                .kanban-column-pro::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
            `}</style>
        </div>
    );
}
