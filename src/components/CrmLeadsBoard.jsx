import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import ConfirmModal from "./ConfirmModal";

const ESTADOS = [
    { id: "Nuevo", title: "🆕 Nuevos", color: "var(--primary)" },
    { id: "Mensaje Enviado", title: "💬 Mensaje Enviado", color: "#3b82f6" },
    { id: "Llamado", title: "📞 Llamados", color: "#f59e0b" },
    { id: "Agendado", title: "✅ Agendados", color: "var(--success)" },
    { id: "En Construccion", title: "🏗️ En Construcción", color: "#a855f7" },
    { id: "Finalizado", title: "🎉 Finalizados", color: "#06b6d4" },
    { id: "No Interesado", title: "❌ No Interesados", color: "var(--danger)" }
];

const parseObservaciones = (obs) => {
    if (!obs) return { texto_original: "", notas: [], recordatorio_fecha: "", recordatorio_texto: "" };
    const trimmed = obs.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed);
            return {
                texto_original: parsed.texto_original || "",
                notas: parsed.notas || [],
                recordatorio_fecha: parsed.recordatorio_fecha || "",
                recordatorio_texto: parsed.recordatorio_texto || ""
            };
        } catch {
            // fallback
        }
    }
    return { texto_original: obs, notas: [], recordatorio_fecha: "", recordatorio_texto: "" };
};

