import { useState, useEffect } from "react";
import useWebSocket from "../hooks/useWebSocket";

const SalesCounter = ({ token }) => {
    const [sales, setSales] = useState({ total: 0, count: 0 });
    const { lastMessage } = useWebSocket("ws://localhost:8000/ws");

    const fetchSales = async () => {
        try {
            const res = await fetch("http://localhost:8000/stats/agent-sales", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSales(data);
            }
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
