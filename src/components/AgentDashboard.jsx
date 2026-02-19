import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import AiChatMonitor from "./AiChatMonitor";

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
            alert("SMS reenviado con ├®xito");
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
                            {log.status === 'success' ? 'Ô£ô Enviado' : 'Ô£ù Fallido'}
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
                            {retrying === log.id ? 'Reenviando...' : '­ƒöä Reintentar Envío'}
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
            alert("Email reenviado con ├®xito");
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
                            {log.status === 'success' ? 'Ô£ô Enviado' : 'Ô£ù Fallido'}
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
                            {retrying === log.id ? 'Reenviando...' : '­ƒöä Reintentar Envío'}
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
    const [view, setView] = useState("general"); // "general", "meta", or "profit"

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
        const [expandedCamps, setExpandedCamps] = useState(new Set());
        const [sortConfig, setSortConfig] = useState({ key: 'spend', direction: 'desc' });

        // Filtros de fecha exclusivos para Meta
        const [metaStartDate, setMetaStartDate] = useState(dateRange.start);
        const [metaEndDate, setMetaEndDate] = useState(dateRange.end);

        useEffect(() => {
            const fetchData = async () => {
                setMetaLoading(true);
                try {
                    const clinicId = user.clinic_id || user.id;
                    // Fetch Stats con fechas de Meta
                    const { data: statsData } = await supabase
                        .from('meta_ads_performance')
                        .select('*')
                        .eq('clinic_id', clinicId)
                        .gte('date', metaStartDate)
                        .lte('date', metaEndDate)
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
        }, [metaStartDate, metaEndDate]);

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

        const { campaigns, adsets } = useMemo(() => {
            // 1. Agrupar metaStats por ID para sumar valores del periodo (Base de datos plana)
            const grouped = {};
            metaStats.forEach(s => {
                const key = `${s.campaign_id}_${s.entity_type}`;
                if (!grouped[key]) {
                    grouped[key] = { ...s, spend: 0, clicks: 0, impressions: 0, leads_count: 0 };
                }
                grouped[key].spend += (s.spend || 0);
                grouped[key].clicks += (s.clicks || 0);
                grouped[key].impressions += (s.impressions || 0);
                grouped[key].leads_count += (s.leads_count || 0);
            });

            const aggregatedStats = Object.values(grouped);
            const asets = aggregatedStats.filter(s => s.entity_type === 'adset');
            const camps = aggregatedStats.filter(s => s.entity_type === 'campaign');

            // 2. Resolver Agenda por Adset con Herencia
            const getAgendaForAdset = (adset) => {
                // Prioridad 1: Mapeo directo del Adset
                const directMap = mappings.find(m => m.meta_entity_id === adset.campaign_id);
                if (directMap) return directMap.agenda_id;

                // Prioridad 2: Herencia de la Campaña Padre
                const parentMap = mappings.find(m => m.meta_entity_id === adset.parent_id);
                if (parentMap) return parentMap.agenda_id;

                return null; // Sin asignar
            };

            // Pre-calcular leads de CRM para cada entidad para ordenamiento
            const getLeadsForEntity = (entityId, entityName) => {
                return metaLeadsInCitas.filter(c => c.meta_ad_id === entityId || c.utm_campaign === entityName).length;
            };

            const getCPLForEntity = (spend, leadsCount) => {
                return leadsCount > 0 ? (spend / leadsCount) : spend;
            };

            let campsData = [];
            let filteredAdsets = [];

            if (selectedAgendaId === "Todas") {
                filteredAdsets = asets;
            } else {
                const targetId = parseInt(selectedAgendaId);
                // Filtrar Adsets que pertenecen a esta agenda (por mapeo directo o herencia)
                filteredAdsets = asets.filter(a => getAgendaForAdset(a) === targetId);
            }

            // Construir campañas basadas ÚNICAMENTE en los adsets filtrados (Concordancia Real Universal)
            const resolvedCampsMap = {};
            filteredAdsets.forEach(a => {
                const pId = a.parent_id;
                if (!pId) return;

                if (!resolvedCampsMap[pId]) {
                    const baseCamp = camps.find(c => c.campaign_id === pId);
                    if (baseCamp) {
                        resolvedCampsMap[pId] = { ...baseCamp, spend: 0, clicks: 0, impressions: 0, leads_count: 0 };
                    } else {
                        resolvedCampsMap[pId] = {
                            campaign_id: pId,
                            campaign_name: "Campaña (Detalle)",
                            entity_type: 'campaign',
                            spend: 0, clicks: 0, impressions: 0, leads_count: 0
                        };
                    }
                }
                resolvedCampsMap[pId].spend += a.spend;
                resolvedCampsMap[pId].clicks += a.clicks;
                resolvedCampsMap[pId].impressions += a.impressions;
                resolvedCampsMap[pId].leads_count += a.leads_count;
            });

            // Incluir pautas mapeadas directamente que no tengan adset con gasto pero deban verse
            if (selectedAgendaId !== "Todas") {
                const targetId = parseInt(selectedAgendaId);
                mappings.filter(m => m.agenda_id === targetId).forEach(m => {
                    const camp = camps.find(c => c.campaign_id === m.meta_entity_id);
                    if (camp && !resolvedCampsMap[camp.campaign_id]) {
                        resolvedCampsMap[camp.campaign_id] = { ...camp };
                    }
                });
            } else {
                camps.forEach(c => {
                    if (!resolvedCampsMap[c.campaign_id]) {
                        const hasAdsets = asets.some(a => a.parent_id === c.campaign_id);
                        if (!hasAdsets) {
                            resolvedCampsMap[c.campaign_id] = { ...c };
                        }
                    }
                });
            }

            campsData = Object.values(resolvedCampsMap);

            // APLICAR ORDENAMIENTO
            const sortData = (data) => {
                return [...data].sort((a, b) => {
                    let valA, valB;

                    switch (sortConfig.key) {
                        case 'campaign_name':
                            valA = (a.campaign_name || '').toLowerCase();
                            valB = (b.campaign_name || '').toLowerCase();
                            break;
                        case 'spend':
                            valA = a.spend;
                            valB = b.spend;
                            break;
                        case 'clicks':
                            valA = a.clicks;
                            valB = b.clicks;
                            break;
                        case 'cpl':
                            valA = getCPLForEntity(a.spend, a.leads_count);
                            valB = getCPLForEntity(b.spend, b.leads_count);
                            break;
                        case 'leads':
                            valA = getLeadsForEntity(a.campaign_id, a.campaign_name);
                            valB = getLeadsForEntity(b.campaign_id, b.campaign_name);
                            break;
                        default:
                            valA = a.spend;
                            valB = b.spend;
                    }

                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });
            };

            return { campaigns: sortData(campsData), adsets: filteredAdsets };
        }, [metaStats, mappings, selectedAgendaId, sortConfig, metaLeadsInCitas]);

        const totals = useMemo(() => {
            return campaigns.reduce((acc, curr) => ({
                spend: acc.spend + (curr.spend || 0),
                clicks: acc.clicks + (curr.clicks || 0),
                impressions: acc.impressions + (curr.impressions || 0),
                leads: acc.leads + (curr.leads_count || 0)
            }), { spend: 0, clicks: 0, impressions: 0, leads: 0 });
        }, [campaigns]);



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
                        <span className="dash-icon">­ƒÆ░</span>
                        <div className="dash-info">
                            <h3>Ventas Meta</h3>
                            <p className="dash-value">${revenueFromMeta.toLocaleString()}</p>
                            <span className="dash-subtitle">{metaLeadsInCitas.filter(c => c.confirmacion === 'Confirmada').length} cierres</span>
                        </div>
                    </div>
                    <div className="dash-card warning">
                        <span className="dash-icon">­ƒôê</span>
                        <div className="dash-info">
                            <h3>ROAS (Retorno)</h3>
                            <p className="dash-value">
                                {totals.spend > 0 ? (revenueFromMeta / totals.spend).toFixed(2) : '0.00'}x
                            </p>
                            <span className="dash-subtitle">ROI sobre inversión</span>
                        </div>
                    </div>
                </div>

                <div className="dashboard-controls card" style={{ marginBottom: '20px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="filter-group">
                        <label>Filtrar por Agenda</label>
                        <select value={selectedAgendaId} onChange={e => setSelectedAgendaId(e.target.value)}>
                            <option value="Todas">Todas las Agendas</option>
                            {user.agendas?.map(ag => (
                                <option key={ag.id} value={ag.id}>{ag.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-group" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexDirection: 'row' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem' }}>Desde</label>
                            <input type="date" value={metaStartDate} onChange={e => setMetaStartDate(e.target.value)} style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ccc', background: '#ffffff', color: '#333', fontWeight: '600' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.85rem' }}>Hasta</label>
                            <input type="date" value={metaEndDate} onChange={e => setMetaEndDate(e.target.value)} style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ccc', background: '#ffffff', color: '#333', fontWeight: '600' }} />
                        </div>
                    </div>
                </div>

                <div className="dashboard-table-container card">
                    <div className="table-header-dash">
                        <h3>Rendimiento por Campaña {selectedAgendaId !== "Todas" ? `(Agenda: ${user.agendas?.find(a => a.id === parseInt(selectedAgendaId))?.name || 'Seleccionada'})` : ''}</h3>
                    </div>
                    <div className="table-wrapper" style={{ padding: '0 20px 20px 20px' }}>
                        {campaigns.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                {metaLoading ? "Cargando datos de Meta..." : "No hay datos de campañas asignadas a esta agenda en este periodo."}
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                        {[
                                            { label: 'Campaña', key: 'campaign_name' },
                                            { label: 'Gasto', key: 'spend' },
                                            { label: 'Clicks', key: 'clicks' },
                                            { label: 'CPL', key: 'cpl' },
                                            { label: 'Leads (CRM)', key: 'leads' }
                                        ].map(col => (
                                            <th
                                                key={col.key}
                                                style={{ padding: '12px', cursor: 'pointer', userSelect: 'none' }}
                                                onClick={() => {
                                                    setSortConfig(prev => ({
                                                        key: col.key,
                                                        direction: prev.key === col.key && prev.direction === 'desc' ? 'asc' : 'desc'
                                                    }));
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    {col.label}
                                                    <span style={{ fontSize: '0.7rem', color: sortConfig.key === col.key ? 'var(--primary)' : '#666' }}>
                                                        {sortConfig.key === col.key ? (sortConfig.direction === 'desc' ? 'Ôû╝' : 'Ôû▓') : 'Ôåò'}
                                                    </span>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaigns.map(camp => {
                                        const isExpanded = expandedCamps.has(camp.campaign_id);
                                        const children = adsets.filter(a => a.parent_id === camp.campaign_id);

                                        return (
                                            <React.Fragment key={camp.campaign_id}>
                                                <tr
                                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: isExpanded ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                                                    onClick={() => {
                                                        const next = new Set(expandedCamps);
                                                        if (isExpanded) next.delete(camp.campaign_id);
                                                        else next.add(camp.campaign_id);
                                                        setExpandedCamps(next);
                                                    }}
                                                >
                                                    <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '0.8rem', width: '15px' }}>{isExpanded ? 'Ôû╝' : 'ÔûÂ'}</span>
                                                        <strong>­ƒôó {camp.campaign_name}</strong>
                                                    </td>
                                                    <td style={{ padding: '12px', fontWeight: 700 }}>${camp.spend.toLocaleString()}</td>
                                                    <td style={{ padding: '12px' }}>{camp.clicks}</td>
                                                    <td style={{ padding: '12px' }}>
                                                        ${camp.leads_count > 0 ? (camp.spend / camp.leads_count).toFixed(0) : camp.spend}
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        {metaLeadsInCitas.filter(c => c.meta_ad_id === camp.campaign_id || c.utm_campaign === camp.campaign_name).length}
                                                    </td>
                                                </tr>
                                                {isExpanded && children.map(adset => (
                                                    <tr key={adset.campaign_id} style={{ background: 'rgba(0,0,0,0.2)', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                        <td style={{ padding: '10px 10px 10px 40px', color: 'var(--text-muted)' }}>
                                                            ­ƒôª {adset.campaign_name}
                                                        </td>
                                                        <td style={{ padding: '10px' }}>${adset.spend.toLocaleString()}</td>
                                                        <td style={{ padding: '10px' }}>{adset.clicks}</td>
                                                        <td style={{ padding: '10px' }}>
                                                            ${adset.leads_count > 0 ? (adset.spend / adset.leads_count).toFixed(0) : adset.spend}
                                                        </td>
                                                        <td style={{ padding: '10px' }}>
                                                            {metaLeadsInCitas.filter(c => c.meta_ad_id === adset.campaign_id).length}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const ConsolidatedView = () => {
        const [manualData, setManualData] = useState([]);
        const [metaAggregated, setMetaAggregated] = useState({});
        const [loading, setLoading] = useState(true);
        const [saving, setSaving] = useState(false);
        const [isEditing, setIsEditing] = useState(false);

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth(); // 0-11

        const allAgendas = [{ id: -1, name: "­ƒîÉ TOTAL CONSOLIDADO / CLÍNICA" }, ...(user.agendas || [])];
        const allSellersWithGeneral = [{ full_name: "­ƒÆ╝ VENTA PRESENCIAL / GENERAL" }, ...allSellers];

        // Calcular Totales Globales (Sumatoria)
        const getGlobalTotals = () => {
            let totalAds = Object.values(metaAggregated).reduce((a, b) => a + b, 0);
            let totalSales = manualData.filter(d => d.agenda_id !== null).reduce((a, b) => a + (b.agendados_cop || 0), 0);
            let totalLeads = manualData.filter(d => d.agenda_id !== null).reduce((a, b) => a + (b.leads_received || 0), 0);

            // Consolidar estadísticas de agentes
            let globalAgentStats = {};
            manualData.filter(d => d.agenda_id !== null).forEach(d => {
                if (d.agent_stats) {
                    Object.keys(d.agent_stats).forEach(agent => {
                        if (!globalAgentStats[agent]) globalAgentStats[agent] = { sales: 0, leads: 0 };
                        globalAgentStats[agent].sales += (d.agent_stats[agent].sales || 0);
                        globalAgentStats[agent].leads += (d.agent_stats[agent].leads || 0);
                    });
                }
            });

            return { adsSpend: totalAds, agendados_cop: totalSales, leads_received: totalLeads, agent_stats: globalAgentStats };
        };

        const globalTotals = getGlobalTotals();

        // Cargar datos consolidados
        useEffect(() => {
            const fetchConsolidated = async () => {
                setLoading(true);
                const clinicId = user.clinic_id || user.id;

                // 1. Meta Ads Performance para el mes seleccionado
                const mStart = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
                const mEnd = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];

                const { data: adsData } = await supabase
                    .from('meta_ads_performance')
                    .select('*')
                    .eq('clinic_id', clinicId)
                    .gte('date', mStart)
                    .lte('date', mEnd);

                // Agrupar por agenda
                const { data: maps } = await supabase.from('meta_ads_agenda_mapping').select('*').eq('clinic_id', clinicId);

                const adsByAgenda = {};
                adsData?.forEach(s => {
                    if (s.entity_type === 'adset') {
                        // Resolver agenda por adset con herencia (Prioridad: Adset > Campaña)
                        const directMap = maps?.find(m => m.meta_entity_id === s.campaign_id);
                        const parentMap = maps?.find(m => m.meta_entity_id === s.parent_id);
                        const resolvedAgendaId = directMap?.agenda_id || parentMap?.agenda_id;

                        if (resolvedAgendaId) {
                            if (!adsByAgenda[resolvedAgendaId]) adsByAgenda[resolvedAgendaId] = 0;
                            adsByAgenda[resolvedAgendaId] += (s.spend || 0);
                        }
                    }
                });
                setMetaAggregated(adsByAgenda);

                // 2. Datos Manuales
                const { data: manData } = await supabase
                    .from('manual_performance_data')
                    .select('*')
                    .eq('clinic_id', clinicId)
                    .eq('month', selectedMonth + 1)
                    .eq('year', selectedYear);

                setManualData(manData || []);
                setLoading(false);
            };
            fetchConsolidated();
        }, [selectedMonth, selectedYear]);

        const handleSave = async (agendaId, field, value) => {
            setSaving(true);
            const clinicId = user.clinic_id || user.id;
            const existing = manualData.find(d => d.agenda_id === agendaId);

            const payload = {
                clinic_id: clinicId,
                agenda_id: agendaId === -1 ? null : agendaId,
                month: selectedMonth + 1,
                year: selectedYear,
                ...(existing || {}),
                [field]: value,
                updated_at: new Date().toISOString()
            };

            // Eliminar ids nulos o problematicos si existen en el spread de 'existing'
            if (payload.id === undefined) delete payload.id;

            const { data, error } = await supabase
                .from('manual_performance_data')
                .upsert(payload, { onConflict: 'clinic_id,agenda_id,month,year' })
                .select()
                .single();

            if (!error) {
                setManualData(prev => {
                    const filtered = prev.filter(d => d.agenda_id !== agendaId);
                    return [...filtered, data];
                });
            }
            setSaving(false);
        };

        const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(val));

        return (
            <div className="consolidated-view animate-in">
                <div className="dashboard-controls card" style={{ marginBottom: '20px', padding: '25px', background: 'rgba(var(--primary-rgb), 0.03)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div className="year-selector-premium" style={{
                            display: 'flex',
                            gap: '15px',
                            alignItems: 'center',
                            background: 'var(--card-bg)',
                            padding: '8px 20px',
                            borderRadius: '16px',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                            <label style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)', opacity: 0.8 }}>Año Fiscal</label>
                            <select
                                value={selectedYear}
                                onChange={e => handleMonthYearChange(selectedMonth, parseInt(e.target.value))}
                                style={{
                                    background: 'var(--primary)',
                                    color: 'white',
                                    borderRadius: '10px',
                                    padding: '6px 18px',
                                    border: 'none',
                                    fontWeight: '700',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    boxShadow: '0 2px 8px rgba(var(--primary-rgb), 0.3)'
                                }}
                            >
                                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        <div style={{ flex: 1 }}></div>

                        <button
                            className={`btn-${isEditing ? 'success' : 'primary'}`}
                            onClick={() => setIsEditing(!isEditing)}
                            style={{
                                padding: '10px 25px',
                                borderRadius: '25px',
                                display: 'flex',
                                gap: '10px',
                                alignItems: 'center',
                                fontWeight: '700',
                                fontSize: '0.95rem',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: isEditing ? '0 10px 20px rgba(16, 185, 129, 0.3)' : '0 10px 20px rgba(99, 102, 241, 0.3)',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>{isEditing ? '­ƒöÆ' : '­ƒöô'}</span>
                            {isEditing ? 'Finalizar Edición' : 'Editar Datos'}
                        </button>
                    </div>

                    <div className="months-navigation" style={{
                        display: 'flex',
                        gap: '8px',
                        overflowX: 'auto',
                        paddingBottom: '10px',
                        borderTop: '1px solid var(--glass-border)',
                        paddingTop: '15px'
                    }}>
                        {months.map((m, i) => {
                            const isFuture = selectedYear === currentYear && i > currentMonth;
                            const isActive = selectedMonth === i;

                            return (
                                <button
                                    key={m}
                                    disabled={isFuture}
                                    onClick={() => handleMonthYearChange(i, selectedYear)}
                                    style={{
                                        padding: '8px 15px',
                                        borderRadius: '15px',
                                        border: '1px solid var(--glass-border)',
                                        background: isActive ? 'var(--primary)' : 'transparent',
                                        color: isFuture ? '#666' : 'white',
                                        cursor: isFuture ? 'not-allowed' : 'pointer',
                                        opacity: isFuture ? 0.4 : 1,
                                        transition: 'all 0.2s',
                                        fontSize: '0.85rem',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {m}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="dashboard-table-container card">
                    <div className="table-header-dash" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Rentabilidad por Sede/Agenda ({months[selectedMonth]} {selectedYear})</h3>
                        {saving && <span style={{ fontSize: '0.8rem', color: 'var(--primary)', animation: 'pulse 1s infinite' }}>ÔÅ│ Guardando cambios...</span>}
                    </div>
                    <div className="table-wrapper" style={{ padding: '20px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px' }}>Agenda / Ciudad</th>
                                    <th style={{ padding: '12px' }}>Inversión Ads</th>
                                    <th style={{ padding: '12px' }}>Ventas Reales (COP)</th>
                                    <th style={{ padding: '12px' }}>ROI</th>
                                    <th style={{ padding: '12px' }}>Eficiencia % (Inv/Venta)</th>
                                    <th style={{ padding: '12px' }}>Leads CRM (Agente)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allAgendas.map(ag => {
                                    const isGlobalRow = ag.id === -1;
                                    const adsSpend = isGlobalRow ? globalTotals.adsSpend : (metaAggregated[ag.id] || 0);
                                    const man = isGlobalRow ? globalTotals : (manualData.find(d => d.agenda_id === ag.id) || { agendados_cop: 0, leads_received: 0, agent_stats: {} });
                                    const roi = adsSpend > 0 ? (man.agendados_cop / adsSpend).toFixed(2) : '0.00';

                                    const target = adsSpend * 3;
                                    const progress = Math.min((man.agendados_cop / (target || 1)) * 100, 100);

                                    return (
                                        <React.Fragment key={ag.id}>
                                            <tr style={{
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                background: isGlobalRow ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent',
                                                borderLeft: isGlobalRow ? '4px solid var(--primary)' : 'none'
                                            }}>
                                                <td style={{ padding: '12px' }}>
                                                    <strong style={{ color: isGlobalRow ? 'var(--primary)' : 'inherit' }}>{ag.name}</strong>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        {isGlobalRow ? 'Suma automática de todas las sedes' : 'Sede / Servicio'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{formatCOP(adsSpend)}</td>
                                                <td style={{ padding: '12px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                        {isEditing && !isGlobalRow ? (
                                                            <input
                                                                type="number"
                                                                placeholder="$ 0"
                                                                value={man.agendados_cop || ''}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setManualData(prev => {
                                                                        const existing = prev.find(d => d.agenda_id === ag.id);
                                                                        if (existing) return prev.map(d => d.agenda_id === ag.id ? { ...d, agendados_cop: val } : d);
                                                                        return [...prev, { agenda_id: ag.id, agendados_cop: val }];
                                                                    });
                                                                }}
                                                                onBlur={e => handleSave(ag.id, 'agendados_cop', parseFloat(e.target.value) || 0)}
                                                                style={{
                                                                    background: '#ffffff', border: '2px solid var(--primary)', color: '#1a1a1a',
                                                                    padding: '8px', borderRadius: '8px', width: '150px', fontWeight: 'bold', fontSize: '1rem'
                                                                }}
                                                            />
                                                        ) : (
                                                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isGlobalRow ? 'var(--primary)' : 'inherit' }}>
                                                                {formatCOP(man.agendados_cop)}
                                                            </span>
                                                        )}
                                                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                                                            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    <div style={{
                                                        padding: '8px 12px', borderRadius: '8px',
                                                        background: parseFloat(roi) > 3 ? 'rgba(46, 213, 115, 0.1)' : parseFloat(roi) > 1 ? 'rgba(255, 165, 2, 0.1)' : 'rgba(255, 71, 87, 0.1)',
                                                        border: `1px solid ${parseFloat(roi) > 3 ? '#2ed573' : parseFloat(roi) > 1 ? '#ffa502' : '#ff4757'}`,
                                                        textAlign: 'center', minWidth: '80px'
                                                    }}>
                                                        <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 'bold', color: parseFloat(roi) > 3 ? '#2ed573' : parseFloat(roi) > 1 ? '#ffa502' : '#ff4757' }}>
                                                            {roi}x
                                                        </span>
                                                        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.8 }}>ROI {isGlobalRow ? 'TOTAL' : ''}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    <div style={{
                                                        padding: '8px 12px', borderRadius: '8px',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        border: '1px solid var(--glass-border)',
                                                        textAlign: 'center', minWidth: '80px'
                                                    }}>
                                                        <span style={{
                                                            display: 'block', fontSize: '1.1rem', fontWeight: 'bold',
                                                            color: man.agendados_cop > 0 ? 'var(--primary)' : 'var(--text-muted)'
                                                        }}>
                                                            {man.agendados_cop > 0 ? ((adsSpend / man.agendados_cop) * 100).toFixed(1) : '0'}%
                                                        </span>
                                                        <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.8 }}>Eficiencia %</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    {isEditing && !isGlobalRow ? (
                                                        <input
                                                            type="number"
                                                            placeholder="0 leads"
                                                            value={man.leads_received || ''}
                                                            onChange={e => {
                                                                const val = parseInt(e.target.value) || 0;
                                                                setManualData(prev => {
                                                                    const existing = prev.find(d => d.agenda_id === ag.id);
                                                                    if (existing) return prev.map(d => d.agenda_id === ag.id ? { ...d, leads_received: val } : d);
                                                                    return [...prev, { agenda_id: ag.id, leads_received: val }];
                                                                });
                                                            }}
                                                            onBlur={e => handleSave(ag.id, 'leads_received', parseInt(e.target.value) || 0)}
                                                            style={{ background: '#ffffff', border: '1px solid #ced4da', color: '#1a1a1a', padding: '8px', borderRadius: '6px', width: '80px', fontWeight: '600' }}
                                                        />
                                                    ) : (
                                                        <span style={{ fontWeight: '600', color: isGlobalRow ? 'var(--primary)' : 'inherit' }}>{man.leads_received || 0} Leads</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {/* Desempeño por Agente (Celdas anidadas) */}
                                            <tr style={{ background: isGlobalRow ? 'rgba(var(--primary-rgb), 0.03)' : 'rgba(0,0,0,0.1)' }}>
                                                <td colSpan="6" style={{ padding: '10px 10px 15px 40px' }}>
                                                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                            {isGlobalRow ? '­ƒæñ TOTAL AGENTES:' : '­ƒæñ AGENTES:'}
                                                        </span>
                                                        {allSellersWithGeneral.map(seller => {
                                                            const sName = seller.full_name || seller.username;
                                                            const sData = man.agent_stats?.[sName] || { sales: 0, leads: 0 };

                                                            return (
                                                                <div key={sName} style={{
                                                                    display: 'flex', gap: '5px', alignItems: 'center',
                                                                    background: isGlobalRow ? 'rgba(var(--primary-rgb), 0.1)' : 'rgba(255,255,255,0.03)',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '15px', border: '1px solid var(--glass-border)'
                                                                }}>
                                                                    <span style={{ fontSize: '0.75rem' }}>{sName}:</span>
                                                                    {isEditing && !isGlobalRow ? (
                                                                        <>
                                                                            <input
                                                                                type="number" placeholder="$"
                                                                                value={sData.sales || ''}
                                                                                onChange={e => {
                                                                                    const val = parseFloat(e.target.value) || 0;
                                                                                    const nextStats = { ...man.agent_stats, [sName]: { ...sData, sales: val } };
                                                                                    setManualData(prev => prev.map(d => d.agenda_id === ag.id ? { ...d, agent_stats: nextStats } : d));
                                                                                }}
                                                                                onBlur={e => handleSave(ag.id, 'agent_stats', { ...man.agent_stats, [sName]: { ...sData, sales: parseFloat(e.target.value) || 0 } })}
                                                                                style={{ background: '#ffffff', border: '1px solid var(--primary)', color: '#1a1a1a', width: '80px', fontSize: '0.7rem', borderRadius: '4px', padding: '2px', textAlign: 'center' }}
                                                                            />
                                                                            <input
                                                                                type="number" placeholder="L"
                                                                                value={sData.leads || ''}
                                                                                onChange={e => {
                                                                                    const val = parseInt(e.target.value) || 0;
                                                                                    const nextStats = { ...man.agent_stats, [sName]: { ...sData, leads: val } };
                                                                                    setManualData(prev => prev.map(d => d.agenda_id === ag.id ? { ...d, agent_stats: nextStats } : d));
                                                                                }}
                                                                                onBlur={e => handleSave(ag.id, 'agent_stats', { ...man.agent_stats, [sName]: { ...sData, leads: parseInt(e.target.value) || 0 } })}
                                                                                style={{ background: '#f0f0f0', border: '1px solid #ccc', color: '#333', width: '40px', fontSize: '0.75rem', borderRadius: '4px', padding: '2px', textAlign: 'center' }}
                                                                            />
                                                                        </>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                                            {formatCOP(sData.sales)} ({sData.leads || 0}L)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
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
                        color: view === 'general' ? 'white' : 'var(--text-main)',
                        cursor: 'pointer'
                    }}
                >
                    ­ƒôè Estadísticas Generales
                </button>
                <button
                    className={`btn-tab ${view === 'meta' ? 'active' : ''}`}
                    onClick={() => setView('meta')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)',
                        background: view === 'meta' ? 'var(--primary)' : 'transparent',
                        color: view === 'meta' ? 'white' : 'var(--text-main)',
                        cursor: 'pointer'
                    }}
                >
                    📱 Rendimiento Ads
                </button>
                <button
                    className={`btn-tab ${view === 'profit' ? 'active' : ''}`}
                    onClick={() => setView('profit')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)',
                        background: view === 'profit' ? 'var(--primary)' : 'transparent',
                        color: view === 'profit' ? 'white' : 'var(--text-main)',
                        cursor: 'pointer'
                    }}
                >
                    ­ƒÆ╣ Rentabilidad REAL
                </button>
                <button
                    className={`btn-tab ${view === 'aimonitor' ? 'active' : ''}`}
                    onClick={() => setView('aimonitor')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)',
                        background: view === 'aimonitor' ? 'var(--primary)' : 'transparent',
                        color: view === 'aimonitor' ? 'white' : 'var(--text-main)',
                        cursor: 'pointer'
                    }}
                >
                    🤖 Monitor IA
                </button>
            </div>

            {view === 'general' ? (
                <>
                    <div className={`dashboard-header-stats ${isFetching ? 'pulse-loading' : ''}`}>
                        <div className="dash-card primary">
                            <span className="dash-icon">­ƒÆ░</span>
                            <div className="dash-info">
                                <h3>Total Ventas</h3>
                                <p className="dash-value">${stats.sold.toLocaleString()}</p>
                                <span className="dash-subtitle">{stats.countSold} paquetes confirmados</span>
                            </div>
                        </div>
                        <div className="dash-card danger">
                            <span className="dash-icon">­ƒôë</span>
                            <div className="dash-info">
                                <h3>Total Cancelado</h3>
                                <p className="dash-value">${stats.canceled.toLocaleString()}</p>
                                <span className="dash-subtitle">{stats.countCanceled} perdidas</span>
                            </div>
                        </div>
                        <div className="dash-card warning">
                            <span className="dash-icon">ÔÅ│</span>
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
                                                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>­ƒæñ {patient.name}</h4>
                                                    <small style={{ color: 'var(--text-muted)' }}>{patient.doc} "ó {patient.celular}</small>
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
                                                                    <button className="btn-icon-mini" onClick={() => setShowDetail(s)} title="Ver Detalles">­ƒæü´©Å</button>
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
            ) : view === 'meta' ? (
                <MetaAdsView />
            ) : view === 'aimonitor' ? (
                <AiChatMonitor />
            ) : (
                <ConsolidatedView />
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
