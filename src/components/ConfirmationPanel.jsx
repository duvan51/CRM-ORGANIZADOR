import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import ConfirmModal from "./ConfirmModal";

const ConfirmationPanel = ({ user, onEditCita, onRefresh }) => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCancelled, setShowCancelled] = useState(false);

    // Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: "",
        message: "",
        icon: "",
        type: "confirm",
        onConfirm: () => { }
    });

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Fetch wider range to include recent history for context
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 60); // Last 60 days
            const dateStr = pastDate.toISOString().split('T')[0];

            let query = supabase
                .from('citas')
                .select('*, agendas(name)')
                .gte('fecha', dateStr);

            if (user.agendas && user.agendas.length > 0) {
                const agendaIds = user.agendas.map(a => a.id);
                query = query.in('agenda_id', agendaIds);
            } else {
                setPackages([]);
                setLoading(false);
                return;
            }

            if (user.role !== 'superuser' && user.role !== 'admin' && user.role !== 'owner') {
                const sellerName = user.full_name || user.username;
                query = query.ilike('vendedor', sellerName);
            }

            const { data, error } = await query.order('fecha', { ascending: true });
            if (error) throw error;

            // Group by Patient + Service
            const groups = {};
            const today = new Date().toISOString().split('T')[0];

            data.forEach(c => {
                const key = `${c.nombres_completos}|${c.tipo_servicio}`;
                if (!groups[key]) {
                    groups[key] = {
                        id: key,
                        patient: c.nombres_completos,
                        service: c.tipo_servicio,
                        sessions: [],
                        urgencyScore: 999
                    };
                }

                // Calc stats
                const diff = new Date(c.fecha) - new Date(today);
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));

                groups[key].sessions.push({
                    ...c,
                    days_until: days,
                    agenda_nombre: c.agendas?.name || "Sin Agenda"
                });
            });

            // Determine Package Status (Urgency)
            // Urgent: Has session <= 1 day && !Confirmed && !Cancelled
            // Warning: Has session <= 2 days && !Confirmed
            // Success: All sessions Confirmed (or past ones)
            // Cancelled: All cancelled? (Usually filters handle this)

            const processedPackages = Object.values(groups).map(g => {
                // Sort sessions by sesion_nro (if available) or date
                g.sessions.sort((a, b) => (a.sesion_nro || 0) - (b.sesion_nro || 0) || new Date(a.fecha) - new Date(b.fecha));

                let status = 'future'; // default
                let score = 3; // 1=Urgent, 2=Warning, 3=Future/Success

                // Check active sessions (not cancelled, not confirmed)
                const pending = g.sessions.filter(s => s.confirmacion !== 'Confirmada' && s.confirmacion !== 'Cancelada' && s.days_until >= -1); // Include yesterday?

                if (pending.length === 0) {
                    // All confirmed or cancelled
                    const hasConfirmed = g.sessions.some(s => s.confirmacion === 'Confirmada');
                    status = hasConfirmed ? 'success' : 'future'; // or 'cancelled'
                    score = 4;
                } else {
                    const minDays = Math.min(...pending.map(s => s.days_until));
                    if (minDays <= 1) {
                        status = 'urgent';
                        score = 1;
                    } else if (minDays <= 3) {
                        status = 'warning';
                        score = 2;
                    } else {
                        status = 'future';
                        score = 3;
                    }
                }

                // Override if all cancelled
                const allCancelled = g.sessions.every(s => s.confirmacion === 'Cancelada');
                if (allCancelled) {
                    status = 'cancelled';
                    score = 5;
                }

                return { ...g, status, urgencyScore: score };
            });

            setPackages(processedPackages);

        } catch (e) {
            console.error(e);
            setError("Error cargando paquetes");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [user]);

    const handleConfirm = (citaId) => {
        setConfirmModal({
            isOpen: true,
            title: "Confirmar Sesión",
            message: "¿Deseas marcar esta sesión como confirmada?",
            icon: "✅",
            type: "confirm",
            onConfirm: async () => {
                try {
                    const { error } = await supabase.from('citas').update({ confirmacion: "Confirmada" }).eq('id', citaId);
                    if (error) throw error;
                    fetchData();
                    if (onRefresh) onRefresh();
                } catch (e) { alert("Error al confirmar"); }
            }
        });
    };

    const handleCancel = (citaId) => {
        setConfirmModal({
            isOpen: true,
            title: "Eliminar Sesión",
            message: "¿Estás seguro? Esta acción no se puede deshacer.",
            icon: "🗑️",
            type: "danger",
            onConfirm: async () => {
                try {
                    const { error } = await supabase.from('citas').update({ confirmacion: "Cancelada" }).eq('id', citaId);
                    if (error) throw error;
                    fetchData();
                    if (onRefresh) onRefresh();
                } catch (e) { alert("Error al eliminar"); }
            }
        });
    };

    const handleWhatsApp = (celular, nombre, fecha, hora) => {
        const msg = `Hola ${nombre}, te recordamos tu sesión para el ${fecha} a las ${hora}. Por favor confirma tu asistencia.`;
        window.open(`https://wa.me/57${celular}?text=${encodeURIComponent(msg)}`, "_blank");
    };

    // Columns
    const urgentCols = packages.filter(p => p.status === 'urgent').sort((a, b) => a.urgencyScore - b.urgencyScore);
    const warningCols = packages.filter(p => p.status === 'warning' || p.status === 'future').sort((a, b) => a.urgencyScore - b.urgencyScore); // Future here? Or separate?
    // Actually typically Kanban has: Urgent, Next, Done.
    // Let's put 'urgent' in col 1. 'warning' (Next 2-3 days) in col 2. 'future' in col 2? Or maybe 'success' in 3.
    // User asked "urgent" vs normal.
    // Let's stick to existing cols structure roughly.

    // Strict match
    const colUrgent = packages.filter(p => p.status === 'urgent');
    const colWarning = packages.filter(p => p.status === 'warning' || p.status === 'future'); // Combined Pending
    const colSuccess = packages.filter(p => p.status === 'success');
    const colCancelled = packages.filter(p => p.status === 'cancelled');

    const renderPackageCard = (pkg, styleClass) => (
        <div key={pkg.id} className={`confirmation-card-pro ${styleClass}`} style={{ padding: '0', overflow: 'hidden' }}>
            <div className="card-pro-header" style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                    <h4 className="pro-name">{pkg.patient}</h4>
                    <span className="pro-badge service-badge">{pkg.service}</span>
                </div>
                <div className={`status-indicator ${styleClass.replace('border-', 'status-')}`}></div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.1)' }}>
                {pkg.sessions.map((s, idx) => {
                    const isConfirmed = s.confirmacion === 'Confirmada';
                    const isCancelled = s.confirmacion === 'Cancelada';

                    if (!showCancelled && isCancelled) return null;

                    return (
                        <div key={s.id} style={{
                            display: 'grid',
                            gridTemplateColumns: '30px 1fr auto',
                            gap: '10px',
                            padding: '10px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            alignItems: 'center',
                            opacity: isCancelled ? 0.5 : 1,
                            textDecoration: isCancelled ? 'line-through' : 'none',
                            background: isConfirmed ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>#{s.sesion_nro || idx + 1}</div>

                            <div>
                                <div style={{ fontSize: '0.9rem', color: s.days_until <= 1 && !isConfirmed ? 'var(--danger)' : 'var(--text-main)' }}>
                                    {s.fecha} - {s.hora}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {s.agenda_nombre} {s.days_until >= -1 && s.days_until <= 30 && !isConfirmed ? `(${s.days_until} días)` : ''}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '5px' }}>
                                {/* Only show actions if not cancelled/confirmed (mostly) */}
                                {!isConfirmed && !isCancelled && (
                                    <>
                                        <button className="btn-icon-mini" onClick={() => handleWhatsApp(s.celular, s.nombres_completos, s.fecha, s.hora)} title="WhatsApp">💬</button>
                                        <button className="btn-icon-mini" onClick={() => onEditCita(s)} title="Editar/Aplazar">✏️</button>
                                        <button className="btn-icon-mini" onClick={() => handleConfirm(s.id)} title="Confirmar" style={{ color: 'var(--success)' }}>✅</button>
                                        <button className="btn-icon-mini" onClick={() => handleCancel(s.id)} title="Eliminar" style={{ color: 'var(--danger)' }}>🗑️</button>
                                    </>
                                )}
                                {isConfirmed && <span style={{ color: 'var(--success)', fontSize: '1.2rem' }}>✅</span>}
                                {isCancelled && <span style={{ color: 'var(--danger)', fontSize: '1.2rem' }}>🚫</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Quick Actions Footer for Whole Package? Maybe later */}
        </div>
    );

    return (
        <div className="confirmation-panel-container">
            <div className="panel-header-pro">
                <div>
                    <h2 className="panel-title-pro">
                        <span className="emoji-title">📦</span> Centro de Servicios
                    </h2>
                    <p className="panel-subtitle">Visualiza tus paquetes y sesiones agrupadas.</p>
                </div>
                <button className={`btn-show-cancelled ${showCancelled ? 'active' : ''}`} onClick={() => setShowCancelled(!showCancelled)}>
                    {showCancelled ? "🌙 Ocultar Canceladas" : "🗑️ Ver Canceladas"}
                </button>
            </div>

            <div className="kanban-board-pro">
                {/* URGENT */}
                <div className="kanban-column-pro urgent-col">
                    <div className="column-header-pro">
                        <h3>🔥 Atención Inmediata</h3>
                        <span className="count-badge-pro urgent">{colUrgent.length}</span>
                    </div>
                    <div className="column-content-pro">
                        {colUrgent.map(pkg => renderPackageCard(pkg, "border-urgent"))}
                    </div>
                </div>

                {/* PENDING / FUTURE */}
                <div className="kanban-column-pro warning-col">
                    <div className="column-header-pro">
                        <h3>📅 En Curso</h3>
                        <span className="count-badge-pro warning">{colWarning.length}</span>
                    </div>
                    <div className="column-content-pro">
                        {colWarning.map(pkg => renderPackageCard(pkg, "border-warning"))}
                    </div>
                </div>

                {/* COMPLETED */}
                <div className="kanban-column-pro success-col">
                    <div className="column-header-pro">
                        <h3>✨ Finalizados</h3>
                        <span className="count-badge-pro success">{colSuccess.length}</span>
                    </div>
                    <div className="column-content-pro">
                        {colSuccess.map(pkg => renderPackageCard(pkg, "border-success"))}
                    </div>
                </div>
            </div>

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

            <style>{`
                .btn-icon-mini {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1.1rem;
                    padding: 2px;
                    transition: transform 0.2s;
                }
                .btn-icon-mini:hover { transform: scale(1.2); }
            `}</style>
        </div>
    );
};

export default ConfirmationPanel;
