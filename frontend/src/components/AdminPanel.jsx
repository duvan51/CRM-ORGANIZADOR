import { useState, useEffect } from "react";

const AdminPanel = ({ token, onBack, userRole }) => {

    const [agendas, setAgendas] = useState([]);
    const [users, setUsers] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [configServicios, setConfigServicios] = useState([]); // Locales (legacy)
    const [globalServices, setGlobalServices] = useState([]);  // Catálogo Maestro
    const [agendaServices, setAgendaServices] = useState([]);  // Asignaciones con Descuento
    const [newAgenda, setNewAgenda] = useState({ name: "", description: "", slots_per_hour: 1 });
    const [newUser, setNewUser] = useState({ username: "", password: "", full_name: "", role: "agent" });
    const [newBlock, setNewBlock] = useState({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "" });
    const [newAlert, setNewAlert] = useState({ agenda_id: "", mensaje: "", tipo: "info" });
    const [loading, setLoading] = useState(false);
    const [activeView, setActiveView] = useState(userRole === "superuser" ? "agendas" : "bloqueos");


    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const h = { "Authorization": `Bearer ${token}` };

            // 1. Obtener Agendas (según rol, el backend filtra)
            const agRes = await fetch("http://localhost:8000/agendas", { headers: h });
            const agData = await agRes.json();
            const agendasList = Array.isArray(agData) ? agData : [];
            setAgendas(agendasList);

            // 2. Si es superuser, obtener Usuarios
            if (userRole === "superuser") {
                const usRes = await fetch("http://localhost:8000/users", { headers: h });
                if (usRes.ok) setUsers(await usRes.json());
            }

            // 3. Obtener Bloqueos y Alertas iterando por agenda (porque no hay endpoint global)
            let allBlocks = [];
            let allAlerts = [];
            let allHorarios = [];
            let allConfigs = [];

            for (const ag of agendasList) {
                try {
                    const [bRes, aRes, hRes, cRes] = await Promise.all([
                        fetch(`http://localhost:8000/agendas/${ag.id}/bloqueos`, { headers: h }),
                        fetch(`http://localhost:8000/agendas/${ag.id}/alertas`, { headers: h }),
                        fetch(`http://localhost:8000/agendas/${ag.id}/horarios`, { headers: h }),
                        fetch(`http://localhost:8000/agendas/${ag.id}/config-servicios`, { headers: h })
                    ]);

                    if (bRes.ok) {
                        const bData = await bRes.json();
                        if (Array.isArray(bData)) allBlocks = [...allBlocks, ...bData];
                    }
                    if (aRes.ok) {
                        const aData = await aRes.json();
                        if (Array.isArray(aData)) allAlerts = [...allAlerts, ...aData];
                    }
                    if (hRes.ok) {
                        const hData = await hRes.json();
                        if (Array.isArray(hData)) allHorarios = [...allHorarios, ...hData];
                    }
                    if (cRes.ok) {
                        const cData = await cRes.json();
                        if (Array.isArray(cData)) allConfigs = [...allConfigs, ...cData];
                    }
                } catch (e) { console.error(`Error loading data for agenda ${ag.id}:`, e); }
            }

            setBlocks(allBlocks);
            setAlerts(allAlerts);
            setHorarios(allHorarios);
            setConfigServicios(allConfigs);


        } catch (err) {
            console.error("Error fetching admin data:", err);
            setAgendas([]);
            setUsers([]);
            setBlocks([]);
            setAlerts([]);
        } finally {
            setLoading(false);
        }
    };


    const handleCreateAgenda = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch("http://localhost:8000/agendas", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(newAgenda)
            });
            if (res.ok) {
                setNewAgenda({ name: "", description: "", slots_per_hour: 1 });
                fetchData();
            }
        } catch (err) { alert("Error al crear agenda"); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch("http://localhost:8000/users", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                setNewUser({ username: "", password: "", full_name: "", role: "agent" });
                fetchData();
            }
        } catch (err) { alert("Error al crear usuario"); }
    };

    const assignUser = async (agendaId, userId) => {
        try {
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/assign/${userId}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                alert("Usuario asignado correctamente");
                fetchData();
            }
        } catch (err) { alert("Error al asignar"); }
    };

    const deleteBlock = async (blockId) => {
        try {
            const res = await fetch(`http://localhost:8000/bloqueos/${blockId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                alert("Bloqueo eliminado correctamente");
                fetchData();
            }
        } catch (err) { alert("Error al eliminar bloqueo"); }
    };

    const deleteAlert = async (alertId) => {
        try {
            const res = await fetch(`http://localhost:8000/alertas/${alertId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                alert("Alerta eliminada correctamente");
                fetchData();
            }
        } catch (err) { alert("Error al eliminar alerta"); }
    };

    return (
        <div className="admin-panel-container card" style={{ padding: "40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "30px" }}>
                <h2>{userRole === "superuser" ? "Panel de Súper Administrador" : "Gestión de mi Agenda"}</h2>
                <button onClick={onBack} className="btn-secondary">Volver a la Agenda</button>
            </div>

            <div className="admin-tabs" style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
                {userRole === "superuser" && (
                    <>
                        <button className={`btn-tab ${activeView === "agendas" ? "active" : ""}`} onClick={() => setActiveView("agendas")}>Gestionar Agendas</button>
                        <button className={`btn-tab ${activeView === "users" ? "active" : ""}`} onClick={() => setActiveView("users")}>Gestionar Usuarios</button>
                    </>
                )}
                <button className={`btn-tab ${activeView === "bloqueos" ? "active" : ""}`} onClick={() => setActiveView("bloqueos")}>Bloqueos/Horarios</button>
                <button className={`btn-tab ${activeView === "alertas" ? "active" : ""}`} onClick={() => setActiveView("alertas")}>Alertas/Avisos</button>
                <button className={`btn-tab ${activeView === "config" ? "active" : ""}`} onClick={() => setActiveView("config")}>Configuración Agenda</button>
            </div>



            {activeView === "agendas" && (
                <div className="admin-section">
                    <h3>Crear Nueva Agenda</h3>
                    <form onSubmit={handleCreateAgenda} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 100px", gap: "10px", marginBottom: "40px" }}>
                        <input type="text" placeholder="Nombre (ej: Cali)" value={newAgenda.name} onChange={e => setNewAgenda({ ...newAgenda, name: e.target.value })} required className="custom-file-input" />
                        <input type="text" placeholder="Descripción" value={newAgenda.description} onChange={e => setNewAgenda({ ...newAgenda, description: e.target.value })} className="custom-file-input" />
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.7rem" }}>Cupos/Hora</span>
                            <input type="number" value={newAgenda.slots_per_hour} onChange={e => setNewAgenda({ ...newAgenda, slots_per_hour: parseInt(e.target.value) })} className="custom-file-input" />
                        </div>
                        <button type="submit" className="btn-process" style={{ alignSelf: "end" }}>Crear</button>
                    </form>

                    <h3>Listado de Agendas</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Descripción</th>
                                    <th>Cupos/Hora</th>
                                    <th>Asignar Usuario</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(agendas) && agendas.map(ag => (
                                    <tr key={ag.id}>
                                        <td>{ag.name}</td>
                                        <td>{ag.description}</td>
                                        <td>{ag.slots_per_hour} personas/turno</td>
                                        <td>
                                            <select style={{ padding: "5px", background: "#1e293b", color: "white", borderRadius: "5px" }}
                                                onChange={(e) => assignUser(ag.id, e.target.value)} value="">
                                                <option value="">-- Seleccionar Usuario --</option>
                                                {Array.isArray(users) && users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role})</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                ))}

                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeView === "users" && (
                <div className="admin-section">
                    <h3>Crear Nuevo Usuario</h3>
                    <form onSubmit={handleCreateUser} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "40px" }}>
                        <input type="text" placeholder="Usuario" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} required className="custom-file-input" />
                        <input type="password" placeholder="Contraseña" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required className="custom-file-input" />
                        <input type="text" placeholder="Nombre Full" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} required className="custom-file-input" />
                        <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="custom-file-input">
                            <option value="agent">Agente</option>
                            <option value="admin">Administrador de Agenda</option>
                        </select>
                        <button type="submit" className="btn-process" style={{ gridColumn: "span 2" }}>Crear Usuario</button>
                    </form>

                    <h3>Usuarios Registrados</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Nombre</th>
                                    <th>Rol</th>
                                    <th>Agendas Asignadas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(users) && users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.username}</td>
                                        <td>{u.full_name}</td>
                                        <td>{u.role}</td>
                                        <td>{u.agendas?.map(a => a.name).join(", ")}</td>
                                    </tr>
                                ))}

                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeView === "bloqueos" && (
                <div className="admin-section">
                    <h3>Bloquear Horarios / Días</h3>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "20px" }}>
                        Define rangos de fechas o turnos específicos donde no se podrá agendar.
                    </p>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        await fetch("http://localhost:8000/bloqueos", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            body: JSON.stringify(newBlock)
                        });
                        setNewBlock({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "" });
                        fetchData(); // Refresh data after creating block
                        alert("Bloqueo creado");
                    }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "30px" }}>
                        <select value={newBlock.agenda_id} onChange={e => setNewBlock({ ...newBlock, agenda_id: parseInt(e.target.value) })} required className="custom-file-input">
                            <option value="">-- Agenda --</option>
                            {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <input type="date" value={newBlock.fecha_inicio} onChange={e => setNewBlock({ ...newBlock, fecha_inicio: e.target.value, fecha_fin: e.target.value })} required className="custom-file-input" />
                        <input type="time" value={newBlock.hora_inicio} onChange={e => setNewBlock({ ...newBlock, hora_inicio: e.target.value })} className="custom-file-input" placeholder="Hora Inicio" />
                        <input type="time" value={newBlock.hora_fin} onChange={e => setNewBlock({ ...newBlock, hora_fin: e.target.value })} className="custom-file-input" placeholder="Hora Fin" />
                        <div style={{ gridColumn: "span 4", display: "flex", gap: "20px", alignItems: "center" }}>
                            <label style={{ fontSize: "0.85rem" }}>
                                <input type="checkbox" checked={newBlock.es_todo_el_dia === 1} onChange={e => setNewBlock({ ...newBlock, es_todo_el_dia: e.target.checked ? 1 : 0 })} /> Día Completo
                            </label>
                            <input type="text" placeholder="Motivo (Vacaciones, Mantenimiento...)" value={newBlock.motivo} onChange={e => setNewBlock({ ...newBlock, motivo: e.target.value })} className="custom-file-input" style={{ flex: 1 }} />
                            <button type="submit" className="btn-process">Crear Bloqueo</button>
                        </div>
                    </form>

                    <h3>Bloqueos Existentes</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Agenda</th>
                                    <th>Fecha Inicio</th>
                                    <th>Fecha Fin</th>
                                    <th>Hora Inicio</th>
                                    <th>Hora Fin</th>
                                    <th>Día Completo</th>
                                    <th>Motivo</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(blocks) && blocks.map(block => (
                                    <tr key={block.id}>
                                        <td>{Array.isArray(agendas) && agendas.find(a => a.id === block.agenda_id)?.name || "N/A"}</td>
                                        <td>{block.fecha_inicio}</td>
                                        <td>{block.fecha_fin}</td>
                                        <td>{block.hora_inicio || "N/A"}</td>
                                        <td>{block.hora_fin || "N/A"}</td>
                                        <td>{block.es_todo_el_dia ? "Sí" : "No"}</td>
                                        <td>{block.motivo}</td>
                                        <td>
                                            <button onClick={() => deleteBlock(block.id)} className="btn-delete">Eliminar</button>
                                        </td>
                                    </tr>
                                ))}

                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeView === "config" && (
                <div className="admin-section">
                    <h3>⚙️ Configuración Avanzada de Agenda</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginTop: "20px" }}>
                        {/* Panel de Horarios */}
                        <div className="sub-card" style={{ padding: "20px", background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px solid var(--glass-border)" }}>
                            <h4>Horarios de Atención</h4>
                            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "15px" }}>Define cuándo abre y cierra cada agenda.</p>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const fd = new FormData(e.target);
                                const res = await fetch("http://localhost:8000/horarios", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                    body: JSON.stringify({
                                        agenda_id: parseInt(fd.get("agenda_id")),
                                        dia_semana: parseInt(fd.get("dia_semana")),
                                        hora_inicio: fd.get("hora_inicio"),
                                        hora_fin: fd.get("hora_fin")
                                    })
                                });
                                if (res.ok) { fetchData(); alert("Horario guardado"); }
                            }}>
                                <select name="agenda_id" required className="custom-file-input" style={{ marginBottom: 10 }}>
                                    <option value="">-- Seleccionar Agenda --</option>
                                    {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                                <select name="dia_semana" required className="custom-file-input" style={{ marginBottom: 10 }}>
                                    {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                                </select>
                                <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
                                    <input name="hora_inicio" type="time" required defaultValue="08:00" className="custom-file-input" />
                                    <input name="hora_fin" type="time" required defaultValue="18:00" className="custom-file-input" />
                                </div>
                                <button type="submit" className="btn-process">+ Añadir Horario</button>
                            </form>
                            <div style={{ marginTop: 20, maxHeight: "200px", overflowY: "auto" }}>
                                {horarios.length > 0 ? horarios.map(h => (
                                    <div key={h.id} style={{ fontSize: "0.8rem", padding: "8px 0", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between" }}>
                                        <span><strong>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][h.dia_semana]}</strong>: {h.hora_inicio} - {h.hora_fin}</span>
                                        <span style={{ color: "var(--primary)" }}>{agendas.find(a => a.id === h.agenda_id)?.name}</span>
                                    </div>
                                )) : <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>No hay horarios configurados.</p>}
                            </div>
                        </div>

                        {/* Panel de Catálogo Maestro (Solo Superadmin) */}
                        {userRole === "superuser" && (
                            <div className="sub-card" style={{ padding: "20px", background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px solid var(--glass-border)" }}>
                                <h4>🏢 Catálogo Maestro (Global)</h4>
                                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "15px" }}>Define los servicios base para todas las agendas.</p>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.target);
                                    const res = await fetch("http://localhost:8000/global-services", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                        body: JSON.stringify({
                                            nombre: fd.get("nombre"),
                                            duracion_minutos: parseInt(fd.get("duracion_minutos")),
                                            precio_base: parseFloat(fd.get("precio_base")),
                                            slots: parseInt(fd.get("slots")),
                                            color: fd.get("color")
                                        })
                                    });
                                    if (res.ok) { fetchData(); alert("Servicio Global creado"); e.target.reset(); }
                                }}>
                                    <input name="nombre" placeholder="Nombre Servicio" required className="custom-file-input" style={{ marginBottom: 10 }} />
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                        <input name="precio_base" type="number" placeholder="Precio Base" step="0.01" required className="custom-file-input" />
                                        <input name="duracion_minutos" type="number" placeholder="Minutos" defaultValue="30" required className="custom-file-input" />
                                    </div>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 15 }}>
                                        <input name="slots" type="number" placeholder="Slots" defaultValue="1" style={{ width: 80 }} className="custom-file-input" />
                                        <input name="color" type="color" defaultValue="#3b82f6" style={{ width: 50, height: 40, border: "none" }} />
                                    </div>
                                    <button type="submit" className="btn-process">Crear en Catálogo</button>
                                </form>
                                <div style={{ marginTop: 15, maxHeight: "150px", overflowY: "auto" }}>
                                    {globalServices.map(s => (
                                        <div key={s.id} style={{ fontSize: "0.75rem", padding: "5px", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between" }}>
                                            <span>{s.nombre} - ${s.precio_base}</span>
                                            <span>{s.duracion_minutos} min</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Panel de Asignación por Agenda (Descuentos) */}
                        <div className="sub-card" style={{ padding: "20px", background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px solid var(--glass-border)" }}>
                            <h4>🏷️ Mis Servicios y Descuentos</h4>
                            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "15px" }}>Activa servicios globales y aplica descuentos.</p>
                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const fd = new FormData(e.target);
                                const res = await fetch("http://localhost:8000/agenda-services", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                    body: JSON.stringify({
                                        agenda_id: parseInt(fd.get("agenda_id")),
                                        service_id: parseInt(fd.get("service_id")),
                                        descuento_porcentaje: parseFloat(fd.get("descuento") || 0)
                                    })
                                });
                                if (res.ok) { fetchData(); alert("Servicio asignado a la agenda"); e.target.reset(); }
                            }}>
                                <select name="agenda_id" required className="custom-file-input" style={{ marginBottom: 10 }}>
                                    <option value="">-- Seleccionar Agenda --</option>
                                    {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                                <select name="service_id" required className="custom-file-input" style={{ marginBottom: 10 }}>
                                    <option value="">-- Activar Servicio del Catálogo --</option>
                                    {globalServices.map(s => <option key={s.id} value={s.id}>{s.nombre} (Base: ${s.precio_base})</option>)}
                                </select>
                                <div style={{ marginBottom: 15 }}>
                                    <label style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Descuento (%)</label>
                                    <input name="descuento" type="number" step="0.1" defaultValue="0" className="custom-file-input" />
                                </div>
                                <button type="submit" className="btn-process">Habilitar en Agenda</button>
                            </form>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminPanel;
