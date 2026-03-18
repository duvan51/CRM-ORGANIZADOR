import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { supabase } from '../supabase';

// --- INITIAL TEMPLATES FOR DRAG ---
const AVAILABLE_TRIGGERS = [
    { id: 't_new_reg', content: 'Nuevo Registro / Paciente', type: 'trigger' },
    { id: 't_new_appt', content: 'Cita Agendada', type: 'trigger' },
    { id: 't_cancel_appt', content: 'Cita Cancelada', type: 'trigger' },
    { id: 't_reminder_24h', content: 'Recordatorio 24h Antes', type: 'trigger' },
    { id: 't_time_1h_before', content: '⏱️ 1 Hora Antes de Cita', type: 'trigger' },
    { id: 't_time_post_3d', content: '⏱️ Seguimiento (3 Días Después)', type: 'trigger' },
    { id: 't_time_birthday', content: '🎉 El Día de su Cumpleaños', type: 'trigger' },
    { id: 't_time_monthly', content: '📅 Ejecución Mensual (Día 1)', type: 'trigger' }
];

const AVAILABLE_ACTIONS = [
    { id: 'a_sms', content: 'Enviar SMS', type: 'action', provider: 'infobip', template: '' },
    { id: 'a_email', content: 'Enviar Email', type: 'action', provider: 'aws_ses', template: '', subject: '' },
    { id: 'a_whatsapp', content: 'Enviar WhatsApp', type: 'action', provider: 'whaticket', template: '' },
    { id: 'a_alert', content: 'Crear Alerta Interna', type: 'action', assigned_to: 'admin', template: '' }
];

