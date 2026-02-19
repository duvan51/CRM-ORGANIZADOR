import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';

const QuickScheduleModal = ({ baseCita, onClose, onSelectSlot, agendaId }) => {
    const [selectedDate, setSelectedDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [slots, setSlots] = useState([]);
    const [error, setError] = useState("");
    const [config, setConfig] = useState(null);
    const [history, setHistory] = useState([]); // Store previous sessions

    // Initial load of config (static for the agenda)
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const [sRes, hRes, hsRes] = await Promise.all([
                    supabase.from('agenda_services').select('*, service:global_services(*)').eq('agenda_id', agendaId),
                    supabase.from('horarios_atencion').select('*').eq('agenda_id', agendaId),
                    supabase.from('horarios_servicios').select('*').eq('agenda_id', agendaId)
                ]);
                setConfig({
                    servicios: sRes.data || [],
                    horarios: hRes.data || [],
                    horariosServicios: hsRes.data || []
                });
            } catch (e) { console.error(e); setError("Error cargando configuración"); }
        };
        fetchConfig();
    }, [agendaId]);



    // Fetch History
    useEffect(() => {
        const loadHistory = async () => {
            if (!baseCita) return;
            let subq = supabase.from('citas')
                .select('fecha, confirmacion, sesion_nro')
                .eq('agenda_id', agendaId)
                .eq('tipo_servicio', baseCita.tipo_servicio)
                .order('sesion_nro', { ascending: true });

            if (baseCita.documento) {
                subq = subq.eq('documento', baseCita.documento);
            } else {
                subq = subq.eq('nombres_completos', baseCita.nombres_completos);
            }

            const { data } = await subq;
            if (data) setHistory(data);
        };
        loadHistory();
    }, [baseCita, agendaId]);

    // Fetch daily constraints and calculate slots when date/config changes
    useEffect(() => {
        if (!selectedDate || !config) return;

        const fetchDailyDocs = async () => {
            setLoading(true);
            setSlots([]);
            setError("");
            try {
                // Fetch dynamic data for the specific date
                const [bRes, cRes] = await Promise.all([
                    supabase.from('bloqueos').select('*').eq('agenda_id', agendaId), // We filter by date in JS or query? Query is better but easier to filter in JS for small sets
                    supabase.from('citas').select('*').eq('agenda_id', agendaId).eq('fecha', selectedDate)
                ]);

                const bloqueos = bRes.data || [];
                const citasDelDia = cRes.data || [];

                calculateSlots(selectedDate, config, bloqueos, citasDelDia);
            } catch (e) {
                console.error(e);
                setError("Error buscando horarios");
            } finally {
                setLoading(false);
            }
        };

        fetchDailyDocs();
    }, [selectedDate, config, agendaId, baseCita]);

    const calculateSlots = (dateStr, { servicios, horarios, horariosServicios }, bloqueos, citasDelDia) => {
        const date = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = (date.getDay() + 6) % 7; // 0=Lunes

        // Find service config
        // Robust matching
        const serviceName = baseCita.tipo_servicio;
        const selectedService = servicios.find(as => as.service.nombre.trim() === serviceName?.trim());

        if (!selectedService) {
            setError(`Servicio '${serviceName}' no configurado en esta agenda.`);
            return;
        }

        const duration = selectedService.service.duracion_minutos || 30;
        const maxSlots = selectedService.service.concurrency || 1;

        // 1. Determine Search Ranges
        let ranges = [];

        // Habilitaciones (Exceptions type 2)
        const habilitaciones = bloqueos.filter(b =>
            b.tipo === 2 &&
            b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
            (b.service_id === null || b.service_id === selectedService.service_id)
        );

        if (habilitaciones.length > 0) {
            habilitaciones.forEach(b => {
                if (b.es_todo_el_dia) ranges.push({ start: 6 * 60, end: 21 * 60 }); // Full day default
                else if (b.hora_inicio && b.hora_fin) {
                    const [h1, m1] = b.hora_inicio.split(':').map(Number);
                    const [h2, m2] = b.hora_fin.split(':').map(Number);
                    ranges.push({ start: h1 * 60 + m1, end: h2 * 60 + m2 });
                }
            });
        } else {
            // Check Full Day Block (Type 1)
            const fullBlock = bloqueos.some(b =>
                b.tipo === 1 && b.es_todo_el_dia &&
                b.fecha_inicio <= dateStr && b.fecha_fin >= dateStr &&
                (b.service_id === null || b.service_id === selectedService.service_id)
            );
            if (fullBlock) {
                setError("Día bloqueado por excepción.");
                return;
            }

            // Normal Schedule
            // Specific Service Schedule?
            const specificRules = horariosServicios.filter(hs => hs.service_id === selectedService.service_id && hs.dia_semana === dayOfWeek);
            if (specificRules.length > 0) {
                specificRules.forEach(r => {
                    const [h1, m1] = r.hora_inicio.split(':').map(Number);
                    const [h2, m2] = r.hora_fin.split(':').map(Number);
                    ranges.push({ start: h1 * 60 + m1, end: h2 * 60 + m2 });
                });
            } else {
                // General Agenda Schedule
                const generalRules = horarios.filter(h => h.dia_semana === dayOfWeek);
                if (generalRules.length === 0) {
                    setError("No hay horario de atención este día.");
                    return;
                }
                generalRules.forEach(r => {
                    const [h1, m1] = r.hora_inicio.split(':').map(Number);
                    const [h2, m2] = r.hora_fin.split(':').map(Number);
                    ranges.push({ start: h1 * 60 + m1, end: h2 * 60 + m2 });
                });
            }
        }

        // 2. Iterate Ranges and Check Availability
        const foundSlots = [];
        ranges.forEach(range => {
            let t = range.start;
            while (t + duration <= range.end) {
                // Check Overlaps (Concurrency)
                const tEnd = t + duration;

                // Check Partial Blocks (Type 1)
                const isBlocked = bloqueos.some(b => {
                    if (b.tipo !== 1 || b.es_todo_el_dia) return false;
                    if (b.fecha_inicio > dateStr || b.fecha_fin < dateStr) return false;
                    const [bh1, bm1] = b.hora_inicio.split(':').map(Number);
                    const [bh2, bm2] = b.hora_fin.split(':').map(Number);
                    const bStart = bh1 * 60 + bm1;
                    const bEnd = bh2 * 60 + bm2;
                    return (t < bEnd && tEnd > bStart);
                });

                if (!isBlocked) {
                    // Check Existing Appointments Concurrency
                    const overlapping = citasDelDia.filter(c => {
                        if (c.confirmacion === 'Cancelada') return false;
                        // Match service concurrency group? 
                        // Usually concurrency is per service TYPE, but here we assume simple match or strict name match
                        // Use strict name match as in AgendaForm
                        if (c.tipo_servicio !== serviceName) return false;

                        const [ch, cm] = c.hora.split(':').map(Number);
                        // Find duration of that cita's service
                        const thatService = servicios.find(s => s.service.nombre === c.tipo_servicio);
                        const cDur = thatService?.service?.duracion_minutos || 30;
                        const cStart = ch * 60 + cm;
                        const cEnd = cStart + cDur;

                        return (t < cEnd && tEnd > cStart);
                    });

                    if (overlapping.length < maxSlots) {
                        const h = Math.floor(t / 60);
                        const m = t % 60;
                        foundSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                }

                t += (duration + 5); // 5 min step
            }
        });

        setSlots(foundSlots);
    };

    return createPortal(
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <h3>Agendar Siguiente Sesión</h3>
                <div style={{ marginBottom: '15px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }}>
                    <p style={{ margin: '5px 0' }}>Paciente: <strong>{baseCita.nombres_completos}</strong></p>
                    <p style={{ margin: '5px 0' }}>Servicio: <strong>{baseCita.tipo_servicio}</strong></p>
                    <p style={{ margin: '5px 0', color: 'var(--primary)' }}>Próxima Sesión: <strong>#{(Number(baseCita.sesion_nro) || 0) + 1}</strong></p>
                </div>

                <div style={{ marginBottom: '15px', maxHeight: '120px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '10px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>HISTORIAL DE SESIONES:</label>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '5px 0', fontSize: '0.85rem' }}>
                        {history.length === 0 ? <li style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Cargando historial...</li> :
                            history.map((h, idx) => (
                                <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: 'var(--text-main)' }}>Sesión {h.sesion_nro || '?'} - {h.fecha}</span>
                                    <span style={{
                                        fontWeight: '600',
                                        color: h.confirmacion === 'Confirmada' ? 'var(--success)' :
                                            h.confirmacion === 'Cancelada' ? 'var(--danger)' : 'var(--warning)'
                                    }}>
                                        {h.confirmacion}
                                    </span>
                                </li>
                            ))
                        }
                    </ul>
                </div>

                <div className="form-group">
                    <label>Selecciona la Fecha:</label>
                    <input
                        type="date"
                        className="custom-file-input"
                        value={selectedDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                </div>

                <div className="slots-container" style={{ marginTop: '20px', maxHeight: '300px', overflowY: 'auto' }}>
                    <label>Horarios Disponibles:</label>
                    {loading && <div className="loading-spinner small">Buscando...</div>}
                    {!loading && selectedDate && slots.length === 0 && !error && (
                        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay horarios disponibles para esta fecha.</p>
                    )}
                    {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', marginTop: '10px' }}>
                        {slots.map(time => (
                            <button
                                key={time}
                                className="slot-btn"
                                style={{
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--primary)',
                                    background: 'rgba(var(--primary-rgb), 0.1)',
                                    color: 'var(--text-main)',
                                    cursor: 'pointer'
                                }}
                                onClick={() => onSelectSlot(selectedDate, time)}
                            >
                                {time}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="modal-footer" style={{ marginTop: '20px' }}>
                    <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default QuickScheduleModal;
