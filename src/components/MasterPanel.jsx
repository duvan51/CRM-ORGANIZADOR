import React, { useState, useEffect } from "react";
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
        subscription_plan_id: "",
        predictive_credits: 0
    });
    const [viewingClinic, setViewingClinic] = useState(null);
    const [notification, setNotification] = useState(null); // { message, type }
    const [newPassword, setNewPassword] = useState("");
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

    const [myPasswordData, setMyPasswordData] = useState({ newPassword: "", confirmPassword: "" });
    const [updatingMyOwnPassword, setUpdatingMyOwnPassword] = useState(false);

    // Estados para la gestión expandida de sedes y personal
    const [expandedClinicId, setExpandedClinicId] = useState(null);
    const [addingAgendaForClinic, setAddingAgendaForClinic] = useState(null);
    const [editingAgendaData, setEditingAgendaData] = useState(null);
    const [addingMemberForClinic, setAddingMemberForClinic] = useState(null);
    const [newMember, setNewMember] = useState({ full_name: "", username: "", email: "", password: "", role: "agent" });
    const [newAgendaName, setNewAgendaName] = useState("");
    const [orphanedUsers, setOrphanedUsers] = useState([]);
    const [debugEmail, setDebugEmail] = useState("");
    const [debugResult, setDebugResult] = useState(null);
    const [debugLoading, setDebugLoading] = useState(false);

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
                    clinic_id: authData.user.id, // Self-referencing clinic_id for SuperAdmins
                    predictive_credits: newSuperAdmin.predictive_credits || 0
                });

                if (profileError) throw profileError;

                showNotify("SuperAdmin creado exitosamente.");
                setShowCreateModal(false);
                setNewSuperAdmin({ name: "", clinic_name: "", email: "", password: "", subscription_plan_id: "", predictive_credits: 0 });
                fetchData();
            }
        } catch (error) {
            console.error("Error creating SuperAdmin:", error);
            showNotify("Error: " + error.message, 'error');
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
                    predictive_credits: editingSuperAdmin.predictive_credits || 0
                    // We don't update email/password here mostly due to Auth complexity, but role is fixed
                })
                .eq('id', editingSuperAdmin.id);

            if (error) throw error;

            showNotify("SuperAdmin actualizado correctamente.");
            setEditingSuperAdmin(null);
            fetchData();
        } catch (error) {
            console.error("Error updating SuperAdmin:", error);
            showNotify("Error al actualizar: " + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            showNotify("La contraseña debe tener al menos 6 caracteres", "error");
            return;
        }

        setIsUpdatingPassword(true);
        try {
            // Invocamos una Edge Function personalizada para cambiar la contraseña usando el Admin SDK
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: {
                    userId: editingSuperAdmin.id,
                    password: newPassword
                }
            });

            if (error) throw error;

            showNotify("¡Contraseña actualizada con éxito!");
            setNewPassword("");
        } catch (error) {
            console.error("Error updating password:", error);
            showNotify("Error: Revisa que la Edge Function 'manage-users' esté activa", "error");
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleUpdateMyOwnPassword = async (e) => {
        e.preventDefault();
        if (myPasswordData.newPassword !== myPasswordData.confirmPassword) {
            return showNotify("Las contraseñas no coinciden", "error");
        }
        if (myPasswordData.newPassword.length < 6) {
            return showNotify("La contraseña debe tener al menos 6 caracteres", "error");
        }

        setUpdatingMyOwnPassword(true);
        try {
            // 1. Obtener y verificar sesión
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                console.error("Sesión no recuperable:", sessionError);
                throw new Error("Sesión perdida. Por favor reingresa al sistema.");
            }

            // 2. Intentar actualizar vía standard auth
            const { error: updateError } = await supabase.auth.updateUser({
                password: myPasswordData.newPassword
            });

            if (updateError) {
                console.warn("Error con updateUser (403/Forbidden?), intentando vía Edge Function...");

                // 3. Fallback: Usar la Edge Function para evitar 403 (en caso de que el trigger o RLS bloqueen updateUser)
                const { data: funcData, error: funcError } = await supabase.functions.invoke('manage-users', {
                    body: {
                        userId: user.id, // ID del superadmin actual
                        password: myPasswordData.newPassword
                    }
                });

                if (funcError) {
                    console.error("Error en Edge Function Fallback:", funcError);
                    throw new Error("No se pudo actualizar la contraseña vía Edge Function.");
                }
            }

            showNotify("✅ Contraseña actualizada correctamente.");
            setMyPasswordData({ newPassword: "", confirmPassword: "" });
        } catch (err) {
            console.error("Error crítico en actualización de clave:", err);
            showNotify("Error: " + (err.message || "No se pudo actualizar"), "error");
        } finally {
            setUpdatingMyOwnPassword(false);
        }
    };

    // --- ACCIONES DE AGENDAS / SEDES EN PANEL MAESTRO ---
    const handleCreateAgendaForClinic = async (e) => {
        e.preventDefault();
        if (!newAgendaName.trim()) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('agendas').insert({
                name: newAgendaName.trim(),
                description: "Sede creada desde Panel Maestro",
                clinic_id: addingAgendaForClinic,
                slots_per_hour: 1
            });
            if (error) throw error;
            showNotify("Sede/Agenda creada con éxito.");
            setAddingAgendaForClinic(null);
            setNewAgendaName("");
            fetchData();
        } catch (err) {
            console.error("Error creating agenda:", err);
            showNotify("Error al crear sede: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAgendaName = async (e) => {
        e.preventDefault();
        if (!editingAgendaData.name.trim()) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('agendas')
                .update({ name: editingAgendaData.name.trim() })
                .eq('id', editingAgendaData.id);
            if (error) throw error;
            showNotify("Sede actualizada correctamente.");
            setEditingAgendaData(null);
            fetchData();
        } catch (err) {
            console.error("Error updating agenda:", err);
            showNotify("Error al actualizar sede: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAgendaMaster = async (id) => {
        if (!window.confirm("¿Estás seguro de eliminar esta sede y todas sus citas asociadas? Esta acción no se puede deshacer.")) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('agendas').delete().eq('id', id);
            if (error) throw error;
            showNotify("Sede eliminada correctamente.");
            fetchData();
        } catch (err) {
            console.error("Error deleting agenda:", err);
            showNotify("Error al eliminar sede: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    // --- ACCIONES DE COLABORADORES EN PANEL MAESTRO ---
    const handleCreateMemberForClinic = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
            );

            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newMember.email,
                password: newMember.password,
            });

            if (authError) throw authError;

            if (authData?.user) {
                const { error: profileError } = await supabase.from('profiles').upsert({
                    id: authData.user.id,
                    username: newMember.username || newMember.email,
                    full_name: newMember.full_name,
                    email: newMember.email,
                    role: newMember.role,
                    clinic_id: addingMemberForClinic,
                    is_active: true
                });

                if (profileError) throw profileError;

                showNotify("Colaborador creado exitosamente.");
                setAddingMemberForClinic(null);
                setNewMember({ full_name: "", username: "", email: "", password: "", role: "agent" });
                fetchData();
            }
        } catch (err) {
            console.error("Error creating collaborator:", err);
            showNotify("Error al crear colaborador: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleChangeMemberRole = async (memberId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'agent' : 'admin';
        setLoading(true);
        try {
            const { error } = await supabase.from('profiles')
                .update({ role: newRole })
                .eq('id', memberId);
            if (error) throw error;
            showNotify("Rol del colaborador actualizado.");
            fetchData();
        } catch (err) {
            console.error("Error changing role:", err);
            showNotify("Error al cambiar rol: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleChangeMemberPassword = async (memberId) => {
        const newPassword = prompt("Introduce la nueva contraseña para este usuario (mínimo 6 caracteres):");
        if (!newPassword) return;
        if (newPassword.length < 6) {
            alert("La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.functions.invoke('manage-users', {
                body: {
                    userId: memberId,
                    password: newPassword
                }
            });
            if (error) throw error;
            showNotify("Contraseña del colaborador actualizada.");
        } catch (err) {
            console.error("Error changing password:", err);
            showNotify("Error: Revisa que la Edge Function esté activa", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMemberMaster = async (memberId) => {
        if (!window.confirm("¿Deseas eliminar permanentemente a este usuario? Perderá el acceso de inmediato.")) return;
        setLoading(true);
        try {
            const { error } = await supabase.functions.invoke('manage-users', {
                body: {
                    action: 'delete',
                    userId: memberId
                }
            });
            if (error) throw error;
            showNotify("Colaborador eliminado con éxito.");
            fetchData();
        } catch (err) {
            console.error("Error deleting collaborator:", err);
            showNotify("Error al eliminar colaborador: " + err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    // --- FUNCIONES DEL DEPURADOR DE CORREOS (AUTH) ---
    const handleCheckAuthEmail = async (e) => {
        e.preventDefault();
        if (!debugEmail.trim()) return;
        setDebugLoading(true);
        setDebugResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: {
                    action: 'checkAuth',
                    email: debugEmail.trim()
                }
            });
            if (error) throw error;
            setDebugResult({ checked: true, exists: data.exists, user: data.user || null });
        } catch (err) {
            console.error("Error checking auth user:", err);
            showNotify("Error al verificar correo: " + err.message, "error");
        } finally {
            setDebugLoading(false);
        }
    };

    const handleDeleteAuthEmail = async () => {
        if (!debugEmail.trim()) return;
        if (!window.confirm(`⚠️ ADVERTENCIA CRÍTICA ⚠️\n¿Estás completamente seguro de eliminar de raíz el correo ${debugEmail.trim()}?\nEsto borrará la cuenta en Supabase Auth y su perfil en la base de datos permanentemente. Esta acción no se puede deshacer.`)) return;
        
        setDebugLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('manage-users', {
                body: {
                    action: 'deleteByEmail',
                    email: debugEmail.trim()
                }
            });
            if (error) throw error;
            showNotify("Cuenta eliminada de raíz con éxito.");
            setDebugEmail("");
            setDebugResult(null);
            fetchData();
        } catch (err) {
            console.error("Error deleting auth user by email:", err);
            showNotify("Error al borrar cuenta: " + err.message, "error");
        } finally {
            setDebugLoading(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // Cargar en paralelo todos los perfiles, agendas y planes de suscripción
            const [profilesRes, agendasRes, plansRes] = await Promise.all([
                supabase.from('profiles').select('*'),
                supabase.from('agendas').select('*'),
                supabase.from('subscription_plans').select('*')
            ]);

            const profilesData = profilesRes.data || [];
            const agendasData = agendasRes.data || [];
            const plansData = plansRes.data || [];

            // Filtrar los perfiles que son SuperAdministradores (role === 'superuser')
            const superAdminsProfiles = profilesData.filter(p => p.role === 'superuser');
            const superAdminIds = superAdminsProfiles.map(sa => sa.id);

            // Filtrar perfiles huérfanos (no superuser, no dueño, y clinic_id no asignado o inválido)
            const orphanedProfiles = profilesData.filter(p => 
                p.role !== 'superuser' && 
                p.role !== 'owner' && 
                p.username !== 'duvanaponteramirez@gmail.com' &&
                (!p.clinic_id || !superAdminIds.includes(p.clinic_id))
            );

            // Enriquecer cada SuperAdmin con sus agendas asociadas y colaboradores
            const enrichedAdmins = superAdminsProfiles.map(sa => {
                const clinicAgendas = agendasData.filter(a => a.clinic_id === sa.id);
                const clinicMembers = profilesData.filter(p => p.clinic_id === sa.id && p.id !== sa.id);
                const matchedPlan = plansData.find(p => p.id === sa.subscription_plan_id) || null;

                return {
                    ...sa,
                    sedesCount: clinicAgendas.length,
                    clinicAgendas,
                    clinicMembers,
                    plan: matchedPlan ? { name: matchedPlan.name } : null
                };
            });

            setSuperAdmins(enrichedAdmins);
            setOrphanedUsers(orphanedProfiles);
            setPlans(plansData);

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

    const showNotify = (msg, type = 'success') => {
        setNotification({ message: msg, type });
        setTimeout(() => setNotification(null), 4000);
    };

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
                                <React.Fragment key={user.id || idx}>
                                    <tr style={{ borderBottom: expandedClinicId === user.id ? 'none' : '1px solid var(--glass-border)' }}>
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
                                                    onClick={() => setViewingClinic(user)}
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
                                                <button
                                                    className="btn-pro-icon edit"
                                                    title="Sedes y Personal"
                                                    onClick={() => setExpandedClinicId(expandedClinicId === user.id ? null : user.id)}
                                                    style={{
                                                        background: expandedClinicId === user.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                                        color: expandedClinicId === user.id ? 'white' : 'inherit'
                                                    }}
                                                >
                                                    {expandedClinicId === user.id ? "📂" : "📁"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedClinicId === user.id && (
                                        <tr key={`expand-${user.id}`} className="expanded-row animate-in" style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                                            <td colSpan={8} style={{ padding: '25px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0, 0, 0, 0.2)' }}>
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 1.2fr',
                                                    gap: '25px'
                                                }}>
                                                    {/* Columna Agendas/Sedes */}
                                                    <div style={{
                                                        background: 'rgba(255, 255, 255, 0.02)',
                                                        padding: '20px',
                                                        borderRadius: '16px',
                                                        border: '1px solid var(--glass-border)',
                                                        boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.01)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                            <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                🏥 Agendas y Sedes ({user.clinicAgendas?.length || 0})
                                                            </h4>
                                                            <button
                                                                className="btn-process"
                                                                style={{ padding: '5px 12px', fontSize: '0.75rem', borderRadius: '8px' }}
                                                                onClick={() => setAddingAgendaForClinic(user.id)}
                                                            >
                                                                + Nueva Sede
                                                            </button>
                                                        </div>

                                                        {user.clinicAgendas && user.clinicAgendas.length > 0 ? (
                                                            <div className="table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                                <table className="modern-table compact" style={{ width: '100%', fontSize: '0.85rem' }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Nombre Sede</th>
                                                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {user.clinicAgendas.map(agenda => (
                                                                            <tr key={agenda.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                                <td><strong>{agenda.name}</strong></td>
                                                                                <td style={{ textAlign: 'right' }}>
                                                                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                                                        <button
                                                                                            className="btn-pro-icon edit"
                                                                                            title="Editar Nombre"
                                                                                            onClick={() => setEditingAgendaData(agenda)}
                                                                                            style={{ padding: '3px 8px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}
                                                                                        >
                                                                                            ✏️
                                                                                        </button>
                                                                                        <button
                                                                                            className="btn-pro-icon delete"
                                                                                            title="Eliminar Sede"
                                                                                            onClick={() => handleDeleteAgendaMaster(agenda.id)}
                                                                                            style={{ padding: '3px 8px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                                                                                        >
                                                                                            🗑️
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: '20px 0' }}>
                                                                No hay sedes creadas para esta clínica.
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Columna Personal/Colaboradores */}
                                                    <div style={{
                                                        background: 'rgba(255, 255, 255, 0.02)',
                                                        padding: '20px',
                                                        borderRadius: '16px',
                                                        border: '1px solid var(--glass-border)',
                                                        boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.01)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                            <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                👥 Personal y Colaboradores ({user.clinicMembers?.length || 0})
                                                            </h4>
                                                            <button
                                                                className="btn-process"
                                                                style={{ padding: '5px 12px', fontSize: '0.75rem', borderRadius: '8px' }}
                                                                onClick={() => setAddingMemberForClinic(user.id)}
                                                            >
                                                                + Nuevo Usuario
                                                            </button>
                                                        </div>

                                                        {user.clinicMembers && user.clinicMembers.length > 0 ? (
                                                            <div className="table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                                <table className="modern-table compact" style={{ width: '100%', fontSize: '0.85rem' }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Nombre</th>
                                                                            <th>Usuario / Correo</th>
                                                                            <th>Rol</th>
                                                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {user.clinicMembers.map(member => (
                                                                            <tr key={member.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                                <td>{member.full_name || "Sin Nombre"}</td>
                                                                                <td>{member.email || member.username}</td>
                                                                                <td>
                                                                                    <span className={`role-badge ${member.role}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                                                                                        {member.role === 'admin' ? 'Admin' : 'Agente'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ textAlign: 'right' }}>
                                                                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                                                        <button
                                                                                            className="btn-pro-icon edit"
                                                                                            title="Cambiar Rol (Admin/Agente)"
                                                                                            onClick={() => handleChangeMemberRole(member.id, member.role)}
                                                                                            style={{ padding: '3px 8px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}
                                                                                        >
                                                                                            🔑
                                                                                        </button>
                                                                                        <button
                                                                                            className="btn-pro-icon edit"
                                                                                            title="Cambiar Contraseña"
                                                                                            onClick={() => handleChangeMemberPassword(member.id)}
                                                                                            style={{ padding: '3px 8px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}
                                                                                        >
                                                                                            🔒
                                                                                        </button>
                                                                                        <button
                                                                                            className="btn-pro-icon delete"
                                                                                            title="Eliminar Cuenta"
                                                                                            onClick={() => handleDeleteMemberMaster(member.id)}
                                                                                            style={{ padding: '3px 8px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                                                                                        >
                                                                                            🗑️
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', margin: '20px 0' }}>
                                                                No hay colaboradores creados para esta clínica.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sección de Cuentas Huérfanas */}
            <div className="card" style={{ marginTop: '25px', padding: '25px' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    🔍 Cuentas de Usuario Huérfanas <span style={{ fontSize: '0.85rem', background: 'var(--accent)', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>{orphanedUsers.length}</span>
                </h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '5px', fontSize: '0.9rem' }}>
                    Usuarios registrados en el sistema que no están vinculados a ninguna clínica activa (o su clínica fue eliminada).
                </p>

                {orphanedUsers.length > 0 ? (
                    <div className="table-wrapper" style={{ marginTop: '15px' }}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Usuario / Correo</th>
                                    <th>Rol Actual</th>
                                    <th>Vincular a Clínica</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orphanedUsers.map(member => (
                                    <tr key={member.id}>
                                        <td><strong>{member.full_name || "Sin Nombre"}</strong></td>
                                        <td>{member.email || member.username}</td>
                                        <td>
                                            <span className={`role-badge ${member.role}`} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                                                {member.role === 'admin' ? 'Administrador' : 'Agente'}
                                            </span>
                                        </td>
                                        <td>
                                            <select
                                                value={member.clinic_id || ""}
                                                onChange={async (e) => {
                                                    const clinicId = e.target.value;
                                                    if (!clinicId) return;
                                                    if (!window.confirm(`¿Deseas vincular a ${member.full_name || member.username} a esta clínica?`)) return;
                                                    setLoading(true);
                                                    try {
                                                        const { error } = await supabase.from('profiles').update({ clinic_id: clinicId }).eq('id', member.id);
                                                        if (error) throw error;
                                                        showNotify("Usuario vinculado correctamente a la clínica.");
                                                        fetchData();
                                                    } catch (err) {
                                                        showNotify("Error al vincular: " + err.message, "error");
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                }}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    color: 'white',
                                                    border: '1px solid var(--glass-border)',
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    width: '100%',
                                                    maxWidth: '250px'
                                                }}
                                            >
                                                <option value="">-- Seleccionar Clínica --</option>
                                                {superAdmins.map(sa => (
                                                    <option key={sa.id} value={sa.id}>{sa.clinic_name || sa.full_name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    className="btn-pro-icon edit"
                                                    title="Cambiar Rol"
                                                    onClick={() => handleChangeMemberRole(member.id, member.role)}
                                                    style={{ padding: '4px 10px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)' }}
                                                >
                                                    🔑
                                                </button>
                                                <button
                                                    className="btn-pro-icon edit"
                                                    title="Cambiar Contraseña"
                                                    onClick={() => handleChangeMemberPassword(member.id)}
                                                    style={{ padding: '4px 10px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)' }}
                                                >
                                                    🔒
                                                </button>
                                                <button
                                                    className="btn-pro-icon delete"
                                                    title="Eliminar Cuenta"
                                                    onClick={() => handleDeleteMemberMaster(member.id)}
                                                    style={{ padding: '4px 10px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', margin: '30px 0' }}>
                        🎉 ¡No hay cuentas de usuario huérfanas en el sistema! Todos los colaboradores pertenecen a una clínica.
                    </p>
                )}
            </div>

            {/* Depurador de Cuentas (Auth / Registro) */}
            <div className="card" style={{ marginTop: '25px', padding: '25px' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    🔍 Depurador de Cuentas de Acceso (Auth)
                </h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '5px', fontSize: '0.9rem' }}>
                    ¿Un correo da error de "ya registrado" al crear una clínica o colaborador, pero no aparece en el listado? Búscalo aquí y elimínalo de raíz del sistema de autenticación de Supabase para liberarlo de inmediato.
                </p>

                <form onSubmit={handleCheckAuthEmail} style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'flex-end', maxWidth: '600px' }}>
                    <div className="filter-group" style={{ flex: 1, margin: 0 }}>
                        <label style={{ color: 'var(--text-main)', marginBottom: '8px', fontSize: '0.85rem' }}>Correo Electrónico a Investigar</label>
                        <input
                            type="email"
                            required
                            placeholder="ejemplo@correo.com"
                            value={debugEmail}
                            onChange={e => {
                                setDebugEmail(e.target.value);
                                setDebugResult(null);
                            }}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <button type="submit" className="btn-process" disabled={debugLoading} style={{ height: '42px', padding: '0 25px' }}>
                        {debugLoading ? "Buscando..." : "🔍 Investigar en Auth"}
                    </button>
                </form>

                {debugResult && debugResult.checked && (
                    <div style={{
                        marginTop: '20px',
                        padding: '20px',
                        background: debugResult.exists ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)',
                        border: debugResult.exists ? '1px dashed #ef4444' : '1px dashed #22c55e',
                        borderRadius: '12px',
                        maxWidth: '600px'
                    }}>
                        {debugResult.exists ? (
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    ⚠️ Registro Encontrado en Supabase Auth
                                </h4>
                                <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
                                    <strong>ID del Usuario:</strong> {debugResult.user?.id}
                                </p>
                                <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
                                    <strong>Registrado el:</strong> {new Date(debugResult.user?.created_at).toLocaleString()}
                                </p>
                                <p style={{ margin: '15px 0 10px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    El correo está ocupando un espacio en el sistema de autenticación de Supabase (pero no tiene un perfil visible en la base de datos). Esto bloquea la creación de cualquier nueva empresa con este email.
                                </p>
                                <button
                                    type="button"
                                    className="btn-process"
                                    onClick={handleDeleteAuthEmail}
                                    style={{ background: '#ef4444', color: 'white', marginTop: '10px' }}
                                    disabled={debugLoading}
                                >
                                    {debugLoading ? "Eliminando..." : "🗑️ Eliminar cuenta de raíz (Liberar Correo)"}
                                </button>
                            </div>
                        ) : (
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    ✅ Correo Completamente Disponible
                                </h4>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    El correo <strong>{debugEmail}</strong> no está registrado en el sistema de autenticación de Supabase ni en la base de datos de perfiles. Está 100% libre para ser registrado.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="card" style={{ marginTop: '25px', padding: '25px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '40px' }}>
                    <div>
                        <h3>⚙️ Configuración Global</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Parámetros base del CRM y precios de suscripción.</p>
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

                    <div style={{ borderLeft: '1px solid var(--glass-border)', paddingLeft: '40px' }}>
                        <h3>🔑 Seguridad de mi Cuenta</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cambia tu clave de acceso root.</p>
                        <form onSubmit={handleUpdateMyOwnPassword} className="premium-form-v" style={{ marginTop: '15px' }}>
                            <div className="form-group">
                                <input
                                    type="password"
                                    placeholder="Nueva contraseña"
                                    required
                                    value={myPasswordData.newPassword}
                                    onChange={e => setMyPasswordData({ ...myPasswordData, newPassword: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ marginTop: '10px' }}>
                                <input
                                    type="password"
                                    placeholder="Confirmar contraseña"
                                    required
                                    value={myPasswordData.confirmPassword}
                                    onChange={e => setMyPasswordData({ ...myPasswordData, confirmPassword: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn-process" disabled={updatingMyOwnPassword} style={{ marginTop: '15px', width: '100%' }}>
                                {updatingMyOwnPassword ? 'Actualizando...' : '💾 Actualizar mi clave'}
                            </button>
                        </form>
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

                            <div className="form-group">
                                <label>Créditos Lab Audiencias (IA)</label>
                                <input
                                    type="number"
                                    required
                                    placeholder="Ej: 50"
                                    value={newSuperAdmin.predictive_credits}
                                    onChange={e => setNewSuperAdmin({ ...newSuperAdmin, predictive_credits: parseInt(e.target.value) || 0 })}
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
                                <input type="text" value={editingSuperAdmin.username} readOnly disabled style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }} />
                            </div>

                            <div className="form-group">
                                <label style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Créditos Lab Audiencias (IA)</label>
                                <input
                                    type="number"
                                    required
                                    value={editingSuperAdmin.predictive_credits || 0}
                                    onChange={e => setEditingSuperAdmin({ ...editingSuperAdmin, predictive_credits: parseInt(e.target.value) || 0 })}
                                    style={{ border: '1px solid var(--primary)' }}
                                />
                                <small className="text-muted">Cantidad actual disponible para simulaciones de IA.</small>
                            </div>

                            <div className="form-group" style={{ marginTop: '10px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--glass-border)' }}>
                                <label style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Cambiar Contraseña</label>
                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <input
                                        type="password"
                                        placeholder="Nueva contraseña"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        type="button"
                                        className="btn-process"
                                        style={{ background: 'var(--accent)', padding: '0 15px' }}
                                        onClick={handleUpdatePassword}
                                        disabled={isUpdatingPassword}
                                    >
                                        {isUpdatingPassword ? "..." : "Actualizar"}
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '5px' }}>Esto cambiará el acceso del administrador de inmediato.</p>
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

            {viewingClinic && (
                <div className="modal-overlay" onClick={() => setViewingClinic(null)}>
                    <div className="modal-content premium-modal animate-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="modal-header-pro">
                            <div>
                                <h2>Información de la Clínica</h2>
                                <p>Detalles administrativos y de suscripción</p>
                            </div>
                            <button className="btn-close" onClick={() => setViewingClinic(null)}>×</button>
                        </div>

                        <div className="clinic-detail-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '20px',
                            padding: '20px'
                        }}>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Nombre Clínica</label>
                                <p style={{ fontSize: '1.1rem', margin: 0 }}>{viewingClinic.clinic_name}</p>
                            </div>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Administrador</label>
                                <p style={{ fontSize: '1.1rem', margin: 0 }}>{viewingClinic.full_name}</p>
                            </div>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Correo Electrónico</label>
                                <p style={{ fontSize: '1.1rem', margin: 0 }}>{viewingClinic.username}</p>
                            </div>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Sedes / Agendas</label>
                                <p style={{ fontSize: '1.1rem', margin: 0 }}>{viewingClinic.sedesCount} activas</p>
                            </div>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Plan Actual</label>
                                <span className="status-pill confirmada" style={{ background: 'var(--accent)', marginTop: '5px' }}>
                                    {viewingClinic.plan?.name || "Gratuito"}
                                </span>
                            </div>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Créditos Lab Audiencias</label>
                                <strong style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>{viewingClinic.predictive_credits || 0}</strong>
                            </div>
                            <div className="detail-field">
                                <label style={{ display: 'block', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '5px' }}>Estado de Cuenta</label>
                                <span className="status-pill confirmada" style={{ marginTop: '5px' }}>Activo / Al Día</span>
                            </div>
                        </div>

                        <div style={{ padding: '0 20px 20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <p><strong>ID de Sistema:</strong> {viewingClinic.id}</p>
                            <p><strong>Registrado el:</strong> {new Date(viewingClinic.created_at).toLocaleDateString()}</p>
                        </div>

                        <div className="modal-footer" style={{ borderTop: '1px solid var(--glass-border)', padding: '15px 20px', textAlign: 'right' }}>
                            <button className="btn-secondary" onClick={() => setViewingClinic(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {addingAgendaForClinic && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal animate-in" style={{ maxWidth: '450px' }}>
                        <h3>Crear Nueva Sede / Agenda</h3>
                        <p className="text-muted">Asigna una nueva agenda de atención a esta clínica.</p>
                        <form onSubmit={handleCreateAgendaForClinic} className="premium-form-v">
                            <div className="form-group">
                                <label>Nombre de la Sede</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Sede Norte / Consultorio 2"
                                    value={newAgendaName}
                                    onChange={e => setNewAgendaName(e.target.value)}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => { setAddingAgendaForClinic(null); setNewAgendaName(""); }}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Creando..." : "Crear Sede"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingAgendaData && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal animate-in" style={{ maxWidth: '450px' }}>
                        <h3>Editar Sede / Agenda</h3>
                        <p className="text-muted">Cambia el nombre de la sede.</p>
                        <form onSubmit={handleUpdateAgendaName} className="premium-form-v">
                            <div className="form-group">
                                <label>Nombre de la Sede</label>
                                <input
                                    type="text"
                                    required
                                    value={editingAgendaData.name}
                                    onChange={e => setEditingAgendaData({ ...editingAgendaData, name: e.target.value })}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setEditingAgendaData(null)}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Guardando..." : "Guardar Cambios"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {addingMemberForClinic && (
                <div className="modal-overlay">
                    <div className="modal-content premium-modal animate-in" style={{ maxWidth: '500px' }}>
                        <h3>Nuevo Colaborador / Usuario</h3>
                        <p className="text-muted">Crea una cuenta para el personal de esta clínica.</p>
                        <form onSubmit={handleCreateMemberForClinic} className="premium-form-v">
                            <div className="form-group">
                                <label>Nombre Completo</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Dr. Carlos Pérez"
                                    value={newMember.full_name}
                                    onChange={e => setNewMember({ ...newMember, full_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Usuario / Alias (Opcional)</label>
                                <input
                                    type="text"
                                    placeholder="carlosperez"
                                    value={newMember.username}
                                    onChange={e => setNewMember({ ...newMember, username: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Correo de Acceso (Email)</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="carlos@clinica.com"
                                    value={newMember.email}
                                    onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Contraseña Temporal</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="clave123"
                                    value={newMember.password}
                                    onChange={e => setNewMember({ ...newMember, password: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Rol Inicial</label>
                                <select
                                    value={newMember.role}
                                    onChange={e => setNewMember({ ...newMember, role: e.target.value })}
                                >
                                    <option value="agent">Agente (Acceso limitado a agendas asignadas)</option>
                                    <option value="admin">Administrador (Acceso total a la clínica)</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => { setAddingMemberForClinic(null); setNewMember({ full_name: "", username: "", email: "", password: "", role: "agent" }); }}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Creando..." : "Crear Usuario"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {notification && (
                <div className={`notification-toast ${notification.type}`} style={{
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    padding: '15px 25px',
                    borderRadius: '12px',
                    background: notification.type === 'success' ? 'var(--success)' : 'var(--danger)',
                    color: 'white',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                    zIndex: 10000,
                    animation: 'slideInRight 0.3s forwards'
                }}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default MasterPanel;
