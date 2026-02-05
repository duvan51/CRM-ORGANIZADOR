import { useState, useEffect } from "react";
import useWebSocket from "../hooks/useWebSocket";
import { supabase } from "../supabase";

const SalesCounter = ({ token }) => {
    const [sales, setSales] = useState({ total: 0, count: 0 });
    const { lastMessage } = useWebSocket();

    const fetchSales = async () => {
        try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

            // Obtenemos citas confirmadas del mes
            const { data, error } = await supabase
                .from('citas')
                .select('tipo_servicio')
                .eq('confirmacion', 'Confirmada')
                .gte('fecha', startOfMonth);

            if (error) throw error;

            // Cálculo simplificado: Si el servicio incluye "Sueroterapia", vale 550k.
            // Para otros, asumimos un valor base o 0 si no se conoce.
            let totalVentas = 0;
            (data || []).forEach(c => {
                if (c.tipo_servicio && c.tipo_servicio.toLowerCase().includes("sueroterapia")) {
                    totalVentas += 550000;
                } else {
                    totalVentas += 150000; // Valor default para otros servicios por ahora
                }
            });

            setSales({ total: totalVentas, count: (data || []).length });
        } catch (e) {
            console.error("Error fetching sales:", e);
        }
    };

    useEffect(() => {
        fetchSales();
    }, []);

    // Refresh on relevant updates
    useEffect(() => {
        if (lastMessage && (lastMessage.type === "REFRESH_CITAS" || lastMessage.type === "REFRESH_AGENDA_SERVICES")) {
            fetchSales();
        }
    }, [lastMessage]);

    return (
        <div className="sales-counter" title="Tus ventas confirmadas este mes">
            <div className="sales-label">🏆 Ventas Mes</div>
            <div className="sales-amount">
                ${sales.total.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
            </div>
            {sales.count > 0 && <div className="sales-count-badge">#{sales.count}</div>}
        </div>
    );
};

export default SalesCounter;
