import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function PredictiveMarketing({ clinicId }) {
    const [loading, setLoading] = useState(false);
    const [simulating, setSimulating] = useState(false);
    const [simulations, setSimulations] = useState([]);
    const [activeTab, setActiveTab] = useState("nuevo"); // "nuevo" or "historial"
    const [credits, setCredits] = useState(0);

    const [formData, setFormData] = useState({
        buyerPersona: {
            age: "25-45",
            interests: "Estética, Salud, Bienestar",
            location: "Bogotá, Colombia"
        },
        copyText: "",
        campaignGoal: "Venta Directa"
    });

    const [result, setResult] = useState(null);

    const fetchData = async () => {
        if (!clinicId) return;
        setLoading(true);
        try {
            const { data: simulationsData } = await supabase
                .from('predictive_simulations')
                .select('*')
                .eq('clinic_id', clinicId)
                .order('created_at', { ascending: false });
            setSimulations(simulationsData || []);

            const { data: profile } = await supabase
                .from('profiles')
                .select('predictive_credits')
                .eq('id', clinicId)
                .maybeSingle();
            setCredits(profile?.predictive_credits || 0);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [clinicId]);

    const handleSimulate = async (e) => {
        e.preventDefault();
        if (credits <= 0) return alert("❌ No tienes créditos suficientes para esta simulación.");
        if (!formData.copyText) return alert("Por favor escribe el copy de la campaña.");

        setSimulating(true);
        setResult(null);

        try {
            const { data, error } = await supabase.functions.invoke('predictive-marketing', {
                body: { 
                    action: 'simulate',
                    payload: formData
                }
            });

            if (error) throw error;

            setResult(data);
            setCredits(prev => prev - 1);
            fetchData();
            alert("✅ Simulación completada con éxito.");
        } catch (err) {
            alert("Error en la simulación: " + err.message);
        } finally {
            setSimulating(false);
        }
    };

    return (
        <div className="predictive-marketing-container animate-in">
            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <div>
                    <h2 style={{ margin: 0 }}>🧬 Laboratorio de Audiencias (IA Swarm)</h2>
                    <p className="text-muted">Valida tus campañas con un enjambre de agentes de IA entrenados en el mercado local.</p>
                </div>
                <div className="credit-badge" style={{ background: 'var(--primary)', padding: '10px 20px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.8 }}>Créditos Disponibles</div>
                    <strong style={{ fontSize: '1.2rem' }}>{credits}</strong>
                </div>
            </div>

            <div className="tabs-pro" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button className={activeTab === 'nuevo' ? 'active' : ''} onClick={() => setActiveTab('nuevo')}>Nueva Simulación</button>
                <button className={activeTab === 'historial' ? 'active' : ''} onClick={() => setActiveTab('historial')}>Historial ({simulations.length})</button>
            </div>

            {activeTab === 'nuevo' && (
                <div className="simulation-layout" style={{ display: 'grid', gridTemplateColumns: result ? '350px 1fr' : '1fr', gap: '25px', transition: 'all 0.4s' }}>
                    
                    <div className="simulation-form card" style={{ padding: '25px', borderRadius: '15px' }}>
                        <h3>Parámetros de Campaña</h3>
                        <form onSubmit={handleSimulate} className="premium-form-v">
                            <div className="form-group">
                                <label>Target (Edad)</label>
                                <input type="text" value={formData.buyerPersona.age} onChange={e => setFormData({ ...formData, buyerPersona: { ...formData.buyerPersona, age: e.target.value } })} />
                            </div>
                            <div className="form-group">
                                <label>Intereses / Comportamiento</label>
                                <textarea 
                                    rows="2"
                                    value={formData.buyerPersona.interests} 
                                    onChange={e => setFormData({ ...formData, buyerPersona: { ...formData.buyerPersona, interests: e.target.value } })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Ubicación</label>
                                <input type="text" value={formData.buyerPersona.location} onChange={e => setFormData({ ...formData, buyerPersona: { ...formData.buyerPersona, location: e.target.value } })} />
                            </div>
                            <div className="form-group" style={{ marginTop: '20px' }}>
                                <label>Copy o Script del Anuncio</label>
                                <textarea 
                                    rows="6"
                                    required
                                    placeholder="Ingresa aquí el texto que planeas publicar..."
                                    value={formData.copyText} 
                                    onChange={e => setFormData({ ...formData, copyText: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn-process" style={{ width: '100%', marginTop: '20px' }} disabled={simulating || credits <= 0}>
                                {simulating ? "🤖 El enjambre está debatiendo..." : "🚀 Lanzar Simulación (1 Crédito)"}
                            </button>
                        </form>
                    </div>

                    {result && (
                        <div className="simulation-results animate-in">
                            <div className="card" style={{ padding: '25px', borderRadius: '15px', background: 'var(--card-bg)', border: '1px solid var(--primary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ margin: 0 }}>📊 Resultado del Análisis</h3>
                                    <div className={`acceptance-score ${result.acceptance >= 70 ? 'high' : 'low'}`} style={{
                                        fontSize: '2rem',
                                        fontWeight: 'bold',
                                        color: result.acceptance >= 70 ? 'var(--success)' : 'var(--danger)'
                                    }}>
                                        {result.acceptance}%
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>ACEPTACIÓN</div>
                                    </div>
                                </div>

                                <div className="debate-transcript" style={{ marginBottom: '25px' }}>
                                    <h4 style={{ color: 'var(--primary)' }}>🗣️ Debate del Enjambre (Resumen)</h4>
                                    <div className="chat-preview" style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                        {result.debateSummary}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div className="objections">
                                        <h4 style={{ color: 'var(--danger)' }}>⚠️ Objeciones Clave</h4>
                                        <ul style={{ paddingLeft: '20px', fontSize: '0.85rem' }}>
                                            {result.objections?.map((ob, i) => <li key={i} style={{ marginBottom: '5px' }}>{ob}</li>)}
                                        </ul>
                                    </div>
                                    <div className="recommendations">
                                        <h4 style={{ color: 'var(--success)' }}>💡 Recomendaciones</h4>
                                        <ul style={{ paddingLeft: '20px', fontSize: '0.85rem' }}>
                                            {result.recommendations?.map((rec, i) => <li key={i} style={{ marginBottom: '5px' }}>{rec}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'historial' && (
                <div className="simulations-history" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {simulations.length === 0 ? (
                        <div className="card text-center" style={{ padding: '40px' }}>No hay simulaciones previas.</div>
                    ) : (
                        simulations.map(sim => (
                            <div key={sim.id} className="card-v4" style={{ padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: 0 }}>Análisis: {sim.campaign_name || "Sin Nombre"}</h4>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '5px 0' }}>{new Date(sim.created_at).toLocaleString()}</p>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Target: {sim.payload?.buyerPersona?.age} • {sim.payload?.buyerPersona?.location}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: sim.result?.acceptance >= 70 ? 'var(--success)' : 'var(--danger)' }}>
                                        {sim.result?.acceptance}%
                                    </div>
                                    <button className="btn-pro-icon" style={{ marginTop: '5px' }} onClick={() => { setResult(sim.result); setActiveTab('nuevo'); }}>👁️ Ver</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <style>{`
                .predictive-marketing-container { padding: 20px; }
                .tabs-pro button { background: none; border: none; padding: 10px 20px; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
                .tabs-pro button.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: bold; }
                .acceptance-score { padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.05); }
                .acceptance-score.high { border: 1px solid var(--success); }
                .acceptance-score.low { border: 1px solid var(--danger); }
            `}</style>
        </div>
    );
}
