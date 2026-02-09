import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../supabase";

const MasterPanel = ({ user }) => {
    const [stats, setStats] = useState({
        totalClinics: 0,
        totalSuperAdmins: 0,
        activeSubscriptions: 0,
        monthlyRevenue: 0
    });
    const [superAdmins, setSuperAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [plans, setPlans] = useState([]);
    const [editingSuperAdmin, setEditingSuperAdmin] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newSuperAdmin, setNewSuperAdmin] = useState({
        name: "",
        clinic_name: "",
        email: "",
        password: "",
        subscription_plan_id: ""
    });

    const handleCreateSuperAdmin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
            );

            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newSuperAdmin.email,
                password: newSuperAdmin.password,
            });

            if (authError) throw authError;

            if (authData?.user) {
                const { error: profileError } = await supabase.from('profiles').upsert({
                    id: authData.user.id,
                    username: newSuperAdmin.email, // using email as username
                    full_name: newSuperAdmin.name,
                    clinic_name: newSuperAdmin.clinic_name,
                    role: 'superuser',
                    is_active: true,
                    subscription_plan_id: newSuperAdmin.subscription_plan_id || null,
                    clinic_id: authData.user.id // Self-referencing clinic_id for SuperAdmins
                });

                if (profileError) throw profileError;

                alert("SuperAdmin creado exitosamente.");
                setShowCreateModal(false);
                setNewSuperAdmin({ name: "", clinic_name: "", email: "", password: "", subscription_plan_id: "" });
                fetchData();
            }
        } catch (error) {
            console.error("Error creating SuperAdmin:", error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSuperAdmin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: editingSuperAdmin.full_name,
                    clinic_name: editingSuperAdmin.clinic_name,
                    subscription_plan_id: editingSuperAdmin.subscription_plan_id || null,
                    // We don't update email/password here mostly due to Auth complexity, but role is fixed
                })
                .eq('id', editingSuperAdmin.id);

            if (error) throw error;

            alert("SuperAdmin actualizado correctamente.");
            setEditingSuperAdmin(null);
            fetchData();
        } catch (error) {
            console.error("Error updating SuperAdmin:", error);
            alert("Error al actualizar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch All Users who are SuperAdmins (Clinic Owners) with Plan Info
            const { data: superAdminsData } = await supabase
                .from('profiles')
                .select('*, agendas:agenda_users(agenda_id), plan:subscription_plans(name)')
                .eq('role', 'superuser');

            // Map to include agenda count
            const enrichedAdmins = superAdminsData?.map(sa => ({
                ...sa,
                sedesCount: sa.agendas?.length || 0
            })) || [];

            setSuperAdmins(enrichedAdmins);

            // Fetch Plans for dropdowns
            const { data: plansData } = await supabase.from('subscription_plans').select('*');
            setPlans(plansData || []);

            // Stats
            setStats({
                totalClinics: enrichedAdmins.length,
                totalSuperAdmins: enrichedAdmins.length,
                activeSubscriptions: enrichedAdmins.length,
                monthlyRevenue: enrichedAdmins.length * 150000
            });

        } catch (e) {
            console.error("Error fetching master data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) return <div className="loading-spinner">Cargando Panel Maestro...</div>;

    return (
        <div className="master-panel animate-in">
            <div className="dashboard-header-stats">
                <div className="dash-card primary">
                    <span className="dash-icon">🏢</span>
                    <div className="dash-info">
                        <h3>Clínicas / SuperAdmins</h3>
                        <p className="dash-value">{stats.totalClinics}</p>
                        <span className="dash-subtitle">Suscripciones activas</span>
                    </div>
                </div>
                <div className="dash-card success">
                    <span className="dash-icon">💳</span>
                    <div className="dash-info">
                        <h3>Recaudado Mes</h3>
                        <p className="dash-value">${stats.monthlyRevenue.toLocaleString()}</p>
                        <span className="dash-subtitle">Pagos confirmados</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-table-container card" style={{ marginTop: '25px' }}>
                <div className="table-header-dash">
                    <h3>Gestión de Super Administradores</h3>
                    <button className="btn-process" style={{ padding: '8px 20px' }} onClick={() => setShowCreateModal(true)}>+ Nuevo SuperAdmin</button>
                </div>
                <div className="table-wrapper">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Clínica</th>
                                <th>Administrador</th>
                                <th>Email</th>
                                <th>Sedes / Agendas</th>
                                <th>Plan Actual</th>
                                <th>Rol Actual</th>
                                <th>Estado Pago</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {superAdmins.map((user, idx) => (
                                <tr key={idx}>
                                    <td><strong>{user.clinic_name || "Sin Nombre"}</strong></td>
                                    <td>{user.full_name}</td>
                                    <td>{user.username}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className="info-badge" style={{ background: 'var(--primary)', color: 'white' }}>
                                            🏥 {user.sedesCount}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="status-pill confirmada" style={{ background: 'var(--accent)' }}>
                                            {user.plan?.name || "Gratuito / N.A"}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`role-badge ${user.role}`}>
                                            {user.role === 'superuser' ? 'SuperAdmin' : user.role === 'admin' ? 'Administrador' : 'Agente'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="status-pill confirmada">Al Día</span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                className="btn-pro-icon edit"
                                                title="Ver Detalles"
                                                onClick={() => alert(`Detalles de ${user.clinic_name}:\nUsuario: ${user.username}\nPlan: ${user.plan?.name || 'N/A'}`)}
                                            >
                                                👁️
                                            </button>
                                            <button
                                                className="btn-pro-icon edit"
                                                title="Editar Clínica"
                                                onClick={() => setEditingSuperAdmin(user)}
                                            >
                                                ✏️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ marginTop: '25px', padding: '25px' }}>
                <h3>Configuración Global del Sistema</h3>
                <p style={{ color: 'var(--text-muted)' }}>Configura aquí los parámetros base del CRM, precios de suscripción y notificaciones generales.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px' }}>
                    <div className="filter-group">
                        <label>Precio Suscripción Base ($)</label>
                        <input type="number" defaultValue="150000" />
                    </div>
                    <div className="filter-group">
                        <label>Límite de Agendas por Clínica</label>
                        <input type="number" defaultValue="5" />
                    </div>
                </div>
            </div>


            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal animate-in" style={{ maxWidth: '500px' }}>
                        <h3>Nuevo SuperAdmin (Clínica)</h3>
                        <p className="text-muted">Crea una nueva cuenta administrativa para una clínica.</p>

                        <form onSubmit={handleCreateSuperAdmin} className="premium-form-v">
                            <div className="form-group">
                                <label>Nombre de la Clínica</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Clínica Sanitas"
                                    value={newSuperAdmin.clinic_name}
                                    onChange={e => setNewSuperAdmin({ ...newSuperAdmin, clinic_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Nombre del Administrador</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Juan Pérez"
                                    value={newSuperAdmin.name}
                                    onChange={e => setNewSuperAdmin({ ...newSuperAdmin, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Email (Usuario de Acceso)</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="admin@clinica.com"
                                    value={newSuperAdmin.email}
                                    onChange={e => setNewSuperAdmin({ ...newSuperAdmin, email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Plan de Suscripción</label>
                                <select
                                    value={newSuperAdmin.subscription_plan_id}
                                    onChange={e => setNewSuperAdmin({ ...newSuperAdmin, subscription_plan_id: e.target.value })}
                                >
                                    <option value="">-- Seleccionar Plan --</option>
                                    {plans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Contraseña Temporal</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="clave123"
                                    value={newSuperAdmin.password}
                                    onChange={e => setNewSuperAdmin({ ...newSuperAdmin, password: e.target.value })}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Creando..." : "Crear SuperAdmin"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingSuperAdmin && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal animate-in" style={{ maxWidth: '500px' }}>
                        <h3>Editar Clínica / SuperAdmin</h3>

                        <form onSubmit={handleUpdateSuperAdmin} className="premium-form-v">
                            <div className="form-group">
                                <label>Nombre de la Clínica</label>
                                <input
                                    type="text"
                                    required
                                    value={editingSuperAdmin.clinic_name || ''}
                                    onChange={e => setEditingSuperAdmin({ ...editingSuperAdmin, clinic_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Nombre del Administrador</label>
                                <input
                                    type="text"
                                    required
                                    value={editingSuperAdmin.full_name || ''}
                                    onChange={e => setEditingSuperAdmin({ ...editingSuperAdmin, full_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Plan de Suscripción</label>
                                <select
                                    value={editingSuperAdmin.subscription_plan_id || ''}
                                    onChange={e => setEditingSuperAdmin({ ...editingSuperAdmin, subscription_plan_id: e.target.value })}
                                >
                                    <option value="">-- Sin Plan / Gratuito --</option>
                                    {plans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Email is read-only usually because changing it in Auth is complex */}
                            <div className="form-group">
                                <label>Email (Solo lectura)</label>
                                <input type="text" value={editingSuperAdmin.username} readOnly disabled style={{ background: '#f0f0f0' }} />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setEditingSuperAdmin(null)}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Guardando..." : "Guardar Cambios"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
};

export default MasterPanel;
