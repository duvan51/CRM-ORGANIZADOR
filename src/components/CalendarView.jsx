import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import ConfirmModal from "./ConfirmModal";
import VoiceCall from "./VoiceCall";
import "../excel_view.css";


const CalendarView = ({ onDateSelect, agendaId, agendas, token, user, userRole, onEditCita, onScheduleNext }) => {



    const [currentDate, setCurrentDate] = useState(new Date());
    const [citas, setCitas] = useState([]);
    const [bloqueos, setBloqueos] = useState([]);
    const [alertas, setAlertas] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [configServicios, setConfigServicios] = useState([]);
    const [horariosServicios, setHorariosServicios] = useState([]); // New state for service schedules
    const [serviceFilter, setServiceFilter] = useState(""); // ID of selected service to filter
    const [loading, setLoading] = useState(false);

    const getLocalDateStr = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };


    const [viewMode, setViewMode] = useState("month"); // "month", "week", "day", "general"
    const [selectedDayOptions, setSelectedDayOptions] = useState(null);

    // Filters for General View
    const [filterSearch, setFilterSearch] = useState("");
    const [filterDateStart, setFilterDateStart] = useState(new Date().toISOString().split('T')[0]);
    const [filterDateEnd, setFilterDateEnd] = useState("");
    const [filterStatus, setFilterStatus] = useState("");

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: "",
        message: "",
        icon: "",
        type: "confirm",
        onConfirm: () => { }
    });

    const [showVoiceCall, setShowVoiceCall] = useState(null);


    useEffect(() => {
        if (agendaId) {
            fetchCitas();
            fetchBloqueos();
            fetchAlertas();
            fetchHorarios();
            fetchConfigServicios(); // This fetches global config, but we need the specific endpoint for this agenda
            fetchServiceSchedules();
        }
    }, [agendaId]);

    // Sync filter dates with currentDate when in general mode
    useEffect(() => {
        if (viewMode === "general") {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0);
            setFilterDateStart(getLocalDateStr(start));
            setFilterDateEnd(getLocalDateStr(end));
        }
    }, [currentDate, viewMode]);



    const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const currentAgendaData = Array.isArray(agendas) ? agendas.find(a => a.id === agendaId) : null;
    const maxSlots = currentAgendaData?.slots_per_hour || 1;

    const fetchCitas = async () => {
        if (!agendaId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('citas')
                .select('*')
                .eq('agenda_id', agendaId);

            if (error) throw error;
            setCitas(data || []);
        } catch (error) {
            console.error("Error fetching citas:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBloqueos = async () => {
        try {
            const { data, error } = await supabase
                .from('bloqueos')
                .select('*')
                .eq('agenda_id', agendaId);

            if (error) throw error;
            setBloqueos(data || []);
        } catch (e) {
            console.error(e);
            setBloqueos([]);
        }
    };

    const fetchAlertas = async () => {
        try {
            const { data, error } = await supabase
                .from('alertas')
                .select('*')
                .eq('agenda_id', agendaId);

            if (error) throw error;
            setAlertas(data || []);
        } catch (e) {
            console.error(e);
            setAlertas([]);
        }
    };

    const fetchHorarios = async () => {
        try {
            const { data, error } = await supabase
                .from('horarios_atencion')
                .select('*')
                .eq('agenda_id', agendaId);

            if (error) throw error;
            setHorarios(data || []);
        } catch (e) { setHorarios([]); }
    };

    const fetchConfigServicios = async () => {
        try {
            const { data, error } = await supabase
                .from('agenda_services')
                .select('*, service:global_services(*)')
                .eq('agenda_id', agendaId);

            if (error) throw error;
            setConfigServicios(data || []);
        } catch (e) { setConfigServicios([]); }
    };

    const fetchServiceSchedules = async () => {
        try {
            const { data, error } = await supabase
                .from('horarios_servicios')
                .select('*, service:global_services(*)')
                .eq('agenda_id', agendaId);

            if (error) throw error;
            setHorariosServicios(data || []);
        } catch (e) { setHorariosServicios([]); }
    };

    // Helper to check if a specific time is allowed for the selected service filter
    const isTimeAllowedForService = (date, hour, overrideFilter = undefined) => {
        const dateStr = getLocalDateStr(date);
        const sFilter = overrideFilter !== undefined ? overrideFilter : (serviceFilter ? parseInt(serviceFilter) : null);
        const h5 = hour.substring(0, 5);

        // 1. PRIORIDAD: Habilitaciones (Excepciones de apertura)
        // Inclusivo: si sFilter es null, cualquier habilitación (de cualquier servicio o global) cuenta.
        const hasEnablement = (bloqueos || []).some(b =>
            b.tipo === 2 &&
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            (b.service_id === null || (sFilter && b.service_id === sFilter) || (!sFilter && b.service_id !== null)) &&
            (b.es_todo_el_dia || ((b.hora_inicio || "").substring(0, 5) <= h5 && (b.hora_fin || "").substring(0, 5) > h5))
        );
        if (hasEnablement) return true;

        // 2. PRIORIDAD: Bloqueos (Excepciones de cierre)
        const hasBlock = (bloqueos || []).some(b =>
            b.tipo === 1 &&
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            (b.service_id === null || (sFilter && b.service_id === sFilter)) &&
            (b.es_todo_el_dia || ((b.hora_inicio || "").substring(0, 5) <= h5 && (b.hora_fin || "").substring(0, 5) > h5))
        );
        if (hasBlock) return false;

        // 3. Fallback al horario recurrente
        const dayIndex = (date.getDay() + 6) % 7; // 0=Mon

        // Si no hay filtro, es inclusivo: permitido si la agenda general lo permite O algún servicio tiene regla
        if (!sFilter) {
            const inGeneral = (horarios || []).some(h =>
                h.dia_semana === dayIndex &&
                h.agenda_id === agendaId &&
                (h.hora_inicio || "").substring(0, 5) <= h5 &&
                (h.hora_fin || "").substring(0, 5) > h5
            );
            if (inGeneral) return true;

            const inAnyService = (horariosServicios || []).some(hs =>
                hs.dia_semana === dayIndex &&
                (hs.hora_inicio || "").substring(0, 5) <= h5 &&
                (hs.hora_fin || "").substring(0, 5) > h5
            );
            return inAnyService;
        }

        const hasRules = (horariosServicios || []).some(hs => hs.service_id === sFilter);
        if (!hasRules) {
            return (horarios || []).some(h =>
                h.dia_semana === dayIndex &&
                h.agenda_id === agendaId &&
                (h.hora_inicio || "").substring(0, 5) <= h5 &&
                (h.hora_fin || "").substring(0, 5) > h5
            );
        }

        const dayRules = (horariosServicios || []).filter(hs => hs.service_id === sFilter && hs.dia_semana === dayIndex);
        return dayRules.some(rule => h5 >= (rule.hora_inicio || "").substring(0, 5) && h5 < (rule.hora_fin || "").substring(0, 5));
    };

    const isAnyTimeAllowedOnDay = (date) => {
        const dateStr = getLocalDateStr(date);
        const sFilter = serviceFilter ? parseInt(serviceFilter) : null;

        // 1. Alguna habilitación en el día? (Inclusivo para cualquier servicio si sFilter es null)
        const hasEnablement = (bloqueos || []).some(b =>
            b.tipo === 2 &&
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            (b.service_id === null || (sFilter && b.service_id === sFilter) || (!sFilter && b.service_id !== null))
        );
        if (hasEnablement) return true;

        // 2. Día totalmente bloqueado? (Bloqueo general o del servicio filtrado)
        const isTotallyBlocked = (bloqueos || []).some(b =>
            b.tipo === 1 &&
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            b.es_todo_el_dia &&
            (b.service_id === null || (sFilter && b.service_id === sFilter))
        );
        if (isTotallyBlocked) return false;

        // 3. Horario recurrente
        const dayOfWeek = (date.getDay() + 6) % 7;
        if (!sFilter) {
            const hasGeneral = (horarios || []).some(h => h.dia_semana === dayOfWeek && h.agenda_id === agendaId);
            const hasAnyService = (horariosServicios || []).some(hs => hs.dia_semana === dayOfWeek);
            return hasGeneral || hasAnyService;
        }

        const hSchedules = (horariosServicios || []).filter(hs => hs.service_id === sFilter);
        if (hSchedules.length === 0) {
            return (horarios || []).some(h => h.dia_semana === dayOfWeek && h.agenda_id === agendaId);
        }

        return hSchedules.some(hs => hs.dia_semana === dayOfWeek);
    };



    const handleDeleteCita = (citaId) => {
        setConfirmModal({
            isOpen: true,
            title: "Eliminar Cita",
            message: "¿Deseas eliminar permanentemente esta cita? Esta acción no se puede deshacer.",
            icon: "🗑️",
            type: "danger",
            onConfirm: async () => {
                try {
                    const { error } = await supabase
                        .from('citas')
                        .delete()
                        .eq('id', citaId);

                    if (error) throw error;
                    fetchCitas();
                } catch (e) {
                    console.error(e);
                    alert("Error al eliminar");
                }
            }
        });
    };

    const canModify = (cita) => {
        if (userRole === "superuser" || userRole === "admin") return true;
        const now = new Date();
        const citaDate = new Date(`${cita.fecha}T${cita.hora}`);
        return citaDate > now;
    };

    const handleQuickBlock = async (date) => {
        const dateStr = getLocalDateStr(date);
        try {
            const { error } = await supabase.from('bloqueos').insert({
                agenda_id: agendaId,
                tipo: 1,
                fecha_inicio: dateStr,
                fecha_fin: dateStr,
                es_todo_el_dia: true,
                descripcion: "Bloqueo rápido desde calendario"
            });
            if (error) throw error;
            fetchBloqueos();
        } catch (e) {
            console.error(e);
            alert("Error al bloquear día");
        }
    };

    const handleDayClick = (date) => {
        if (userRole === "superuser" || userRole === "admin") {
            setSelectedDayOptions(date);
        } else {
            onDateSelect(date);
        }
    };

    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();



    const renderMonthView = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const startOffset = (firstDay + 6) % 7; // Ajustar para que la semana empiece en Lunes
        const daysInMonth = getDaysInMonth(year, month);
        const todayStr = getLocalDateStr(new Date());

        const days = [];
        const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

        // Días del mes anterior para rellenar el inicio
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startOffset - 1; i >= 0; i--) {
            const dayNum = prevMonthLastDay - i;
            const dateObj = new Date(year, month - 1, dayNum);
            days.push(
                <div key={`prev-${dayNum}`} className="calendar-day other-month" onClick={() => {
                    const d = new Date(year, month - 1, dayNum);
                    setCurrentDate(d);
                }}>
                    <span className="day-number">{dayNum}</span>
                </div>
            );
        }

        // Días del mes actual
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = getLocalDateStr(dateObj);
            const isToday = dateStr === todayStr;
            const dayOfWeek = (dateObj.getDay() + 6) % 7;

            const dayCitas = citas.filter(c => c.fecha === dateStr);
            const isBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia && b.tipo === 1);
            const isAvailable = isAnyTimeAllowedOnDay(dateObj);
            const isClosed = !isAvailable;
            const isUnavailableByFilter = serviceFilter && !isAvailable;

            days.push(
                <div key={`curr-${d}`} className={`calendar-day ${isToday ? 'today' : ''} ${isBlocked ? 'blocked-day' : ''} ${isClosed ? 'closed-day' : ''} ${isUnavailableByFilter ? 'unavailable-filter' : ''}`} onClick={() => handleDayClick(new Date(year, month, d))}>
                    <span className="day-number">{d}</span>
                    <div className="day-appointments">
                        {isBlocked ? <div className="blocked-label">No disponible</div> : (
                            isClosed ? <div className="closed-label">No laborativo</div> : (
                                <>
                                    {dayCitas.slice(0, 3).map(c => (
                                        <div
                                            key={c.id}
                                            className={`appointment-pill ${c.confirmacion === 'Cancelada' ? 'cancelled-pill' : ''}`}
                                            title={c.confirmacion === 'Cancelada' ? 'Cita Cancelada' : ''}
                                        >
                                            {c.confirmacion === 'Cancelada' && '⚠️ '}{c.hora} {c.nombres_completos.split(' ')[0]}
                                        </div>
                                    ))}
                                    {dayCitas.length > 3 && <div style={{ fontSize: "0.6rem", color: "var(--primary)" }}>+{dayCitas.length - 3} más</div>}
                                </>
                            )
                        )}
                    </div>
                </div>
            );
        }

        // Días del mes siguiente para rellenar hasta completar la grilla (6 semanas = 42 días)
        const totalCells = 42;
        const remainingCells = totalCells - days.length;
        for (let d = 1; d <= remainingCells; d++) {
            days.push(
                <div key={`next-${d}`} className="calendar-day other-month" onClick={() => {
                    const date = new Date(year, month + 1, d);
                    setCurrentDate(date);
                }}>
                    <span className="day-number">{d}</span>
                </div>
            );
        }

        return (
            <>
                <div className="calendar-grid-header">
                    {weekDays.map(wd => <div key={wd} className="calendar-day-header">{wd}</div>)}
                </div>
                <div className="calendar-grid">{days}</div>
            </>
        );
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
        let minH = 24, maxH = 0;
        const sFilter = serviceFilter ? parseInt(serviceFilter) : null;

        weekDays.forEach(date => {
            const dateStr = getLocalDateStr(date);
            const dayOfWeek = (date.getDay() + 6) % 7;

            // 1. Horarios de la agenda
            const diaHorarios = (horarios || []).filter(h => h.dia_semana === dayOfWeek && h.agenda_id === agendaId);
            diaHorarios.forEach(h => {
                const s = parseInt(h.hora_inicio.split(":")[0]);
                const e = parseInt(h.hora_fin.split(":")[0]) + (h.hora_fin.split(":")[1] !== "00" ? 1 : 0);
                if (s < minH) minH = s;
                if (e > maxH) maxH = e;
            });

            // 2. Horarios de TODOS los servicios (inclusivo para calcular rango)
            const sRules = (horariosServicios || []).filter(hs => hs.dia_semana === dayOfWeek);
            sRules.forEach(r => {
                const s = parseInt(r.hora_inicio.split(":")[0]);
                const e = parseInt(r.hora_fin.split(":")[0]) + (r.hora_fin.split(":")[1] !== "00" ? 1 : 0);
                if (s < minH) minH = s;
                if (e > maxH) maxH = e;
            });

            // 3. Habilitaciones (inclusivo)
            const hbs = (bloqueos || []).filter(b => b.tipo === 2 && b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr);
            hbs.forEach(b => {
                if (b.es_todo_el_dia) { minH = 0; maxH = 24; }
                else if (b.hora_inicio && b.hora_fin) {
                    const s = parseInt(b.hora_inicio.split(":")[0]);
                    const e = parseInt(b.hora_fin.split(":")[0]) + (b.hora_fin.split(":")[1] !== "00" ? 1 : 0);
                    if (s < minH) minH = s;
                    if (e > maxH) maxH = e;
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
                        const dateStr = getLocalDateStr(date);
                        const dayCitas = citas.filter(c => c.fecha === dateStr);
                        const isDayBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia && b.tipo === 1);
                        const hasDayEnablement = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.tipo === 2);

                        // Visualmente bloqueado solo si no hay habilitaciones
                        const isVisuallyBlocked = isDayBlocked && !hasDayEnablement;

                        return (
                            <div key={idx} className={`day-column ${isVisuallyBlocked ? 'blocked' : ''}`}>
                                <div className="time-slot-header">
                                    {new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(date)}
                                </div>
                                {visibleHours.map(h => {
                                    const activeCitas = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)) && c.confirmacion !== 'Cancelada');
                                    const allCitasInSlot = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)));

                                    // La disponibilidad real la decide el helper unificado
                                    const isSlotAllowed = isTimeAllowedForService(date, h);
                                    const isServiceBlocked = serviceFilter && !isSlotAllowed;

                                    // Para las rayas de "no laborativo" usamos la agenda general (filtro null)
                                    const isBaseWorkHour = isTimeAllowedForService(date, h, null);

                                    const freeSlots = maxSlots - activeCitas.length;

                                    return (
                                        <div
                                            key={h}
                                            className={`time-slot ${!isSlotAllowed && !isServiceBlocked ? 'blocked-slot' : ''} ${!isBaseWorkHour ? 'non-work-slot' : ''} ${activeCitas.length === 0 ? 'empty-slot' : ''} ${isServiceBlocked ? 'service-blocked' : ''}`}
                                            onClick={() => {
                                                if (isServiceBlocked) {
                                                    alert("El servicio seleccionado no está disponible en este horario.");
                                                    return;
                                                }
                                                // Si isSlotAllowed es true, permitimos interacción
                                                if (isSlotAllowed) handleDayClick(new Date(date.setHours(parseInt(h), 0)));
                                            }}
                                            style={isServiceBlocked ? { opacity: 0.3, background: '#000' } : {}}
                                        >
                                            {allCitasInSlot.map(c => (
                                                <div
                                                    key={c.id}
                                                    className={`appointment-pill compact ${c.confirmacion === 'Cancelada' ? 'cancelled-pill' : ''}`}
                                                    title={c.nombres_completos}
                                                >
                                                    {c.confirmacion === 'Cancelada' && '⚠️ '}{c.nombres_completos.split(' ')[0]}
                                                    {canModify(c) && c.confirmacion !== 'Cancelada' && (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); onEditCita(c); }}
                                                            style={{ marginLeft: '5px', cursor: 'pointer', opacity: 0.7 }}
                                                        >✏️</span>
                                                    )}
                                                    {canModify(c) && c.confirmacion !== 'Cancelada' && (
                                                        <span
                                                            onClick={(e) => { e.stopPropagation(); onScheduleNext(c); }}
                                                            style={{ marginLeft: '5px', cursor: 'pointer', opacity: 0.7 }}
                                                            title="Agendar Siguiente Sesión"
                                                        >📅</span>
                                                    )}
                                                </div>
                                            ))}
                                            {isSlotAllowed && (
                                                <div className="available-indicator">
                                                    {activeCitas.length === 0 ? "Libre" : (freeSlots > 0 ? `+${freeSlots}` : "Lleno")}
                                                </div>
                                            )}
                                            {!isSlotAllowed && !isBaseWorkHour && <div className="non-work-stripe"></div>}
                                            {isVisuallyBlocked && !isSlotAllowed && <div className="blocked-stripe"></div>}
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
        const dateStr = getLocalDateStr(currentDate);
        const dayCitas = citas.filter(c => c.fecha === dateStr);
        const isDayBlocked = (bloqueos || []).some(b => b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr && b.es_todo_el_dia && b.tipo === 1);

        const dayOfWeek = (currentDate.getDay() + 6) % 7;
        const sFilter = serviceFilter ? parseInt(serviceFilter) : null;

        const workHours = HOURS.filter(h => {
            const h5 = h.substring(0, 5);

            // Si hay un filtro de servicio, verificamos si es laborativo o habilitado
            const isAllowed = isTimeAllowedForService(currentDate, h);

            // Si no hay filtro, queremos ver al menos el horario general o cualquier habilitación
            if (!serviceFilter) {
                const inGeneral = (horarios || []).some(hor =>
                    hor.dia_semana === dayOfWeek &&
                    hor.agenda_id === agendaId &&
                    (hor.hora_inicio || "").substring(0, 5) <= h5 &&
                    (hor.hora_fin || "").substring(0, 5) > h5
                );
                const inEnablement = (bloqueos || []).some(b =>
                    b.tipo === 2 &&
                    b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                    (b.es_todo_el_dia || ((b.hora_inicio || "").substring(0, 5) <= h5 && (b.hora_fin || "").substring(0, 5) > h5))
                );
                return inGeneral || inEnablement;
            }

            return isAllowed;
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
                            const activeCitas = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)) && c.confirmacion !== 'Cancelada');
                            const allCitasInSlot = dayCitas.filter(c => c.hora.startsWith(h.substring(0, 2)));
                            const isAllowed = isTimeAllowedForService(currentDate, h);
                            const isServiceBlocked = serviceFilter && !isAllowed;
                            const freeSlots = maxSlots - activeCitas.length;

                            return (
                                <div
                                    key={h}
                                    className={`time-slot large ${!isAllowed && !isServiceBlocked ? 'blocked-slot' : ''} ${activeCitas.length === 0 ? 'empty-slot' : ''} ${isServiceBlocked ? 'service-blocked' : ''}`}
                                    onClick={() => {
                                        if (isServiceBlocked) {
                                            alert("El servicio seleccionado no está disponible en este horario.");
                                            return;
                                        }
                                        if (isAllowed) handleDayClick(new Date(currentDate.setHours(parseInt(h), 0)));
                                    }}
                                    style={isServiceBlocked ? { opacity: 0.3, background: '#000' } : {}}
                                >
                                    {allCitasInSlot.map(c => (
                                        <div
                                            key={c.id}
                                            className={`appointment-pill detail ${c.confirmacion === 'Cancelada' ? 'cancelled-pill' : ''}`}
                                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                        >
                                            <div style={c.confirmacion === 'Cancelada' ? { textDecoration: 'line-through' } : {}}>
                                                {c.confirmacion === 'Cancelada' && '⚠️ '}
                                                <strong>{c.hora}</strong> - {c.nombres_completos} ({c.servicios})
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        let num = c.celular;
                                                        if (num && !num.startsWith('+')) num = '+' + num;
                                                        setShowVoiceCall(num);
                                                    }}
                                                    className="btn-edit-tiny"
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.8 }}
                                                    title="Llamada Twilio"
                                                >
                                                    📞
                                                </button>
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
                                                        onClick={(e) => { e.stopPropagation(); onScheduleNext(c); }}
                                                        className="btn-edit-tiny"
                                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                        title="Agendar Siguiente Sesión"
                                                    >
                                                        📅
                                                    </button>
                                                )}
                                                {canModify(c) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCita(c.id); }}
                                                        className="btn-delete-tiny"
                                                        title="Eliminar cita"
                                                        style={{ position: 'relative', top: 'auto', right: 'auto', marginLeft: '5px', transform: 'none' }}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {isAllowed && (
                                        <div className="available-indicator large">
                                            {activeCitas.length === 0 ? "🟢 Horario Disponible - Haz clic para agendar" : `🔵 ${freeSlots} cupos disponibles`}
                                        </div>
                                    )}
                                    {!isAllowed && <div className="blocked-stripe full"></div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };


    const renderGeneralView = () => {
        const filteredCitas = citas.filter(c => {
            const matchesSearch = !filterSearch ||
                (c.nombres_completos || "").toLowerCase().includes(filterSearch.toLowerCase()) ||
                (c.documento || "").toLowerCase().includes(filterSearch.toLowerCase()) ||
                (c.celular || "").toLowerCase().includes(filterSearch.toLowerCase());

            const matchesDateStart = !filterDateStart || c.fecha >= filterDateStart;
            const matchesDateEnd = !filterDateEnd || c.fecha <= filterDateEnd;
            const matchesStatus = !filterStatus || c.confirmacion === filterStatus;
            const matchesService = !serviceFilter || c.agenda_id === agendaId; // agendaId is already filtered in fetchCitas

            return matchesSearch && matchesDateStart && matchesDateEnd && matchesStatus;
        }).sort((a, b) => {
            const dateA = new Date(`${a.fecha}T${a.hora}`);
            const dateB = new Date(`${b.fecha}T${b.hora}`);
            return dateA - dateB; // Chronological order
        });

        return (
            <div className="general-view-container" style={{ marginTop: '20px' }}>
                <div className="excel-filters" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '15px',
                    marginBottom: '20px',
                    padding: '20px',
                    background: 'var(--glass-bg)',
                    borderRadius: '12px',
                    border: '1px solid var(--glass-border)'
                }}>
                    <div className="filter-group">
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '5px', color: 'var(--text-muted)' }}>🔍 Buscar (Nombre, CC, WhatsApp)</label>
                        <input
                            type="text"
                            className="custom-file-input"
                            placeholder="Ej: Juan Perez / 12345 / 310..."
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div className="filter-group">
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '5px', color: 'var(--text-muted)' }}>📅 Fecha Desde</label>
                        <input
                            type="date"
                            className="custom-file-input"
                            value={filterDateStart}
                            onChange={(e) => setFilterDateStart(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div className="filter-group">
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '5px', color: 'var(--text-muted)' }}>📅 Fecha Hasta</label>
                        <input
                            type="date"
                            className="custom-file-input"
                            value={filterDateEnd}
                            onChange={(e) => setFilterDateEnd(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div className="filter-group">
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '5px', color: 'var(--text-muted)' }}>📊 Estado</label>
                        <select
                            className="custom-file-input"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            <option value="">Todos los estados</option>
                            <option value="Pendiente">⏳ Pendiente</option>
                            <option value="Confirmada">✅ Confirmada</option>
                            <option value="Cancelada">❌ Cancelada</option>
                            <option value="Asistió">🏥 Asistió</option>
                        </select>
                    </div>
                </div>

                <div className="table-responsive" style={{ overflowX: 'auto', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)' }}>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Fecha</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Hora</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Paciente</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Documento</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>WhatsApp</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Servicio</th>
                                <th style={{ padding: '12px', textAlign: 'left' }}>Vendedor</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Estado</th>
                                <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCitas.length > 0 ? filteredCitas.map(c => (
                                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="table-row-hover">
                                    <td style={{ padding: '12px' }}>{c.fecha}</td>
                                    <td style={{ padding: '12px' }}>{c.hora}</td>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{c.nombres_completos}</td>
                                    <td style={{ padding: '12px' }}>{c.td} {c.documento}</td>
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <a href={`https://wa.me/${c.celular?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ color: '#25D366', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                🟢 {c.celular}
                                            </a>
                                            <button
                                                onClick={() => {
                                                    let num = c.celular;
                                                    if (num && !num.startsWith('+')) num = '+' + num;
                                                    setShowVoiceCall(num);
                                                }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0' }}
                                                title="Llamada Twilio"
                                            >
                                                📞
                                            </button>
                                        </div>

                                    </td>
                                    <td style={{ padding: '12px' }}>{c.tipo_servicio}</td>
                                    <td style={{ padding: '12px' }}>{c.vendedor}</td>
                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                        <span className={`status-pill ${c.confirmacion.toLowerCase()}`} style={{
                                            padding: '4px 8px',
                                            borderRadius: '20px',
                                            fontSize: '0.75rem',
                                            background: c.confirmacion === 'Confirmada' ? 'rgba(16, 185, 129, 0.1)' :
                                                c.confirmacion === 'Cancelada' ? 'rgba(239, 68, 68, 0.1)' :
                                                    'rgba(245, 158, 11, 0.1)',
                                            color: c.confirmacion === 'Confirmada' ? '#10b981' :
                                                c.confirmacion === 'Cancelada' ? '#ef4444' :
                                                    '#f59e0b',
                                            border: `1px solid ${c.confirmacion === 'Confirmada' ? 'rgba(16, 185, 129, 0.2)' :
                                                c.confirmacion === 'Cancelada' ? 'rgba(239, 68, 68, 0.2)' :
                                                    'rgba(245, 158, 11, 0.2)'}`
                                        }}>
                                            {c.confirmacion}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button onClick={() => onEditCita(c)} className="btn-edit-tiny" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✏️</button>
                                            <button onClick={() => onScheduleNext(c)} className="btn-edit-tiny" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>📅</button>
                                            {canModify(c) && (
                                                <button onClick={() => handleDeleteCita(c.id)} className="btn-delete-tiny" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No se encontraron citas con los filtros aplicados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: '15px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Mostrando {filteredCitas.length} registros
                </div>
            </div>
        );
    };



    const nav = (dir) => {
        const newDate = new Date(currentDate);
        if (viewMode === "month" || viewMode === "general") newDate.setMonth(currentDate.getMonth() + dir);
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
                        <button className={`view-btn ${viewMode === 'general' ? 'active' : ''}`} onClick={() => setViewMode('general')}>📊 General</button>
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
                                viewMode === "week" ? "Semana Actual" :
                                    viewMode === "day" ? "Día Seleccionado" : "Control de Agenda (Excel)"}
                        </h2>
                        <button onClick={() => nav(1)} className="btn-nav">{">"}</button>
                    </div>
                </div>
            </div>

            {viewMode === "month" && renderMonthView()}
            {viewMode === "week" && renderWeekView()}
            {viewMode === "day" && renderDayView()}
            {viewMode === "general" && renderGeneralView()}



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

            {/* Modal de Opciones de Día para Administradores */}
            {selectedDayOptions && (
                <div className="modal-overlay" onClick={() => setSelectedDayOptions(null)}>
                    <div className="modal-content alert-modal-content" onClick={e => e.stopPropagation()}>
                        <span className="alert-modal-icon">📅</span>
                        <h3 className="alert-modal-title">Gestión de Fecha</h3>
                        <p className="alert-modal-text">Selecciona una acción para el <strong>{selectedDayOptions.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>

                        <div className="alert-modal-actions" style={{ flexDirection: 'column', gap: '12px' }}>
                            <button className="alert-modal-btn confirm" onClick={() => {
                                onDateSelect(selectedDayOptions);
                                setSelectedDayOptions(null);
                            }}>
                                ✨ Agendar Nueva Cita
                            </button>

                            <button className="alert-modal-btn danger" onClick={() => {
                                handleQuickBlock(selectedDayOptions);
                                setSelectedDayOptions(null);
                            }}>
                                🚫 Bloquear Día Completo
                            </button>

                            <button className="alert-modal-btn cancel" onClick={() => setSelectedDayOptions(null)} style={{ border: 'none', background: 'transparent', marginTop: '10px' }}>
                                Cancelar y Volver
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                icon={confirmModal.icon}
                type={confirmModal.type}
                confirmText={confirmModal.type === 'danger' ? "Eliminar" : "Confirmar"}
            />


            {showVoiceCall && (
                <VoiceCall
                    clinicId={user?.clinic_id || user?.id}
                    phoneNumber={showVoiceCall}
                    onEnd={() => setShowVoiceCall(null)}
                />
            )}
        </div>

    );
};

export default CalendarView;
