import { useState, useEffect } from "react";
import useWebSocket from "../hooks/useWebSocket";
import { supabase } from "../supabase";

const SalesCounter = ({ user }) => {
    const [stats, setStats] = useState({
        totalVendido: 0,
        cantConfirmadas: 0,
        totalCancelado: 0,
        cantCanceladas: 0,
        totalGeneral: 0,
        cantTotal: 0
    });
    const { lastMessage } = useWebSocket();

    const fetchStats = async () => {
        if (!user) return;

        try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const sellerName = user.full_name || user.username;
            let query = supabase
                .from('citas')
                .select('tipo_servicio, confirmacion, sesion_nro')  // Added sesion_nro
                .gte('fecha', startOfMonth);

            if (user.agendas && user.agendas.length > 0) {
                query = query.in('agenda_id', user.agendas.map(a => a.id));
            } else {
                setStats({ totalVendido: 0, cantConfirmadas: 0, totalCancelado: 0, cantCanceladas: 0, totalGeneral: 0, cantTotal: 0 });
                return;
            }

            if (user.role !== 'superuser' && user.role !== 'admin' && user.role !== 'owner') {
                const sellerName = user.full_name || user.username;
                query = query.ilike('vendedor', sellerName);
            }

            const { data, error } = await query;

            if (error) throw error;

            let totalVentas = 0;
            let confirmadas = 0;
            let totalCancelado = 0;
            let canceladas = 0;
            let totalGeneral = 0;
            let cantTotal = 0;

            (data || []).forEach(c => {
                // If it's a follow-up session (session > 1), it doesn't count as a new sale value
                // ONLY count the first session as the sale event
                if (c.sesion_nro && c.sesion_nro > 1) {
                    // Logic for attendance/cancellation count might still apply? 
                    // Usually yes, we want to know if they attended. But sales value is 0.
                    // The user said "me va a sumar un total y no lo que quiero".
                    // So we treat value as 0.
                }

                let valorCita = 0;
                // Only assign value if it's the first session
                if (!c.sesion_nro || c.sesion_nro === 1) {
                    valorCita = 150000; // Base value
                    if (c.tipo_servicio && c.tipo_servicio.toLowerCase().includes("sueroterapia")) {
                        valorCita = 550000;
                    }
                }

                // Sumar al total general independiente del estado
                totalGeneral += valorCita;
                cantTotal++;

                if (c.confirmacion === 'Confirmada') {
                    confirmadas++;
                    totalVentas += valorCita;
                } else if (c.confirmacion === 'Cancelada') {
                    canceladas++;
                    totalCancelado += valorCita;
                }
            });

            setStats({
                totalVendido: totalVentas,
                cantConfirmadas: confirmadas,
                totalCancelado: totalCancelado,
                cantCanceladas: canceladas,
                totalGeneral: totalGeneral,
                cantTotal: cantTotal
            });
        } catch (e) {
            console.error("Error fetching stats:", e);
        }
    };

    useEffect(() => {
        fetchStats();
    }, [user]);

    useEffect(() => {
        if (lastMessage && (lastMessage.type === "REFRESH_CITAS")) {
            console.log('SalesCounter detected refresh message', lastMessage);
            fetchStats();
        }
    }, [lastMessage]);

    return (
        <div className="sales-stats-container">
            <div className="sales-counter success" title="Tus ventas confirmadas este mes">
                <div className="sales-label">🏆 Ventas Mes</div>
                <div className="sales-amount">
                    ${stats.totalVendido.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                </div>
                {stats.cantConfirmadas > 0 && <div className="sales-count-badge">#{stats.cantConfirmadas}</div>}
            </div>

            <div className="sales-counter danger" title="Valor total de citas canceladas este mes">
                <div className="sales-label">📉 Perdido (Canc.)</div>
                <div className="sales-amount">
                    ${stats.totalCancelado.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                </div>
                {stats.cantCanceladas > 0 && <div className="sales-count-badge" style={{ background: '#ef4444' }}>#{stats.cantCanceladas}</div>}
            </div>

            <div className="sales-counter info" title="Valor total de TODAS las citas (Confirmadas + Canceladas + Pendientes)">
                <div className="sales-label">📊 Total Gestión</div>
                <div className="sales-amount">
                    ${stats.totalGeneral.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
                </div>
                {stats.cantTotal > 0 && <div className="sales-count-badge" style={{ background: '#3b82f6' }}>#{stats.cantTotal}</div>}
            </div>
        </div>
    );
};

export default SalesCounter;