export default function CrmLeadsBoard({ user, activeAgenda }) {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [vendedores, setVendedores] = useState([]);
    const [selectedLeads, setSelectedLeads] = useState([]);
    const [massAssignVendedor, setMassAssignVendedor] = useState("");
    const [draggedLead, setDraggedLead] = useState(null);
    const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);
    const [newNoteText, setNewNoteText] = useState("");
    const [reminderDate, setReminderDate] = useState("");
    const [reminderText, setReminderText] = useState("");
    const [savingFollowUp, setSavingFollowUp] = useState(false);
    const [hiddenColumns, setHiddenColumns] = useState([]);

    const toggleColumnVisibility = (colId) => {
        setHiddenColumns(prev => 
            prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
        );
    };

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: "",
        message: "",
        confirmText: "Confirmar",
        cancelText: "Cancelar",
        type: "confirm",
        icon: "❓",
        onConfirm: null
    });

    const showAlert = (message, title = "Aviso", icon = "ℹ️") => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            confirmText: "Aceptar",
            cancelText: "",
            type: "alert",
            icon,
            onConfirm: null
        });
    };

    const showConfirm = (message, onConfirm, title = "Confirmar", icon = "❓", type = "confirm") => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            confirmText: "Confirmar",
            cancelText: "Cancelar",
            type,
            icon,
            onConfirm
        });
    };

    const openLeadDetails = (lead) => {
        setSelectedLeadDetails(lead);
        setNewNoteText("");
        
        const parsed = parseObservaciones(lead.observaciones);
        setReminderDate(parsed.recordatorio_fecha || "");
        setReminderText(parsed.recordatorio_texto || "");
    };

    const handleSaveFollowUp = async () => {
        if (!selectedLeadDetails) return;
        setSavingFollowUp(true);
        try {
            const prevObs = selectedLeadDetails.observaciones || "";
            const obsObj = parseObservaciones(prevObs);

            // Add new note if present
            if (newNoteText.trim()) {
                if (!obsObj.notas) obsObj.notas = [];
                obsObj.notas.push({
                    fecha: new Date().toISOString(),
                    vendedor: user.full_name || user.username || "Sistema",
                    texto: newNoteText.trim()
                });
            }

            // Update reminder
            obsObj.recordatorio_fecha = reminderDate;
            obsObj.recordatorio_texto = reminderText.trim();

            const updatedObs = JSON.stringify(obsObj);

            const { error } = await supabase
                .from('crm_leads')
                .update({ observaciones: updatedObs })
                .eq('id', selectedLeadDetails.id);

            if (error) throw error;

            showAlert("Seguimiento guardado correctamente", "Éxito", "✅");
            setNewNoteText("");
            // Update local leads state
            setLeads(prev => prev.map(l => l.id === selectedLeadDetails.id ? { ...l, observaciones: updatedObs } : l));
            // Update selected lead details to reflect changes in UI immediately
            setSelectedLeadDetails(prev => ({ ...prev, observaciones: updatedObs }));
        } catch (e) {
            console.error(e);
            showAlert("Error al guardar el seguimiento", "Error", "❌");
        } finally {
            setSavingFollowUp(false);
        }
    };

    const handleCompleteReminder = async (lead, parsedObs) => {
        try {
            const todayStr = new Date().toLocaleDateString('en-CA');
            if (parsedObs.recordatorio_fecha > todayStr) {
                showAlert("No puedes completar un recordatorio programado para el futuro.", "Acción no Permitida", "⚠️");
                return;
            }

            const obsObj = { ...parsedObs };
            const completedText = obsObj.recordatorio_texto || "Llamar/Hablar con cliente";
            
            // Add automatic note in bitácora
            if (!obsObj.notas) obsObj.notas = [];
            obsObj.notas.push({
                fecha: new Date().toISOString(),
                vendedor: user.full_name || user.username || "Sistema",
                texto: `✅ Recordatorio completado: "${completedText}"`
            });

            // Clear reminder fields
            obsObj.recordatorio_fecha = "";
            obsObj.recordatorio_texto = "";

            const updatedObs = JSON.stringify(obsObj);

            const { error } = await supabase
                .from('crm_leads')
                .update({ observaciones: updatedObs })
                .eq('id', lead.id);

            if (error) throw error;

            showAlert("Recordatorio marcado como realizado", "Éxito", "✅");
            
            // Update local state
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, observaciones: updatedObs } : l));
            
            // Sync open lead details if applicable
            if (selectedLeadDetails && selectedLeadDetails.id === lead.id) {
                setSelectedLeadDetails(prev => ({ ...prev, observaciones: updatedObs }));
                setReminderDate("");
                setReminderText("");
            }
        } catch (e) {
            console.error(e);
            showAlert("Error al completar el recordatorio", "Error", "❌");
        }
    };

    const isManager = user.role === "superuser" || user.role === "owner" || user.role === "admin";

    const fetchData = async () => {
        if (!activeAgenda) return;
        setLoading(true);
        try {
            // 1. Fetch Vendedores (Admins can assign to them)
            if (isManager) {
                const clinicId = user.clinic_id || user.id;
                const { data: vData } = await supabase
                    .from('profiles')
                    .select('full_name, username')
                    .eq('is_active', true)
                    .eq('clinic_id', clinicId);
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
                showAlert("Error al actualizar estado", "Error", "❌");
                fetchData(); // revert on error
            }
        } catch (e) { console.error(e); }
    };

    const handleMassAssign = async () => {
        if (!massAssignVendedor) {
            showAlert("Por favor selecciona un vendedor antes de asignar.", "Selección Requerida", "⚠️");
            return;
        }
        if (selectedLeads.length === 0) {
            showAlert("Selecciona prospectos para asignar.", "Selección Requerida", "⚠️");
            return;
        }

        try {
            setLoading(true);
            const { error } = await supabase
                .from('crm_leads')
                .update({ vendedor_asignado: massAssignVendedor })
                .in('id', selectedLeads);

            if (error) throw error;
            showAlert(`${selectedLeads.length} prospectos asignados a ${massAssignVendedor}`, "Éxito", "✅");
            fetchData();
        } catch (e) {
            console.error(e);
            showAlert("Error al asignar prospectos masivamente", "Error", "❌");
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

            {/* Column Visibility Selector */}
            <div style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: '14px',
                padding: '12px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
            }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    👁️ Columnas Visibles:
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {ESTADOS.map(col => {
                        const isVisible = !hiddenColumns.includes(col.id);
                        return (
                            <button
                                key={col.id}
                                onClick={() => toggleColumnVisibility(col.id)}
                                style={{
                                    background: isVisible ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.01)',
                                    color: isVisible ? 'var(--text-main)' : 'var(--text-muted)',
                                    border: `1px solid ${isVisible ? col.color : 'var(--glass-border)'}`,
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s ease',
                                    opacity: isVisible ? 1 : 0.5
                                }}
                            >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isVisible ? col.color : '#64748b', display: 'inline-block' }} />
                                {col.title}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="kanban-board-pro" style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '20px', minHeight: '600px' }}>
                {ESTADOS.filter(col => !hiddenColumns.includes(col.id)).length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        padding: '60px 20px',
                        background: 'rgba(255,255,255,0.01)',
                        border: '1px dashed var(--glass-border)',
                        borderRadius: '16px',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        gap: '12px'
                    }}>
                        <span style={{ fontSize: '2.5rem' }}>👁️‍🗨️</span>
                        <p style={{ margin: 0, fontWeight: '600', fontSize: '1rem' }}>Todas las columnas de seguimiento están ocultas.</p>
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>Activa alguna columna arriba para visualizar tus prospectos.</p>
                    </div>
                ) : (
                    ESTADOS.filter(col => !hiddenColumns.includes(col.id)).map(col => {
                        const colLeads = leads.filter(l => l.estado === col.id);
                        return (
                            <div
                                key={col.id}
                                className="kanban-column-pro"
                                style={{ minWidth: '300px', flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '15px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column' }}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, col.id)}
                            >
                                <div className="column-header-pro" style={{ borderBottom: `2px solid ${col.color}`, paddingBottom: '10px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{col.title}</h3>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleColumnVisibility(col.id);
                                            }}
                                            title="Ocultar columna"
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-muted)',
                                                cursor: 'pointer',
                                                fontSize: '0.95rem',
                                                padding: '2px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                opacity: 0.5,
                                                transition: 'all 0.2s ease',
                                                borderRadius: '4px'
                                            }}
                                            onMouseEnter={el => { el.currentTarget.style.opacity = 1; el.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                            onMouseLeave={el => { el.currentTarget.style.opacity = 0.5; el.currentTarget.style.background = 'transparent'; }}
                                        >
                                            👁️
                                        </button>
                                    </div>
                                    <span style={{ background: col.color, color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                        {colLeads.length}
                                    </span>
                                </div>

                            <div className="column-content-pro" style={{ flex: 1, overflowY: 'auto', paddingRight: '5px' }}>
                                {colLeads.map(lead => {
                                    const parsedObs = parseObservaciones(lead.observaciones);
                                    const hasReminder = !!parsedObs.recordatorio_fecha;
                                    const notesCount = parsedObs.notas ? parsedObs.notas.length : 0;
                                    
                                    // Calculate if priority (overdue or today)
                                    let isPriority = false;
                                    if (hasReminder) {
                                        const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
                                        isPriority = parsedObs.recordatorio_fecha <= todayStr;
                                    }

                                    return (
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
                                            <div 
                                                className="card-drag-handle" 
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    background: 'rgba(255, 255, 255, 0.02)',
                                                    borderBottom: '1px solid var(--glass-border)',
                                                    margin: '-12px -12px 10px -12px',
                                                    padding: '4px',
                                                    borderTopLeftRadius: '7px',
                                                    borderTopRightRadius: '7px',
                                                    cursor: 'grab',
                                                    color: 'var(--text-muted)',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 'bold',
                                                    letterSpacing: '1px',
                                                    userSelect: 'none'
                                                }}
                                            >
                                                ⣿ ARRASTRAR PARA MOVER ⣿
                                            </div>

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
                                                    <h4 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {lead.nombres_completos}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openLeadDetails(lead);
                                                            }}
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                fontSize: '0.95rem',
                                                                padding: '0',
                                                                color: 'var(--primary)',
                                                                transition: 'transform 0.15s',
                                                                display: 'inline-flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Ver detalles del prospecto"
                                                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.25)'}
                                                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                        >
                                                            👁️
                                                        </button>
                                                    </h4>
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

                                            {/* Reminders & Notes badges */}
                                            {(hasReminder || notesCount > 0) && (
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'center' }}>
                                                    {hasReminder && (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <span 
                                                                title={parsedObs.recordatorio_texto || "Recordatorio sin detalle"}
                                                                className={isPriority ? "priority-glow-badge" : ""}
                                                                style={{
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '600',
                                                                    background: isPriority ? '#ef4444' : 'rgba(59, 130, 246, 0.15)',
                                                                    color: isPriority ? '#ffffff' : '#60a5fa',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '20px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    border: isPriority ? '1px solid #f87171' : '1px solid rgba(59, 130, 246, 0.3)',
                                                                }}
                                                            >
                                                                ⏰ {parsedObs.recordatorio_fecha.split('-').reverse().join('/')}
                                                            </span>
                                                            {isPriority && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        showConfirm("¿Marcar este recordatorio como realizado?", () => {
                                                                            handleCompleteReminder(lead, parsedObs);
                                                                        }, "Confirmar", "⏰");
                                                                    }}
                                                                    style={{
                                                                        background: '#10b981',
                                                                        color: '#ffffff',
                                                                        border: 'none',
                                                                        borderRadius: '50%',
                                                                        width: '18px',
                                                                        height: '18px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '0.75rem',
                                                                        cursor: 'pointer',
                                                                        padding: '0',
                                                                        lineHeight: '1',
                                                                        transition: 'transform 0.1s'
                                                                    }}
                                                                    title="Marcar recordatorio como realizado"
                                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                                >
                                                                    ✓
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    {notesCount > 0 && (
                                                        <span 
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: '600',
                                                                background: 'rgba(16, 185, 129, 0.15)',
                                                                color: '#34d399',
                                                                padding: '2px 8px',
                                                                borderRadius: '20px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                                            }}
                                                        >
                                                            💬 {notesCount} {notesCount === 1 ? 'nota' : 'notas'}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', gap: '5px', marginTop: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                                                {lead.celular && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.open(`https://wa.me/57${lead.celular.replace(/\D/g, '')}?text=Hola+${encodeURIComponent(lead.nombres_completos)}`, '_blank');
                                                        }}
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
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateLeadStatus(lead.id, 'Llamado');
                                                        }}
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
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateLeadStatus(lead.id, 'Mensaje Enviado');
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                    >
                                                        📧 Mail
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {colLeads.length === 0 && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                                        Arrastra prospectos aquí
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }))}
            </div>

            <style>{`
                .kanban-board-pro::-webkit-scrollbar { height: 8px; }
                .kanban-board-pro::-webkit-scrollbar-thumb { background: var(--primary); border-radius: 10px; }
                .kanban-column-pro::-webkit-scrollbar { width: 4px; }
                .kanban-column-pro::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
                
                @keyframes priorityGlow {
                    0% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); transform: scale(1); }
                    50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.8); transform: scale(1.02); }
                    100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); transform: scale(1); }
                }
                .priority-glow-badge {
                    animation: priorityGlow 2s infinite ease-in-out;
                }
            `}</style>

            {selectedLeadDetails && createPortal(
                (() => {
                    const docVal = selectedLeadDetails.documento ? `${selectedLeadDetails.td || 'CC'} ${selectedLeadDetails.documento}` : '';
                    const dateVal = selectedLeadDetails.fecha ? `${selectedLeadDetails.fecha} ${selectedLeadDetails.hora || ''}` : '';
                    const utmVal = selectedLeadDetails.utm_campaign || selectedLeadDetails.utm_source ? 
                        `${selectedLeadDetails.utm_source || ''} ${selectedLeadDetails.utm_campaign ? `(${selectedLeadDetails.utm_campaign})` : ''}` : '';

                    const renderField = (label, val) => {
                        if (val === null || val === undefined || val === "") return null;
                        return (
                            <div key={label} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px'
                            }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {label}
                                </span>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '500', wordBreak: 'break-word' }}>
                                    {val}
                                </span>
                            </div>
                        );
                    };

                    const hasPersonal = selectedLeadDetails.celular || selectedLeadDetails.email || docVal;
                    const hasService = selectedLeadDetails.tipo_servicio || selectedLeadDetails.servicios || dateVal;
                    const hasManagement = selectedLeadDetails.utm_source || selectedLeadDetails.utm_campaign || selectedLeadDetails.created_at;

                    const renderedKeys = ['id', 'agenda_id', 'nombres_completos', 'celular', 'email', 'documento', 'td', 'fecha', 'hora', 'tipo_servicio', 'servicios', 'observaciones', 'vendedor_asignado', 'estado', 'utm_source', 'utm_campaign', 'utm_medium', 'meta_ad_id', 'created_at'];

                    const otherFields = Object.entries(selectedLeadDetails).filter(([key, value]) => {
                        return !renderedKeys.includes(key) && value !== null && value !== undefined && value !== "";
                    });

                    return (
                        <div className="modal-overlay" onClick={() => setSelectedLeadDetails(null)} style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(15, 23, 42, 0.75)',
                            backdropFilter: 'blur(10px)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            zIndex: 10000,
                            padding: '20px'
                        }}>
                            <div className="modal-content animate-in" onClick={e => e.stopPropagation()} style={{
                                background: 'var(--card-bg)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '24px',
                                width: '100%',
                                maxWidth: '700px',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                                overflow: 'hidden',
                                backdropFilter: 'blur(16px)',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '20px 24px',
                                    borderBottom: '1px solid var(--glass-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'rgba(255, 255, 255, 0.01)'
                                }}>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        🎯 Detalle del Prospecto
                                    </h3>
                                    <button 
                                        onClick={() => setSelectedLeadDetails(null)} 
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-muted)',
                                            fontSize: '1.5rem',
                                            cursor: 'pointer',
                                            lineHeight: 1,
                                            padding: '4px',
                                            transition: 'color 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                    >
                                        &times;
                                    </button>
                                </div>
                                
                                {/* Body */}
                                <div style={{
                                    padding: '24px',
                                    maxHeight: '65vh',
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '20px'
                                }}>
                                    {/* Name Header Card */}
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                        padding: '24px 20px',
                                        borderRadius: '16px',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        minHeight: '100px'
                                    }}>
                                        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.5px', textAlign: 'center', lineHeight: '1.2' }}>
                                                {selectedLeadDetails.nombres_completos}
                                            </h4>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    background: 'var(--primary)',
                                                    color: '#fff',
                                                    padding: '3px 10px',
                                                    borderRadius: '20px',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    {selectedLeadDetails.estado}
                                                </span>
                                                {selectedLeadDetails.vendedor_asignado && (
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        background: 'rgba(255, 255, 255, 0.08)',
                                                        color: 'var(--text-muted)',
                                                        border: '1px solid var(--glass-border)',
                                                        padding: '3px 10px',
                                                        borderRadius: '20px',
                                                        fontWeight: '600'
                                                    }}>
                                                        👤 {selectedLeadDetails.vendedor_asignado}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{
                                            position: 'absolute',
                                            top: '-50px',
                                            right: '-50px',
                                            width: '120px',
                                            height: '120px',
                                            background: 'var(--primary)',
                                            filter: 'blur(40px)',
                                            opacity: 0.25,
                                            pointerEvents: 'none'
                                        }} />
                                    </div>

                                    {/* Details Categories */}
                                    {hasPersonal && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.01)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '14px',
                                            padding: '16px'
                                        }}>
                                            <h5 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                👤 Datos de Contacto
                                            </h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                                {renderField("Celular", selectedLeadDetails.celular)}
                                                {renderField("Email", selectedLeadDetails.email)}
                                                {renderField("Identificación", docVal)}
                                            </div>
                                        </div>
                                    )}

                                    {hasService && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.01)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '14px',
                                            padding: '16px'
                                        }}>
                                            <h5 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                🏷️ Servicio Solicitado
                                            </h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                                {renderField("Servicio / Concepto", selectedLeadDetails.tipo_servicio || selectedLeadDetails.servicios)}
                                                {renderField("Fecha / Hora", dateVal)}
                                            </div>
                                        </div>
                                    )}

                                    {hasManagement && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.01)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '14px',
                                            padding: '16px'
                                        }}>
                                            <h5 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                📊 Gestión y Atribución
                                            </h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                                {renderField("Origen / Campaña", utmVal)}
                                                {renderField("Fecha de Ingreso", selectedLeadDetails.created_at ? new Date(selectedLeadDetails.created_at).toLocaleString() : '')}
                                            </div>
                                        </div>
                                    )}

                                    {otherFields.length > 0 && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.01)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '14px',
                                            padding: '16px'
                                        }}>
                                            <h5 style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                🔍 Información Adicional
                                            </h5>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                                {otherFields.map(([key, val]) => renderField(key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), val))}
                                            </div>
                                        </div>
                                    )}

                                    {(() => {
                                        const parsed = parseObservaciones(selectedLeadDetails.observaciones);
                                        
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                                                {/* Bitácora de Notas */}
                                                <div style={{
                                                    background: 'rgba(255, 255, 255, 0.01)',
                                                    border: '1px solid var(--glass-border)',
                                                    borderRadius: '16px',
                                                    padding: '16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '12px'
                                                }}>
                                                    <h5 style={{ margin: '0', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        💬 Bitácora de Seguimiento
                                                    </h5>
                                                    
                                                    {/* Texto Original */}
                                                    {parsed.texto_original && (
                                                        <div style={{
                                                            background: 'rgba(245, 158, 11, 0.04)',
                                                            borderLeft: '3px solid #f59e0b',
                                                            padding: '10px 12px',
                                                            borderRadius: '4px 8px 8px 4px',
                                                            fontSize: '0.85rem',
                                                            lineHeight: '1.4',
                                                            color: 'var(--text-main)',
                                                            whiteSpace: 'pre-wrap'
                                                        }}>
                                                            <strong style={{ display: 'block', fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', marginBottom: '4px' }}>
                                                                Detalle Inicial:
                                                            </strong>
                                                            {parsed.texto_original}
                                                        </div>
                                                    )}

                                                    {/* Historial de Notas */}
                                                    <div style={{
                                                        maxHeight: '180px',
                                                        overflowY: 'auto',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '10px',
                                                        paddingRight: '5px'
                                                    }}>
                                                        {parsed.notas && parsed.notas.length > 0 ? (
                                                            [...parsed.notas].reverse().map((nota, idx) => (
                                                                <div key={idx} style={{
                                                                    background: 'var(--input-bg)',
                                                                    border: '1px solid var(--glass-border)',
                                                                    padding: '10px',
                                                                    borderRadius: '12px',
                                                                    fontSize: '0.85rem'
                                                                }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', opacity: 0.8, fontSize: '0.75rem' }}>
                                                                        <span style={{ fontWeight: '700', color: 'var(--primary)' }}>👤 {nota.vendedor}</span>
                                                                        <span>🗓️ {new Date(nota.fecha).toLocaleString()}</span>
                                                                    </div>
                                                                    <p style={{ margin: 0, color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                                                                        {nota.texto}
                                                                    </p>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div style={{ textAlign: 'center', padding: '15px 0', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                                                Sin notas de seguimiento registradas.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Programar y Agregar */}
                                                <div style={{
                                                    background: 'rgba(255, 255, 255, 0.01)',
                                                    border: '1px solid var(--glass-border)',
                                                    borderRadius: '16px',
                                                    padding: '16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '15px'
                                                }}>
                                                    <h5 style={{ margin: '0', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        ✍️ Registrar Nuevo Seguimiento
                                                    </h5>

                                                    {/* Nueva Nota textarea */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>
                                                            NUEVA NOTA DE SEGUIMIENTO:
                                                        </label>
                                                        <textarea 
                                                            value={newNoteText}
                                                            onChange={e => setNewNoteText(e.target.value)}
                                                            placeholder="Escribe aquí los detalles de tu llamada o contacto..."
                                                            rows="3"
                                                            style={{
                                                                background: 'var(--input-bg)',
                                                                border: '1px solid var(--glass-border)',
                                                                borderRadius: '10px',
                                                                color: 'var(--text-main)',
                                                                padding: '10px',
                                                                fontFamily: 'var(--font-family)',
                                                                fontSize: '0.85rem',
                                                                resize: 'none',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Recordatorio Form */}
                                                    <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                                ⏰ Programar Recordatorio (Alerta de Prioridad)
                                                            </span>
                                                            {(reminderDate || reminderText) && (
                                                                <button 
                                                                    onClick={() => { setReminderDate(""); setReminderText(""); }}
                                                                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                                                                >
                                                                    🗑️ Eliminar Recordatorio
                                                                </button>
                                                            )}
                                                        </div>

                                                        {(() => {
                                                            const todayStr = new Date().toLocaleDateString('en-CA');
                                                            const isPri = reminderDate && reminderDate <= todayStr;
                                                            if (isPri) {
                                                                return (
                                                                    <button
                                                                        onClick={() => {
                                                                            showConfirm("¿Marcar este recordatorio como realizado?", () => {
                                                                                handleCompleteReminder(selectedLeadDetails, parsed);
                                                                            }, "Confirmar", "⏰");
                                                                        }}
                                                                        style={{
                                                                            background: 'rgba(16, 185, 129, 0.1)',
                                                                            color: '#10b981',
                                                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                                                            borderRadius: '8px',
                                                                            padding: '6px 12px',
                                                                            fontSize: '0.8rem',
                                                                            fontWeight: '600',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '5px',
                                                                            marginBottom: '4px',
                                                                            width: 'fit-content'
                                                                        }}
                                                                    >
                                                                        ✅ Marcar Recordatorio como Realizado
                                                                    </button>
                                                                );
                                                            }
                                                            return null;
                                                        })()}

                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>FECHA DE ALERTA:</label>
                                                                <input 
                                                                    type="date"
                                                                    value={reminderDate}
                                                                    onChange={e => setReminderDate(e.target.value)}
                                                                    style={{
                                                                        background: 'var(--input-bg)',
                                                                        border: '1px solid var(--glass-border)',
                                                                        borderRadius: '10px',
                                                                        color: 'var(--text-main)',
                                                                        padding: '8px 10px',
                                                                        fontSize: '0.85rem',
                                                                        fontFamily: 'var(--font-family)',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RAZÓN/DETALLE:</label>
                                                                <input 
                                                                    type="text"
                                                                    value={reminderText}
                                                                    onChange={e => setReminderText(e.target.value)}
                                                                    placeholder="Ej: Llamar a las 3pm"
                                                                    style={{
                                                                        background: 'var(--input-bg)',
                                                                        border: '1px solid var(--glass-border)',
                                                                        borderRadius: '10px',
                                                                        color: 'var(--text-main)',
                                                                        padding: '8px 10px',
                                                                        fontSize: '0.85rem',
                                                                        fontFamily: 'var(--font-family)',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Guardar Button */}
                                                    <button 
                                                        onClick={handleSaveFollowUp}
                                                        disabled={savingFollowUp}
                                                        className="btn-process"
                                                        style={{
                                                            marginTop: '5px',
                                                            padding: '10px 16px',
                                                            borderRadius: '10px',
                                                            fontWeight: '700',
                                                            fontSize: '0.9rem',
                                                            display: 'flex',
                                                            justifyContent: 'center',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            cursor: savingFollowUp ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        {savingFollowUp ? '💾 Guardando...' : '💾 Guardar Seguimiento'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                
                                {/* Footer */}
                                <div style={{
                                    padding: '15px 24px',
                                    borderTop: '1px solid var(--glass-border)',
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    background: 'rgba(255, 255, 255, 0.01)'
                                }}>
                                    <button 
                                        className="btn-secondary" 
                                        onClick={() => setSelectedLeadDetails(null)}
                                        style={{ padding: '8px 20px', borderRadius: '12px', fontWeight: '600' }}
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}
            <ConfirmModal 
                {...confirmModal} 
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
            />
        </div>
    );
}
