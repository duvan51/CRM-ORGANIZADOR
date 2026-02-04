import { useState, useEffect } from "react";

const AdminPanel = ({ token, onBack, userRole }) => {
    const [agendas, setAgendas] = useState([]);
    const [users, setUsers] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [globalServices, setGlobalServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeView, setActiveView] = useState(userRole === "superuser" ? "agendas" : "bloqueos");
    const [selectedAgendaForOffers, setSelectedAgendaForOffers] = useState(null);
    const [agendaOffers, setAgendaOffers] = useState([]);
    const [selectedAgendaForHours, setSelectedAgendaForHours] = useState(null);

    // States for Modals
    const [showAgentModal, setShowAgentModal] = useState(null); // stores agenda object
    const [showEditAgenda, setShowEditAgenda] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(null); // stores service object for editing
    const [editingAgenda, setEditingAgenda] = useState({ name: "", description: "", slots_per_hour: 1 });
    const [editingService, setEditingService] = useState({ nombre: "", precio_base: 0, duracion_minutos: 30, concurrency: 1, color: "#3b82f6", image_url: "", descripcion: "" });

    const [newAgenda, setNewAgenda] = useState({ name: "", description: "", slots_per_hour: 1 });
    const [newUser, setNewUser] = useState({ username: "", password: "", full_name: "", role: "agent" });
    const [newBlock, setNewBlock] = useState({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "", service_id: "", tipo: 1 });
    const [newAlert, setNewAlert] = useState({ agenda_id: "", mensaje: "", tipo: "info" });

    // Service Hours State
    const [showServiceHoursModal, setShowServiceHoursModal] = useState(null);
    const [serviceHours, setServiceHours] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const h = { "Authorization": `Bearer ${token}` };
            const agRes = await fetch("http://localhost:8000/agendas", { headers: h });
            const agData = await agRes.json();
            const agendasList = Array.isArray(agData) ? agData : [];
            setAgendas(agendasList);

            if (userRole === "superuser") {
                const usRes = await fetch("http://localhost:8000/users", { headers: h });
                if (usRes.ok) setUsers(await usRes.json());
            }

            // Catálogo Maestro
            const sRes = await fetch("http://localhost:8000/global-services", { headers: h });
            if (sRes.ok) setGlobalServices(await sRes.json());

            // Combinar datos de todas las agendas accesibles
            let allBlocks = [];
            let allAlerts = [];
            let allHorarios = [];
            for (const ag of agendasList) {
                const [bRes, aRes, hRes] = await Promise.all([
                    fetch(`http://localhost:8000/agendas/${ag.id}/bloqueos`, { headers: h }),
                    fetch(`http://localhost:8000/agendas/${ag.id}/alertas`, { headers: h }),
                    fetch(`http://localhost:8000/agendas/${ag.id}/horarios`, { headers: h })
                ]);
                if (bRes.ok) allBlocks = [...allBlocks, ...await bRes.json()];
                if (aRes.ok) allAlerts = [...allAlerts, ...await aRes.json()];
                if (hRes.ok) allHorarios = [...allHorarios, ...await hRes.json()];
            }
            setBlocks(allBlocks);
            setAlerts(allAlerts);
            setHorarios(allHorarios);

            if (selectedAgendaForOffers) {
                const offRes = await fetch(`http://localhost:8000/agendas/${selectedAgendaForOffers.id}/services`, { headers: h });
                if (offRes.ok) setAgendaOffers(await offRes.json());
            }

            if (selectedAgendaForHours) {
                // Horarios ya están en allHorarios, pero forzamos un refetch global por simplicidad
                // o podrías filtrar allHorarios aquí.
            }
        } catch (error) { console.error("Error fetching data:", error); }
        setLoading(false);
    };

    const handleClearDay = async (agendaId, dayIndex) => {
        if (!agendaId) return alert("Selecciona una agenda");
        if (!window.confirm("¿Estás seguro de que quieres cerrar todo el día? Se eliminarán todos los rangos horarios.")) return;

        await fetch(`http://localhost:8000/agendas/${agendaId}/horarios/dia/${dayIndex}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        fetchData();
    };

    const handleUpdateService = async (e) => {
        e.preventDefault();
        const res = await fetch(`http://localhost:8000/global-services/${showServiceModal.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(editingService)
        });
        if (res.ok) {
            setShowServiceModal(null);
            fetchData();
        }
    };

    const handleCreateAgenda = async (e) => {
        e.preventDefault();
        const res = await fetch("http://localhost:8000/agendas", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(newAgenda)
        });
        if (res.ok) {
            setNewAgenda({ name: "", description: "", slots_per_hour: 1 });
            setShowEditAgenda(null);
            fetchData();
        }
    };

    const handleDeleteAgenda = async (id) => {
        if (!confirm("¿Estás seguro de eliminar esta agenda y todas sus citas?")) return;
        const res = await fetch(`http://localhost:8000/agendas/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) fetchData();
    };

    const handleUpdateAgenda = async (e) => {
        e.preventDefault();
        const res = await fetch(`http://localhost:8000/agendas/${showEditAgenda.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(editingAgenda)
        });
        if (res.ok) { setShowEditAgenda(null); fetchData(); }
    };

    const toggleAgentAssignment = async (userId, agendaId, isAssigned) => {
        const method = isAssigned ? "DELETE" : "POST";
        const url = isAssigned
            ? `http://localhost:8000/agendas/${agendaId}/unassign/${userId}`
            : `http://localhost:8000/agendas/${agendaId}/assign/${userId}`;

        const res = await fetch(url, { method, headers: { "Authorization": `Bearer ${token}` } });
        if (res.ok) fetchData();
    };

    const handleDeleteUser = async (id) => {
        if (!confirm("¿Eliminar este usuario?")) return;
        const res = await fetch(`http://localhost:8000/users/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) fetchData();
        else alert("No se puede eliminar al admin principal");
    };

    const handleCreateCreateBlock = async (e) => {
        e.preventDefault();
        const payload = {
            ...newBlock,
            service_id: newBlock.service_id === "" ? null : parseInt(newBlock.service_id),
            tipo: parseInt(newBlock.tipo)
        };
        const res = await fetch("http://localhost:8000/bloqueos", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            setNewBlock({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "", service_id: "", tipo: 1 });
            fetchData();
            alert("Operación completada con éxito");
        }
    };

    const handleDeleteBlock = async (id) => {
        if (!confirm("¿Eliminar bloqueo?")) return;
        const res = await fetch(`http://localhost:8000/bloqueos/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) fetchData();
    };

    const handleCreateAlert = async (e) => {
        e.preventDefault();
        const res = await fetch("http://localhost:8000/alertas", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(newAlert)
        });
        if (res.ok) {
            setNewAlert({ agenda_id: "", mensaje: "", tipo: "info" });
            fetchData();
        }
    };

    const handleDeleteAlert = async (id) => {
        const res = await fetch(`http://localhost:8000/alertas/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) fetchData();
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        const res = await fetch("http://localhost:8000/users", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(newUser)
        });
        if (res.ok) {
            setNewUser({ username: "", password: "", full_name: "", role: "agent" });
            setShowUserModal(false);
            fetchData();
        }
    };

    const handleFetchServiceHours = async (agendaId, serviceId) => {
        const res = await fetch(`http://localhost:8000/agendas/${agendaId}/horarios-servicios`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            const all = await res.json();
            setServiceHours(all.filter(h => h.service_id === serviceId));
        }
    };

    const handleAddServiceHour = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
            agenda_id: showServiceHoursModal.agenda_id,
            service_id: showServiceHoursModal.service_id,
            dia_semana: parseInt(fd.get("dia_semana")),
            hora_inicio: fd.get("hora_inicio"),
            hora_fin: fd.get("hora_fin")
        };
        const res = await fetch("http://localhost:8000/horarios-servicios", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (res.ok) handleFetchServiceHours(showServiceHoursModal.agenda_id, showServiceHoursModal.service_id);
    };

    // --- RENDER HELPERS ---

    const renderAgendas = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>Agendas Activas</h3>
                <button className="btn-process" onClick={() => setShowEditAgenda({ id: 'new' })}>+ Nueva Agenda</button>
            </div>

            <div className="grid-cards">
                {agendas.map(ag => (
                    <div key={ag.id} className="premium-card">
                        <div className="card-badge">{ag.slots_per_hour} cupos/h</div>
                        <h4>{ag.name}</h4>
                        <p>{ag.description || "Sin descripción"}</p>
                        <div className="card-agents">
                            <span>👥 {ag.users?.length || 0} Agentes asignados</span>
                        </div>
                        <div className="card-actions">
                            <button className="btn-edit" onClick={() => {
                                setShowEditAgenda(ag);
                                setEditingAgenda({ name: ag.name, description: ag.description, slots_per_hour: ag.slots_per_hour });
                            }}>⚙️ Editar</button>
                            <button className="btn-secondary" onClick={() => setShowAgentModal(ag)}>👤 Agentes</button>
                            <button className="btn-delete" onClick={() => handleDeleteAgenda(ag.id)}>🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderUsers = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>Gestión de Personal</h3>
                <button className="btn-process" onClick={() => setShowUserModal(true)}>+ Nuevo Usuario</button>
            </div>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Usuario</th>
                            <th>Rol</th>
                            <th>Agendas</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id}>
                                <td><strong>{u.full_name}</strong></td>
                                <td>@{u.username}</td>
                                <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                                <td>{u.agendas?.map(a => a.name).join(", ") || "Sin acceso"}</td>
                                <td>
                                    <button className="btn-delete" style={{ padding: '6px 12px' }} onClick={() => handleDeleteUser(u.id)}>🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderBloqueos = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🚫 Control de Indisponibilidad</h3>
            </div>
            <div className="premium-card" style={{ marginBottom: '30px' }}>
                <h4>Crear Nuevo Bloqueo</h4>
                <form onSubmit={handleCreateCreateBlock} className="premium-form-inline">
                    <select value={newBlock.tipo} onChange={e => setNewBlock({ ...newBlock, tipo: parseInt(e.target.value) })} style={{ border: newBlock.tipo === 2 ? '2px solid #22c55e' : '2px solid #ef4444' }}>
                        <option value="1">🚫 Bloquear</option>
                        <option value="2">✅ Habilitar (Excepción)</option>
                    </select>
                    <select value={newBlock.agenda_id} onChange={e => setNewBlock({ ...newBlock, agenda_id: parseInt(e.target.value) })} required>
                        <option value="">-- Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <select value={newBlock.service_id} onChange={e => setNewBlock({ ...newBlock, service_id: e.target.value })}>
                        <option value="">🔥 Todo el sistema</option>
                        {globalServices.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                    <input type="date" value={newBlock.fecha_inicio} onChange={e => setNewBlock({ ...newBlock, fecha_inicio: e.target.value, fecha_fin: e.target.value })} required />
                    <input type="time" value={newBlock.hora_inicio} onChange={e => setNewBlock({ ...newBlock, hora_inicio: e.target.value })} placeholder="Inicio" />
                    <input type="time" value={newBlock.hora_fin} onChange={e => setNewBlock({ ...newBlock, hora_fin: e.target.value })} placeholder="Fin" />
                    <input type="text" value={newBlock.motivo} onChange={e => setNewBlock({ ...newBlock, motivo: e.target.value })} placeholder="Motivo/Evento" />
                    <button type="submit" className={newBlock.tipo === 2 ? "btn-process success" : "btn-process"}>{newBlock.tipo === 2 ? "Abrir Cupo" : "Bloquear"}</button>
                </form>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Agenda</th>
                            <th>Tipo</th>
                            <th>Servicio</th>
                            <th>Fecha</th>
                            <th>Horario</th>
                            <th>Motivo</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {blocks.map(b => (
                            <tr key={b.id}>
                                <td><strong>{agendas.find(a => a.id === b.agenda_id)?.name}</strong></td>
                                <td>{b.tipo === 2 ? <span className="role-badge agent">✅ HABILITADO</span> : <span className="role-badge danger">🚫 BLOQUEO</span>}</td>
                                <td>{b.service_id ? <span className="role-badge agent">{globalServices.find(s => s.id === b.service_id)?.nombre}</span> : <span className="role-badge superuser">TODO</span>}</td>
                                <td>{b.fecha_inicio}</td>
                                <td>{b.es_todo_el_dia ? "Todo el día" : `${b.hora_inicio} - ${b.hora_fin}`}</td>
                                <td>{b.motivo}</td>
                                <td><button className="btn-delete" onClick={() => handleDeleteBlock(b.id)}>🗑️</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderAlertas = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🔔 Alertas y Avisos</h3>
            </div>
            <div className="premium-card" style={{ marginBottom: '30px' }}>
                <h4>Nueva Alerta</h4>
                <form onSubmit={handleCreateAlert} className="premium-form-inline">
                    <select value={newAlert.agenda_id} onChange={e => setNewAlert({ ...newAlert, agenda_id: parseInt(e.target.value) })} required>
                        <option value="">-- Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="text" value={newAlert.mensaje} onChange={e => setNewAlert({ ...newAlert, mensaje: e.target.value })} placeholder="Mensaje de aviso..." required style={{ flex: 1 }} />
                    <select value={newAlert.tipo} onChange={e => setNewAlert({ ...newAlert, tipo: e.target.value })}>
                        <option value="info">Información (Azul)</option>
                        <option value="warning">Advertencia (Naranja)</option>
                        <option value="danger">Crítico (Rojo)</option>
                    </select>
                    <button type="submit" className="btn-process">Publicar</button>
                </form>
            </div>

            <div className="grid-cards">
                {alerts.map(al => (
                    <div key={al.id} className={`premium-card alert-card ${al.tipo}`}>
                        <span className="alert-agenda-tag">{agendas.find(a => a.id === al.agenda_id)?.name}</span>
                        <p>{al.mensaje}</p>
                        <button className="btn-delete-tiny" onClick={() => handleDeleteAlert(al.id)}>×</button>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderConfigHorarios = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🕒 Gestión de Horarios de Atención</h3>
            </div>

            <div className="config-grid">
                {/* Horarios logic... (Keeping it similar but styled) */}
                <div className="premium-card">
                    <h4>Horarios de Atención</h4>
                    {userRole === "superuser" ? (
                        <form className="premium-form-v" onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.target);
                            await fetch("http://localhost:8000/horarios", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                body: JSON.stringify({
                                    agenda_id: parseInt(fd.get("agenda_id")),
                                    dia_semana: parseInt(fd.get("dia_semana")),
                                    hora_inicio: fd.get("hora_inicio"),
                                    hora_fin: fd.get("hora_fin")
                                })
                            });
                            fetchData();
                        }}>
                            <select name="agenda_id" required>
                                <option value="">-- Agenda --</option>
                                {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <select name="dia_semana" required>
                                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="hora_inicio" type="time" defaultValue="08:00" required />
                                <input name="hora_fin" type="time" defaultValue="18:00" required />
                            </div>
                            <button type="submit" className="btn-process">Añadir Horario</button>
                            <button
                                type="button"
                                className="btn-delete"
                                style={{ width: '100%', marginTop: '5px' }}
                                onClick={(e) => {
                                    const form = e.target.closest('form');
                                    const agendaId = parseInt(new FormData(form).get("agenda_id"));
                                    const dayIndex = parseInt(new FormData(form).get("dia_semana"));
                                    handleClearDay(agendaId, dayIndex);
                                }}
                            >
                                🚫 Marcar día como CERRADO
                            </button>
                        </form>
                    ) : <p className="text-muted" style={{ marginBottom: '15px' }}>Vista de horarios configurada por Superadmin.</p>}

                    <div className="mini-list">
                        {/* Agrupar por dia para mostrar los cerrados */}
                        {[0, 1, 2, 3, 4, 5, 6].map(d => {
                            const diaHorarios = horarios.filter(h => h.dia_semana === d);
                            const diaNombre = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][d];
                            return (
                                <div key={d} className={`schedule-day-row ${diaHorarios.length === 0 ? 'inactive-day' : 'active-day'}`}>
                                    <div className="day-info">
                                        <strong>{diaNombre}</strong>
                                        <span className={`status-pill ${diaHorarios.length > 0 ? 'open' : 'closed'}`}>
                                            {diaHorarios.length > 0 ? 'Operativo' : 'Sin horario (Cerrado)'}
                                        </span>
                                    </div>
                                    <div className="day-ranges">
                                        {diaHorarios.map(h => (
                                            <div key={h.id} className="mini-item-inline range-badge">
                                                <span>{h.hora_inicio}-{h.hora_fin}</span>
                                                <small>{agendas.find(a => a.id === h.agenda_id)?.name}</small>
                                                <button className="btn-delete-tiny" onClick={async () => {
                                                    await fetch(`http://localhost:8000/horarios/${h.id}`, {
                                                        method: "DELETE",
                                                        headers: { "Authorization": `Bearer ${token}` }
                                                    });
                                                    fetchData();
                                                }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderConfigServicios = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🛒 Catálogo de Servicios y Ofertas</h3>
                <p className="text-muted">Gestiona el catálogo maestro y personaliza precios por agenda</p>
            </div>

            <div className="premium-card" style={{ marginBottom: '30px' }}>
                <h4>Gestionar Ofertas por Agenda</h4>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="custom-file-input"
                        style={{ flex: 1, minWidth: '250px' }}
                        value={selectedAgendaForOffers?.id || ""}
                        onChange={(e) => {
                            const ag = agendas.find(a => a.id === parseInt(e.target.value));
                            setSelectedAgendaForOffers(ag);
                            if (ag) {
                                fetch(`http://localhost:8000/agendas/${ag.id}/services`, { headers: { "Authorization": `Bearer ${token}` } })
                                    .then(res => res.json())
                                    .then(data => setAgendaOffers(data));
                            } else {
                                setAgendaOffers([]);
                            }
                        }}
                    >
                        <option value="">-- Seleccionar Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>

                    {selectedAgendaForOffers && (
                        <div className="mini-form" style={{ display: 'flex', gap: '10px', flex: 2 }}>
                            <select id="offer-service-select" className="custom-file-input" style={{ flex: 1 }}>
                                <option value="">-- Añadir del Catálogo Maestro --</option>
                                {globalServices.filter(gs => !agendaOffers.some(ao => ao.service_id === gs.id)).map(gs => (
                                    <option key={gs.id} value={gs.id}>{gs.nombre} (${gs.precio_base.toLocaleString()})</option>
                                ))}
                            </select>
                            <button className="btn-process" onClick={async () => {
                                const sid = document.getElementById("offer-service-select").value;
                                if (!sid) return;
                                const res = await fetch("http://localhost:8000/agenda-services", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                    body: JSON.stringify({ agenda_id: selectedAgendaForOffers.id, service_id: parseInt(sid) })
                                });
                                if (res.ok) fetchData();
                            }}>+ Asignar</button>
                        </div>
                    )}
                </div>

                {selectedAgendaForOffers && (
                    <div className="offers-grid fade-in" style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {agendaOffers.map(off => (
                            <div key={off.id} className="offer-item-premium" style={{ border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{off.service.nombre}</div>
                                    <small style={{ opacity: 0.6 }}>Base: ${off.service.precio_base.toLocaleString()}</small>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => {
                                        setShowServiceHoursModal({
                                            agenda_id: selectedAgendaForOffers.id,
                                            service_id: off.service.id,
                                            service_name: off.service.nombre
                                        });
                                        handleFetchServiceHours(selectedAgendaForOffers.id, off.service.id);
                                    }}>🕒 Horarios</button>
                                    <input
                                        type="number"
                                        defaultValue={off.precio_final}
                                        style={{ width: '90px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', textAlign: 'right' }}
                                        onBlur={async (e) => {
                                            const val = parseFloat(e.target.value);
                                            if (val === off.precio_final) return;
                                            await fetch(`http://localhost:8000/agenda-services/${off.id}`, {
                                                method: "PUT",
                                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                                body: JSON.stringify({ precio_final: val })
                                            });
                                            fetchData();
                                        }}
                                    />
                                    <button className="btn-delete-tiny" onClick={async () => {
                                        if (confirm("¿Desvincular este servicio de la agenda?")) {
                                            await fetch(`http://localhost:8000/agenda-services/${off.id}`, {
                                                method: "DELETE",
                                                headers: { "Authorization": `Bearer ${token}` }
                                            });
                                            fetchData();
                                        }
                                    }}>×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {userRole === "superuser" && (
                <div className="master-catalog-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h4 style={{ margin: 0 }}>🌟 Catálogo Maestro (Global)</h4>
                        <button className="btn-process" onClick={() => setShowServiceModal({ id: 'new' })}>+ Nuevo Servicio</button>
                    </div>

                    <div className="service-premium-grid">
                        {globalServices.map(s => (
                            <div key={s.id} className="service-card-v2" style={{ borderTop: `4px solid ${s.color || 'var(--primary)'}` }}>
                                {s.image_url && (
                                    <div className="service-card-img" style={{ backgroundImage: `url(${s.image_url})` }}></div>
                                )}
                                <div className="service-card-body">
                                    <div className="service-title-row">
                                        <h5>{s.nombre}</h5>
                                        <span className="price-tag">${s.precio_base.toLocaleString()}</span>
                                    </div>
                                    <p className="service-desc">{s.descripcion || "Sin descripción proporcionada."}</p>
                                    <div className="service-meta">
                                        <span>⏱️ {s.duracion_minutos} min</span>
                                        <span>👥 {s.concurrency > 1 ? `${s.concurrency} cupos` : '1 cupo'}</span>
                                    </div>
                                    <div className="service-actions">
                                        <button className="btn-edit-v2" onClick={() => {
                                            setEditingService({
                                                nombre: s.nombre,
                                                precio_base: s.precio_base,
                                                duracion_minutos: s.duracion_minutos,
                                                concurrency: s.concurrency || 1,
                                                color: s.color || "#3b82f6",
                                                image_url: s.image_url || "",
                                                descripcion: s.descripcion || ""
                                            });
                                            setShowServiceModal(s);
                                        }}>✏️ Editar</button>
                                        <button className="btn-delete-v2" onClick={async () => {
                                            if (confirm("¿Eliminar este servicio del catálogo maestro? Esto lo quitará de todas las agendas.")) {
                                                await fetch(`http://localhost:8000/global-services/${s.id}`, {
                                                    method: "DELETE",
                                                    headers: { "Authorization": `Bearer ${token}` }
                                                });
                                                fetchData();
                                            }
                                        }}>🗑️</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="admin-panel-premium">
            <div className="admin-sidebar">
                <div className="sidebar-logo">
                    <h2>CRM Admin</h2>
                    <span>v2.1 Full Access</span>
                </div>
                <nav>
                    <button className={activeView === "agendas" ? "active" : ""} onClick={() => setActiveView("agendas")}>📅 Agendas</button>
                    <button className={activeView === "users" ? "active" : ""} onClick={() => setActiveView("users")}>👥 Personal</button>
                    <button className={activeView === "bloqueos" ? "active" : ""} onClick={() => setActiveView("bloqueos")}>🚫 Bloqueos</button>
                    <button className={activeView === "alertas" ? "active" : ""} onClick={() => setActiveView("alertas")}>🔔 Alertas</button>
                    {(userRole === "superuser" || userRole === "admin") && (
                        <>
                            <button className={activeView === "servicios" ? "active" : ""} onClick={() => setActiveView("servicios")}>🛒 Servicios</button>
                            <button className={activeView === "horarios" ? "active" : ""} onClick={() => setActiveView("horarios")}>🕒 Horarios</button>
                        </>
                    )}
                </nav>
                <button className="btn-back-sidebar" onClick={onBack}>← Volver Agenda</button>
            </div>

            <main className="admin-content">
                {activeView === "agendas" && renderAgendas()}
                {activeView === "users" && renderUsers()}
                {activeView === "bloqueos" && renderBloqueos()}
                {activeView === "alertas" && renderAlertas()}
                {activeView === "servicios" && renderConfigServicios()}
                {activeView === "horarios" && renderConfigHorarios()}
            </main>

            {/* MODAL: MANAGE AGENTS */}
            {/* Service Hour Modal */}
            {showServiceHoursModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: "500px" }}>
                        <h3>Horarios: {showServiceHoursModal.service_name}</h3>
                        <p className="text-muted">Si no defines ningún horario, el servicio sigue el horario general de la agenda. Si agregas al menos uno, SOLO estará disponible en estos rangos.</p>

                        <form className="premium-form-v" onSubmit={handleAddServiceHour} style={{ marginTop: '15px' }}>
                            <select name="dia_semana" required>
                                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="hora_inicio" type="time" required />
                                <input name="hora_fin" type="time" required />
                            </div>
                            <button type="submit" className="btn-process">Añadir Rango</button>
                        </form>

                        <div className="mini-list" style={{ marginTop: '20px', maxHeight: '300px', overflowY: 'auto' }}>
                            {serviceHours.length === 0 ? <p className="text-muted text-center">Usa horario general</p> :
                                serviceHours.map(h => (
                                    <div key={h.id} className="mini-item-inline range-badge">
                                        <strong>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][h.dia_semana]}</strong>: {h.hora_inicio} - {h.hora_fin}
                                        <button className="btn-delete-tiny" onClick={async () => {
                                            await fetch(`http://localhost:8000/horarios-servicios/${h.id}`, {
                                                method: "DELETE",
                                                headers: { "Authorization": `Bearer ${token}` }
                                            });
                                            handleFetchServiceHours(showServiceHoursModal.agenda_id, showServiceHoursModal.service_id);
                                        }}>×</button>
                                    </div>
                                ))}
                        </div>

                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowServiceHoursModal(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Modals */}
            {showAgentModal && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>Gestionar Agentes: {showAgentModal.name}</h3>
                        <p>Selecciona los agentes que tienen permiso para ver esta agenda.</p>
                        <div className="agent-list-scroll">
                            {users.filter(u => u.role !== 'superuser').map(u => {
                                const isAssigned = agendas.find(a => a.id === showAgentModal.id)?.users?.some(au => au.id === u.id);
                                return (
                                    <div key={u.id} className="agent-item-row">
                                        <div className="agent-info">
                                            <strong>{u.full_name}</strong>
                                            <span>@{u.username}</span>
                                        </div>
                                        <button
                                            className={isAssigned ? "btn-delete" : "btn-process"}
                                            onClick={() => toggleAgentAssignment(u.id, showAgentModal.id, isAssigned)}
                                        >
                                            {isAssigned ? "Quitar" : "Asignar"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowAgentModal(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: EDIT/NEW AGENDA */}
            {showEditAgenda && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>{showEditAgenda.id === 'new' ? 'Nueva Agenda' : 'Editar Agenda'}</h3>
                        <form onSubmit={showEditAgenda.id === 'new' ? handleCreateAgenda : handleUpdateAgenda} className="premium-form">
                            <div className="form-group">
                                <label>Nombre de la Agenda</label>
                                <input
                                    type="text"
                                    value={showEditAgenda.id === 'new' ? newAgenda.name : editingAgenda.name}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, name: e.target.value })
                                        : setEditingAgenda({ ...editingAgenda, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Descripción</label>
                                <textarea
                                    value={showEditAgenda.id === 'new' ? newAgenda.description : editingAgenda.description}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, description: e.target.value })
                                        : setEditingAgenda({ ...editingAgenda, description: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Cupos Disponibles por Hora</label>
                                <input
                                    type="number"
                                    value={showEditAgenda.id === 'new' ? newAgenda.slots_per_hour : editingAgenda.slots_per_hour}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, slots_per_hour: parseInt(e.target.value) })
                                        : setEditingAgenda({ ...editingAgenda, slots_per_hour: parseInt(e.target.value) })}
                                    min="1"
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowEditAgenda(null)}>Cancelar</button>
                                <button type="submit" className="btn-process">{showEditAgenda.id === 'new' ? 'Crear Agenda' : 'Guardar Cambios'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: NEW USER */}
            {showUserModal && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>Crear Nuevo Usuario</h3>
                        <form onSubmit={handleCreateUser} className="premium-form">
                            <div className="form-group">
                                <label>Nombre Completo</label>
                                <input type="text" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} required placeholder="Ej: Juan Pérez" />
                            </div>
                            <div className="form-group">
                                <label>Nombre de Usuario</label>
                                <input type="text" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} required placeholder="ej: juan_p" />
                            </div>
                            <div className="form-group">
                                <label>Contraseña</label>
                                <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required placeholder="Mínimo 6 caracteres" />
                            </div>
                            <div className="form-group">
                                <label>Rol del Usuario</label>
                                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                    <option value="agent">Agente (Acceso limitado)</option>
                                    <option value="admin">Administrador (Gestión básica)</option>
                                    <option value="superuser">Superadmin (Acceso total)</option>
                                </select>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowUserModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-process">Crear Usuario</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: EDIT/NEW GLOBAL SERVICE */}
            {showServiceModal && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>{showServiceModal.id === 'new' ? 'Nuevo Servicio Global' : `Editar: ${showServiceModal.nombre}`}</h3>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const payload = {
                                ...editingService,
                                precio_base: parseFloat(editingService.precio_base),
                                duracion_minutos: parseInt(editingService.duracion_minutos),
                                concurrency: parseInt(editingService.concurrency),
                                assign_to_agendas: showServiceModal.id === 'new' ? (new FormData(e.target)).getAll("assign_to").map(Number) : []
                            };

                            const url = showServiceModal.id === 'new'
                                ? "http://localhost:8000/global-services"
                                : `http://localhost:8000/global-services/${showServiceModal.id}`;
                            const method = showServiceModal.id === 'new' ? "POST" : "PUT";

                            const res = await fetch(url, {
                                method,
                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                body: JSON.stringify(payload)
                            });

                            if (res.ok) {
                                setShowServiceModal(null);
                                fetchData();
                            }
                        }} className="premium-form">
                            <div className="form-group">
                                <label>Nombre del Servicio</label>
                                <input
                                    type="text"
                                    value={editingService.nombre}
                                    onChange={e => setEditingService({ ...editingService, nombre: e.target.value })}
                                    required
                                    placeholder="Ej: Sueroterapia Pack x3"
                                />
                            </div>
                            <div className="form-group">
                                <label>Descripción / Detalles</label>
                                <textarea
                                    value={editingService.descripcion}
                                    onChange={e => setEditingService({ ...editingService, descripcion: e.target.value })}
                                    placeholder="Describe los beneficios o el contenido del pack..."
                                    rows="3"
                                />
                            </div>
                            <div className="form-row-three">
                                <div className="form-group">
                                    <label>Precio Base $</label>
                                    <input
                                        type="number"
                                        value={editingService.precio_base}
                                        onChange={e => setEditingService({ ...editingService, precio_base: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Duración (min)</label>
                                    <input
                                        type="number"
                                        value={editingService.duracion_minutos}
                                        onChange={e => setEditingService({ ...editingService, duracion_minutos: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Cupos Simult.</label>
                                    <input
                                        type="number"
                                        value={editingService.concurrency}
                                        onChange={e => setEditingService({ ...editingService, concurrency: e.target.value })}
                                        required
                                        min="1"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Imagen (Link URL)</label>
                                <input
                                    type="url"
                                    value={editingService.image_url}
                                    onChange={e => setEditingService({ ...editingService, image_url: e.target.value })}
                                    placeholder="https://ejemplo.com/imagen.jpg"
                                />
                                {editingService.image_url && (
                                    <div className="img-preview-tiny" style={{ backgroundImage: `url(${editingService.image_url})` }}></div>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Color Distintivo</label>
                                <input
                                    type="color"
                                    value={editingService.color}
                                    onChange={e => setEditingService({ ...editingService, color: e.target.value })}
                                />
                            </div>

                            {showServiceModal.id === 'new' && (
                                <div className="assign-checkboxes-modal">
                                    <label>Asignar automáticamente a:</label>
                                    <div className="checkbox-scroll">
                                        <label className="checkbox-item">
                                            <input type="checkbox" name="assign_to" value="-1" />
                                            <span>⭐ TODAS LAS AGENDAS</span>
                                        </label>
                                        {agendas.map(ag => (
                                            <label key={ag.id} className="checkbox-item">
                                                <input type="checkbox" name="assign_to" value={ag.id} />
                                                <span>{ag.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowServiceModal(null)}>Cancelar</button>
                                <button type="submit" className="btn-process">{showServiceModal.id === 'new' ? 'Crear Servicio' : 'Guardar Cambios'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPanel;
