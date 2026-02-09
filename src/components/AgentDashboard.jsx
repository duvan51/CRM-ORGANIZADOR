import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const AgentDashboard = ({ user }) => {
    const [loading, setLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [firstLoad, setFirstLoad] = useState(true);
    const [citas, setCitas] = useState([]);
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
    });
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [filterStatus, setFilterStatus] = useState("Todas");
    const [allSellers, setAllSellers] = useState([]);
    const [selectedSeller, setSelectedSeller] = useState((user.role === "superuser" || user.role === "admin") ? "Todos" : (user.full_name || user.username));
    const [showDetail, setShowDetail] = useState(null);

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const handleMonthYearChange = (m, y) => {
        setSelectedMonth(m);
        setSelectedYear(y);
        const start = new Date(y, m, 1).toISOString().split('T')[0];
        const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
        setDateRange({ start, end });
    };

    const fetchSellers = async () => {
        if (user.role === 'superuser' || user.role === 'admin' || user.role === 'owner') {
            const clinicId = user.clinic_id || user.id;
            const { data } = await supabase.from('profiles')
                .select('full_name, username')
                .eq('is_active', true)
                .eq('clinic_id', clinicId);
            setAllSellers(data || []);
        }
    };

    const fetchStats = async () => {
        if (!user) return;
        setIsFetching(true);
        try {
            const sellerName = selectedSeller;
            let query = supabase
                .from('citas')
                .select('*')
                .gte('fecha', dateRange.start)
                .lte('fecha', dateRange.end);

            if (user.agendas && user.agendas.length > 0) {
                query = query.in('agenda_id', user.agendas.map(a => a.id));
            } else {
                setCitas([]);
                setIsFetching(false);
                setLoading(false);
                return;
            }

            if (user.role !== 'superuser' && user.role !== 'admin') {
                query = query.ilike('vendedor', sellerName);
            } else if (selectedSeller && selectedSeller !== "Todos") {
                query = query.ilike('vendedor', selectedSeller);
            }

            const { data, error } = await query.order('fecha', { ascending: false });

            if (error) throw error;
            setCitas(data || []);
        } catch (e) {
            console.error("Error fetching dashboard stats:", e);
        } finally {
            setIsFetching(false);
            setLoading(false);
            setFirstLoad(false);
        }
    };

    useEffect(() => {
        fetchSellers();
    }, [user]);

    useEffect(() => {
        fetchStats();
    }, [user, dateRange, selectedSeller]);

    const stats = useMemo(() => {
        let sold = 0;
        let canceled = 0;
        let pending = 0;
        let countSold = 0;
        let countCanceled = 0;

        citas.forEach(c => {
            let valor = 0;
            // Only count value for the first session
            if (!c.sesion_nro || c.sesion_nro === 1) {
                valor = 150000;
                if (c.tipo_servicio && c.tipo_servicio.toLowerCase().includes("sueroterapia")) valor = 550000;
            }

            if (c.confirmacion === 'Confirmada') {
                sold += valor;
                if (!c.sesion_nro || c.sesion_nro === 1) countSold++;
            }
            else if (c.confirmacion === 'Cancelada') {
                canceled += valor;
                if (!c.sesion_nro || c.sesion_nro === 1) countCanceled++;
            }
            else {
                pending += valor;
            }
        });

        const total = citas.length; // Total sessions
        return { sold, canceled, pending, countSold, countCanceled, total };
    }, [citas]);

    const groupedData = useMemo(() => {
        let filtered = citas;
        if (filterStatus !== "Todas") {
            filtered = citas.filter(c => c.confirmacion === filterStatus);
        }

        const groups = {};
        filtered.forEach(c => {
            const pKey = c.documento || c.nombres_completos;
            if (!groups[pKey]) groups[pKey] = {
                id: pKey,
                name: c.nombres_completos,
                doc: c.documento,
                celular: c.celular,
                services: {}
            };

            const sKey = c.tipo_servicio || "General";
            if (!groups[pKey].services[sKey]) groups[pKey].services[sKey] = {
                name: sKey,
                sessions: [],
                packageValue: 0
            };

            groups[pKey].services[sKey].sessions.push(c);

            // Determine Package Value (Assumed from first session type)
            if (!c.sesion_nro || c.sesion_nro === 1) {
                let v = 150000;
                if (c.tipo_servicio && c.tipo_servicio.toLowerCase().includes("sueroterapia")) v = 550000;
                groups[pKey].services[sKey].packageValue = v;
            } else if (groups[pKey].services[sKey].packageValue === 0) {
                // Try to guess value if session 1 is missing in this range but others exist
                let v = 150000;
                if (c.tipo_servicio && c.tipo_servicio.toLowerCase().includes("sueroterapia")) v = 550000;
                groups[pKey].services[sKey].packageValue = v;
            }
        });

        return Object.values(groups).map(g => ({
            ...g,
            services: Object.values(g.services)
        }));
    }, [citas, filterStatus]);

    if (firstLoad) return <div className="loading-spinner">Cargando tu dashboard...</div>;

    return (
        <div className={`agent-dashboard animate-in ${isFetching ? 'is-refreshing' : ''}`}>
            <div className={`dashboard-header-stats ${isFetching ? 'pulse-loading' : ''}`}>
                <div className="dash-card primary">
                    <span className="dash-icon">💰</span>
                    <div className="dash-info">
                        <h3>Total Ventas</h3>
                        <p className="dash-value">${stats.sold.toLocaleString()}</p>
                        <span className="dash-subtitle">{stats.countSold} paquetes confirmados</span>
                    </div>
                </div>
                <div className="dash-card danger">
                    <span className="dash-icon">📉</span>
                    <div className="dash-info">
                        <h3>Total Cancelado</h3>
                        <p className="dash-value">${stats.canceled.toLocaleString()}</p>
                        <span className="dash-subtitle">{stats.countCanceled} perdidas</span>
                    </div>
                </div>
                <div className="dash-card warning">
                    <span className="dash-icon">⏳</span>
                    <div className="dash-info">
                        <h3>En Seguimiento</h3>
                        <p className="dash-value">${stats.pending.toLocaleString()}</p>
                        <span className="dash-subtitle">Potenciales ventas</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-controls card">
                {(user.role === 'superuser' || user.role === 'admin') && (
                    <div className="filter-group">
                        <label>Vendedor</label>
                        <select
                            value={selectedSeller}
                            onChange={(e) => setSelectedSeller(e.target.value)}
                        >
                            <option value="Todos">Administrador (Todos)</option>
                            {allSellers.map((v, idx) => (
                                <option key={idx} value={v.full_name || v.username}>
                                    {v.full_name || v.username}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="filter-group">
                    <label>Periodo (Mes)</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select
                            value={selectedMonth}
                            onChange={e => handleMonthYearChange(parseInt(e.target.value), selectedYear)}
                        >
                            {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={e => handleMonthYearChange(selectedMonth, parseInt(e.target.value))}
                        >
                            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>

                <div className="filter-group">
                    <label>Estado</label>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="Todas">Todas las citas</option>
                        <option value="Confirmada">Confirmadas</option>
                        <option value="Cancelada">Canceladas</option>
                        <option value="Pendiente">Pendientes</option>
                    </select>
                </div>
            </div>

            <div className="dashboard-table-container card">
                <div className="table-header-dash">
                    <h3>Detalle de mi Actividad (Agrupado)</h3>
                </div>
                <div className={`table-wrapper ${isFetching ? 'pulse-loading' : ''}`} style={{ padding: '20px' }}>
                    {groupedData.length === 0 ? (
                        <div style={{ textAlign: 'center', margin: '40px', color: 'var(--text-muted)' }}>No hay actividad en este periodo.</div>
                    ) : (
                        <div className="patient-groups">
                            {groupedData.map(patient => (
                                <div key={patient.id} className="patient-group-card" style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
                                    <div className="group-header" style={{ padding: '15px', background: 'rgba(var(--primary-rgb), 0.1)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>👤 {patient.name}</h4>
                                            <small style={{ color: 'var(--text-muted)' }}>{patient.doc} • {patient.celular}</small>
                                        </div>
                                    </div>

                                    <div className="group-body">
                                        {patient.services.map(service => (
                                            <div key={service.name} className="service-subgroup" style={{ padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span className="pro-badge service-badge" style={{ fontSize: '0.9rem' }}>{service.name}</span>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{service.sessions.length} sesiones</span>
                                                    </div>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                                        ${service.packageValue.toLocaleString()}
                                                    </div>
                                                </div>

                                                <div className="sessions-list" style={{ marginLeft: '10px', paddingLeft: '10px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                                                    {service.sessions.sort((a, b) => (a.sesion_nro || 0) - (b.sesion_nro || 0)).map(s => (
                                                        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '40px 120px 100px 1fr auto', gap: '10px', padding: '6px 0', alignItems: 'center', fontSize: '0.9rem' }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>#{s.sesion_nro || 1}</span>
                                                            <span>{s.fecha}</span>
                                                            <span className={`status-pill ${s.confirmacion.toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>{s.confirmacion}</span>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{s.hora} - {s.vendedor || 'N/A'}</span>
                                                            <button className="btn-icon-mini" onClick={() => setShowDetail(s)} title="Ver Detalles">👁️</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showDetail && (
                <div className="modal-overlay" onClick={() => setShowDetail(null)}>
                    <div className="modal-content animate-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="modal-header-pro">
                            <div>
                                <h2>Detalles de la Cita</h2>
                                <p>Información completa del registro</p>
                            </div>
                            <button className="btn-close" onClick={() => setShowDetail(null)}>×</button>
                        </div>
                        <div className="detail-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '20px',
                            padding: '20px',
                            maxHeight: '70vh',
                            overflowY: 'auto'
                        }}>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Paciente</label>
                                <p style={{ fontSize: '1.1rem', margin: '5px 0' }}>{showDetail.nombres_completos}</p>
                            </div>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Documento</label>
                                <p style={{ fontSize: '1.1rem', margin: '5px 0' }}>{showDetail.td} {showDetail.documento}</p>
                            </div>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Celular</label>
                                <p style={{ fontSize: '1.1rem', margin: '5px 0' }}>{showDetail.celular}</p>
                            </div>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Email</label>
                                <p style={{ fontSize: '1.1rem', margin: '5px 0' }}>{showDetail.email || 'N/A'}</p>
                            </div>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Servicio</label>
                                <p style={{ fontSize: '1.1rem', margin: '5px 0' }}>{showDetail.tipo_servicio}</p>
                            </div>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Estado</label>
                                <p><span className={`status-pill ${showDetail.confirmacion.toLowerCase()}`}>{showDetail.confirmacion}</span></p>
                            </div>
                            <div className="detail-item">
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Sesión</label>
                                <p style={{ fontSize: '1.1rem', margin: '5px 0' }}>{showDetail.sesion_nro} de {showDetail.total_sesiones}</p>
                            </div>
                            <div className="detail-item" style={{ gridColumn: 'span 2' }}>
                                <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Observaciones</label>
                                <div style={{
                                    background: 'var(--btn-secondary-bg)',
                                    padding: '15px',
                                    borderRadius: '12px',
                                    marginTop: '8px',
                                    fontStyle: showDetail.observaciones ? 'normal' : 'italic',
                                    color: showDetail.observaciones ? 'var(--text-main)' : 'var(--text-muted)'
                                }}>
                                    {showDetail.observaciones || 'Sin observaciones registradas.'}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px', borderTop: '1px solid var(--glass-border)' }}>
                            <button className="btn-secondary" onClick={() => setShowDetail(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AgentDashboard;
