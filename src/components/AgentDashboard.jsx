import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";

const SmsLogsList = ({ phone, clinicId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('sms_logs')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('patient_phone', phone)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setLogs(data || []);
        } catch (e) {
            console.error("Error loading SMS logs:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (phone && clinicId) fetchLogs();
    }, [phone, clinicId]);

    const handleRetry = async (log) => {
        setRetrying(log.id);
        try {
            const { data, error } = await supabase.functions.invoke('send-sms-infobip', {
                body: {
                    clinicId,
                    phone: log.patient_phone,
                    message: log.message_content,
                    patientName: log.patient_name
                }
            });
            if (error) throw error;
            alert("SMS reenviado con éxito");
            fetchLogs();
        } catch (e) {
            console.error(e);
            alert("Error al reenviar: " + e.message);
        } finally {
            setRetrying(null);
        }
    };

    if (loading) return <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem' }}>Cargando historial de mensajes...</div>;

    if (logs.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No se han enviado mensajes SMS a este número.</div>;

    return (
        <div className="sms-logs-items" style={{ padding: '10px' }}>
            {logs.map(log => (
                <div key={log.id} style={{
                    padding: '10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '0.8rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{
                            color: log.status === 'success' ? 'var(--success)' : 'var(--danger)',
                            fontWeight: 'bold',
                            textTransform: 'uppercase'
                        }}>
                            {log.status === 'success' ? '✓ Enviado' : '✗ Fallido'}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-main)', opacity: 0.9 }}>{log.message_content}</p>
                    {log.error_details && <p style={{ margin: '5px 0 0 0', color: 'var(--danger)', fontSize: '0.7rem' }}>Error: {log.error_details}</p>}

                    {log.status !== 'success' && (
                        <button
                            onClick={() => handleRetry(log)}
                            disabled={retrying === log.id}
                            style={{
                                marginTop: '10px',
                                padding: '4px 8px',
                                background: 'var(--accent)',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.7rem'
                            }}
                        >
                            {retrying === log.id ? 'Reenviando...' : '🔄 Reintentar Envío'}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};

const EmailLogsList = ({ email, clinicId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('email_logs')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('patient_email', email)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setLogs(data || []);
        } catch (e) {
            console.error("Error loading Email logs:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (email && clinicId) fetchLogs();
    }, [email, clinicId]);

    const handleRetry = async (log) => {
        if (!log.message_content) {
            alert("No se puede reintentar: El contenido del mensaje no fue guardado en este log antiguo.");
            return;
        }
        setRetrying(log.id);
        try {
            const { data, error } = await supabase.functions.invoke('send-email-hostinger', {
                body: {
                    clinicId,
                    to: log.patient_email,
                    subject: log.subject,
                    body: log.message_content,
                    patientName: log.patient_name
                }
            });
            if (error) throw error;
            alert("Email reenviado con éxito");
            fetchLogs();
        } catch (e) {
            console.error(e);
            alert("Error al reenviar email: " + e.message);
        } finally {
            setRetrying(null);
        }
    };

    if (loading) return <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem' }}>Cargando historial de correos...</div>;

    if (logs.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No se han enviado correos a esta dirección.</div>;

    return (
        <div className="email-logs-items" style={{ padding: '10px' }}>
            {logs.map(log => (
                <div key={log.id} style={{
                    padding: '10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '0.8rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{
                            color: log.status === 'success' ? 'var(--success)' : 'var(--danger)',
                            fontWeight: 'bold',
                            textTransform: 'uppercase'
                        }}>
                            {log.status === 'success' ? '✓ Enviado' : '✗ Fallido'}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-main)', opacity: 0.9 }}><strong>{log.subject}</strong></p>
                    {log.error_details && <p style={{ margin: '5px 0 0 0', color: 'var(--danger)', fontSize: '0.7rem' }}>Error: {log.error_details}</p>}

                    {log.status !== 'success' && (
                        <button
                            onClick={() => handleRetry(log)}
                            disabled={retrying === log.id}
                            style={{
                                marginTop: '10px',
                                padding: '4px 8px',
                                background: 'var(--accent)',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.7rem'
                            }}
                        >
                            {retrying === log.id ? 'Reenviando...' : '🔄 Reintentar Envío'}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};

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
    const [view, setView] = useState("general"); // "general" or "meta"

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

    const MetaAdsView = () => {
        const [metaStats, setMetaStats] = useState([]);
        const [metaLoading, setMetaLoading] = useState(true);
        const [mappings, setMappings] = useState([]);
        const [selectedAgendaId, setSelectedAgendaId] = useState("Todas");

        useEffect(() => {
            const fetchData = async () => {
                setMetaLoading(true);
                try {
                    const clinicId = user.clinic_id || user.id;
                    // Fetch Stats
                    const { data: statsData } = await supabase
                        .from('meta_ads_performance')
                        .select('*')
                        .eq('clinic_id', clinicId)
                        .gte('date', dateRange.start)
                        .lte('date', dateRange.end)
                        .order('date', { ascending: false });

                    // Fetch Mappings
                    const { data: mapsData } = await supabase
                        .from('meta_ads_agenda_mapping')
                        .select('*')
                        .eq('clinic_id', clinicId);

                    setMetaStats(statsData || []);
                    setMappings(mapsData || []);
                } catch (e) {
                    console.error("Error loading Meta data:", e);
                } finally {
                    setMetaLoading(false);
                }
            };
            fetchData();
        }, [dateRange]);

        const filteredMetaStats = useMemo(() => {
            if (selectedAgendaId === "Todas") return metaStats;
            const campaignIds = mappings
                .filter(m => m.agenda_id === selectedAgendaId)
                .map(m => m.meta_entity_id);
            return metaStats.filter(s => campaignIds.includes(s.campaign_id));
        }, [metaStats, mappings, selectedAgendaId]);

        const totals = useMemo(() => {
            return filteredMetaStats.reduce((acc, curr) => ({
                spend: acc.spend + (curr.spend || 0),
                clicks: acc.clicks + (curr.clicks || 0),
                impressions: acc.impressions + (curr.impressions || 0),
                leads: acc.leads + (curr.leads_count || 0)
            }), { spend: 0, clicks: 0, impressions: 0, leads: 0 });
        }, [filteredMetaStats]);

        const metaLeadsInCitas = useMemo(() => {
            let filteredCitas = citas;
            if (selectedAgendaId !== "Todas") {
                filteredCitas = citas.filter(c => c.agenda_id === selectedAgendaId);
            }
            return filteredCitas.filter(c =>
                c.utm_source?.toLowerCase().includes('meta') ||
                c.utm_source?.toLowerCase().includes('facebook') ||
                c.utm_source?.toLowerCase().includes('instagram') ||
                mappings.some(m => m.meta_entity_id === c.meta_ad_id && (selectedAgendaId === "Todas" || m.agenda_id === selectedAgendaId))
            );
        }, [citas, selectedAgendaId, mappings]);

        const revenueFromMeta = useMemo(() => {
            return metaLeadsInCitas.reduce((acc, c) => {
                if (c.confirmacion === 'Confirmada') {
                    let v = 150000;
                    if (c.tipo_servicio?.toLowerCase().includes("sueroterapia")) v = 550000;
                    return acc + v;
                }
                return acc;
            }, 0);
        }, [metaLeadsInCitas]);

        return (
            <div className="meta-ads-view animate-in">
                <div className="dashboard-header-stats">
                    <div className="dash-card primary">
                        <span className="dash-icon">📱</span>
                        <div className="dash-info">
                            <h3>Inversión Meta</h3>
                            <p className="dash-value">${totals.spend.toLocaleString()}</p>
                            <span className="dash-subtitle">{totals.clicks} clicks totales</span>
                        </div>
                    </div>
                    <div className="dash-card success">
                        <span className="dash-icon">💰</span>
                        <div className="dash-info">
                            <h3>Ventas Meta</h3>
                            <p className="dash-value">${revenueFromMeta.toLocaleString()}</p>
                            <span className="dash-subtitle">{metaLeadsInCitas.filter(c => c.confirmacion === 'Confirmada').length} cierres</span>
                        </div>
                    </div>
                    <div className="dash-card warning">
                        <span className="dash-icon">📈</span>
                        <div className="dash-info">
                            <h3>ROAS (Retorno)</h3>
                            <p className="dash-value">
                                {totals.spend > 0 ? (revenueFromMeta / totals.spend).toFixed(2) : '0.00'}x
                            </p>
                            <span className="dash-subtitle">ROI sobre inversión</span>
                        </div>
                    </div>
                </div>

                <div className="dashboard-controls card" style={{ marginBottom: '20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div className="filter-group">
                        <label>Filtrar por Agenda</label>
                        <select value={selectedAgendaId} onChange={e => setSelectedAgendaId(e.target.value)}>
                            <option value="Todas">Todas las Agendas</option>
                            {user.agendas?.map(ag => (
                                <option key={ag.id} value={ag.id}>{ag.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="dashboard-table-container card">
                    <div className="table-header-dash">
                        <h3>Rendimiento por Campaña {selectedAgendaId !== "Todas" ? `(Agenda: ${user.agendas.find(a => a.id === selectedAgendaId)?.name})` : ''}</h3>
                    </div>
                    <div className="table-wrapper" style={{ padding: '20px' }}>
                        {filteredMetaStats.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                {metaLoading ? "Cargando datos de Meta..." : "No hay datos de campañas asignadas a esta agenda en este periodo."}
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                        <th style={{ padding: '12px' }}>Campaña</th>
                                        <th style={{ padding: '12px' }}>Gasto</th>
                                        <th style={{ padding: '12px' }}>Clicks</th>
                                        <th style={{ padding: '12px' }}>CPL</th>
                                        <th style={{ padding: '12px' }}>Leads (CRM)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMetaStats.map(stat => (
                                        <tr key={stat.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '12px' }}>{stat.campaign_name}</td>
                                            <td style={{ padding: '12px' }}>${stat.spend.toLocaleString()}</td>
                                            <td style={{ padding: '12px' }}>{stat.clicks}</td>
                                            <td style={{ padding: '12px' }}>
                                                ${stat.leads_count > 0 ? (stat.spend / stat.leads_count).toFixed(0) : stat.spend}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                {metaLeadsInCitas.filter(c => c.meta_ad_id === stat.campaign_id || c.utm_campaign === stat.campaign_name).length}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`agent-dashboard animate-in ${isFetching ? 'is-refreshing' : ''}`}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                    className={`btn-tab ${view === 'general' ? 'active' : ''}`}
                    onClick={() => setView('general')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)',
                        background: view === 'general' ? 'var(--primary)' : 'transparent',
                        color: 'white',
                        cursor: 'pointer'
                    }}
                >
                    📊 Estadísticas Generales
                </button>
                <button
                    className={`btn-tab ${view === 'meta' ? 'active' : ''}`}
                    onClick={() => setView('meta')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)',
                        background: view === 'meta' ? 'var(--primary)' : 'transparent',
                        color: 'white',
                        cursor: 'pointer'
                    }}
                >
                    📱 Rendimiento Meta Ads
                </button>
            </div>

            {view === 'general' ? (
                <>
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
                </>
            ) : (
                <MetaAdsView />
            )}

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

                            {/* --- LISTADO DE SMS Y EMAIL ENVIADOS --- */}
                            <div className="logs-container" style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '10px' }}>
                                <div className="sms-logs-section">
                                    <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Historial SMS</label>
                                    <div style={{
                                        marginTop: '10px',
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--glass-border)',
                                        maxHeight: '200px',
                                        overflowY: 'auto'
                                    }}>
                                        <SmsLogsList phone={showDetail.celular} clinicId={user.clinic_id || user.id} />
                                    </div>
                                </div>
                                <div className="email-logs-section">
                                    <label style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.7rem', textTransform: 'uppercase' }}>Historial Email</label>
                                    <div style={{
                                        marginTop: '10px',
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: '12px',
                                        border: '1px solid var(--glass-border)',
                                        maxHeight: '200px',
                                        overflowY: 'auto'
                                    }}>
                                        <EmailLogsList email={showDetail.email} clinicId={user.clinic_id || user.id} />
                                    </div>
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
