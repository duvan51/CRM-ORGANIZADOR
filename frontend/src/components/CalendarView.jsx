import { useState, useEffect } from "react";

const CalendarView = ({ onDateSelect, agendaId, agendas, token, userRole }) => {



    const [currentDate, setCurrentDate] = useState(new Date());
    const [citas, setCitas] = useState([]);
    const [bloqueos, setBloqueos] = useState([]);
    const [alertas, setAlertas] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [configServicios, setConfigServicios] = useState([]);
    const [loading, setLoading] = useState(false);


    const [viewMode, setViewMode] = useState("month"); // "month", "week", "day"

    useEffect(() => {
        if (agendaId) {
            fetchCitas();
            fetchBloqueos();
            fetchAlertas();
            fetchHorarios();
            fetchConfigServicios();
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
            const res = await fetch(`http://localhost:8000/agendas/${agendaId}/config-servicios`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            setConfigServicios(Array.isArray(data) ? data : []);
        } catch (e) { setConfigServicios([]); }
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

    const handleDayClick = (date) => {
        if (userRole === "superuser" || userRole === "admin") {
            const action = confirm("¿Qué deseas hacer?\n\nACEPTAR: Agendar Cita\nCANCELAR: Poner Fuera de Servicio (Bloquear día)");
            if (action) onDateSelect(date);
            else handleQuickBlock(date);
        } else {
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
            const dayCitas = citas.filter(c => c.fecha === dateStr);
            const isBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia);


            days.push(
                <div key={d} className={`calendar-day ${isBlocked ? 'blocked-day' : ''}`} onClick={() => handleDayClick(new Date(year, month, d))}>

                    <span className="day-number">{d}</span>
                    <div className="day-appointments">
                        {isBlocked ? <div className="blocked-label">No disponible</div> : (
                            <>
                                {dayCitas.slice(0, 3).map(c => (
                                    <div key={c.id} className="appointment-pill">{c.hora} {c.nombres_completos.split(' ')[0]}</div>
                                ))}
                                {dayCitas.length > 3 && <div style={{ fontSize: "0.6rem", color: "var(--primary)" }}>+{dayCitas.length - 3} más</div>}
                            </>
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

        return (
            <div className="time-grid week-view">
                <div className="time-column">
                    <div className="time-slot-header">Hora</div>
                    {HOURS.map(h => <div key={h} className="time-slot-label">{h}</div>)}
                </div>
                <div className="days-columns" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flex: 1 }}>
                    {weekDays.map((date, idx) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const dayCitas = citas.filter(c => c.fecha === dateStr);
                        const isDayBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia);

                        return (
                            <div key={idx} className={`day-column ${isDayBlocked ? 'blocked' : ''}`}>
                                <div className="time-slot-header">
                                    {new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(date)}
                                </div>
                                {HOURS.map(h => {
                                    const slotCitas = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)));
                                    const isSlotBlocked = (bloqueos || []).some(b =>
                                        b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                                        !b.es_todo_el_dia && b.hora_inicio <= h && b.hora_fin > h
                                    );

                                    // Verificar horario de atención para este día (0=Lunes, ..., 6=Domingo)
                                    const dayOfWeek = (date.getDay() + 6) % 7; // Ajustar a 0=Lunes
                                    const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek && hor.agenda_id === agendaId);
                                    const isWorkHour = diaHorarios.length === 0 || diaHorarios.some(hor => hor.hora_inicio <= h && hor.hora_fin > h);

                                    const freeSlots = maxSlots - slotCitas.length;

                                    return (
                                        <div
                                            key={h}
                                            className={`time-slot ${isSlotBlocked ? 'blocked-slot' : ''} ${!isWorkHour ? 'non-work-slot' : ''} ${slotCitas.length === 0 ? 'empty-slot' : ''}`}
                                            onClick={() => !isDayBlocked && !isSlotBlocked && isWorkHour && handleDayClick(new Date(date.setHours(parseInt(h), 0)))}
                                        >
                                            {slotCitas.map(c => (
                                                <div key={c.id} className="appointment-pill compact" title={c.nombres_completos}>
                                                    {c.nombres_completos.split(' ')[0]}
                                                </div>
                                            ))}
                                            {!isDayBlocked && !isSlotBlocked && isWorkHour && slotCitas.length < maxSlots && (
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
        const isDayBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia);

        const dayOfWeek = (currentDate.getDay() + 6) % 7;
        const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek && hor.agenda_id === agendaId);

        // Filtrar horas: si no hay horarios definidos, mostrar todo. Si los hay, mostrar solo los laborales.
        const workHours = diaHorarios.length === 0 ? HOURS : HOURS.filter(h =>
            diaHorarios.some(hor => hor.hora_inicio <= h && hor.hora_fin > h)
        );

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

                            return (
                                <div
                                    key={h}
                                    className={`time-slot large ${isSlotBlocked ? 'blocked-slot' : ''} ${slotCitas.length === 0 ? 'empty-slot' : ''}`}
                                    onClick={() => !isDayBlocked && !isSlotBlocked && handleDayClick(new Date(currentDate.setHours(parseInt(h), 0)))}
                                >
                                    {slotCitas.map(c => (
                                        <div key={c.id} className="appointment-pill detail">
                                            <strong>{c.hora}</strong> - {c.nombres_completos} ({c.servicios})
                                        </div>
                                    ))}
                                    {!isDayBlocked && !isSlotBlocked && slotCitas.length < maxSlots && (
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
            <div className="calendar-controls" style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div className="view-switcher" style={{ display: "flex", gap: 10 }}>
                    <button className={`btn-tab ${viewMode === "month" ? "active" : ""}`} onClick={() => setViewMode("month")}>Mes</button>
                    <button className={`btn-tab ${viewMode === "week" ? "active" : ""}`} onClick={() => setViewMode("week")}>Semana</button>
                    <button className={`btn-tab ${viewMode === "day" ? "active" : ""}`} onClick={() => setViewMode("day")}>Día</button>
                </div>
                <div className="nav-controls" style={{ display: "flex", alignItems: "center", gap: 15 }}>
                    <button onClick={() => nav(-1)} className="btn-nav">{"<"}</button>
                    <h2 style={{ margin: 0, minWidth: 200, textAlign: "center", fontSize: "1.2rem" }}>
                        {viewMode === "month" ? new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate).toUpperCase() :
                            viewMode === "week" ? "Semana Actual" : "Día Seleccionado"}
                    </h2>
                    <button onClick={() => nav(1)} className="btn-nav">{">"}</button>
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
                            padding: "10px 15px",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: "8px",
                            borderLeft: `4px solid ${a.tipo === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                            fontSize: "0.9rem"
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