export default function AutomationsKanban({ clinicId }) {
    const [flows, setFlows] = useState([]);
    const [activeFlowId, setActiveFlowId] = useState(null);
    const [editingAction, setEditingAction] = useState(null);
    const [actionModalOpen, setActionModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (clinicId) {
            fetchFlows();
        }
    }, [clinicId]);

    const fetchFlows = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('automation_flows')
            .select('*')
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Error fetching flows:", error);
        } else {
            if (data && data.length > 0) {
                // Map data from database to state
                const mappedFlows = data.map(dbFlow => ({
                    id: dbFlow.id,
                    name: dbFlow.name,
                    trigger: dbFlow.flow_data.trigger || null,
                    actions: dbFlow.flow_data.actions || []
                }));
                setFlows(mappedFlows);
                setActiveFlowId(mappedFlows[0].id);
            } else {
                // Create an initial empty flow in state if new
                const newTempId = `temp_${Date.now()}`;
                setFlows([{ id: newTempId, name: 'Flujo Principal (Confirmación)', trigger: null, actions: [], isNew: true }]);
                setActiveFlowId(newTempId);
            }
        }
        setLoading(false);
    };

    const activeFlow = flows.find(f => f.id === activeFlowId) || flows[0];

    const handleSaveAll = async () => {
        if (!clinicId) return alert("Se requiere Clinic ID");
        setSaving(true);

        try {
            const upsertPromises = flows.map(async (f) => {
                const payload = {
                    clinic_id: clinicId,
                    name: f.name,
                    flow_data: {
                        trigger: f.trigger,
                        actions: f.actions
                    }
                };

                // If it isn't starting with "temp_", it's a UUID from Supabase
                if (!f.id.toString().startsWith('temp_')) {
                    payload.id = f.id;
                }

                const { data, error } = await supabase.from('automation_flows').upsert(payload).select().single();
                if (error) throw error;
                return data; // returns the updated/inserted database row
            });

            const updatedDBFlows = await Promise.all(upsertPromises);

            // Map back UUIDs to state (replaces temp IDs with real UUIDs)
            const mappedFlows = updatedDBFlows.map(dbFlow => ({
                id: dbFlow.id,
                name: dbFlow.name,
                trigger: dbFlow.flow_data.trigger || null,
                actions: dbFlow.flow_data.actions || []
            }));
            setFlows(mappedFlows);

            // Update active ID if it was a temp
            if (activeFlowId && activeFlowId.startsWith('temp_')) {
                const matchingNewFlow = mappedFlows.find(mf => mf.name === activeFlow.name);
                if (matchingNewFlow) setActiveFlowId(matchingNewFlow.id);
            }

            alert("¡Flujos guardados en la Nube exitosamente!");
        } catch (err) {
            console.error("Save error:", err);
            alert("Hubo un error guardando: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateFlow = () => {
        const newId = `temp_${Date.now()}`;
        setFlows([...flows, { id: newId, name: `Nuevo Flujo ${flows.length + 1}`, trigger: null, actions: [], isNew: true }]);
        setActiveFlowId(newId);
    };

    const handleDeleteFlow = async (id) => {
        if (flows.length <= 1) return alert("Debe existir al menos un flujo.");

        // Only call delete on DB if it has a real UUID (not temp)
        if (!id.toString().startsWith('temp_')) {
            const { error } = await supabase.from('automation_flows').delete().eq('id', id);
            if (error) {
                return alert("Error al eliminar de base de datos: " + error.message);
            }
        }

        const newFlows = flows.filter(f => f.id !== id);
        setFlows(newFlows);
        if (activeFlowId === id) setActiveFlowId(newFlows[0].id);
    };

    const onDragEnd = (result) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;

        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        const isFromLibrary = source.droppableId === 'lib_triggers' || source.droppableId === 'lib_actions';

        let draggedItem = null;
        if (source.droppableId === 'lib_triggers') draggedItem = AVAILABLE_TRIGGERS.find(t => t.id === draggableId);
        else if (source.droppableId === 'lib_actions') draggedItem = AVAILABLE_ACTIONS.find(a => a.id === draggableId);
        else if (source.droppableId === 'flow_trigger') draggedItem = activeFlow.trigger;
        else if (source.droppableId === 'flow_actions') draggedItem = activeFlow.actions[source.index];

        if (!draggedItem) return;

        let updatedFlow = { ...activeFlow };

        if (!isFromLibrary) {
            if (source.droppableId === 'flow_trigger') {
                updatedFlow.trigger = null;
            } else if (source.droppableId === 'flow_actions') {
                updatedFlow.actions.splice(source.index, 1);
            }
        } else {
            draggedItem = { ...draggedItem, instanceId: `${draggedItem.id}_${Date.now()}` };
        }

        if (destination.droppableId === 'flow_trigger') {
            if (draggedItem.type !== 'trigger') return alert("Solo puedes poner un Disparador aquí.");
            updatedFlow.trigger = draggedItem;
        } else if (destination.droppableId === 'flow_actions') {
            if (draggedItem.type !== 'action') return alert("Solo puedes poner Acciones aquí.");
            updatedFlow.actions.splice(destination.index, 0, draggedItem);
        }

        setFlows(flows.map(f => f.id === activeFlow.id ? updatedFlow : f));
    };

    const handleEditActionClick = (action) => {
        setEditingAction({ ...action });
        setActionModalOpen(true);
    };

    const handleSaveActionEdit = () => {
        const updatedFlow = { ...activeFlow };
        const index = updatedFlow.actions.findIndex(a => a.instanceId === editingAction.instanceId);
        if (index !== -1) {
            updatedFlow.actions[index] = editingAction;
            setFlows(flows.map(f => f.id === activeFlow.id ? updatedFlow : f));
        }
        setActionModalOpen(false);
        setEditingAction(null);
    };

    const removeActionFromFlow = (instanceId) => {
        const updatedFlow = { ...activeFlow };
        updatedFlow.actions = updatedFlow.actions.filter(a => a.instanceId !== instanceId);
        setFlows(flows.map(f => f.id === activeFlow.id ? updatedFlow : f));
    }

    const removeTriggerFromFlow = () => {
        const updatedFlow = { ...activeFlow };
        updatedFlow.trigger = null;
        setFlows(flows.map(f => f.id === activeFlow.id ? updatedFlow : f));
    }

    const getStyle = (isDragging, draggableStyle, isAction) => ({
        userSelect: 'none',
        padding: '12px',
        margin: '0 0 10px 0',
        backgroundColor: isDragging ? 'var(--primary)' : 'var(--btn-secondary-bg)',
        border: isDragging ? '1px solid var(--primary-hover)' : '1px solid var(--glass-border)',
        borderRadius: '8px',
        color: isDragging ? '#fff' : 'var(--text-main)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'grab',
        boxShadow: isDragging ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
        ...draggableStyle
    });

    if (loading) {
        return <div className="admin-section fade-in" style={{ padding: '40px', textAlign: 'center' }}>Cargando flujos desde Supabase...</div>;
    }

    return (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>Automatizaciones (Flujos Múltiples)</h3>
                <button className="btn-process" onClick={handleSaveAll} disabled={saving}>{saving ? 'Guardando en la Nube...' : '☁️ Guardar en la Nube'}</button>
            </div>

            <div style={{ display: 'flex', gap: '20px', minHeight: '600px' }}>

                {/* SIDEBAR: Lista de Flujos */}
                <div style={{ width: '250px', background: 'var(--card-bg)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <h4 style={{ marginBottom: '15px', color: 'var(--accent)', fontWeight: 'bold' }}>Tus Flujos</h4>
                    <button className="btn-secondary" style={{ width: '100%', marginBottom: '15px' }} onClick={handleCreateFlow}>+ Crear Nuevo Flujo</button>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {flows.map(f => (
                            <div
                                key={f.id}
                                onClick={() => setActiveFlowId(f.id)}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    background: activeFlowId === f.id ? 'var(--primary)' : 'var(--input-bg)',
                                    color: activeFlowId === f.id ? '#ffffff' : 'var(--text-main)',
                                    border: activeFlowId === f.id ? '1px solid var(--primary-hover)' : '1px solid var(--glass-border)',
                                    cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    boxShadow: activeFlowId === f.id ? '0 4px 10px rgba(99, 102, 241, 0.2)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <div style={{ wordBreak: 'break-word', fontSize: '0.9rem', fontWeight: activeFlowId === f.id ? '600' : '400' }}>{f.name}</div>
                                {flows.length > 1 && <button className={activeFlowId === f.id ? "btn-delete-tiny" : ""} style={activeFlowId !== f.id ? { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' } : {}} onClick={(e) => { e.stopPropagation(); handleDeleteFlow(f.id); }}>×</button>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* WORKSPACE & BUILDER */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Editor de nombre de flujo */}
                    <div style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        <input
                            type="text"
                            value={activeFlow?.name || ''}
                            onChange={(e) => setFlows(flows.map(f => f.id === activeFlowId ? { ...f, name: e.target.value } : f))}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 'bold', width: '100%', outline: 'none' }}
                            placeholder="Nombre del flujo"
                        />
                    </div>

                    <DragDropContext onDragEnd={onDragEnd}>
                        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>

                            {/* CANVAS: El Flujo Activo */}
                            <div style={{ flex: 2, background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', position: 'relative' }}>
                                <h4 style={{ marginBottom: '20px', color: 'var(--text-main)' }}>Lógica del Flujo</h4>

                                {/* ZONA DISPARADOR */}
                                <div style={{ marginBottom: '30px' }}>
                                    <h5 style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>1. CUÁNDO SUCEDE... (Arrastra aquí 1 Disparador)</h5>
                                    <Droppable droppableId="flow_trigger">
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                style={{
                                                    minHeight: '80px',
                                                    background: snapshot.isDraggingOver ? 'var(--btn-secondary-bg)' : 'var(--input-bg)',
                                                    border: snapshot.isDraggingOver ? '1px dashed var(--primary)' : '1px dashed var(--glass-border)',
                                                    borderRadius: '8px',
                                                    padding: '10px',
                                                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {activeFlow?.trigger ? (
                                                    <Draggable draggableId={activeFlow.trigger.instanceId || activeFlow.trigger.id} index={0}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={getStyle(snapshot.isDragging, provided.draggableProps.style, false)}
                                                            >
                                                                <div style={{ fontWeight: '500' }}><span style={{ marginRight: '8px' }}>⚡</span>{activeFlow.trigger.content}</div>
                                                                <button onClick={(e) => { e.preventDefault(); removeTriggerFromFlow(); }} className="btn-delete-tiny">×</button>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ) : (
                                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Mueve un disparador aquí</div>
                                                )}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>

                                {/* FLECHA */}
                                <div style={{ textAlign: 'center', margin: '15px 0', color: 'var(--text-muted)', fontSize: '1.5rem' }}>⬇️</div>

                                {/* ZONA ACCIONES */}
                                <div>
                                    <h5 style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>2. EJECUTAR ACCIONES... (En Orden)</h5>
                                    <Droppable droppableId="flow_actions">
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                style={{
                                                    minHeight: '200px',
                                                    background: snapshot.isDraggingOver ? 'var(--btn-secondary-bg)' : 'var(--input-bg)',
                                                    border: snapshot.isDraggingOver ? '1px dashed var(--primary)' : '1px dashed var(--glass-border)',
                                                    borderRadius: '8px',
                                                    padding: '10px',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {activeFlow?.actions.map((action, index) => (
                                                    <Draggable key={action.instanceId} draggableId={action.instanceId} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={getStyle(snapshot.isDragging, provided.draggableProps.style, true)}
                                                            >
                                                                <div>
                                                                    <span style={{ marginRight: '8px' }}>🚀</span>
                                                                    <span style={{ fontWeight: '500' }}>{action.content}</span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--primary)', marginLeft: '10px', fontWeight: 'bold' }}>
                                                                        ({action.provider})
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                                    <button onClick={(e) => { e.preventDefault(); handleEditActionClick(action); }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>⚙️ Edit</button>
                                                                    <button onClick={(e) => { e.preventDefault(); removeActionFromFlow(action.instanceId) }} className="btn-delete-tiny">×</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {activeFlow?.actions.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px' }}>Suelta acciones aquí para construir tu flujo</div>}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            </div>

                            {/* LIBRERÍA DE ELEMENTOS */}
                            <div style={{ flex: 1, background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', overflowY: 'auto' }}>
                                <h4 style={{ marginBottom: '20px', color: 'var(--text-main)' }}>Herramientas</h4>

                                <h5 style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>Disparadores Disponibles</h5>
                                <Droppable droppableId="lib_triggers" isDropDisabled={true}>
                                    {(provided) => (
                                        <div ref={provided.innerRef} {...provided.droppableProps} style={{ marginBottom: '20px' }}>
                                            {AVAILABLE_TRIGGERS.map((t, index) => (
                                                <Draggable key={t.id} draggableId={t.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <>
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={getStyle(snapshot.isDragging, provided.draggableProps.style, false)}
                                                            >
                                                                <div style={{ fontWeight: '500' }}><span style={{ marginRight: '8px' }}>⚡</span>{t.content}</div>
                                                            </div>
                                                            {snapshot.isDragging && (
                                                                <div style={{ padding: '12px', margin: '0 0 10px 0', border: '1px dashed var(--glass-border)', borderRadius: '8px', color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                                                    Copiando Disparador...
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>

                                <h5 style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>Acciones Disponibles</h5>
                                <Droppable droppableId="lib_actions" isDropDisabled={true}>
                                    {(provided) => (
                                        <div ref={provided.innerRef} {...provided.droppableProps}>
                                            {AVAILABLE_ACTIONS.map((a, index) => (
                                                <Draggable key={a.id} draggableId={a.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <>
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                style={getStyle(snapshot.isDragging, provided.draggableProps.style, true)}
                                                            >
                                                                <div style={{ fontWeight: '500' }}><span style={{ marginRight: '8px' }}>🚀</span>{a.content}</div>
                                                            </div>
                                                            {snapshot.isDragging && (
                                                                <div style={{ padding: '12px', margin: '0 0 10px 0', border: '1px dashed var(--glass-border)', borderRadius: '8px', color: 'var(--text-muted)', background: 'var(--input-bg)' }}>
                                                                    Copiando Acción...
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </div>

                        </div>
                    </DragDropContext>
                </div>
            </div>

            {/* MODAL CONFIGURACIÓN ACCIÓN */}
            {actionModalOpen && editingAction && (
                <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)' }}>
                    <div className="modal-content premium-modal" style={{ maxWidth: '500px', background: 'var(--card-bg)' }}>
                        <h3 style={{ color: 'var(--text-main)' }}>Configurar: {editingAction.content}</h3>
                        <div className="premium-form">

                            <div className="form-group">
                                <label style={{ color: 'var(--text-muted)' }}>Proveedor (Vía de Envío)</label>
                                <select
                                    className="custom-file-input"
                                    value={editingAction.provider}
                                    onChange={(e) => setEditingAction({ ...editingAction, provider: e.target.value })}
                                    style={{ background: 'var(--input-bg)', color: 'var(--text-main)', border: '1px solid var(--glass-border)' }}
                                >
                                    {editingAction.id === 'a_sms' && (
                                        <>
                                            <option value="infobip">Infobip</option>
                                            <option value="twilio">Twilio</option>
                                        </>
                                    )}
                                    {editingAction.id === 'a_email' && (
                                        <>
                                            <option value="aws_ses">AWS SES / SMTP Principal</option>
                                            <option value="hostinger">Hostinger SMTP</option>
                                        </>
                                    )}
                                    {editingAction.id === 'a_whatsapp' && (
                                        <>
                                            <option value="whaticket">Servidor Local (Whaticket)</option>
                                            <option value="meta_api">API Oficial Meta</option>
                                        </>
                                    )}
                                    {editingAction.id === 'a_alert' && (
                                        <option value="internal">Sistema CRM</option>
                                    )}
                                </select>
                            </div>

                            {editingAction.id === 'a_email' && (
                                <div className="form-group">
                                    <label style={{ color: 'var(--text-muted)' }}>Asunto del Correo</label>
                                    <input
                                        type="text"
                                        value={editingAction.subject || ''}
                                        onChange={e => setEditingAction({ ...editingAction, subject: e.target.value })}
                                        placeholder="Ej: Confirmación de cita"
                                        style={{ background: 'var(--input-bg)', color: 'var(--text-main)', border: '1px solid var(--glass-border)', padding: '10px', borderRadius: '8px', width: '100%' }}
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label style={{ color: 'var(--text-muted)' }}>Mensaje / Plantilla</label>
                                <textarea
                                    rows={4}
                                    value={editingAction.template || ''}
                                    onChange={e => setEditingAction({ ...editingAction, template: e.target.value })}
                                    placeholder="Puedes usar variables como {paciente}, {fecha}, {hora}..."
                                    style={{ background: 'var(--input-bg)', color: 'var(--text-main)', border: '1px solid var(--glass-border)', padding: '10px', borderRadius: '8px', width: '100%' }}
                                />
                                <small className="text-muted">Variables válidas: {'{paciente}'}, {'{fecha}'}, {'{hora}'}</small>
                            </div>

                            <div className="modal-footer footer-between" style={{ marginTop: '20px' }}>
                                <button className="btn-secondary" onClick={() => { setActionModalOpen(false); setEditingAction(null); }}>Cancelar</button>
                                <button className="btn-process" onClick={handleSaveActionEdit}>Guardar Ajustes</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
