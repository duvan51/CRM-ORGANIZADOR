import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const SubscriptionManager = ({ user }) => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);

    // Initial state for new plan
    const initialPlanState = {
        name: "",
        price: 0,
        max_agendas: 1,
        max_users: 1,
        description: "",
        features: "" // We will handle as comma separated string for input
    };

    const [formData, setFormData] = useState(initialPlanState);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;
            setPlans(data || []);
        } catch (e) {
            console.error("Error fetching plans:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    const handleOpenModal = (plan = null) => {
        if (plan) {
            setEditingPlan(plan);
            setFormData({
                ...plan,
                features: plan.features ? plan.features.join(', ') : ""
            });
        } else {
            setEditingPlan(null);
            setFormData(initialPlanState);
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingPlan(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Process features string to array
            const featuresArray = formData.features.split(',').map(f => f.trim()).filter(f => f);

            const payload = {
                name: formData.name,
                price: parseFloat(formData.price),
                max_agendas: parseInt(formData.max_agendas),
                max_users: parseInt(formData.max_users),
                description: formData.description,
                features: featuresArray
            };

            let error;

            if (editingPlan) {
                const { error: updateError } = await supabase
                    .from('subscription_plans')
                    .update(payload)
                    .eq('id', editingPlan.id);
                error = updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('subscription_plans')
                    .insert(payload);
                error = insertError;
            }

            if (error) throw error;

            handleCloseModal();
            fetchPlans();
        } catch (e) {
            console.error("Error saving plan:", e);
            alert("Error al guardar el plan: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Estás seguro de eliminar este plan? Esto podría afectar a clínicas suscritas.")) return;

        try {
            const { error } = await supabase
                .from('subscription_plans')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchPlans();
        } catch (e) {
            console.error("Error deleting plan:", e);
            alert("Error al eliminar: " + e.message);
        }
    };

    return (
        <div className="subscription-manager animate-in">
            <div className="dashboard-header-stats">
                <div className="dash-card primary">
                    <span className="dash-icon">💎</span>
                    <div className="dash-info">
                        <h3>Planes Activos</h3>
                        <p className="dash-value">{plans.length}</p>
                        <span className="dash-subtitle">Opciones de suscripción</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-table-container card" style={{ marginTop: '25px' }}>
                <div className="table-header-dash">
                    <h3>Gestión de Planes y Suscripciones</h3>
                    <button className="btn-process" onClick={() => handleOpenModal()}>+ Nuevo Plan</button>
                </div>

                <div className="plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', padding: '20px' }}>
                    {plans.map(plan => (
                        <div key={plan.id} className="plan-card premium-card" style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0 }}>{plan.name}</h3>
                                <span className="price-tag" style={{ background: 'var(--success)', padding: '5px 10px', borderRadius: '15px', color: 'white', fontWeight: 'bold' }}>
                                    ${plan.price.toLocaleString()}
                                </span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '15px' }}>{plan.description}</p>

                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0' }}>
                                <li style={{ marginBottom: '5px' }}>🏥 Máx. Sedes: <strong>{plan.max_agendas}</strong></li>
                                <li style={{ marginBottom: '5px' }}>👥 Máx. Usuarios: <strong>{plan.max_users}</strong></li>
                                {plan.features && plan.features.map((f, i) => (
                                    <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>✓ {f}</li>
                                ))}
                            </ul>

                            <div className="card-actions" style={{ marginTop: 'auto' }}>
                                <button className="btn-edit" onClick={() => handleOpenModal(plan)} style={{ flex: 1 }}>✏️ Editar</button>
                                <button className="btn-delete" onClick={() => handleDelete(plan.id)}>🗑️</button>
                            </div>
                        </div>
                    ))}

                    {plans.length === 0 && !loading && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            No hay planes creados aún. ¡Crea el primero para empezar a vender suscripciones!
                        </div>
                    )}
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal animate-in" style={{ maxWidth: '600px' }}>
                        <h3>{editingPlan ? 'Editar Plan' : 'Nuevo Plan de Suscripción'}</h3>
                        <form onSubmit={handleSubmit} className="premium-form-v">
                            <div className="form-group">
                                <label>Nombre del Plan</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Plan Básico"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="form-row" style={{ display: 'flex', gap: '15px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Precio Mensual ($)</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Máx. Sedes (Agendas)</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={formData.max_agendas}
                                        onChange={e => setFormData({ ...formData, max_agendas: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Descripción Corta</label>
                                <input
                                    type="text"
                                    placeholder="Ideal para clínicas pequeñas..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Características (separadas por coma)</label>
                                <textarea
                                    rows="3"
                                    placeholder="Soporte 24/7, Reportes Avanzados, API Access..."
                                    value={formData.features}
                                    onChange={e => setFormData({ ...formData, features: e.target.value })}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={handleCloseModal}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Guardando..." : "Guardar Plan"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubscriptionManager;
