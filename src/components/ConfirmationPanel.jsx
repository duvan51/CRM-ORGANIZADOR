import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const ConfirmationPanel = () => {
    const [citas, setCitas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('citas')
                .select('*, agendas(name)')
                .gte('fecha', today)
                .neq('confirmacion', 'Cancelada')
                .order('fecha', { ascending: true });

            if (error) throw error;

            // Enriquecer datos con days_until y agenda_nombre
            const enrichedData = (data || []).map(c => {
                const diff = new Date(c.fecha) - new Date(today);
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                return {
                    ...c,
                    days_until: days,
                    agenda_nombre: c.agendas?.name || "Sin Agenda"
                };
            });

            setCitas(enrichedData);
        } catch (e) {
            console.error(e);
            setError("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Poll every 30 seconds to keep updated
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleConfirm = async (citaId) => {
        if (!window.confirm("¿Confirmar esta cita?")) return;
        try {
            const { error } = await supabase
                .from('citas')
                .update({ confirmacion: "Confirmada" })
                .eq('id', citaId);

            if (error) throw error;
            fetchData();
        } catch (e) { alert("Error al confirmar"); }
    };

    const handleWhatsApp = (celular, nombre, fecha, hora) => {
        const msg = `Hola ${nombre}, te recordamos tu cita para el ${fecha} a las ${hora}. Por favor confirma tu asistencia.`;
        window.open(`https://wa.me/57${celular}?text=${encodeURIComponent(msg)}`, "_blank");
    };

    // --- FILTERS ---
    const urgentCitas = citas.filter(c => c.days_until <= 1 && c.confirmacion !== "Confirmada").sort((a, b) => a.days_until - b.days_until);
    const nearCitas = citas.filter(c => c.days_until > 1 && c.days_until <= 2 && c.confirmacion !== "Confirmada");
    const confirmedCitas = citas.filter(c => c.confirmacion === "Confirmada").sort((a, b) => new Date(b.fecha) - new Date(a.fecha)); // Most recent first

    const renderCard = (c, colorClass, borderClass) => (
        <div key={c.id} className={`confirmation-card-pro ${borderClass}`}>
            <div className="card-pro-header">
                <div>
                    <h4 className="pro-name">{c.nombres_completos}</h4>
                    <span className="pro-badge service-badge">{c.tipo_servicio}</span>
                </div>
                <div className={`status-indicator ${colorClass}`}></div>
            </div>

            <div className="card-pro-body">
                <div className="info-row">
                    <span className="icon">📅</span>
                    <span className="info-text">{c.fecha} <small>({c.days_until} días)</small></span>
                </div>
                <div className="info-row">
                    <span className="icon">⏰</span>
                    <span className="info-text">{c.hora}</span>
                </div>
                <div className="info-row">
                    <span className="icon">📱</span>
                    <span className="info-text">{c.celular}</span>
                </div>
                <div className="info-row small-agenda">
                    <span className="icon">📂</span>
                    <span>{c.agenda_nombre}</span>
                </div>
            </div>

            <div className="card-pro-actions">
                <button
                    className="btn-pro-icon whatsapp"
                    onClick={() => handleWhatsApp(c.celular, c.nombres_completos, c.fecha, c.hora)}
                    title="Enviar WhatsApp"
                >
                    💬 WhatsApp
                </button>
                {c.confirmacion !== "Confirmada" ? (
                    <button
                        className="btn-pro-action confirm"
                        onClick={() => handleConfirm(c.id)}
                    >
                        ✅ Confirmar
                    </button>
                ) : (
                    <span className="confirmed-check">✨ Confirmada</span>
                )}
            </div>
        </div>
    );

    return (
        <div className="confirmation-panel-container">
            <h2 className="panel-title-pro">
                <span className="emoji-title">🚀</span> Centro de Confirmaciones
            </h2>
            <p className="panel-subtitle">Gestiona la asistencia de tus clientes en tiempo real.</p>

            <div className="kanban-board-pro">
                {/* COLUMNA 1: URGENTE (0-1 Días) */}
                <div className="kanban-column-pro urgent-col">
                    <div className="column-header-pro">
                        <h3>🔥 Urgente <small>(1 día)</small></h3>
                        <span className="count-badge-pro urgent">{urgentCitas.length}</span>
                    </div>
                    <div className="column-content-pro">
                        {urgentCitas.length === 0 ?
                            <div className="empty-state-pro">🍃 Todo al día</div> :
                            urgentCitas.map(c => renderCard(c, "status-urgent", "border-urgent"))
                        }
                    </div>
                </div>

                {/* COLUMNA 2: PROXIMAS (2 Días) */}
                <div className="kanban-column-pro warning-col">
                    <div className="column-header-pro">
                        <h3>⚠️ Próximas <small>(2 días)</small></h3>
                        <span className="count-badge-pro warning">{nearCitas.length}</span>
                    </div>
                    <div className="column-content-pro">
                        {nearCitas.length === 0 ?
                            <div className="empty-state-pro">📅 Sin citas próximas</div> :
                            nearCitas.map(c => renderCard(c, "status-warning", "border-warning"))
                        }
                    </div>
                </div>

                {/* COLUMNA 3: CONFIRMADAS */}
                <div className="kanban-column-pro success-col">
                    <div className="column-header-pro">
                        <h3>✨ Confirmadas</h3>
                        <span className="count-badge-pro success">{confirmedCitas.length}</span>
                    </div>
                    <div className="column-content-pro">
                        {confirmedCitas.length === 0 ?
                            <div className="empty-state-pro">💤 Aún sin confirmaciones</div> :
                            confirmedCitas.map(c => renderCard(c, "status-success", "border-success"))
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationPanel;
