import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../supabase";

const AdminPanel = ({ token, onBack, userRole }) => {
    console.log("AdminPanel Mount - Role:", userRole);
    const [agendas, setAgendas] = useState([]);
    const [users, setUsers] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [globalServices, setGlobalServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeView, setActiveView] = useState((userRole === "superuser" || userRole === "admin") ? "agendas" : "bloqueos");
    const [selectedAgendaForOffers, setSelectedAgendaForOffers] = useState(null);
    const [agendaOffers, setAgendaOffers] = useState([]);
    const [selectedAgendaForHours, setSelectedAgendaForHours] = useState(null);
    const [allAgendaServices, setAllAgendaServices] = useState([]);

    // States for Modals
    const [showAgentModal, setShowAgentModal] = useState(null); // stores agenda object
    const [showEditAgenda, setShowEditAgenda] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(null); // stores service object for editing
    const [editingAgenda, setEditingAgenda] = useState({ name: "", description: "", slots_per_hour: 1 });
    const [editingService, setEditingService] = useState({ nombre: "", precio_base: 0, duracion_minutos: 30, concurrency: 1, color: "#3b82f6", image_url: "", descripcion: "" });

    const [newAgenda, setNewAgenda] = useState({ name: "", description: "", slots_per_hour: 1 });
    const [newUser, setNewUser] = useState({
        full_name: "",
        username: "",
        email: "",
        password: "",
        role: "agent"
    });
    const [newBlock, setNewBlock] = useState({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "", service_id: "", tipo: 1 });
    const [newAlert, setNewAlert] = useState({ agenda_id: "", mensaje: "", tipo: "info" });

    // Service Hours State
    const [showServiceHoursModal, setShowServiceHoursModal] = useState(null);
    const [serviceHours, setServiceHours] = useState([]);
    const [editingGeneralHour, setEditingGeneralHour] = useState(null);
    const [editingServiceHour, setEditingServiceHour] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchAgendaOffers = async (agenda) => {
        if (!agenda) return;
        const { data } = await supabase.from('agenda_services').select('*, service:global_services(*)').eq('agenda_id', agenda.id);
        setAgendaOffers(data || []);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // Cargar Agendas con sus usuarios vinculados para detectar asignaciones
            const { data: agData, error: agError } = await supabase
                .from('agendas')
                .select('*, users:agenda_users(id:user_id)');

            if (agError) throw agError;
            let agendasList = agData || [];

            // Si es admin (pero no superuser), filtrar solo las agendas asignadas
            if (userRole === "admin") {
                const { data: { session } } = await supabase.auth.getSession();
                agendasList = agendasList.filter(a => a.users && a.users.some(u => u.id === session?.user?.id));
            }

            setAgendas(agendasList);

            // Auto-seleccionar primera agenda si no hay ninguna para servicios
            if (!selectedAgendaForOffers && agendasList.length > 0) {
                setSelectedAgendaForOffers(agendasList[0]);
                fetchAgendaOffers(agendasList[0]);
            } else if (selectedAgendaForOffers) {
                fetchAgendaOffers(selectedAgendaForOffers);
            }

            // Cargar Usuarios (Profiles) si es superuser o admin
            if (userRole === "superuser" || userRole === "admin") {
                const { data: usData, error: usError } = await supabase.from('profiles').select('*, agendas:agenda_users(agenda:agendas(id, name))');
                if (usError) throw usError;
                setUsers(usData || []);
            }

            // Catálogo Maestro
            const { data: sData, error: sError } = await supabase.from('global_services').select('*');
            if (sError) throw sError;
            setGlobalServices(sData || []);

            // Cargar Bloqueos, Alertas, Horarios y Mapeo de Servicios-Agenda
            const [bRes, aRes, hRes, asRes] = await Promise.all([
                supabase.from('bloqueos').select('*'),
                supabase.from('alertas').select('*'),
                supabase.from('horarios_atencion').select('*'),
                supabase.from('agenda_services').select('agenda_id, service_id')
            ]);

            setBlocks(bRes.data || []);
            setAlerts(aRes.data || []);
            setHorarios(hRes.data || []);
            setAllAgendaServices(asRes.data || []);

        } catch (error) { console.error("Error fetching data:", error); }
        setLoading(false);
    };

    const handleClearDay = async (agendaId, dayIndex) => {
        if (!agendaId) return alert("Selecciona una agenda");
        if (!window.confirm("¿Estás seguro de que quieres cerrar todo el día? Se eliminarán todos los rangos horarios.")) return;

        await supabase.from('horarios_atencion')
            .delete()
            .eq('agenda_id', agendaId)
            .eq('dia_semana', dayIndex);

        fetchData();
    };

    const handleUpdateService = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('global_services')
            .update(editingService)
            .eq('id', showServiceModal.id);

        if (!error) {
            setShowServiceModal(null);
            fetchData();
        }
    };

    const handleCreateAgenda = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('agendas').insert(newAgenda);
        if (!error) {
            setNewAgenda({ name: "", description: "", slots_per_hour: 1 });
            setShowEditAgenda(null);
            fetchData();
        }
    };

    const handleDeleteAgenda = async (id) => {
        if (!confirm("¿Estás seguro de eliminar esta agenda y todas sus citas?")) return;
        const { error } = await supabase.from('agendas').delete().eq('id', id);
        if (!error) fetchData();
    };

    const handleUpdateAgenda = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('agendas')
            .update(editingAgenda)
            .eq('id', showEditAgenda.id);
        if (!error) { setShowEditAgenda(null); fetchData(); }
    };

    const toggleAgentAssignment = async (userId, agendaId, isAssigned) => {
        if (isAssigned) {
            await supabase.from('agenda_users')
                .delete()
                .eq('user_id', userId)
                .eq('agenda_id', agendaId);
        } else {
            await supabase.from('agenda_users')
                .insert({ user_id: userId, agenda_id: agendaId });
        }
        fetchData();
    };

    const handleDeleteUser = async (id) => {
        if (!confirm("¿Eliminar este usuario? En Supabase esto desvinculará su perfil.")) return;
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (!error) fetchData();
    };

    const handleCreateCreateBlock = async (e) => {
        e.preventDefault();
        const payload = {
            ...newBlock,
            service_id: newBlock.service_id === "" ? null : parseInt(newBlock.service_id),
            tipo: parseInt(newBlock.tipo)
        };
        const { error } = await supabase.from('bloqueos').insert(payload);
        if (!error) {
            setNewBlock({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "", service_id: "", tipo: 1 });
            fetchData();
            alert("Operación completada con éxito");
        }
    };

    const handleDeleteBlock = async (id) => {
        if (!confirm("¿Eliminar bloqueo?")) return;
        const { error } = await supabase.from('bloqueos').delete().eq('id', id);
        if (!error) fetchData();
    };

    const handleCreateAlert = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('alertas').insert(newAlert);
        if (!error) {
            setNewAlert({ agenda_id: "", mensaje: "", tipo: "info" });
            fetchData();
        }
    };

    const handleDeleteAlert = async (id) => {
        const { error } = await supabase.from('alertas').delete().eq('id', id);
        if (!error) fetchData();
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Crear un cliente temporal que NO guarde la sesión en el navegador
            // Esto evita que el nuevo usuario "reemplace" al superadmin actual.
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            // 2. Crear usuario en Supabase Auth usando el cliente temporal
            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newUser.email,
                password: newUser.password,
                options: {
                    data: {
                        full_name: newUser.full_name,
                        username: newUser.username,
                    }
                }
            });

            if (authError) throw authError;

            // 3. Crear perfil en la tabla 'profiles' usando el cliente principal (Superadmin)
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    username: newUser.username,
                    full_name: newUser.full_name,
                    role: newUser.role
                });

            if (profileError) {
                console.error("Auth creado pero perfil falló:", profileError);
            }

            // 4. SI EL CREADOR ES ADMIN: Vincular automáticamente al nuevo agente a las agendas de este Admin
            if (userRole === "admin" && agendas.length > 0) {
                console.log("DEBUG: Vinculando nuevo agente a las agendas del admin creador...");
                const assignments = agendas.map(ag => ({
                    user_id: authData.user.id,
                    agenda_id: ag.id
                }));

                const { error: linkError } = await supabase
                    .from('agenda_users')
                    .insert(assignments);

                if (linkError) console.error("Error al auto-vincular agente:", linkError);
                else console.log("✅ Agente vinculado a:", agendas.length, "agendas.");
            }

            alert(`Usuario creado correctamente${userRole === "admin" ? " y vinculado a tus agendas" : ""}. Se ha enviado un correo de confirmación.`);
            setShowUserModal(false);
            setNewUser({ full_name: "", username: "", email: "", password: "", role: "agent" });
            fetchData();
        } catch (error) {
            console.error("Error al crear usuario:", error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveService = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const isNew = showServiceModal.id === 'new';
            const payload = {
                nombre: editingService.nombre,
                descripcion: editingService.descripcion,
                precio_base: parseFloat(editingService.precio_base),
                duracion_minutos: parseInt(editingService.duracion_minutos),
                concurrency: parseInt(editingService.concurrency),
                color: editingService.color,
                image_url: editingService.image_url
            };

            let serviceId = showServiceModal.id;

            if (isNew) {
                const { data, error } = await supabase.from('global_services').insert(payload).select();
                if (error) throw error;
                serviceId = data[0].id;

                // Asignar a agendas
                const selectedAgendas = new FormData(e.target).getAll("assign_to");
                if (selectedAgendas.length > 0) {
                    let toAssign = [];
                    if (selectedAgendas.includes("-1")) {
                        toAssign = agendas.map(ag => ({ agenda_id: ag.id, service_id: serviceId }));
                    } else {
                        toAssign = selectedAgendas.map(id => ({ agenda_id: parseInt(id), service_id: serviceId }));
                    }
                    await supabase.from('agenda_services').insert(toAssign);
                }
            } else {
                const { error } = await supabase.from('global_services').update(payload).eq('id', serviceId);
                if (error) throw error;
            }

            alert(isNew ? "Servicio creado con éxito" : "Cambios guardados");
            setShowServiceModal(null);
            fetchData();
        } catch (error) {
            console.error("Error saving service:", error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchServiceHours = async (agendaId, serviceId) => {
        const { data, error } = await supabase.from('horarios_servicios')
            .select('*')
            .eq('agenda_id', agendaId)
            .eq('service_id', serviceId);

        if (!error) setServiceHours(data || []);
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

        let error;
        if (editingServiceHour) {
            const { error: err } = await supabase.from('horarios_servicios')
                .update(payload)
                .eq('id', editingServiceHour.id);
            error = err;
        } else {
            const { error: err } = await supabase.from('horarios_servicios').insert(payload);
            error = err;
        }

        if (!error) {
            setEditingServiceHour(null);
            e.target.reset();
            handleFetchServiceHours(showServiceHoursModal.agenda_id, showServiceHoursModal.service_id);
        }
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

    const renderUsers = () => {
        // Filtrar usuarios para mostrar solo los que el Admin debe ver
        const filteredUsers = users.filter(u => {
            if (userRole === "superuser") return true;
            // Si es admin, ver solo usuarios que compartan al menos una agenda con él
            return u.agendas?.some(ua => agendas.some(ag => ag.id === ua.agenda.id));
        });

        return (
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
                                {userRole === "superuser" && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(u => (
                                <tr key={u.id}>
                                    <td><strong>{u.full_name}</strong></td>
                                    <td>@{u.username}</td>
                                    <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                                    <td>{u.agendas?.map(ua => ua.agenda.name).join(", ") || "Sin acceso"}</td>
                                    {userRole === "superuser" && (
                                        <td>
                                            <button className="btn-delete" style={{ padding: '6px 12px' }} onClick={() => handleDeleteUser(u.id)}>🗑️</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

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
                    <select value={newBlock.service_id} onChange={e => setNewBlock({ ...newBlock, service_id: e.target.value })} disabled={!newBlock.agenda_id}>
                        <option value="">🔥 Todo el sistema de la Agenda</option>
                        {globalServices
                            .filter(s => allAgendaServices.some(as => as.agenda_id === newBlock.agenda_id && as.service_id === s.id))
                            .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)
                        }
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
                        {blocks.filter(b => agendas.some(a => a.id === b.agenda_id)).map(b => (
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
                {alerts.filter(al => agendas.some(a => a.id === al.agenda_id)).map(al => (
                    <div key={al.id} className={`premium-card alert-card ${al.tipo}`}>
                        <span className="alert-agenda-tag">{agendas.find(a => a.id === al.agenda_id)?.name}</span>
                        <p>{al.mensaje}</p>
                        <button className="btn-delete-tiny" onClick={async () => {
                            await supabase.from('alertas').delete().eq('id', al.id);
                            fetchData();
                        }}>×</button>
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
                    {(userRole === "superuser" || userRole === "admin") ? (
                        <form className="premium-form-v" onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.target);
                            const data = {
                                agenda_id: parseInt(fd.get("agenda_id")),
                                dia_semana: parseInt(fd.get("dia_semana")),
                                hora_inicio: fd.get("hora_inicio"),
                                hora_fin: fd.get("hora_fin")
                            };

                            let error;
                            if (editingGeneralHour) {
                                const { error: err } = await supabase.from('horarios_atencion')
                                    .update(data)
                                    .eq('id', editingGeneralHour.id);
                                error = err;
                            } else {
                                const { error: err } = await supabase.from('horarios_atencion').insert(data);
                                error = err;
                            }

                            if (!error) {
                                setEditingGeneralHour(null);
                                e.target.reset();
                                fetchData();
                            }
                        }}>
                            <select name="agenda_id" required defaultValue={editingGeneralHour?.agenda_id || ""}>
                                <option value="">-- Agenda --</option>
                                {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <select name="dia_semana" required defaultValue={editingGeneralHour?.dia_semana ?? ""}>
                                <option value="" disabled>-- Día --</option>
                                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="hora_inicio" type="time" defaultValue={editingGeneralHour?.hora_inicio || "08:00"} required />
                                <input name="hora_fin" type="time" defaultValue={editingGeneralHour?.hora_fin || "18:00"} required />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="submit" className="btn-process" style={{ flex: 2 }}>{editingGeneralHour ? "💾 Guardar Cambios" : "➕ Añadir Horario"}</button>
                                {editingGeneralHour && <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingGeneralHour(null)}>Cancelar</button>}
                            </div>
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
                    ) : <p className="text-muted" style={{ marginBottom: '15px' }}>Vista de horarios configurada por Admin.</p>}

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
                                                <div className="mini-item-actions">
                                                    <button className="btn-edit-tiny" onClick={() => setEditingGeneralHour(h)}>✏️</button>
                                                    <button className="btn-delete-tiny" onClick={async () => {
                                                        await supabase.from('horarios_atencion').delete().eq('id', h.id);
                                                        fetchData();
                                                    }}>×</button>
                                                </div>
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
                            fetchAgendaOffers(ag);
                        }}
                    >
                        <option value="">-- Seleccionar Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>

                    {selectedAgendaForOffers && (
                        <div className="mini-form" style={{ display: 'flex', gap: '10px', flex: 2 }}>
                            <select id="offer-service-select" className="custom-file-input" style={{ flex: 1 }}>
                                <option value="">-- Añadir del Catálogo Maestro --</option>
                                {globalServices
                                    .filter(gs => {
                                        // No mostrar si ya está en esta agenda
                                        if (agendaOffers.some(ao => ao.service_id === gs.id)) return false;
                                        // Superadmin ve todo el resto
                                        if (userRole === "superuser") return true;
                                        // Admin ve solo si está en alguna de sus agendas
                                        return allAgendaServices.some(as => as.service_id === gs.id && agendas.some(ag => ag.id === as.agenda_id));
                                    })
                                    .map(gs => (
                                        <option key={gs.id} value={gs.id}>{gs.nombre} (${gs.precio_base.toLocaleString()})</option>
                                    ))}
                            </select>
                            <button className="btn-process" onClick={async () => {
                                const sid = document.getElementById("offer-service-select").value;
                                if (!sid) return;
                                const { error } = await supabase.from('agenda_services').insert({ agenda_id: selectedAgendaForOffers.id, service_id: parseInt(sid) });
                                if (!error) fetchData();
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
                                            await supabase.from('agenda_services').update({ precio_final: val }).eq('id', off.id);
                                            fetchData();
                                        }}
                                    />
                                    <button className="btn-delete-tiny" onClick={async () => {
                                        if (confirm("¿Desvincular este servicio de la agenda?")) {
                                            await supabase.from('agenda_services').delete().eq('id', off.id);
                                            fetchData();
                                        }
                                    }}>×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Catálogo Maestro visible para superadmin y admin (admin solo lectura y limitado a sus servicios) */}
            <div className="master-catalog-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h4 style={{ margin: 0 }}>🌟 Catálogo Maestro (Global)</h4>
                    {userRole === "superuser" && <button className="btn-process" onClick={() => setShowServiceModal({ id: 'new' })}>+ Nuevo Servicio</button>}
                </div>

                <div className="service-premium-grid">
                    {globalServices
                        .filter(s => {
                            if (userRole === "superuser") return true;
                            // Para admin, mostrar solo si el servicio está en alguna de sus agendas
                            return allAgendaServices.some(as => as.service_id === s.id && agendas.some(ag => ag.id === as.agenda_id));
                        })
                        .map(s => (
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
                                    {userRole === "superuser" && (
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
                                                    const { error } = await supabase.from('global_services').delete().eq('id', s.id);
                                                    if (!error) fetchData();
                                                }
                                            }}>🗑️</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                </div>
            </div>
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

            <main className="admin-content" key={activeView}>
                <div className="admin-screen-wrapper">
                    {activeView === "agendas" && renderAgendas()}
                    {activeView === "users" && renderUsers()}
                    {activeView === "bloqueos" && renderBloqueos()}
                    {activeView === "alertas" && renderAlertas()}
                    {activeView === "servicios" && renderConfigServicios()}
                    {activeView === "horarios" && renderConfigHorarios()}
                </div>
            </main>

            {/* MODAL: MANAGE AGENTS */}
            {/* Service Hour Modal */}
            {showServiceHoursModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: "500px" }}>
                        <h3>Horarios: {showServiceHoursModal.service_name}</h3>
                        <p className="text-muted">Si no defines ningún horario, el servicio sigue el horario general de la agenda. Si agregas al menos uno, SOLO estará disponible en estos rangos.</p>

                        <form className="premium-form-v" onSubmit={handleAddServiceHour} style={{ marginTop: '15px' }}>
                            <select name="dia_semana" required defaultValue={editingServiceHour?.dia_semana ?? ""}>
                                <option value="" disabled>-- Día --</option>
                                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="hora_inicio" type="time" defaultValue={editingServiceHour?.hora_inicio || ""} required />
                                <input name="hora_fin" type="time" defaultValue={editingServiceHour?.hora_fin || ""} required />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="submit" className="btn-process" style={{ flex: 2 }}>{editingServiceHour ? "💾 Guardar" : "➕ Añadir Rango"}</button>
                                {editingServiceHour && <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingServiceHour(null)}>Cancelar</button>}
                            </div>
                        </form>

                        <div className="mini-list" style={{ marginTop: '20px', maxHeight: '300px', overflowY: 'auto' }}>
                            {serviceHours.length === 0 ? <p className="text-muted text-center">Usa horario general</p> :
                                serviceHours.map(h => (
                                    <div key={h.id} className="mini-item-inline range-badge">
                                        <div style={{ flex: 1 }}>
                                            <strong>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][h.dia_semana]}</strong>: {h.hora_inicio} - {h.hora_fin}
                                        </div>
                                        <div className="mini-item-actions">
                                            <button className="btn-edit-tiny" onClick={() => setEditingServiceHour(h)}>✏️</button>
                                            <button className="btn-delete-tiny" onClick={async () => {
                                                const { error } = await supabase.from('horarios_servicios').delete().eq('id', h.id);
                                                if (!error) handleFetchServiceHours(showServiceHoursModal.agenda_id, showServiceHoursModal.service_id);
                                            }}>×</button>
                                        </div>
                                    </div>
                                ))}
                        </div>

                        <div className="modal-actions" style={{ marginTop: '20px', borderTop: '1px solid var(--glass-border)', paddingTop: '15px' }}>
                            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => {
                                setShowServiceHoursModal(null);
                                setEditingServiceHour(null);
                            }}>Cerrar</button>
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
                                <label>Correo Electrónico</label>
                                <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required placeholder="ej: admin@correo.com" />
                            </div>
                            <div className="form-group">
                                <label>Contraseña</label>
                                <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required placeholder="Mínimo 6 caracteres" minLength="6" />
                            </div>
                            <div className="form-group">
                                <label>Rol del Usuario</label>
                                {userRole === 'superuser' ? (
                                    <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="custom-file-input">
                                        <option value="agent">Agente</option>
                                        <option value="admin">Administrador</option>
                                        <option value="superuser">Super Admin</option>
                                    </select>
                                ) : (
                                    <div className="role-badge agent" style={{ padding: '10px', display: 'block', textAlign: 'center' }}>
                                        Rol: Agente (Solo puedes crear agentes)
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowUserModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Creando..." : "Crear Usuario"}
                                </button>
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
                        <form onSubmit={handleSaveService} className="premium-form">
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
