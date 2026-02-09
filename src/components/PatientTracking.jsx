import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const PatientTracking = ({ user, onScheduleNext }) => {
    const [loading, setLoading] = useState(true);
    const [citas, setCitas] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchAllCitas = async () => {
        setLoading(true);
        try {
            // Traemos las citas que tengan paquetes o múltiples sesiones
            let query = supabase
                .from('citas')
                .select('*')
                .order('fecha', { ascending: false });

            // 1. Filtrar por Agendas Permitidas (Aislamiento Multi-Tenant)
            if (user.agendas && user.agendas.length > 0) {
                const agendaIds = user.agendas.map(a => a.id);
                query = query.in('agenda_id', agendaIds);
            } else {
                setCitas([]); // Sin agendas, no ve nada
                setLoading(false);
                return;
            }

            // 2. Filtrar por Vendedor si es Agente
            if (user.role !== 'superuser' && user.role !== 'admin' && user.role !== 'owner') {
                const sellerName = user.full_name || user.username;
                query = query.ilike('vendedor', sellerName);
            }

            const { data, error } = await query;

            if (error) throw error;
            setCitas(data || []);
        } catch (e) {
            console.error("Error fetching tracking data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllCitas();
    }, []);

    const groupedPatients = useMemo(() => {
        const groups = {};

        citas.forEach(cita => {
            const key = cita.documento || cita.nombres_completos;
            if (!groups[key]) {
                groups[key] = {
                    info: {
                        nombre: cita.nombres_completos,
                        documento: cita.documento,
                        celular: cita.celular,
                        vendedor: cita.vendedor
                    },
                    history: [],
                    totalExpected: 1,
                    completed: 0
                };
            }
            groups[key].history.push(cita);

            // Actualizamos el total de sesiones esperado basado en el registro más alto encontrado
            if (cita.total_sesiones > groups[key].totalExpected) {
                groups[key].totalExpected = cita.total_sesiones;
            }
            if (cita.confirmacion === 'Confirmada') {
                groups[key].completed++;
            }
        });

        // Convertimos a array y filtramos solo los que son paquetes (total > 1) 
        // o si el usuario buscó por nombre
        return Object.values(groups).filter(p => {
            const matchesSearch = p.info.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.info.documento?.includes(searchTerm);
            return (p.totalExpected > 1 || p.history.length > 1) && matchesSearch;
        });
    }, [citas, searchTerm]);

    if (loading) return <div className="loading-spinner">Cargando Seguimientos...</div>;

    return (
        <div className="patient-tracking animate-in">
            <div className="dashboard-header-stats">
                <div className="dash-card primary">
                    <span className="dash-icon">📋</span>
                    <div className="dash-info">
                        <h3>Tratamientos Activos</h3>
                        <p className="dash-value">{groupedPatients.length}</p>
                        <span className="dash-subtitle">Pacientes en seguimiento</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-controls card">
                <div className="filter-group" style={{ flex: 1 }}>
                    <label>Buscar Paciente</label>
                    <input
                        type="text"
                        placeholder="Nombre o Documento..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="tracking-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px', marginTop: '20px' }}>
                {groupedPatients.map((p, idx) => {
                    const progress = Math.min((p.completed / p.totalExpected) * 100, 100);
                    const isFinished = p.completed >= p.totalExpected;

                    return (
                        <div key={idx} className="card animate-in" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{p.info.nombre}</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {p.info.documento}</span>
                                </div>
                                <span className={`status-pill ${isFinished ? 'confirmada' : 'pendiente'}`}>
                                    {isFinished ? 'Completado' : 'En Curso'}
                                </span>
                            </div>

                            <div className="progress-container" style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.85rem' }}>
                                    <span>Progreso del Tratamiento</span>
                                    <strong>{p.completed} / {p.totalExpected} Sesiones</strong>
                                </div>
                                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${progress}%`,
                                        height: '100%',
                                        background: isFinished ? 'var(--success)' : 'var(--primary)',
                                        transition: 'width 0.5s ease'
                                    }}></div>
                                </div>
                            </div>

                            <div className="mini-history" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '15px' }}>
                                <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: '800', color: 'var(--primary)' }}>Últimas Citas</label>
                                <div style={{ marginTop: '10px' }}>
                                    {p.history.slice(0, 3).map((h, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                            <span>{h.fecha}</span>
                                            <span style={{ fontWeight: '600' }}>{h.confirmacion}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                                <a href={`https://wa.me/${p.info.celular.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: '0.8rem', padding: '8px' }}>
                                    💬 Contactar
                                </a>
                                <button
                                    className="btn-process"
                                    style={{ flex: 1, fontSize: '0.8rem', padding: '8px' }}
                                    onClick={() => onScheduleNext(p.history[0])}
                                >
                                    📅 Agendar Siguiente
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {groupedPatients.length === 0 && (
                <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No se encontraron pacientes con tratamientos multisesión activos.</p>
                </div>
            )}


        </div>
    );
};

export default PatientTracking;
