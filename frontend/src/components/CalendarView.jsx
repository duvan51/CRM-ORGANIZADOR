import { useState, useEffect } from "react";

const CalendarView = ({ onDateSelect, agendaId, agendas, token, userRole, onEditCita }) => {



    const [currentDate, setCurrentDate] = useState(new Date());
    const [citas, setCitas] = useState([]);
    const [bloqueos, setBloqueos] = useState([]);
    const [alertas, setAlertas] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [configServicios, setConfigServicios] = useState([]);
    const [horariosServicios, setHorariosServicios] = useState([]); // New state for service schedules
    const [serviceFilter, setServiceFilter] = useState(""); // ID of selected service to filter
    const [loading, setLoading] = useState(false);


    const [viewMode, setViewMode] = useState("month"); // "month", "week", "day"

    useEffect(() => {
        if (agendaId) {
            fetchCitas();
            fetchBloqueos();
            fetchAlertas();
            fetchHorarios();
            fetchHorarios();
            fetchConfigServicios(); // This fetches global config, but we need the specific endpoint for this agenda
            fetchServiceSchedules();
        }
    }, [agendaId]);



    const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const currentAgendaData = Array.isArray(agendas) ? agendas.find(a => a.id === agendaId) : null;
    const maxSlots = currentAgendaData?.slots_per_hour || 1;

    const fetchCitas = async () => {

        if (!agendaId) return;
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/citas/${agendaId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await response.json();
            setCitas(data);
        } catch (error) {
            console.error("Error fetching citas:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBloqueos = async () => {
        try {
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/bloqueos`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setBloqueos(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            setBloqueos([]);
        }

    };

    const fetchAlertas = async () => {
        try {
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/alertas`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setAlertas(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
            setAlertas([]);
        }
    };

    const fetchHorarios = async () => {
        try {
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/horarios`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setHorarios(Array.isArray(data) ? data : []);
        } catch (e) { setHorarios([]); }
    };

    const fetchConfigServicios = async () => {
        try {
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/services`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setConfigServicios(Array.isArray(data) ? data : []);
        } catch (e) { setConfigServicios([]); }
    };

    const fetchServiceSchedules = async () => {
        try {
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/horarios-servicios`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setHorariosServicios(Array.isArray(data) ? data : []);
        } catch (e) { setHorariosServicios([]); }
    };

    // Helper to check if a specific time is allowed for the selected service filter
    const isTimeAllowedForService = (date, hour) => {
        if (!serviceFilter) return true; // No filter active

        // Check if service has ANY rules
        const hasRules = horariosServicios.some(hs => hs.service_id === parseInt(serviceFilter));
        if (!hasRules) return true; // Service has no specific rules, so it follows general agenda

        const dayIndex = (date.getDay() + 6) % 7; // 0=Mon
        const [h, m] = hour.split(":").map(Number);

        // Find rules for this service on this day
        const dayRules = horariosServicios.filter(hs => hs.service_id === parseInt(serviceFilter) && hs.dia_semana === dayIndex);

        if (dayRules.length === 0) return false; // Has rules but none for today -> Blocked

        return dayRules.some(rule => {
            return hour >= rule.hora_inicio && hour < rule.hora_fin;
        });
    };


    const handleQuickBlock = async (date) => {
        const dateStr = date.toISOString().split('T')[0];
        const motive = prompt("Motivo del bloqueo (ej: Fuera de servicio, Almuerzo):", "Fuera de servicio");
        if (motive === null) return;

        try {
            const res = await fetch("http://localhost:8000/bloqueos", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    agenda_id: agendaId,
                    fecha_inicio: dateStr,
                    fecha_fin: dateStr,
                    es_todo_el_dia: 1,
                    motivo: motive
                })
            });
            if (res.ok) {
                alert("Horario bloqueado correctamente");
                fetchBloqueos();
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteCita = async (citaId) => {
        if (!confirm("¿Estás seguro de que deseas eliminar esta cita?")) return;
        try {
            const res = await fetch(`http://localhost:8000/citas/${citaId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) fetchCitas();
            else {
                const err = await res.json();
                alert(err.detail || "Error al eliminar");
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        }
    };

    const canModify = (cita) => {
        if (userRole === "superuser" || userRole === "admin") return true;
        const now = new Date();
        const citaDate = new Date(`${cita.fecha}T${cita.hora}`);
        return citaDate > now;
    };

    const handleDayClick = (date) => {
        if (userRole === "superuser" || userRole === "admin") {
            const action = confirm("¿Qué deseas hacer?\n\nACEPTAR: Agendar Cita\nCANCELAR: Poner Fuera de Servicio (Bloquear día)");
            if (action) onDateSelect(date);
            else handleQuickBlock(date);
        } else {
            // RELAX CONCURRENCY BLOCK: Permitir abrir el formulario siempre si es laborativo
            // El backend y el formulario se encargarán de la validación final.
            onDateSelect(date);
        }
    };

    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();



    const renderMonthView = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = getDaysInMonth(year, month);

        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dateObj = new Date(year, month, d);
            const dayOfWeek = (dateObj.getDay() + 6) % 7;

            const dayCitas = citas.filter(c => c.fecha === dateStr);
            const isBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia && b.tipo === 1);
            const hasEnablement = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.tipo === 2);
            const hasSchedule = horarios.some(h => h.dia_semana === dayOfWeek && h.agenda_id === agendaId);

            const isClosed = !hasSchedule && !hasEnablement;

            days.push(
                <div key={d} className={`calendar-day ${isBlocked ? 'blocked-day' : ''} ${isClosed ? 'closed-day' : ''}`} onClick={() => handleDayClick(new Date(year, month, d))}>
                    <span className="day-number">{d}</span>
                    <div className="day-appointments">
                        {isBlocked ? <div className="blocked-label">No disponible</div> : (
                            isClosed ? <div className="closed-label">No laborativo</div> : (
                                <>
                                    {dayCitas.slice(0, 3).map(c => (
                                        <div key={c.id} className="appointment-pill">{c.hora} {c.nombres_completos.split(' ')[0]}</div>
                                    ))}
                                    {dayCitas.length > 3 && <div style={{ fontSize: "0.6rem", color: "var(--primary)" }}>+{dayCitas.length - 3} más</div>}
                                </>
                            )
                        )}
                    </div>
                </div>
            );
        }

        return <div className="calendar-grid">{days}</div>;
    };

    const renderWeekView = () => {
        const startOfWeek = new Date(currentDate);
        const day = currentDate.getDay();
        startOfWeek.setDate(currentDate.getDate() - day);

        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            weekDays.push(date);
        }

        // --- CALCULAR HORAS VISIBLES PARA LA SEMANA ---
        // Buscamos el rango min/max de todas las reglas (horarios regulares + habilitaciones de esta semana)
        let minH = 24, maxH = 0;
        weekDays.forEach(date => {
            const dateStr = date.toISOString().split('T')[0];
            const dayOfWeek = (date.getDay() + 6) % 7;

            // Horarios regulares
            const diaHorarios = horarios.filter(h => h.dia_semana === dayOfWeek && h.agenda_id === agendaId);
            diaHorarios.forEach(h => {
                const start = parseInt(h.hora_inicio.split(":")[0]);
                const end = parseInt(h.hora_fin.split(":")[0]) + (h.hora_fin.split(":")[1] !== "00" ? 1 : 0);
                if (start < minH) minH = start;
                if (end > maxH) maxH = end;
            });

            // Habilitaciones
            const weekHabilitaciones = bloqueos.filter(b => b.tipo === 2 && b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr);
            weekHabilitaciones.forEach(b => {
                if (b.es_todo_el_dia) { minH = 0; maxH = 24; }
                else if (b.hora_inicio && b.hora_fin) {
                    const start = parseInt(b.hora_inicio.split(":")[0]);
                    const end = parseInt(b.hora_fin.split(":")[0]) + (b.hora_fin.split(":")[1] !== "00" ? 1 : 0);
                    if (start < minH) minH = start;
                    if (end > maxH) maxH = end;
                }
            });
        });

        // Si no hay nada configurado, mostramos de 8 a 18 por defecto o todo el rango si hay citas?
        // Mejor 8-18 como fallback razonable para no mostrar un hueco vacío
        if (minH === 24) { minH = 8; maxH = 18; }

        // Ajustar un poco de margen (1 hora antes/después si es posible)
        const finalMin = Math.max(0, minH - 1);
        const finalMax = Math.min(24, maxH + 1);

        const visibleHours = HOURS.filter(h => {
            const hourInt = parseInt(h.split(":")[0]);
            return hourInt >= finalMin && hourInt < finalMax;
        });

        return (
            <div className="time-grid week-view" style={{ minHeight: '600px' }}>
                <div className="time-column">
                    <div className="time-slot-header">Hora</div>
                    {visibleHours.map(h => <div key={h} className="time-slot-label">{h}</div>)}
                </div>
                <div className="days-columns" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flex: 1 }}>
                    {weekDays.map((date, idx) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const dayCitas = citas.filter(c => c.fecha === dateStr);
                        const isDayBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia && b.tipo === 1);

                        return (
                            <div key={idx} className={`day-column ${isDayBlocked ? 'blocked' : ''}`}>
                                <div className="time-slot-header">
                                    {new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(date)}
                                </div>
                                {visibleHours.map(h => {
                                    const slotCitas = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)));
                                    const isSlotBlocked = (bloqueos || []).some(b =>
                                        b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                                        !b.es_todo_el_dia && b.hora_inicio <= h && b.hora_fin > h
                                    );

                                    // Verificar horario de atención para este día (0=Lunes, ..., 6=Domingo)
                                    const dayOfWeek = (date.getDay() + 6) % 7; // Ajustar a 0=Lunes
                                    const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek && hor.agenda_id === agendaId);

                                    // Habilitaciones para este horario exacto
                                    const hasSlotEnablement = (bloqueos || []).some(b =>
                                        b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                                        b.tipo === 2 &&
                                        (b.es_todo_el_dia || (b.hora_inicio <= h && b.hora_fin > h))
                                    );

                                    const isWorkHour = hasSlotEnablement || diaHorarios.some(hor => hor.hora_inicio <= h && hor.hora_fin > h);

                                    const freeSlots = maxSlots - slotCitas.length;
                                    const isServiceBlocked = serviceFilter && !isTimeAllowedForService(date, h);

                                    return (
                                        <div
                                            key={h}
                                            className={`time-slot ${isSlotBlocked ? 'blocked-slot' : ''} ${!isWorkHour ? 'non-work-slot' : ''} ${slotCitas.length === 0 ? 'empty-slot' : ''} ${isServiceBlocked ? 'service-blocked' : ''}`}
                                            onClick={() => {
                                                if (isServiceBlocked) {
                                                    alert("El servicio seleccionado no está disponible en este horario.");
                                                    return;
                                                }
                                                if (!isDayBlocked && !isSlotBlocked && isWorkHour) handleDayClick(new Date(date.setHours(parseInt(h), 0)));
                                            }}
                                            style={isServiceBlocked ? { opacity: 0.3, background: '#000' } : {}}
                                        >
                                            {slotCitas.map(c => (
                                                <div key={c.id} className="appointment-pill compact" title={c.nombres_completos}>
                                                    {c.nombres_completos.split(' ')[0]}
                                                    {canModify(c) && (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); onEditCita(c); }}
                                                            style={{ marginLeft: '5px', cursor: 'pointer', opacity: 0.7 }}
                                                        >✏️</span>
                                                    )}
                                                </div>
                                            ))}
                                            {!isDayBlocked && !isSlotBlocked && isWorkHour && (
                                                <div className="available-indicator">
                                                    {slotCitas.length === 0 ? "Libre" : `+${freeSlots}`}
                                                </div>
                                            )}
                                            {!isWorkHour && <div className="non-work-stripe"></div>}
                                            {(isDayBlocked || isSlotBlocked) && <div className="blocked-stripe"></div>}
                                        </div>
                                    );
                                })}

                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };


    const renderDayView = () => {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayCitas = citas.filter(c => c.fecha === dateStr);
        const isDayBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia && b.tipo === 1);

        const dayOfWeek = (currentDate.getDay() + 6) % 7;
        const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek && hor.agenda_id === agendaId);

        // Habilitaciones para este día
        const dayEnablements = (bloqueos || []).filter(b => b.tipo === 2 && b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr);

        // Si no hay horarios ni habilitaciones, el día está totalmente cerrado.
        // Si hay horarios, mostramos esos. Si hay habilitaciones además, las incluimos.
        const workHours = HOURS.filter(h => {
            const inSchedule = diaHorarios.some(hor => hor.hora_inicio <= h && hor.hora_fin > h);
            const inEnablement = dayEnablements.some(b => b.es_todo_el_dia || (b.hora_inicio <= h && b.hora_fin > h));
            return inSchedule || inEnablement;
        });

        return (
            <div className="day-view-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h3>{new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(currentDate)}</h3>
                    <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Capacidad: {maxSlots} pers/hora</div>
                </div>

                {isDayBlocked && <div className="alert-item alert-warning" style={{ marginBottom: 20 }}>Este día está marcado como FUERA DE SERVICIO.</div>}

                <div className="time-grid day-only">
                    <div className="time-column">
                        {workHours.map(h => <div key={h} className="time-slot-label">{h}</div>)}
                    </div>
                    <div className="day-column single">
                        {workHours.map(h => {
                            const slotCitas = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)));
                            const isSlotBlocked = (bloqueos || []).some(b =>
                                b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                                !b.es_todo_el_dia && b.hora_inicio <= h && b.hora_fin > h
                            );

                            const freeSlots = maxSlots - slotCitas.length;

                            const isServiceBlocked = serviceFilter && !isTimeAllowedForService(currentDate, h);

                            return (
                                <div
                                    key={h}
                                    className={`time-slot large ${isSlotBlocked ? 'blocked-slot' : ''} ${slotCitas.length === 0 ? 'empty-slot' : ''} ${isServiceBlocked ? 'service-blocked' : ''}`}
                                    onClick={() => {
                                        if (isServiceBlocked) {
                                            alert("El servicio seleccionado no está disponible en este horario.");
                                            return;
                                        }
                                        if (!isDayBlocked && !isSlotBlocked) handleDayClick(new Date(currentDate.setHours(parseInt(h), 0)));
                                    }}
                                    style={isServiceBlocked ? { opacity: 0.3, background: '#000' } : {}}
                                >
                                    {slotCitas.map(c => (
                                        <div key={c.id} className="appointment-pill detail" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <strong>{c.hora}</strong> - {c.nombres_completos} ({c.servicios})
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {canModify(c) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onEditCita(c); }}
                                                        className="btn-edit-tiny"
                                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                        title="Editar cita"
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                                {canModify(c) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCita(c.id); }}
                                                        className="btn-delete-tiny"
                                                        title="Eliminar cita"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {!isDayBlocked && !isSlotBlocked && (
                                        <div className="available-indicator large">
                                            {slotCitas.length === 0 ? "🟢 Horario Disponible - Haz clic para agendar" : `🔵 ${freeSlots} cupos disponibles`}
                                        </div>
                                    )}
                                    {(isDayBlocked || isSlotBlocked) && <div className="blocked-stripe full"></div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };



    const nav = (dir) => {
        const newDate = new Date(currentDate);
        if (viewMode === "month") newDate.setMonth(currentDate.getMonth() + dir);
        else if (viewMode === "week") newDate.setDate(currentDate.getDate() + (dir * 7));
        else newDate.setDate(currentDate.getDate() + dir);
        setCurrentDate(newDate);
    };

    return (
        <div className="calendar-container">
            <div className="calendar-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div className="view-switcher-premium">
                        <button className={`view-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>📅 Mes</button>
                        <button className={`view-btn ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>🗓️ Semana</button>
                        <button className={`view-btn ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>📍 Día</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <select
                        className="custom-file-input"
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                        style={{ padding: '8px', maxWidth: '180px', cursor: 'pointer', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                    >
                        <option value="">👁️ Ver todo</option>
                        {configServicios.map(cs => (
                            <option key={cs.id} value={cs.service_id}>{cs.service.nombre}</option>
                        ))}
                    </select>

                    <div className="nav-controls" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <button onClick={() => nav(-1)} className="btn-nav">{"<"}</button>
                        <h2 style={{ margin: 0, minWidth: 180, textAlign: "center", fontSize: "1.1rem" }}>
                            {viewMode === "month" ? new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate).toUpperCase() :
                                viewMode === "week" ? "Semana Actual" : "Día Seleccionado"}
                        </h2>
                        <button onClick={() => nav(1)} className="btn-nav">{">"}</button>
                    </div>
                </div>
            </div>

            {viewMode === "month" && renderMonthView()}
            {viewMode === "week" && renderWeekView()}
            {viewMode === "day" && renderDayView()}



            <div className="agenda-alerts-section" style={{ marginTop: "30px", borderTop: "1px solid var(--glass-border)", paddingTop: "20px" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    🔔 Avisos y Alertas
                </h4>
                <div className="alerts-container" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {alertas.length > 0 ? alertas.map(a => (
                        <div key={a.id} className={`alert-item alert-${a.tipo}`} style={{
                            borderLeft: `4px solid ${a.tipo === 'warning' ? '#f59e0b' : '#3b82f6'}`
                        }}>
                            {a.mensaje}
                        </div>
                    )) : <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No hay avisos recientes.</p>}
                </div>
            </div>

            {loading && <div className="spinner-overlay"><div className="spinner"></div></div>}
        </div>

    );
};

export default CalendarView;
