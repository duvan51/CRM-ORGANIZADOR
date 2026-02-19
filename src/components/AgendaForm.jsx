import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";

export default function AgendaForm({ selectedDate, onCitaCreated, onCancel, agendaId, token, userRole, initialData = null, currentUserName = "" }) {


    const [loading, setLoading] = useState(false);
    const [configServicios, setConfigServicios] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [horariosServicios, setHorariosServicios] = useState([]);
    const [bloqueos, setBloqueos] = useState([]);
    const [availableServices, setAvailableServices] = useState([]);
    const [validationError, setValidationError] = useState("");
    const [citasDelDia, setCitasDelDia] = useState([]);
    const [suggestedSlots, setSuggestedSlots] = useState([]);
    const [bookedSlots, setBookedSlots] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [patientSuggestions, setPatientSuggestions] = useState([]);
    const [metaCampaigns, setMetaCampaigns] = useState([]);


    const [formData, setFormData] = useState(initialData || {
        agenda_id: agendaId,
        mes: new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(selectedDate),
        cantidad: 1,
        dia: new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(selectedDate),
        fecha: selectedDate.toISOString().split('T')[0],
        hora: "08:00",
        servicios: "",
        tipo_servicio: "",
        nombres_completos: "",
        td: "CC",
        documento: "",
        celular: "",
        email: "",
        observaciones: "",
        factura: "",
        confirmacion: "Pendiente",
        vendedor: currentUserName || "",
        otros: "",
        sesion_nro: 1,
        total_sesiones: 1,
        utm_source: "",
        utm_campaign: "",
        utm_medium: ""
    });


    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const [sRes, hRes, bRes, hsRes, cRes, vRes, mRes, pRes] = await Promise.all([
                    supabase.from('agenda_services').select('*, service:global_services(*)').eq('agenda_id', agendaId),
                    supabase.from('horarios_atencion').select('*').eq('agenda_id', agendaId),
                    supabase.from('bloqueos').select('*').eq('agenda_id', agendaId),
                    supabase.from('horarios_servicios').select('*').eq('agenda_id', agendaId),
                    supabase.from('citas').select('*').eq('agenda_id', agendaId).eq('fecha', selectedDate.toISOString().split('T')[0]),
                    supabase.from('profiles').select('full_name, username').eq('is_active', true),
                    supabase.from('meta_ads_agenda_mapping').select('*').eq('agenda_id', agendaId),
                    supabase.from('meta_ads_performance').select('campaign_id, campaign_name')
                ]);

                setConfigServicios(sRes.data || []);
                setHorarios(hRes.data || []);
                setBloqueos(bRes.data || []);
                setHorariosServicios(hsRes.data || []);
                setCitasDelDia(cRes.data || []);
                setVendedores(vRes.data || []);

                // Join mappings with performance data manually
                if (mRes.data && pRes.data) {
                    const uniqueCamps = [];
                    const seenIds = new Set();
                    const mappedIds = mRes.data.map(m => m.meta_entity_id);

                    pRes.data.forEach(p => {
                        if (mappedIds.includes(p.campaign_id) && !seenIds.has(p.campaign_id)) {
                            seenIds.add(p.campaign_id);
                            uniqueCamps.push({ id: p.campaign_id, name: p.campaign_name });
                        }
                    });
                    setMetaCampaigns(uniqueCamps);
                }
            } catch (e) { console.error(e); }
        };
        fetchConfig();
    }, [agendaId, selectedDate]);

    // Normalize service name to match config (fixes dropdown mismatch and prevents session reset)
    useEffect(() => {
        if (configServicios.length > 0 && formData.tipo_servicio) {
            const match = configServicios.find(cs => cs.service.nombre.trim() === formData.tipo_servicio.trim());
            if (match && match.service.nombre !== formData.tipo_servicio) {
                setFormData(prev => ({ ...prev, tipo_servicio: match.service.nombre }));
            }
        }
    }, [configServicios, formData.tipo_servicio]);

    // SUGERENCIAS DE PACIENTES
    useEffect(() => {
        const searchPatients = async () => {
            const nameQuery = formData.nombres_completos;
            const docQuery = formData.documento;

            if ((!nameQuery || nameQuery.length < 3) && (!docQuery || docQuery.length < 3) || initialData) {
                setPatientSuggestions([]);
                return;
            }

            try {
                let query = supabase.from('citas')
                    .select('nombres_completos, documento, td, celular, email')
                    .limit(20);

                if (nameQuery && nameQuery.length >= 3 && docQuery && docQuery.length >= 3) {
                    query = query.or(`nombres_completos.ilike.%${nameQuery}%,documento.ilike.%${docQuery}%`);
                } else if (nameQuery && nameQuery.length >= 3) {
                    query = query.ilike('nombres_completos', `%${nameQuery}%`);
                } else {
                    query = query.ilike('documento', `%${docQuery}%`);
                }

                const { data } = await query;
                if (data) {
                    const unique = [];
                    const seen = new Set();
                    data.forEach(p => {
                        const key = p.documento || p.nombres_completos;
                        if (!seen.has(key)) {
                            seen.add(key);
                            unique.push(p);
                        }
                    });
                    setPatientSuggestions(unique.slice(0, 5));
                }
            } catch (e) { console.error(e); }
        };

        const t = setTimeout(searchPatients, 400);
        return () => clearTimeout(t);
    }, [formData.nombres_completos, formData.documento, initialData]);

    const selectPatient = (p) => {
        setFormData(prev => ({
            ...prev,
            nombres_completos: p.nombres_completos,
            documento: p.documento,
            td: p.td || "CC",
            celular: p.celular,
            email: p.email || ""
        }));
        setPatientSuggestions([]);
    };

    // Filtrar servicios disponibles según el día de la semana y excepciones (bloqueos/habilitaciones)
    useEffect(() => {
        if (!configServicios || configServicios.length === 0) {
            setAvailableServices([]);
            return;
        }

        const dateStr = selectedDate.toISOString().split('T')[0];
        const dayIndex = (selectedDate.getDay() + 6) % 7; // 0=Lunes, 6=Domingo

        const filtered = configServicios.filter(as => {
            // 1. PRIORIDAD: Habilitaciones (Excepciones de apertura)
            // Si hay una habilitación de apertura para este servicio (o global) en esta fecha, está disponible
            const hasEnablement = (bloqueos || []).some(b =>
                b.tipo === 2 &&
                b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                (b.service_id === null || b.service_id === as.service_id)
            );
            if (hasEnablement) return true;

            // 2. PRIORIDAD: Bloqueos de día completo (Excepciones de cierre)
            // Si hay un bloqueo global o específico para este servicio en esta fecha (todo el día), no se muestra
            const hasFullBlock = (bloqueos || []).some(b =>
                b.tipo === 1 &&
                b.es_todo_el_dia &&
                b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                (b.service_id === null || b.service_id === as.service_id)
            );
            if (hasFullBlock) return false;

            // 3. HORARIOS RECURRENTES
            // Verificar si el servicio tiene reglas específicas en esta agenda
            const hasSpecificRules = (horariosServicios || []).some(hs => hs.service_id === as.service_id);

            if (!hasSpecificRules) return true; // Si no tiene reglas, asume horario general (disponible)

            // Si tiene reglas recurrentes, DEBE tener una regla para ESTE día de la semana
            const ruleForToday = (horariosServicios || []).some(hs =>
                hs.service_id === as.service_id && hs.dia_semana === dayIndex
            );
            return ruleForToday;
        });

        setAvailableServices(filtered);
    }, [configServicios, horariosServicios, bloqueos, selectedDate]);

    // Función pura para verificar disponibilidad (para el generador de sugerencias)
    const checkTimeAvailability = (hora, duracionMinutos, serviceName) => {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const [newH, newM] = hora.split(":").map(Number);
        const newStart = newH * 60 + newM;
        const newEnd = newStart + duracionMinutos;
        const dayOfWeek = (selectedDate.getDay() + 6) % 7;
        const selectedService = configServicios.find(as => as.service.nombre.trim() === serviceName?.trim());
        if (!selectedService) return { ok: false, msg: "Servicio no encontrado" };

        const maxSlots = selectedService.service.concurrency || 1;

        // 1. BLOQUEOS (Tipo 1) - Si hay un bloqueo, no debe haber ningún solapamiento
        const hasBlock = (bloqueos || []).some(b => {
            if (b.tipo !== 1 || b.fecha_inicio > dateStr || b.fecha_fin < dateStr) return false;
            if (b.es_todo_el_dia) return true;
            const [rsH, rsM] = b.hora_inicio.split(":").map(Number);
            const [reH, reM] = b.hora_fin.split(":").map(Number);
            const bStart = rsH * 60 + rsM;
            const bEnd = reH * 60 + reM;
            return (newStart < bEnd && newEnd > bStart);
        });
        if (hasBlock) return { ok: false, msg: "Horario bloqueado por excepción" };

        // 2. HABILITACIONES (Tipo 2) - Aperturas excepcionales
        const activeEnablements = (bloqueos || []).filter(b =>
            b.tipo === 2 && b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr
        );

        const isCoveredByEnablement = activeEnablements.some(b => {
            if (b.es_todo_el_dia) return true;
            const [rsH, rsM] = b.hora_inicio.split(":").map(Number);
            const [reH, reM] = b.hora_fin.split(":").map(Number);
            return newStart >= (rsH * 60 + rsM) && newEnd <= (reH * 60 + reM);
        });

        // 3. HORARIOS (Solo si no está cubierto por una habilitación excepcional)
        if (!isCoveredByEnablement) {
            const serviceRules = horariosServicios.filter(hs => hs.service_id === selectedService.service_id && hs.dia_semana === dayOfWeek);
            if (serviceRules.length > 0) {
                const ok = serviceRules.some(r => {
                    const [rsH, rsM] = r.hora_inicio.split(":").map(Number);
                    const [reH, reM] = r.hora_fin.split(":").map(Number);
                    return newStart >= (rsH * 60 + rsM) && newEnd <= (reH * 60 + reM);
                });
                if (!ok) return { ok: false, msg: "La duración excede el horario del servicio" };
            } else {
                const diaHorarios = horarios.filter(hor => hor.dia_semana === dayOfWeek);
                if (diaHorarios.length === 0) return { ok: false, msg: "No hay atención este día" };
                const ok = diaHorarios.some(r => {
                    const [rsH, rsM] = r.hora_inicio.split(":").map(Number);
                    const [reH, reM] = r.hora_fin.split(":").map(Number);
                    return newStart >= (rsH * 60 + rsM) && newEnd <= (reH * 60 + reM);
                });
                if (!ok) return { ok: false, msg: "La duración excede el rango laboral" };
            }
        }

        // 4. CUPOS SIMULTÁNEOS
        const concurrentCitas = citasDelDia.filter(c =>
            c.tipo_servicio === serviceName &&
            c.id !== initialData?.id &&
            c.confirmacion !== 'Cancelada'
        );

        for (let t = newStart; t < newEnd; t++) {
            let overlapCount = 0;
            concurrentCitas.forEach(cita => {
                const [cH, cM] = cita.hora.split(":").map(Number);
                const configCitaExistente = configServicios.find(cs => cs.service.nombre === cita.tipo_servicio);
                const cDuration = configCitaExistente?.service?.duracion_minutos || 30;
                if (t >= (cH * 60 + cM) && t < (cH * 60 + cM + cDuration)) overlapCount++;
            });
            if (overlapCount >= maxSlots) return { ok: false, msg: `Cupos agotados (${maxSlots}/${maxSlots})` };
        }

        return { ok: true };
    };

    const validateTime = (hora, duracionMinutos) => {
        const result = checkTimeAvailability(hora, duracionMinutos, formData.tipo_servicio);
        if (!result.ok) {
            setValidationError(result.msg);
            return false;
        }
        setValidationError("");
        return true;
    };

    // GENERADOR DE SUGERENCIAS
    useEffect(() => {
        if (!formData.tipo_servicio || configServicios.length === 0) {
            setSuggestedSlots([]);
            return;
        }

        const selectedService = configServicios.find(as => as.service.nombre.trim() === formData.tipo_servicio?.trim());
        if (!selectedService) return;

        const duration = selectedService.service.duracion_minutos || 30;
        const slots = [];
        const dateStr = selectedDate.toISOString().split('T')[0];
        const dayOfWeek = (selectedDate.getDay() + 6) % 7;

        // 1. Obtener todos los rangos posibles de búsqueda
        let rangesToSearch = [];

        // - Horarios Generales del día
        horarios.filter(h => h.dia_semana === dayOfWeek).forEach(h => {
            rangesToSearch.push({ hora_inicio: h.hora_inicio, hora_fin: h.hora_fin });
        });

        // - Horarios Específicos del servicio
        horariosServicios.filter(hs => hs.service_id === selectedService.service_id && hs.dia_semana === dayOfWeek).forEach(sr => {
            rangesToSearch.push({ hora_inicio: sr.hora_inicio, hora_fin: sr.hora_fin });
        });

        // - Habilitaciones (Bloqueos Tipo 2: Excepciones de APERTURA)
        bloqueos.filter(b =>
            b.tipo === 2 &&
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            (b.service_id === null || b.service_id === selectedService.service_id)
        ).forEach(b => {
            if (b.es_todo_el_dia) {
                // Si es todo el día habilitado, buscamos en un rango amplio estándar
                rangesToSearch.push({ hora_inicio: "06:00", hora_fin: "21:00" });
            } else if (b.hora_inicio && b.hora_fin) {
                rangesToSearch.push({ hora_inicio: b.hora_inicio, hora_fin: b.hora_fin });
            }
        });

        if (rangesToSearch.length === 0) {
            setSuggestedSlots([]);
            setBookedSlots([]);
            return;
        }

        // 2. Procesar cada rango para encontrar bloques válidos
        const booked = [];
        rangesToSearch.forEach(range => {
            const [rsH, rsM] = (range.hora_inicio || "08:00").split(":").map(Number);
            const [reH, reM] = (range.hora_fin || "18:00").split(":").map(Number);
            let currentTime = rsH * 60 + rsM;
            const endTime = reH * 60 + reM;

            while (currentTime + duration <= endTime) {
                const h = Math.floor(currentTime / 60);
                const m = currentTime % 60;
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

                const check = checkTimeAvailability(timeStr, duration, formData.tipo_servicio);
                if (check.ok) {
                    if (!slots.includes(timeStr)) slots.push(timeStr);
                } else if (check.msg && check.msg.includes("Cupos agotados")) {
                    if (!booked.includes(timeStr)) booked.push(timeStr);
                }

                // Avanzar según duración + 5 minutos de espacio
                currentTime += (duration + 5);
            }
        });

        // También añadir a 'booked' cualquier hora que ya tenga una cita agendada de ese servicio hoy
        citasDelDia.forEach(cita => {
            if (cita.tipo_servicio === formData.tipo_servicio && cita.confirmacion !== 'Cancelada') {
                if (!booked.includes(cita.hora)) booked.push(cita.hora);
            }
        });

        // Ordenar y limpiar
        const sortedUniqueSlots = [...new Set(slots)].sort((a, b) => a.localeCompare(b));
        const sortedUniqueBooked = [...new Set(booked)].filter(b => !slots.includes(b)).sort((a, b) => a.localeCompare(b));

        setSuggestedSlots(sortedUniqueSlots);
        setBookedSlots(sortedUniqueBooked);
    }, [formData.tipo_servicio, selectedDate, configServicios, citasDelDia, horarios, horariosServicios, bloqueos]);


    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === "hora") {
            const s = configServicios.find(as => as.service.nombre === formData.tipo_servicio);
            validateTime(value, s ? s.service.duracion_minutos : 30);
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const triggerSMS = async (eventType, citaData) => {
        try {
            // 1. Obtener la clínica a la que pertenece esta agenda
            const { data: agenda } = await supabase.from('agendas').select('clinic_id').eq('id', agendaId).single();
            if (!agenda?.clinic_id) return;

            // 1.5 Verificar si el SMS está activo globalmente para la clínica
            const { data: config } = await supabase
                .from('infobip_configs')
                .select('is_active')
                .eq('clinic_id', agenda.clinic_id)
                .maybeSingle();

            if (!config || !config.is_active) return;

            // 2. Buscar plantilla activa para este evento
            const { data: template } = await supabase
                .from('sms_templates')
                .select('*')
                .eq('clinic_id', agenda.clinic_id)
                .eq('event_type', eventType)
                .eq('is_active', true)
                .maybeSingle();

            if (!template || !citaData.celular) return;

            // 3. Reemplazar variables {paciente}, {fecha}, {hora}
            let message = template.content
                .replace(/{paciente}/g, citaData.nombres_completos)
                .replace(/{fecha}/g, citaData.fecha)
                .replace(/{hora}/g, citaData.hora);

            // 4. Invocar Edge Function de envío
            const { data, error } = await supabase.functions.invoke('send-sms-infobip', {
                body: {
                    clinicId: agenda.clinic_id,
                    phone: citaData.celular,
                    message: message,
                    patientName: citaData.nombres_completos
                }
            });
            if (error) throw error;
            console.log("SMS Sent Successfully:", data);
        } catch (e) {
            console.error("Error triggering SMS:", e);
        }
    };

    const triggerEmail = async (eventType, citaData) => {
        if (!citaData.email) return;
        try {
            const { data: agenda } = await supabase.from('agendas').select('clinic_id').eq('id', agendaId).single();
            if (!agenda?.clinic_id) return;

            // 1.5 Verificar si el Email está activo globalmente para la clínica
            const { data: config } = await supabase
                .from('email_configs')
                .select('is_active')
                .eq('clinic_id', agenda.clinic_id)
                .maybeSingle();

            if (!config || !config.is_active) return;

            const { data: template } = await supabase
                .from('email_templates')
                .select('*')
                .eq('clinic_id', agenda.clinic_id)
                .eq('event_type', eventType)
                .eq('is_active', true)
                .maybeSingle();

            if (!template) return;

            let subject = template.subject
                .replace(/{paciente}/g, citaData.nombres_completos)
                .replace(/{fecha}/g, citaData.fecha)
                .replace(/{hora}/g, citaData.hora);

            let message = template.content
                .replace(/{paciente}/g, citaData.nombres_completos)
                .replace(/{fecha}/g, citaData.fecha)
                .replace(/{hora}/g, citaData.hora);

            const { data, error } = await supabase.functions.invoke('send-email-hostinger', {
                body: {
                    clinicId: agenda.clinic_id,
                    to: citaData.email,
                    subject: subject,
                    body: message,
                    patientName: citaData.nombres_completos
                }
            });
            if (error) throw error;
            console.log("Email Sent Successfully:", data);
        } catch (e) {
            console.error("Error triggering Email:", e);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (userRole !== "superuser" && userRole !== "admin") {
            const now = new Date();
            const appointmentDate = new Date(`${formData.fecha}T${formData.hora}`);
            if (appointmentDate < now) {
                alert("No puedes agendar citas en el pasado. Contacta a un administrador.");
                return;
            }
        }

        const s = configServicios.find(as => as.service.nombre === formData.tipo_servicio);
        const isValid = validateTime(formData.hora, s ? s.service.duracion_minutos : 30);
        if (!isValid) return;

        setLoading(true);
        try {
            if (initialData && initialData.id) {
                const { error } = await supabase
                    .from('citas')
                    .update(formData)
                    .eq('id', initialData.id);
                if (error) throw error;
                triggerSMS('booking_confirmation', { ...formData, id: initialData.id });
                triggerEmail('booking_confirmation', { ...formData, id: initialData.id });
            } else {
                const { data, error } = await supabase
                    .from('citas')
                    .insert([{ ...formData, agenda_id: agendaId }])
                    .select()
                    .single();

                if (error) throw error;
                triggerSMS('booking_confirmation', data);
                triggerEmail('booking_confirmation', data);
            }
            onCitaCreated();
        } catch (error) {
            console.error("Error:", error);
            alert("Error al procesar la cita: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal-content agenda-form-card" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={onCancel} title="Cerrar">×</button>
                <h3>{initialData ? "Editar Cita" : "Agendar Cita"} - {formData.fecha}</h3>
                <form onSubmit={handleSubmit} className="agenda-grid-form">
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label>Nombres Completos</label>
                        <input type="text" name="nombres_completos" value={formData.nombres_completos} onChange={handleChange} required autoComplete="off" />

                        {patientSuggestions.length > 0 && (
                            <div className="suggestions-list-overlay">
                                {patientSuggestions.map((p, i) => (
                                    <div key={i} className="suggestion-item" onClick={() => selectPatient(p)}>
                                        <strong>{p.nombres_completos}</strong>
                                        <span>{p.td} {p.documento}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label>Documento (T.D y N°)</label>
                        <div style={{ display: "flex", gap: "5px" }}>
                            <select name="td" value={formData.td} onChange={handleChange} style={{ width: "70px" }}>
                                <option value="CC">CC</option>
                                <option value="TI">TI</option>
                                <option value="CE">CE</option>
                                <option value="PAS">PAS</option>
                            </select>
                            <input type="text" name="documento" value={formData.documento} onChange={handleChange} required style={{ flex: 1 }} autoComplete="off" />
                        </div>

                        {patientSuggestions.length > 0 && formData.documento && !formData.nombres_completos.includes(patientSuggestions[0].nombres_completos) && (
                            <div className="suggestions-list-overlay">
                                {patientSuggestions.map((p, i) => (
                                    <div key={i} className="suggestion-item" onClick={() => selectPatient(p)}>
                                        <strong>{p.nombres_completos}</strong>
                                        <span>{p.td} {p.documento}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="form-group">
                        <label>Celular</label>
                        <input type="text" name="celular" value={formData.celular} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Correo Electrónico</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="ejemplo@correo.com" />
                    </div>
                    <div className="form-group">
                        <label>Hora</label>
                        <input type="time" name="hora" value={formData.hora} onChange={handleChange} required />
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label>Tipo de Servicio / Consulta</label>
                        <select
                            name="tipo_servicio"
                            value={formData.tipo_servicio}
                            onChange={(e) => {
                                const s = configServicios.find(as => as.service.nombre === e.target.value);
                                if (s) {
                                    validateTime(formData.hora, s.service.duracion_minutos);
                                    setFormData(prev => ({
                                        ...prev,
                                        tipo_servicio: e.target.value,
                                        servicios: e.target.value,
                                        cantidad: s.service.concurrency || 1,
                                        total_sesiones: s.service.total_sesiones || 1,
                                        sesion_nro: 1
                                    }));
                                } else {
                                    setValidationError("");
                                    setFormData(prev => ({ ...prev, tipo_servicio: e.target.value, servicios: e.target.value }));
                                }
                            }}
                            required
                            className="custom-file-input"
                        >
                            <option value="">-- Seleccionar Servicio --</option>
                            {availableServices.map(as => (
                                <option key={as.id} value={as.service.nombre}>
                                    {as.service.nombre} ({as.service.duracion_minutos} min) -
                                    ${(as.precio_final || 0).toLocaleString()}
                                    {(as.descuento_porcentaje || 0) > 0 ? ` (Dcto ${as.descuento_porcentaje}%)` : ""}
                                </option>
                            ))}
                        </select>

                        {validationError && (
                            <div className="validation-error-alert">
                                <span>🚫</span>
                                <div>
                                    <strong>Atención:</strong> {validationError}
                                </div>
                            </div>
                        )}

                        {/* SUGERENCIAS DE HORARIOS - REUBICADAS PARA MEJOR VISIBILIDAD */}
                        {formData.tipo_servicio && (
                            <div className="suggestions-container">
                                <label>✨ {suggestedSlots.length > 0 ? 'Horarios disponibles (bloques con 5 min de espacio):' : 'No hay bloques disponibles para este servicio hoy'}</label>
                                {suggestedSlots.length > 0 && (
                                    <div className="suggestions-grid">
                                        {suggestedSlots.map(time => (
                                            <div
                                                key={time}
                                                className={`suggestion-pill ${formData.hora === time ? 'active' : ''}`}
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, hora: time }));
                                                    const s = configServicios.find(as => as.service.nombre === formData.tipo_servicio);
                                                    validateTime(time, s ? s.service.duracion_minutos : 30);
                                                }}
                                            >
                                                {time}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* HORARIOS YA TOMADOS - PARA MOTIVACIÓN */}
                        {formData.tipo_servicio && bookedSlots.length > 0 && (
                            <div className="suggestions-container" style={{ marginTop: '20px' }}>
                                <label>🚀 ¡Gran Trabajo! Horarios ya tomados para hoy:</label>
                                <div className="suggestions-grid">
                                    {bookedSlots.map(time => (
                                        <div key={time} className="suggestion-pill booked">
                                            {time}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>


                    <div className="form-group">
                        <label>Vendedor</label>
                        {(userRole === 'superuser' || userRole === 'admin') ? (
                            <select
                                name="vendedor"
                                value={formData.vendedor}
                                onChange={handleChange}
                                required
                                className="custom-file-input"
                            >
                                <option value="">-- Seleccionar Vendedor --</option>
                                {vendedores.map((v, idx) => (
                                    <option key={idx} value={v.full_name || v.username}>
                                        {v.full_name || v.username}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                name="vendedor"
                                value={formData.vendedor}
                                onChange={handleChange}
                                required
                                readOnly={!!currentUserName}
                                style={currentUserName ? { opacity: 0.7, background: 'rgba(0,0,0,0.1)' } : {}}
                            />
                        )}
                    </div>
                    <div className="form-group">
                        <label>Sesión #</label>
                        <input type="number" name="sesion_nro" value={formData.sesion_nro} onChange={handleChange} min="1" />
                    </div>
                    <div className="form-group">
                        <label>Total Sesiones</label>
                        <input type="number" name="total_sesiones" value={formData.total_sesiones} onChange={handleChange} min="1" />
                    </div>
                    <div className="form-group">
                        <label>Factura #</label>
                        <input type="text" name="factura" value={formData.factura} onChange={handleChange} />
                    </div>
                    <div style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginTop: '10px' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '5px' }}>UTM Source</label>
                            <input type="text" name="utm_source" value={formData.utm_source} onChange={handleChange} placeholder="facebook / google / etc" style={{ fontSize: '0.8rem' }} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '5px' }}>UTM Campaign</label>
                            <input type="text" name="utm_campaign" value={formData.utm_campaign} onChange={handleChange} placeholder="campaña_promo" style={{ fontSize: '0.8rem' }} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '5px' }}>UTM Medium</label>
                            <input type="text" name="utm_medium" value={formData.utm_medium} onChange={handleChange} placeholder="cpc / social / lead" style={{ fontSize: '0.8rem' }} />
                        </div>
                        <div className="form-group" style={{ gridColumn: "span 3" }}>
                            <label style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '5px' }}>Origen / Campaña Meta Ads</label>
                            <select
                                name="meta_ad_id"
                                value={formData.meta_ad_id || ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const camp = metaCampaigns.find(c => c.id === val);
                                    setFormData(prev => ({
                                        ...prev,
                                        meta_ad_id: val,
                                        utm_source: val ? 'facebook' : prev.utm_source,
                                        utm_campaign: camp ? camp.name : prev.utm_campaign
                                    }));
                                }}
                                style={{ fontSize: '0.8rem' }}
                                className="custom-file-input"
                            >
                                <option value="">-- Sin Campaña Específica --</option>
                                {metaCampaigns.map(c => (
                                    <option key={c.id} value={c.id}>📢 {c.name}</option>
                                ))}
                                <option value="manual">➕ Otro (Ingresar Manual)</option>
                            </select>
                        </div>
                        {formData.meta_ad_id === 'manual' && (
                            <div className="form-group" style={{ gridColumn: "span 3" }}>
                                <label style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '5px' }}>ID de Campaña Manual</label>
                                <input type="text" name="meta_ad_id_manual" placeholder="Pega el ID aquí" onChange={(e) => setFormData(prev => ({ ...prev, meta_ad_id: e.target.value }))} style={{ fontSize: '0.8rem' }} />
                            </div>
                        )}
                    </div>

                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label>Observaciones</label>
                        <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows="2"></textarea>
                    </div>
                    <div className="form-actions" style={{ gridColumn: "span 2" }}>
                        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
                        <button type="submit" className="btn-process" disabled={loading || !!validationError}>
                            {loading ? "Guardando..." : (initialData ? "Guardar Cambios" : "Guardar Cita")}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
