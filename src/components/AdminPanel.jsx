import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import ConfirmModal from "./ConfirmModal";
import AiAgentSection from "./AiAgentSection";
import MetaConnectModal from "./MetaConnectModal";
import { initFacebookSDK, loginWithFacebook } from "../utils/facebookSDK";

const AdminPanel = ({ token, onBack, userRole }) => {
    console.log("AdminPanel Mount - Role:", userRole);
    const [agendas, setAgendas] = useState([]);
    const [users, setUsers] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [horarios, setHorarios] = useState([]);
    const [globalServices, setGlobalServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeView, setActiveView] = useState((userRole === "superuser" || userRole === "admin" || userRole === "owner") ? "agendas" : "bloqueos");
    const [selectedAgendaForOffers, setSelectedAgendaForOffers] = useState(null);
    const [agendaOffers, setAgendaOffers] = useState([]);
    const [selectedAgendaForHours, setSelectedAgendaForHours] = useState(null);
    const [allAgendaServices, setAllAgendaServices] = useState([]);
    const [authUser, setAuthUser] = useState(null);
    const [clinicId, setClinicId] = useState(null);

    // Meta Ads States
    const [metaConfig, setMetaConfig] = useState({ access_token: '', business_id: '', is_active: true });
    const [savingMeta, setSavingMeta] = useState(false);
    const [metaAccounts, setMetaAccounts] = useState([]);
    const [metaMappings, setMetaMappings] = useState([]);
    const [metaCampaigns, setMetaCampaigns] = useState([]);
    const [expandedCampaigns, setExpandedCampaigns] = useState(new Set());
    const [showMetaGuide, setShowMetaGuide] = useState(false);
    const [metaStatusFilter, setMetaStatusFilter] = useState("ALL");
    const [metaStartDate, setMetaStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [metaEndDate, setMetaEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [metaAccountFilter, setMetaAccountFilter] = useState("ALL"); // "ALL" o array de ad_account_id
    const [metaAgendaFilter, setMetaAgendaFilter] = useState("ALL");
    const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false);
    const [metaSortConfig, setMetaSortConfig] = useState({ key: 'spend', direction: 'desc' });
    const [savedViews, setSavedViews] = useState(() => JSON.parse(localStorage.getItem("meta_saved_views") || "[]"));
    const [newViewName, setNewViewName] = useState("");
    const [tempMetaToken, setTempMetaToken] = useState(null);
    const [showMetaConnectModal, setShowMetaConnectModal] = useState(false);

    // SMS Automation States
    const [infobipConfig, setInfobipConfig] = useState({ api_key: "", base_url: "", sender_id: "CRM_SMS", is_active: true });
    const [smsTemplates, setSmsTemplates] = useState([
        { event_type: 'booking_confirmation', content: "Hola {paciente}, tu cita ha sido agendada para el {fecha} a las {hora}. ¡Te esperamos!", is_active: true },
        { event_type: 'reminder_24h', content: "Recordatorio: {paciente}, tienes una cita mañana {fecha} a las {hora}. Por favor confirma.", is_active: true },
        { event_type: 'immediate_attention', content: "Aviso Urgente: {paciente}, tu cita está próxima. Favor llegar 15 min antes.", is_active: false }
    ]);
    const [savingSms, setSavingSms] = useState(false);

    // Email Automation States
    const [emailConfig, setEmailConfig] = useState({
        smtp_host: "smtp.hostinger.com",
        smtp_port: 465,
        smtp_user: "",
        smtp_pass: "",
        from_email: "",
        from_name: "CRM System",
        is_active: true
    });
    const [emailTemplates, setEmailTemplates] = useState([
        { event_type: 'booking_confirmation', subject: "Confirmación de Cita - {paciente}", content: "Hola {paciente}, tu cita ha sido agendada para el {fecha} a las {hora}. ¡Te esperamos!", is_active: true },
        { event_type: 'reminder_24h', subject: "Recordatorio de Cita Mañana", content: "Recordatorio: {paciente}, tienes una cita mañana {fecha} a las {hora}. Por favor confirma.", is_active: true }
    ]);
    const [savingEmail, setSavingEmail] = useState(false);
    const [showTestEmailModal, setShowTestEmailModal] = useState(false);
    const [testEmailRecipient, setTestEmailRecipient] = useState("");
    const [sendingTestEmail, setSendingTestEmail] = useState(false);

    // States for Modals
    const [showAgentModal, setShowAgentModal] = useState(null); // stores agenda object
    const [showEditAgenda, setShowEditAgenda] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showServiceModal, setShowServiceModal] = useState(null); // stores service object for editing
    const [editingAgenda, setEditingAgenda] = useState({ name: "", description: "", slots_per_hour: 1, ciudad: "" });
    const [editingService, setEditingService] = useState({
        nombre: "",
        precio_base: 0,
        precio_descuento: 0,
        duracion_minutos: 30,
        concurrency: 1,
        total_sesiones: 1,
        color: "#3b82f6",
        image_url: "",
        descripcion: "",
        parent_id: null,
        es_paquete: false,
        informacion_ia: ""
    });

    const [newAgenda, setNewAgenda] = useState({ name: "", description: "", slots_per_hour: 1, ciudad: "" });
    const [newUser, setNewUser] = useState({
        full_name: "",
        username: "",
        email: "",
        password: "",
        role: "agent"
    });
    const [newBlock, setNewBlock] = useState({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "", service_id: "", tipo: 1 });
    const [newAlert, setNewAlert] = useState({ agenda_id: "", mensaje: "", tipo: "info" });
    const [editingUser, setEditingUser] = useState(null);

    // Logs State
    const [globalSmsLogs, setGlobalSmsLogs] = useState([]);
    const [globalEmailLogs, setGlobalEmailLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [retryingLog, setRetryingLog] = useState(null);

    // Service Hours State
    const [showServiceHoursModal, setShowServiceHoursModal] = useState(null);
    const [serviceHours, setServiceHours] = useState([]);
    const [editingGeneralHour, setEditingGeneralHour] = useState(null);
    const [editingServiceHour, setEditingServiceHour] = useState(null);
    const [duplicateHorario, setDuplicateHorario] = useState(null);

    // Superconfig (Password change)
    const [passwordData, setPasswordData] = useState({ newPassword: "", confirmPassword: "" });
    const [updatingPassword, setUpdatingPassword] = useState(false);

    // Confirm Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: "",
        message: "",
        icon: "",
        type: "confirm",
        onConfirm: () => { }
    });

    useEffect(() => {
        fetchData();
        initFacebookSDK();
    }, []);

    useEffect(() => {
        if (clinicId) fetchMetaData();
    }, [metaStartDate, metaEndDate, clinicId]);

    const fetchAgendaOffers = async (agenda) => {
        if (!agenda) return;
        const { data } = await supabase.from('agenda_services').select('*, service:global_services(*)').eq('agenda_id', agenda.id);
        setAgendaOffers(data || []);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setAuthUser(user);

            const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single();
            const currentClinicId = profile?.clinic_id || user.id;
            setClinicId(currentClinicId);

            // --- CARGAR AGENDAS ---
            const { data: agRes } = await supabase.from('agendas').select('*, users:profiles(*)').eq('clinic_id', currentClinicId);
            setAgendas(agRes || []);

            // Auto-seleccionar primera agenda si no hay ninguna para servicios
            if (!selectedAgendaForOffers && agRes && agRes.length > 0) {
                setSelectedAgendaForOffers(agRes[0]);
                fetchAgendaOffers(agRes[0]);
            } else if (selectedAgendaForOffers) {
                fetchAgendaOffers(selectedAgendaForOffers);
            }

            // --- CARGAR PERSONAL ---
            const { data: usrRes } = await supabase.from('profiles').select('*').eq('clinic_id', currentClinicId);
            setUsers(usrRes || []);

            // --- CARGAR BLOQUEOS ---
            const { data: blRes } = await supabase.from('bloqueos').select('*').eq('clinic_id', currentClinicId);
            setBlocks(blRes || []);

            // --- CARGAR ALERTAS ---
            const { data: alRes } = await supabase.from('alertas').select('*');
            setAlerts(alRes || []);

            // --- CARGAR HORARIOS ---
            const { data: horRes } = await supabase.from('horarios_atencion').select('*');
            setHorarios(horRes || []);

            // --- CARGAR SERVICIOS GLOBALES ---
            const { data: servRes } = await supabase.from('global_services').select('*').eq('clinic_id', currentClinicId);
            setGlobalServices(servRes || []);

            // --- CARGAR CONFIG SMS ---
            const { data: sConfig } = await supabase.from('infobip_configs').select('*').eq('clinic_id', currentClinicId).maybeSingle();
            if (sConfig) setInfobipConfig(sConfig);

            const { data: sTemplates } = await supabase.from('sms_templates').select('*').eq('clinic_id', currentClinicId);
            if (sTemplates && sTemplates.length > 0) {
                setSmsTemplates(prev => {
                    const newTempl = [...prev];
                    sTemplates.forEach(t => {
                        const idx = newTempl.findIndex(nt => nt.event_type === t.event_type);
                        if (idx !== -1) newTempl[idx] = t;
                        else newTempl.push(t);
                    });
                    return newTempl;
                });
            }

            // --- CARGAR CONFIG EMAIL ---
            const { data: eConfig } = await supabase.from('email_configs').select('*').eq('clinic_id', currentClinicId).maybeSingle();
            if (eConfig) setEmailConfig(eConfig);

            const { data: eTemplates } = await supabase.from('email_templates').select('*').eq('clinic_id', currentClinicId);
            if (eTemplates && eTemplates.length > 0) {
                setEmailTemplates(prev => {
                    const newTempl = [...prev];
                    eTemplates.forEach(t => {
                        const idx = newTempl.findIndex(nt => nt.event_type === t.event_type);
                        if (idx !== -1) newTempl[idx] = t;
                        else newTempl.push(t);
                    });
                    return newTempl;
                });
            }

            await fetchMetaData(currentClinicId);
        } catch (error) {
            console.error("Error fetching data:", error);
        }
        setLoading(false);
    };

    const fetchMetaData = async (cid = null) => {
        const targetClinicId = cid || clinicId;
        if (!targetClinicId) return;

        try {
            const { data: mConfig } = await supabase.from('meta_ads_config').select('*').eq('clinic_id', targetClinicId).maybeSingle();
            if (mConfig) setMetaConfig(mConfig);

            const { data: mAccounts } = await supabase.from('meta_ads_accounts').select('*').eq('clinic_id', targetClinicId);
            setMetaAccounts(mAccounts || []);

            const { data: mMappings } = await supabase.from('meta_ads_agenda_mapping').select('*').eq('clinic_id', targetClinicId);
            setMetaMappings(mMappings || []);

            const { data: mCampaigns } = await supabase.from('meta_ads_performance')
                .select('*')
                .eq('clinic_id', targetClinicId)
                .gte('date', metaStartDate)
                .lte('date', metaEndDate)
                .order('date', { ascending: false });

            const entityMetrics = {};
            if (mCampaigns) {
                mCampaigns.forEach(row => {
                    const key = `${row.campaign_id}_${row.entity_type}`;
                    if (!entityMetrics[key]) {
                        entityMetrics[key] = { ...row, spend: 0, impressions: 0, clicks: 0, conversations_count: 0 };
                    }
                    entityMetrics[key].spend += parseFloat(row.spend || 0);
                    entityMetrics[key].impressions += (row.impressions || 0);
                    entityMetrics[key].clicks += (row.clicks || 0);
                    entityMetrics[key].conversations_count += (row.conversations_count || 0);

                    if (row.date >= (entityMetrics[key].last_date || '')) {
                        entityMetrics[key].status = row.status;
                        entityMetrics[key].campaign_name = row.campaign_name;
                        entityMetrics[key].last_date = row.date;
                    }
                });
            }
            setMetaCampaigns(Object.values(entityMetrics));
        } catch (error) {
            console.error("Error fetching meta data:", error);
        }
    };

    const fetchGlobalLogs = async () => {
        setLoadingLogs(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user?.id).single();
            const clinicId = profile?.clinic_id || user?.id;

            const [smsRes, emailRes] = await Promise.all([
                supabase.from('sms_logs').select('*').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(50),
                supabase.from('email_logs').select('*').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(50)
            ]);

            setGlobalSmsLogs(smsRes.data || []);
            setGlobalEmailLogs(emailRes.data || []);
        } catch (e) {
            console.error("Error fetching global logs:", e);
        } finally {
            setLoadingLogs(false);
        }
    };

    const handleRetryGlobal = async (log, type) => {
        setRetryingLog(log.id);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user?.id).single();
            const clinicId = profile?.clinic_id || user?.id;

            if (type === 'sms') {
                const { error } = await supabase.functions.invoke('send-sms-infobip', {
                    body: {
                        clinicId,
                        phone: log.patient_phone,
                        message: log.message_content,
                        patientName: log.patient_name
                    }
                });
                if (error) throw error;
            } else {
                if (!log.message_content) throw new Error("No hay contenido guardado para reintentar este correo antiguo");
                const { error } = await supabase.functions.invoke('send-email-hostinger', {
                    body: {
                        clinicId,
                        to: log.patient_email,
                        subject: log.subject,
                        body: log.message_content,
                        patientName: log.patient_name
                    }
                });
                if (error) throw error;
            }
            alert("Reenviado con éxito");
            fetchGlobalLogs();
        } catch (e) {
            alert("Error: " + e.message);
        } finally {
            setRetryingLog(null);
        }
    };

    const handleClearDay = (agendaId, dayIndex) => {
        if (!agendaId) return alert("Selecciona una agenda");

        setConfirmModal({
            isOpen: true,
            title: "Cerrar Día Completo",
            message: "¿Estás seguro de que quieres eliminar todos los horarios de este día? La agenda aparecerá como CERRADA.",
            icon: "🚫",
            type: "danger",
            onConfirm: async () => {
                await supabase.from('horarios_atencion')
                    .delete()
                    .eq('agenda_id', agendaId)
                    .eq('dia_semana', dayIndex);
                fetchData();
            }
        });
    };

    const handleUpdateService = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('global_services')
            .update(editingService)
            .eq('id', showServiceModal.id);

        if (!error) {
            setShowServiceModal(null);
            fetchData();
        }
    };

    const handleCreateAgenda = async (e) => {
        e.preventDefault();

        try {
            // Get clinic_id
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single();
            const currentClinicId = profile?.clinic_id;

            const { error } = await supabase.from('agendas').insert({
                ...newAgenda,
                clinic_id: currentClinicId
            });

            if (error) {
                if (error.code === '23505') {
                    alert("Ya tienes una agenda llamada '" + newAgenda.name + "'. Por favor usa un nombre diferente.");
                } else {
                    alert("Error al crear agenda: " + error.message);
                }
                return;
            }

            alert("Agenda creada con éxito");
            setNewAgenda({ name: "", description: "", slots_per_hour: 1, ciudad: "" });
            setShowEditAgenda(null);
            fetchData();
        } catch (err) {
            console.error("Error creating agenda:", err);
            alert("Error crítico: " + err.message);
        }
    };

    const handleDeleteAgenda = (id) => {
        setConfirmModal({
            isOpen: true,
            title: "Eliminar Agenda",
            message: "¿Estás seguro de eliminar esta agenda y todas sus citas asociadas? Esta acción es irreversible.",
            icon: "📂",
            type: "danger",
            onConfirm: async () => {
                const { error } = await supabase.from('agendas').delete().eq('id', id);
                if (!error) fetchData();
            }
        });
    };

    const handleUpdateAgenda = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('agendas')
            .update(editingAgenda)
            .eq('id', showEditAgenda.id);
        if (!error) { setShowEditAgenda(null); fetchData(); }
    };

    const toggleAgentAssignment = async (userId, agendaId, isAssigned) => {
        if (isAssigned) {
            await supabase.from('agenda_users')
                .delete()
                .eq('user_id', userId)
                .eq('agenda_id', agendaId);
        } else {
            await supabase.from('agenda_users')
                .insert({ user_id: userId, agenda_id: agendaId });
        }
        fetchData();
    };

    const handleDeleteUser = (id) => {
        setConfirmModal({
            isOpen: true,
            title: "Eliminar Usuario",
            message: "¿Deseas eliminar permanentemente a este usuario? Perderá el acceso al sistema de inmediato.",
            icon: "👤",
            type: "danger",
            onConfirm: async () => {
                const { error } = await supabase.from('users').delete().eq('id', id);
                if (!error) fetchData();
            }
        });
    };

    const handleCreateCreateBlock = async (e) => {
        e.preventDefault();
        const payload = {
            ...newBlock,
            service_id: newBlock.service_id === "" ? null : parseInt(newBlock.service_id),
            tipo: parseInt(newBlock.tipo)
        };
        const { error } = await supabase.from('bloqueos').insert(payload);
        if (!error) {
            setNewBlock({ agenda_id: "", fecha_inicio: "", fecha_fin: "", hora_inicio: "", hora_fin: "", es_todo_el_dia: 0, motivo: "", service_id: "", tipo: 1 });
            fetchData();
            alert("Operación completada con éxito");
        }
    };

    const handleDeleteBlock = (id) => {
        setConfirmModal({
            isOpen: true,
            title: "Eliminar Bloqueo",
            message: "¿Deseas liberar este horario y eliminar el bloqueo?",
            icon: "🔓",
            type: "confirm",
            onConfirm: async () => {
                const { error } = await supabase.from('bloqueos').delete().eq('id', id);
                if (!error) fetchData();
            }
        });
    };

    const handleCreateAlert = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('alertas').insert(newAlert);
        if (!error) {
            setNewAlert({ agenda_id: "", mensaje: "", tipo: "info" });
            fetchData();
        }
    };

    const handleDeleteAlert = async (id) => {
        const { error } = await supabase.from('alertas').delete().eq('id', id);
        if (!error) fetchData();
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Crear un cliente temporal que NO guarde la sesión en el navegador
            // Esto evita que el nuevo usuario "reemplace" al superadmin actual.
            const tempClient = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            // 2. Crear usuario en Supabase Auth usando el cliente temporal
            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newUser.email,
                password: newUser.password,
                options: {
                    data: {
                        full_name: newUser.full_name,
                        username: newUser.username,
                    }
                }
            });

            if (authError) throw authError;

            // 3. Crear perfil en la tabla 'profiles' usando el cliente principal (Superadmin)
            // Obtener mi clinic_id para heredarlo
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            const { data: currentProfile } = await supabase.from('profiles').select('clinic_id').eq('id', currentUser.id).single();

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    username: newUser.username,
                    full_name: newUser.full_name,
                    role: newUser.role,
                    clinic_id: currentProfile?.clinic_id // Inherit Clinic ID
                });

            if (profileError) {
                console.error("Auth creado pero perfil falló:", profileError);
            }

            // 4. SI EL CREADOR ES ADMIN: Vincular automáticamente al nuevo agente a las agendas de este Admin
            if (userRole === "admin" && agendas.length > 0) {
                console.log("DEBUG: Vinculando nuevo agente a las agendas del admin creador...");
                const assignments = agendas.map(ag => ({
                    user_id: authData.user.id,
                    agenda_id: ag.id
                }));

                const { error: linkError } = await supabase
                    .from('agenda_users')
                    .insert(assignments);

                if (linkError) console.error("Error al auto-vincular agente:", linkError);
                else console.log("✅ Agente vinculado a:", agendas.length, "agendas.");
            }

            alert(`Usuario creado correctamente${userRole === "admin" ? " y vinculado a tus agendas" : ""}. Se ha enviado un correo de confirmación.`);
            setShowUserModal(false);
            setNewUser({ full_name: "", username: "", email: "", password: "", role: "agent" });
            fetchData();
        } catch (error) {
            console.error("Error al crear usuario:", error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setNewUser({
            full_name: user.full_name || "",
            username: user.username || "",
            email: user.email || "", // Recordar que profiles podría no tener email si no se guardó ahí
            password: "", // No mostramos password por seguridad
            role: user.role || "agent"
        });
        setShowUserModal(true);
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Llamar a la Edge Function para poder actualizar Auth (email/password) y Profile al tiempo
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    userId: editingUser.id,
                    email: newUser.email,
                    password: newUser.password || null, // Solo se envía si se escribió algo
                    full_name: newUser.full_name,
                    username: newUser.username,
                    role: newUser.role
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            alert("✅ Usuario y credenciales actualizados correctamente.");
            setShowUserModal(false);
            setEditingUser(null);
            setNewUser({ full_name: "", username: "", email: "", password: "", role: "agent" });
            fetchData();
        } catch (error) {
            console.error("Error al actualizar usuario:", error);
            alert("Error al actualizar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveService = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const isNew = showServiceModal.id === 'new';
            // Get clinic_id for new service
            const { data: { user } } = await supabase.auth.getUser();
            const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single();
            const currentClinicId = profile?.clinic_id;

            const payload = {
                nombre: editingService.nombre,
                descripcion: editingService.descripcion,
                precio_base: parseFloat(editingService.precio_base || 0),
                precio_descuento: parseFloat(editingService.precio_descuento || 0),
                duracion_minutos: parseInt(editingService.duracion_minutos || 0),
                concurrency: parseInt(editingService.concurrency || 1),
                total_sesiones: parseInt(editingService.total_sesiones || 1),
                color: editingService.color,
                image_url: editingService.image_url,
                clinic_id: currentClinicId,
                parent_id: editingService.parent_id === "" || editingService.parent_id === null ? null : parseInt(editingService.parent_id),
                es_paquete: editingService.es_paquete,
                informacion_ia: editingService.informacion_ia
            };

            let serviceId = showServiceModal.id;

            if (isNew) {
                const { data, error } = await supabase.from('global_services').insert(payload).select();
                if (error) throw error;
                serviceId = data[0].id;

                // Asignar a agendas
                const selectedAgendas = new FormData(e.target).getAll("assign_to");
                if (selectedAgendas.length > 0) {
                    let toAssign = [];
                    if (selectedAgendas.includes("-1")) {
                        toAssign = agendas.map(ag => ({ agenda_id: ag.id, service_id: serviceId }));
                    } else {
                        toAssign = selectedAgendas.map(id => ({ agenda_id: parseInt(id), service_id: serviceId }));
                    }
                    await supabase.from('agenda_services').insert(toAssign);
                }
            } else {
                const { error } = await supabase.from('global_services').update(payload).eq('id', serviceId);
                if (error) throw error;
            }

            alert(isNew ? "Servicio creado con éxito" : "Cambios guardados");
            setShowServiceModal(null);
            fetchData();
        } catch (error) {
            console.error("Error saving service:", error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchServiceHours = async (agendaId, serviceId) => {
        const { data, error } = await supabase.from('horarios_servicios')
            .select('*')
            .eq('agenda_id', agendaId)
            .eq('service_id', serviceId);

        if (!error) setServiceHours(data || []);
    };

    const handleAddServiceHour = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
            agenda_id: showServiceHoursModal.agenda_id,
            service_id: showServiceHoursModal.service_id,
            dia_semana: parseInt(fd.get("dia_semana")),
            hora_inicio: fd.get("hora_inicio"),
            hora_fin: fd.get("hora_fin")
        };

        let error;
        if (editingServiceHour) {
            const { error: err } = await supabase.from('horarios_servicios')
                .update(payload)
                .eq('id', editingServiceHour.id);
            error = err;
        } else {
            const { error: err } = await supabase.from('horarios_servicios').insert(payload);
            error = err;
        }

        if (!error) {
            setEditingServiceHour(null);
            e.target.reset();
            handleFetchServiceHours(showServiceHoursModal.agenda_id, showServiceHoursModal.service_id);
        }
    };

    // --- RENDER HELPERS ---

    const renderAgendas = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>Agendas Activas</h3>
                <button className="btn-process" onClick={() => setShowEditAgenda({ id: 'new' })}>+ Nueva Agenda</button>
            </div>

            <div className="grid-cards">
                {agendas.map(ag => (
                    <div key={ag.id} className="premium-card">
                        <div className="card-badge">{ag.slots_per_hour} cupos/h</div>
                        <h4>{ag.name}</h4>
                        <p style={{ color: 'var(--accent)', fontWeight: '600', fontSize: '0.85rem', marginBottom: '5px' }}>📍 {ag.ciudad || "Ciudad no definida"}</p>
                        <p>{ag.description || "Sin descripción"}</p>
                        <div className="card-agents">
                            <span>👥 {ag.users?.length || 0} Agentes asignados</span>
                        </div>
                        <div className="card-actions">
                            <button className="btn-edit" onClick={() => {
                                setShowEditAgenda(ag);
                                setEditingAgenda({ name: ag.name, description: ag.description, slots_per_hour: ag.slots_per_hour, ciudad: ag.ciudad || "" });
                            }}>⚙️ Editar</button>
                            <button className="btn-secondary" onClick={() => setShowAgentModal(ag)}>👤 Agentes</button>
                            <button className="btn-delete" onClick={() => handleDeleteAgenda(ag.id)}>🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderUsers = () => {
        // Filtrar usuarios para mostrar solo los que el Admin debe ver
        const filteredUsers = users.filter(u => {
            if (userRole === "superuser") return true;
            // Si es admin, ver solo usuarios que compartan al menos una agenda con él
            return u.agendas?.some(ua => agendas.some(ag => ag.id === ua.agenda.id));
        });

        return (
            <div className="admin-section fade-in">
                <div className="section-header">
                    <h3>Gestión de Personal</h3>
                    <button className="btn-process" onClick={() => setShowUserModal(true)}>+ Nuevo Usuario</button>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Usuario</th>
                                <th>Rol</th>
                                <th>Agendas</th>
                                {(userRole === "superuser" || userRole === "owner") && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(u => (
                                <tr key={u.id}>
                                    <td><strong>{u.full_name}</strong></td>
                                    <td>@{u.username}</td>
                                    <td>
                                        <span className={`role-badge ${u.role}`}>
                                            {u.role === 'superuser' ? 'SuperAdmin' : u.role === 'admin' ? 'Administrador' : 'Agente'}
                                        </span>
                                    </td>
                                    <td>{u.agendas?.map(ua => ua.agenda.name).join(", ") || "Sin acceso"}</td>
                                    {(userRole === "superuser" || userRole === "owner") && (
                                        <td>
                                            <button className="btn-edit" style={{ padding: '6px 12px', marginRight: '5px' }} onClick={() => handleEditUser(u)}>✏️</button>
                                            <button className="btn-delete" style={{ padding: '6px 12px' }} onClick={() => handleDeleteUser(u.id)}>🗑️</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderBloqueos = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🚫 Control de Indisponibilidad</h3>
            </div>
            <div className="premium-card" style={{ marginBottom: '30px' }}>
                <h4>Crear Nuevo Bloqueo</h4>
                <form onSubmit={handleCreateCreateBlock} className="premium-form-inline">
                    <select value={newBlock.tipo} onChange={e => setNewBlock({ ...newBlock, tipo: parseInt(e.target.value) })} style={{ border: newBlock.tipo === 2 ? '2px solid #22c55e' : '2px solid #ef4444' }}>
                        <option value="1">🚫 Bloquear</option>
                        <option value="2">✅ Habilitar (Excepción)</option>
                    </select>
                    <select value={newBlock.agenda_id} onChange={e => setNewBlock({ ...newBlock, agenda_id: parseInt(e.target.value) })} required>
                        <option value="">-- Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <select value={newBlock.service_id} onChange={e => setNewBlock({ ...newBlock, service_id: e.target.value })} disabled={!newBlock.agenda_id}>
                        <option value="">🔥 Todo el sistema de la Agenda</option>
                        {globalServices
                            .filter(s => allAgendaServices.some(as => as.agenda_id === newBlock.agenda_id && as.service_id === s.id))
                            .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)
                        }
                    </select>
                    <input type="date" value={newBlock.fecha_inicio} onChange={e => setNewBlock({ ...newBlock, fecha_inicio: e.target.value, fecha_fin: e.target.value })} required />
                    <input type="time" value={newBlock.hora_inicio} onChange={e => setNewBlock({ ...newBlock, hora_inicio: e.target.value })} placeholder="Inicio" />
                    <input type="time" value={newBlock.hora_fin} onChange={e => setNewBlock({ ...newBlock, hora_fin: e.target.value })} placeholder="Fin" />
                    <input type="text" value={newBlock.motivo} onChange={e => setNewBlock({ ...newBlock, motivo: e.target.value })} placeholder="Motivo/Evento" />
                    <button type="submit" className={newBlock.tipo === 2 ? "btn-process success" : "btn-process"}>{newBlock.tipo === 2 ? "Abrir Cupo" : "Bloquear"}</button>
                </form>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Agenda</th>
                            <th>Tipo</th>
                            <th>Servicio</th>
                            <th>Fecha</th>
                            <th>Horario</th>
                            <th>Motivo</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {blocks.filter(b => agendas.some(a => a.id === b.agenda_id)).map(b => (
                            <tr key={b.id}>
                                <td><strong>{agendas.find(a => a.id === b.agenda_id)?.name}</strong></td>
                                <td>{b.tipo === 2 ? <span className="role-badge agent">✅ HABILITADO</span> : <span className="role-badge danger">🚫 BLOQUEO</span>}</td>
                                <td>{b.service_id ? <span className="role-badge agent">{globalServices.find(s => s.id === b.service_id)?.nombre}</span> : <span className="role-badge superuser">TODO</span>}</td>
                                <td>{b.fecha_inicio}</td>
                                <td>{b.es_todo_el_dia ? "Todo el día" : `${b.hora_inicio} - ${b.hora_fin}`}</td>
                                <td>{b.motivo}</td>
                                <td><button className="btn-delete" onClick={() => handleDeleteBlock(b.id)}>🗑️</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderAlertas = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🔔 Alertas y Avisos</h3>
            </div>
            <div className="premium-card" style={{ marginBottom: '30px' }}>
                <h4>Nueva Alerta</h4>
                <form onSubmit={handleCreateAlert} className="premium-form-inline">
                    <select value={newAlert.agenda_id} onChange={e => setNewAlert({ ...newAlert, agenda_id: parseInt(e.target.value) })} required>
                        <option value="">-- Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="text" value={newAlert.mensaje} onChange={e => setNewAlert({ ...newAlert, mensaje: e.target.value })} placeholder="Mensaje de aviso..." required style={{ flex: 1 }} />
                    <select value={newAlert.tipo} onChange={e => setNewAlert({ ...newAlert, tipo: e.target.value })}>
                        <option value="info">Información (Azul)</option>
                        <option value="warning">Advertencia (Naranja)</option>
                        <option value="danger">Crítico (Rojo)</option>
                    </select>
                    <button type="submit" className="btn-process">Publicar</button>
                </form>
            </div>

            <div className="grid-cards">
                {alerts.filter(al => agendas.some(a => a.id === al.agenda_id)).map(al => (
                    <div key={al.id} className={`premium-card alert-card ${al.tipo}`}>
                        <span className="alert-agenda-tag">{agendas.find(a => a.id === al.agenda_id)?.name}</span>
                        <p>{al.mensaje}</p>
                        <button className="btn-delete-tiny" onClick={async () => {
                            await supabase.from('alertas').delete().eq('id', al.id);
                            fetchData();
                        }}>×</button>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderConfigHorarios = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🕒 Gestión de Horarios de Atención</h3>
            </div>

            <div className="config-grid">
                <div className="premium-card">
                    <h4>Horarios de Atención</h4>
                    {(userRole === "superuser" || userRole === "admin" || userRole === "owner") ? (
                        <form className="premium-form-v" onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.target);
                            const data = {
                                agenda_id: parseInt(fd.get("agenda_id")),
                                dia_semana: parseInt(fd.get("dia_semana")),
                                hora_inicio: fd.get("hora_inicio"),
                                hora_fin: fd.get("hora_fin")
                            };

                            let error;
                            if (editingGeneralHour) {
                                const { error: err } = await supabase.from('horarios_atencion')
                                    .update(data)
                                    .eq('id', editingGeneralHour.id);
                                error = err;
                            } else {
                                const { error: err } = await supabase.from('horarios_atencion').insert(data);
                                error = err;
                            }

                            if (!error) {
                                setEditingGeneralHour(null);
                                e.target.reset();
                                fetchData();
                            }
                        }}>
                            <select name="agenda_id" required defaultValue={editingGeneralHour?.agenda_id || ""}>
                                <option value="">-- Agenda --</option>
                                {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <select name="dia_semana" required defaultValue={editingGeneralHour?.dia_semana ?? ""}>
                                <option value="" disabled>-- Día --</option>
                                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="hora_inicio" type="time" defaultValue={editingGeneralHour?.hora_inicio || "08:00"} required />
                                <input name="hora_fin" type="time" defaultValue={editingGeneralHour?.hora_fin || "18:00"} required />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="submit" className="btn-process" style={{ flex: 2 }}>{editingGeneralHour ? "💾 Guardar Cambios" : "➕ Añadir Horario"}</button>
                                {editingGeneralHour && <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingGeneralHour(null)}>Cancelar</button>}
                            </div>
                            <button
                                type="button"
                                className="btn-delete"
                                style={{ width: '100%', marginTop: '5px' }}
                                onClick={(e) => {
                                    const form = e.target.closest('form');
                                    const agendaId = parseInt(new FormData(form).get("agenda_id"));
                                    const dayIndex = parseInt(new FormData(form).get("dia_semana"));
                                    handleClearDay(agendaId, dayIndex);
                                }}
                            >
                                🚫 Marcar día como CERRADO
                            </button>
                        </form>
                    ) : (
                        <div className="read-only-notice" style={{ padding: '15px', background: 'rgba(59,130,246,0.1)', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--primary)' }}>
                            ℹ️ Consultando horarios configurados para la clínica.
                        </div>
                    )}
                </div>

                <div className="mini-list">
                    {[0, 1, 2, 3, 4, 5, 6].map(d => {
                        const diaHorarios = horarios.filter(h => h.dia_semana === d);
                        const diaNombre = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][d];
                        return (
                            <div key={d} className={`schedule-day-row ${diaHorarios.length === 0 ? 'inactive-day' : 'active-day'}`}>
                                <div className="day-info">
                                    <strong>{diaNombre}</strong>
                                    <span className={`status-pill ${diaHorarios.length > 0 ? 'open' : 'closed'}`}>
                                        {diaHorarios.length > 0 ? 'Operativo' : 'Sin horario (Cerrado)'}
                                    </span>
                                </div>
                                <div className="day-ranges">
                                    {diaHorarios.map(h => (
                                        <div key={h.id} className="mini-item-inline range-badge">
                                            <span>{h.hora_inicio}-{h.hora_fin}</span>
                                            <small>{agendas.find(a => a.id === h.agenda_id)?.name}</small>
                                            {(userRole === "superuser" || userRole === "admin" || userRole === "owner") && (
                                                <div className="mini-item-actions">
                                                    <button className="btn-edit-tiny" onClick={() => setDuplicateHorario(h)} title="Duplicar a otro día">📑</button>
                                                    <button className="btn-edit-tiny" onClick={() => setEditingGeneralHour(h)}>✏️</button>
                                                    <button className="btn-delete-tiny" onClick={async () => {
                                                        await supabase.from('horarios_atencion').delete().eq('id', h.id);
                                                        fetchData();
                                                    }}>×</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    const renderConfigServicios = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>🛒 Catálogo de Servicios y Ofertas</h3>
                <p className="text-muted">Gestiona el catálogo maestro y personaliza precios por agenda</p>
            </div>

            <div className="premium-card" style={{ marginBottom: '30px' }}>
                <h4>Gestionar Ofertas por Agenda</h4>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="custom-file-input"
                        style={{ flex: 1, minWidth: '250px' }}
                        value={selectedAgendaForOffers?.id || ""}
                        onChange={(e) => {
                            const ag = agendas.find(a => a.id === parseInt(e.target.value));
                            setSelectedAgendaForOffers(ag);
                            fetchAgendaOffers(ag);
                        }}
                    >
                        <option value="">-- Seleccionar Agenda --</option>
                        {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>

                    {selectedAgendaForOffers && (
                        (userRole === "superuser" || userRole === "admin" || userRole === "owner") ? (
                            <div className="mini-form" style={{ display: 'flex', gap: '10px', flex: 2 }}>
                                <select id="offer-service-select" className="custom-file-input" style={{ flex: 1 }}>
                                    <option value="">-- Añadir del Catálogo Maestro --</option>
                                    {globalServices
                                        .filter(gs => {
                                            // No mostrar si ya está en esta agenda
                                            if (agendaOffers.some(ao => ao.service_id === gs.id)) return false;
                                            // Superadmin/Owner ve todo el resto
                                            if ((userRole === "superuser" || userRole === "owner")) return true;
                                            // Admin ve solo si está en alguna de sus agendas
                                            return allAgendaServices.some(as => as.service_id === gs.id && agendas.some(ag => ag.id === as.agenda_id));
                                        })
                                        .map(gs => (
                                            <option key={gs.id} value={gs.id}>{gs.nombre} (${gs.precio_base.toLocaleString()})</option>
                                        ))}
                                </select>
                                <button className="btn-process" onClick={async () => {
                                    const sid = document.getElementById("offer-service-select").value;
                                    if (!sid) return;
                                    const { error } = await supabase.from('agenda_services').insert({ agenda_id: selectedAgendaForOffers.id, service_id: parseInt(sid) });
                                    if (!error) fetchData();
                                }}>+ Asignar</button>
                            </div>
                        ) : (
                            <div style={{ flex: 2, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                ℹ️ Visualizando servicios asignados a esta agenda.
                            </div>
                        )
                    )}
                </div>

                {selectedAgendaForOffers && (
                    <div className="offers-grid fade-in" style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {agendaOffers.map(off => (
                            <div key={off.id} className="offer-item-premium" style={{ border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{off.service.nombre}</div>
                                    <small style={{ opacity: 0.6 }}>Base: ${off.service.precio_base.toLocaleString()}</small>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => {
                                        setShowServiceHoursModal({
                                            agenda_id: selectedAgendaForOffers.id,
                                            service_id: off.service.id,
                                            service_name: off.service.nombre
                                        });
                                        handleFetchServiceHours(selectedAgendaForOffers.id, off.service.id);
                                    }}>🕒 Horarios</button>
                                    <input
                                        type="number"
                                        defaultValue={off.precio_final}
                                        readOnly={!(userRole === "superuser" || userRole === "admin" || userRole === "owner")}
                                        style={{ width: '90px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', textAlign: 'right', cursor: (!(userRole === "superuser" || userRole === "admin" || userRole === "owner")) ? 'default' : 'text' }}
                                        onBlur={async (e) => {
                                            if (!(userRole === "superuser" || userRole === "admin" || userRole === "owner")) return;
                                            const val = parseFloat(e.target.value);
                                            if (val === off.precio_final) return;
                                            await supabase.from('agenda_services').update({ precio_final: val }).eq('id', off.id);
                                            fetchData();
                                        }}
                                    />
                                    {(userRole === "superuser" || userRole === "admin" || userRole === "owner") && (
                                        <button className="btn-delete-tiny" onClick={async () => {
                                            if (confirm("¿Desvincular este servicio de la agenda?")) {
                                                await supabase.from('agenda_services').delete().eq('id', off.id);
                                                fetchData();
                                            }
                                        }}>×</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Catálogo Maestro visible para superadmin y admin (admin solo lectura y limitado a sus servicios) */}
            <div className="master-catalog-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h4 style={{ margin: 0 }}>🌟 Catálogo Maestro (Global)</h4>
                    {(userRole === "superuser" || userRole === "owner") && (
                        <button className="btn-process" onClick={() => {
                            setEditingService({
                                nombre: "",
                                precio_base: 0,
                                precio_descuento: 0,
                                duracion_minutos: 30,
                                concurrency: 1,
                                total_sesiones: 1,
                                color: "#3b82f6",
                                image_url: "",
                                descripcion: "",
                                parent_id: null,
                                es_paquete: false,
                                informacion_ia: ""
                            });
                            setShowServiceModal({ id: 'new' });
                        }}>+ Nuevo Servicio</button>
                    )}
                </div>

                <div className="service-premium-grid">
                    {globalServices
                        .filter(s => {
                            // Mostrar solo productos base aquí (que no tienen padre)
                            if (s.parent_id) return false;

                            if ((userRole === "superuser" || userRole === "owner")) return true;
                            // Para admin, mostrar solo si el servicio está en alguna de sus agendas
                            return allAgendaServices.some(as => as.service_id === s.id && agendas.some(ag => ag.id === as.agenda_id));
                        })
                        .map(s => {
                            const packages = globalServices.filter(p => p.parent_id === s.id);

                            return (
                                <div key={s.id} className="service-group-container" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div className="service-card-v2 base-product" style={{ borderTop: `4px solid ${s.color || 'var(--primary)'}` }}>
                                        {s.image_url && (
                                            <div className="service-card-img" style={{ backgroundImage: `url(${s.image_url})` }}></div>
                                        )}
                                        <div className="service-card-body">
                                            <div className="service-title-row">
                                                <h5>{s.nombre} {s.es_paquete && <span className="package-badge">📦 Paquete</span>}</h5>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                    {s.precio_descuento > 0 ? (
                                                        <>
                                                            <span className="price-tag" style={{ color: 'var(--accent)', fontWeight: '800' }}>
                                                                ${s.precio_descuento.toLocaleString()}
                                                            </span>
                                                            <span style={{ fontSize: '0.7rem', textDecoration: 'line-through', opacity: 0.5 }}>
                                                                ${s.precio_base.toLocaleString()}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="price-tag">${s.precio_base.toLocaleString()}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="service-desc">{s.descripcion || "Sin descripción proporcionada."}</p>
                                            <div className="service-meta">
                                                <span>⏱️ {s.duracion_minutos} min</span>
                                                <span>👥 {s.concurrency > 1 ? `${s.concurrency} cupos` : '1 cupo'}</span>
                                            </div>
                                            {(userRole === "superuser" || userRole === "owner") && (
                                                <div className="service-actions">
                                                    <button className="btn-edit-v2" onClick={() => {
                                                        setEditingService({
                                                            nombre: s.nombre,
                                                            precio_base: s.precio_base,
                                                            precio_descuento: s.precio_descuento || 0,
                                                            duracion_minutos: s.duracion_minutos,
                                                            concurrency: s.concurrency || 1,
                                                            total_sesiones: s.total_sesiones || 1,
                                                            color: s.color || "#3b82f6",
                                                            image_url: s.image_url || "",
                                                            descripcion: s.descripcion || "",
                                                            parent_id: s.parent_id,
                                                            es_paquete: s.es_paquete || false,
                                                            informacion_ia: s.informacion_ia || ""
                                                        });
                                                        setShowServiceModal(s);
                                                    }}>✏️ Editar</button>
                                                    <button className="btn-delete-v2" onClick={() => {
                                                        setConfirmModal({
                                                            isOpen: true,
                                                            title: "Eliminar del Catálogo",
                                                            message: "¿Estás seguro de eliminar este servicio del catálogo maestro? Se desvinculará de TODAS las agendas.",
                                                            icon: "📦",
                                                            type: "danger",
                                                            onConfirm: async () => {
                                                                const { error } = await supabase.from('global_services').delete().eq('id', s.id);
                                                                if (!error) fetchData();
                                                            }
                                                        });
                                                    }}>🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {packages.length > 0 && (
                                        <div className="nested-packages" style={{ paddingLeft: '40px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {packages.map(p => (
                                                <div key={p.id} className="service-card-v2 package-variant" style={{ borderLeft: `4px solid ${s.color || 'var(--primary)'}`, background: 'rgba(255,255,255,0.01)' }}>
                                                    <div className="service-card-body" style={{ padding: '10px 15px' }}>
                                                        <div className="service-title-row" style={{ marginBottom: '5px' }}>
                                                            <h6 style={{ margin: 0 }}>📦 {p.nombre}</h6>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                                {p.precio_descuento > 0 ? (
                                                                    <>
                                                                        <span className="price-tag" style={{ color: 'var(--accent)', fontWeight: '800', fontSize: '0.9rem' }}>
                                                                            ${p.precio_descuento.toLocaleString()}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.65rem', textDecoration: 'line-through', opacity: 0.5 }}>
                                                                            ${p.precio_base.toLocaleString()}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="price-tag" style={{ fontSize: '0.9rem' }}>${p.precio_base.toLocaleString()}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="service-meta" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>
                                                            <span>📅 {p.total_sesiones} sesiones</span>
                                                            <span style={{ opacity: 0.6 }}>{p.duracion_minutos} min</span>
                                                        </div>
                                                        {(userRole === "superuser" || userRole === "owner") && (
                                                            <div className="service-actions" style={{ justifyContent: 'flex-end', gap: '5px' }}>
                                                                <button className="btn-edit-v2" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => {
                                                                    setEditingService({
                                                                        nombre: p.nombre,
                                                                        precio_base: p.precio_base,
                                                                        precio_descuento: p.precio_descuento || 0,
                                                                        duracion_minutos: p.duracion_minutos,
                                                                        concurrency: p.concurrency || 1,
                                                                        total_sesiones: p.total_sesiones || 1,
                                                                        color: p.color || s.color || "#3b82f6",
                                                                        image_url: p.image_url || "",
                                                                        descripcion: p.descripcion || "",
                                                                        parent_id: p.parent_id,
                                                                        es_paquete: p.es_paquete || false,
                                                                        informacion_ia: p.informacion_ia || ""
                                                                    });
                                                                    setShowServiceModal(p);
                                                                }}>✏️</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                    {/* Sección para paquetes huérfanos o sin padre (por si acaso) */}
                    {globalServices
                        .filter(s => s.parent_id && !globalServices.some(p => p.id === s.parent_id))
                        .map(s => (
                            <div key={s.id} className="service-card-v2 orphan-package" style={{ borderTop: `4px solid #94a3b8`, opacity: 0.7 }}>
                                <div className="service-card-body">
                                    <div className="service-title-row">
                                        <h5>{s.nombre}</h5>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            {s.precio_descuento > 0 ? (
                                                <>
                                                    <span className="price-tag" style={{ color: 'var(--accent)', fontWeight: '800' }}>
                                                        ${s.precio_descuento.toLocaleString()}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', textDecoration: 'line-through', opacity: 0.5 }}>
                                                        ${s.precio_base.toLocaleString()}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="price-tag">${s.precio_base.toLocaleString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button className="btn-edit-v2" onClick={() => {
                                        setEditingService({ ...s, informacion_ia: s.informacion_ia || "" });
                                        setShowServiceModal(s);
                                    }}>✏️ Re-vincular</button>
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );

    const handleSaveSMS = async (e) => {
        e.preventDefault();
        setSavingSms(true);
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            const configToSave = {
                clinic_id: authUser.id,
                api_key: infobipConfig.api_key,
                base_url: infobipConfig.base_url,
                sender_id: infobipConfig.sender_id,
                is_active: infobipConfig.is_active
            };
            const { error: cfgError } = await supabase.from('infobip_configs').upsert(configToSave, { onConflict: 'clinic_id' });
            if (cfgError) throw cfgError;

            for (const t of smsTemplates) {
                const { error: tError } = await supabase.from('sms_templates').upsert({
                    clinic_id: authUser.id,
                    event_type: t.event_type,
                    content: t.content,
                    is_active: t.is_active
                }, { onConflict: 'clinic_id,event_type' });
                if (tError) throw tError;
            }
            alert("Configuración de SMS guardada correctamente.");
        } catch (error) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        } finally {
            setSavingSms(false);
        }
    };

    const handleSaveEmail = async (e) => {
        e.preventDefault();
        setSavingEmail(true);
        try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (!authUser) return;

            const configToSave = {
                clinic_id: authUser.id,
                smtp_host: emailConfig.smtp_host,
                smtp_port: parseInt(emailConfig.smtp_port),
                smtp_user: emailConfig.smtp_user,
                smtp_pass: emailConfig.smtp_pass,
                from_email: emailConfig.from_email,
                from_name: emailConfig.from_name,
                is_active: emailConfig.is_active
            };
            const { error: cfgError } = await supabase.from('email_configs').upsert(configToSave, { onConflict: 'clinic_id' });
            if (cfgError) throw cfgError;

            for (const t of emailTemplates) {
                const { error: tError } = await supabase.from('email_templates').upsert({
                    clinic_id: authUser.id,
                    event_type: t.event_type,
                    subject: t.subject,
                    content: t.content,
                    is_active: t.is_active
                }, { onConflict: 'clinic_id,event_type' });
                if (tError) throw tError;
            }

            alert("Configuración de Email guardada correctamente.");
        } catch (err) {
            console.error(err);
            alert("Error al guardar email: " + err.message);
        } finally {
            setSavingEmail(false);
        }
    };

    const handleSendTestEmail = async (e) => {
        e.preventDefault();
        if (!testEmailRecipient) return alert("Ingresa un correo destinatario");

        setSendingTestEmail(true);
        try {
            const { data, error } = await supabase.functions.invoke('send-email-hostinger', {
                body: {
                    clinicId: clinicId,
                    to: testEmailRecipient,
                    subject: "AndoCRM - Prueba de Conexión SES",
                    body: "<h3>¡Éxito!</h3><p>Tus credenciales de Amazon SES han sido configuradas correctamente en AndoCRM. Ahora puedes enviar notificaciones a tus pacientes.</p>",
                    patientName: "Administrador"
                }
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            alert("✅ Correo de prueba enviado con éxito. Revisa tu bandeja de entrada (y la de Spam).");
            setShowTestEmailModal(false);
            setTestEmailRecipient("");
        } catch (err) {
            console.error(err);
            alert("❌ Fallo en el envío de prueba: " + err.message);
        } finally {
            setSendingTestEmail(false);
        }
    };

    const renderSMS = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>📲 Automatización de Mensajes SMS (Infobip)</h3>
                <p className="text-muted">Configura tus credenciales y plantillas para envíos automáticos.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '20px' }}>
                <div className="card" style={{ padding: '25px' }}>
                    <h4 style={{ marginBottom: '20px' }}>🔑 Credenciales de Infobip</h4>
                    <form onSubmit={handleSaveSMS} className="premium-form-v">
                        <div className="form-group">
                            <label>Infobip API Key</label>
                            <input type="password" value={infobipConfig.api_key} onChange={e => setInfobipConfig({ ...infobipConfig, api_key: e.target.value })} placeholder="Pega tu API Key aquí" required />
                        </div>
                        <div className="form-group">
                            <label>Base URL (Infobip API)</label>
                            <input type="text" value={infobipConfig.base_url} onChange={e => setInfobipConfig({ ...infobipConfig, base_url: e.target.value })} placeholder="ej: https://xyz123.api.infobip.com" required />
                        </div>
                        <div className="form-group">
                            <label>Sender ID</label>
                            <input type="text" value={infobipConfig.sender_id} onChange={e => setInfobipConfig({ ...infobipConfig, sender_id: e.target.value })} placeholder="Ej: CRM_APP" />
                        </div>
                        <div className="form-group" style={{ flexDirection: 'row', gap: '10px', alignItems: 'center' }}>
                            <input type="checkbox" checked={infobipConfig.is_active} onChange={e => setInfobipConfig({ ...infobipConfig, is_active: e.target.checked })} id="sms_active" />
                            <label htmlFor="sms_active" style={{ cursor: 'pointer' }}>Servicio Activo</label>
                        </div>
                        <button type="submit" className="btn-process" disabled={savingSms}>
                            {savingSms ? "Guardando..." : "💾 Guardar Configuración"}
                        </button>
                    </form>
                </div>

                <div className="card" style={{ padding: '25px' }}>
                    <h4 style={{ marginBottom: '20px' }}>📝 Plantillas de Mensajes</h4>
                    <div className="premium-form-v">
                        {smsTemplates.map((t, idx) => (
                            <div key={idx} className="template-item" style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <strong>{t.event_type === 'booking_confirmation' ? '📅 Nueva Cita' : t.event_type === 'reminder_24h' ? '⏰ Recordatorio 24h' : '🚨 Atención Inmediata'}</strong>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input type="checkbox" checked={t.is_active} onChange={e => {
                                            const newT = [...smsTemplates];
                                            newT[idx].is_active = e.target.checked;
                                            setSmsTemplates(newT);
                                        }} />
                                        <small>Activo</small>
                                    </div>
                                </div>
                                <textarea value={t.content} onChange={e => {
                                    const newT = [...smsTemplates];
                                    newT[idx].content = e.target.value;
                                    setSmsTemplates(newT);
                                }} rows="3" style={{ width: '100%', fontSize: '0.85rem' }} />
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '5px' }}>Variables: <code>{`{paciente}`}</code>, <code>{`{fecha}`}</code>, <code>{`{hora}`}</code></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderEmail = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <div>
                    <h1>📧 Configuración de Email (Amazon SES / SMTP)</h1>
                    <p>Configura tus credenciales de correo para enviar confirmaciones automáticas.</p>
                </div>
                <button
                    className="btn-secondary"
                    onClick={() => setShowTestEmailModal(true)}
                    style={{ background: 'rgba(var(--primary-rgb), 0.1)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    🧪 Enviar Prueba
                </button>
            </div>

            <div className="config-grid">
                <form className="premium-card" onSubmit={handleSaveEmail}>
                    <div className="card-header-pro">
                        <h3>🔑 Credenciales SMTP</h3>
                    </div>

                    <div className="premium-form-v" style={{ marginTop: '20px' }}>
                        <div className="form-group">
                            <label>Servidor SMTP (Host)</label>
                            <input
                                type="text"
                                value={emailConfig.smtp_host}
                                onChange={e => setEmailConfig({ ...emailConfig, smtp_host: e.target.value })}
                                placeholder="smtp.hostinger.com o email-smtp.us-east-1.amazonaws.com"
                                required
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="form-group">
                                <label>Puerto</label>
                                <input
                                    type="number"
                                    value={emailConfig.smtp_port}
                                    onChange={e => setEmailConfig({ ...emailConfig, smtp_port: e.target.value })}
                                    placeholder="465"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Estado</label>
                                <select
                                    value={emailConfig.is_active}
                                    onChange={e => setEmailConfig({ ...emailConfig, is_active: e.target.value === "true" })}
                                >
                                    <option value="true">Activo</option>
                                    <option value="false">Inactivo</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Usuario SMTP (Email o Código IAM)</label>
                            <input
                                type="text"
                                value={emailConfig.smtp_user}
                                onChange={e => setEmailConfig({ ...emailConfig, smtp_user: e.target.value })}
                                placeholder="tu@dominio.com o AKIA..."
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Contraseña</label>
                            <input
                                type="password"
                                value={emailConfig.smtp_pass}
                                onChange={e => setEmailConfig({ ...emailConfig, smtp_pass: e.target.value })}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="form-group">
                                <label>Email Remitente (From)</label>
                                <input
                                    type="email"
                                    value={emailConfig.from_email}
                                    onChange={e => setEmailConfig({ ...emailConfig, from_email: e.target.value })}
                                    placeholder="noreply@dominio.com"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Nombre Remitente</label>
                                <input
                                    type="text"
                                    value={emailConfig.from_name}
                                    onChange={e => setEmailConfig({ ...emailConfig, from_name: e.target.value })}
                                    placeholder="Mi Clínica CRM"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="card-header-pro" style={{ marginTop: '40px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                        <h3>📝 Plantillas de Correo</h3>
                        <p>Usa variables como: {"{paciente}"}, {"{fecha}"}, {"{hora}"}</p>
                    </div>

                    {emailTemplates.map((t, idx) => (
                        <div key={t.event_type} className="template-box" style={{
                            marginTop: '20px',
                            padding: '20px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '16px',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <span className="pro-badge" style={{ textTransform: 'uppercase' }}>
                                    {t.event_type === 'booking_confirmation' ? 'Confirmación' : t.event_type === 'reminder_24h' ? 'Recordatorio 24h' : 'Varios'}
                                </span>
                                <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    Activo:
                                    <input
                                        type="checkbox"
                                        checked={t.is_active}
                                        onChange={e => {
                                            const newT = [...emailTemplates];
                                            newT[idx].is_active = e.target.checked;
                                            setEmailTemplates(newT);
                                        }}
                                    />
                                </label>
                            </div>
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label>Asunto (Subject)</label>
                                <input
                                    type="text"
                                    value={t.subject}
                                    onChange={e => {
                                        const newT = [...emailTemplates];
                                        newT[idx].subject = e.target.value;
                                        setEmailTemplates(newT);
                                    }}
                                    placeholder="Asunto del correo"
                                />
                            </div>
                            <div className="form-group">
                                <label>Contenido del Correo (HTML permitido)</label>
                                <textarea
                                    rows="5"
                                    value={t.content}
                                    onChange={e => {
                                        const newT = [...emailTemplates];
                                        newT[idx].content = e.target.value;
                                        setEmailTemplates(newT);
                                    }}
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    ))}

                    <button className="btn-process" type="submit" disabled={savingEmail} style={{ marginTop: '30px', width: '100%' }}>
                        {savingEmail ? 'Guardando...' : '💾 Guardar Configuración de Email'}
                    </button>
                </form>
            </div>
        </div>
    );


    const handleSaveMeta = async (e) => {
        e.preventDefault();
        setSavingMeta(true);
        try {
            const { error } = await supabase.from('meta_ads_config').upsert({
                clinic_id: clinicId,
                access_token: metaConfig.access_token,
                business_id: metaConfig.business_id,
                is_active: metaConfig.is_active
            }, { onConflict: 'clinic_id' });
            if (error) throw error;
            alert("Configuración de Portafolio guardada.");
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setSavingMeta(false);
        }
    };

    const handleMetaLogin = async () => {
        try {
            const authResponse = await loginWithFacebook([
                'ads_management',
                'business_management',
                'ads_read',
                'whatsapp_business_management',
                'whatsapp_business_messaging',
                'pages_show_list'
            ]);
            setTempMetaToken(authResponse.accessToken);
            setShowMetaConnectModal(true);
        } catch (err) {
            alert(err.message);
        }
    };

    const handleSaveMetaAssets = async ({ business, adAccounts, wabas }) => {
        setSavingMeta(true);
        try {
            // 1. Guardar Configuración Base (Token y Business ID)
            const { error: configError } = await supabase.from('meta_ads_config').upsert({
                clinic_id: clinicId,
                access_token: tempMetaToken,
                business_id: business.id,
                is_active: true
            }, { onConflict: 'clinic_id' });
            if (configError) throw configError;

            // 2. Guardar Cuentas Ads
            for (const acc of adAccounts) {
                await supabase.from('meta_ads_accounts').upsert({
                    clinic_id: clinicId,
                    ad_account_id: acc.id,
                    name: acc.name,
                    is_sync_enabled: true
                }, { onConflict: 'clinic_id,ad_account_id' });
            }

            // 3. Guardar Configuración de WhatsApp (si existe al menos una)
            if (wabas.length > 0) {
                const primaryWaba = wabas[0];
                const primaryPhone = primaryWaba.phone_numbers?.[0];

                if (primaryPhone) {
                    await supabase.from('ai_agent_config').upsert({
                        clinic_id: clinicId,
                        phone_id: primaryPhone.id,
                        meta_access_token: tempMetaToken,
                        is_active: true
                    }, { onConflict: 'clinic_id' });
                }
            }

            alert("✅ ¡Conexión exitosa! Los activos seleccionados han sido vinculados.");
            fetchData();
        } catch (err) {
            alert("Error al vincular activos: " + err.message);
        } finally {
            setSavingMeta(false);
        }
    };

    const toggleAccountSync = async (accountId, currentStatus) => {
        const { error } = await supabase.from('meta_ads_accounts').update({ is_sync_enabled: !currentStatus }).eq('id', accountId);
        if (!error) {
            setMetaAccounts(metaAccounts.map(acc => acc.id === accountId ? { ...acc, is_sync_enabled: !currentStatus } : acc));
        }
    };

    const discoverAccounts = async () => {
        if (!metaConfig.access_token) {
            alert("Por favor, ingresa el Token de Acceso y guarda el portafolio antes de descubrir cuentas.");
            return;
        }
        setSavingMeta(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No hay sesión activa. Por favor, logueate de nuevo.");

            const { data, error } = await supabase.functions.invoke('sync-meta-ads', {
                body: { action: 'discover-accounts' }
            });

            if (error) {
                const errorDetails = await error.context?.json?.().catch(() => ({}));
                throw new Error(errorDetails?.error || error.message);
            }

            alert(`¡Éxito! Se encontraron ${data.count} cuentas publicitarias.`);
            fetchData(); // Refresh UI
        } catch (err) {
            alert("Error al descubrir cuentas: " + err.message);
        } finally {
            setSavingMeta(false);
        }
    };

    const syncPerformance = async () => {
        setSavingMeta(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No hay sesión activa. Por favor, logueate de nuevo.");

            const { data, error } = await supabase.functions.invoke('sync-meta-ads', {
                body: {
                    action: 'sync-performance',
                    startDate: metaStartDate,
                    endDate: metaEndDate
                }
            });

            if (error) {
                const errorDetails = await error.context?.json?.().catch(() => ({}));
                throw new Error(errorDetails?.error || error.message);
            }

            if (!data) {
                alert("Error: La sincronización no devolvió datos.");
            } else if (data.message) {
                alert(data.message);
            } else if (data.synced_rows !== undefined) {
                // Formatear diagnósticos de forma amigable
                const diagnosText = data.diagnostics?.map(d =>
                    `- ${d.account}: ${d.status === 'OK' ? `Sincronizado (${d.records} filas)` : `Error: ${d.error}`}`
                ).join('\n') || 'Sin detalles';

                alert(`¡Éxito! Sincronización v5.5 Completa.\n\nPeriodo: ${data.range}\nTotal: ${data.synced_rows} registros.\n\nDetalles por cuenta:\n${diagnosText}`);
            } else {
                alert("Atención: Respuesta inesperada del servidor (v5.5). Respuesta cruda: " + JSON.stringify(data));
            }
            // Forzamos recarga profunda de metadatos
            await fetchMetaData();
        } catch (err) {
            alert("Error en sincronización: " + err.message);
        } finally {
            setSavingMeta(false);
        }
    };

    const toggleMapping = async (campaignId, agendaId) => {
        const exists = metaMappings.find(m => m.meta_entity_id === campaignId && m.agenda_id === agendaId);
        if (exists) {
            const { error } = await supabase.from('meta_ads_agenda_mapping').delete().eq('id', exists.id);
            if (!error) setMetaMappings(metaMappings.filter(m => m.id !== exists.id));
        } else {
            const { data, error } = await supabase.from('meta_ads_agenda_mapping').insert({
                clinic_id: clinicId,
                meta_entity_id: campaignId,
                meta_entity_type: 'campaign',
                agenda_id: agendaId
            }).select().single();
            if (!error) setMetaMappings([...metaMappings, data]);
        }
    };

    const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(val));

    const renderMetaConfig = () => {
        const handleSort = (key) => {
            setMetaSortConfig(prev => ({
                key,
                direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
            }));
        };

        const renderSortIcon = (key) => {
            if (metaSortConfig.key !== key) return <span style={{ opacity: 0.3, fontSize: '0.6rem', marginLeft: '4px' }}>↕</span>;
            return <span style={{ color: 'var(--primary)', marginLeft: '4px' }}>{metaSortConfig.direction === 'desc' ? '▼' : '▲'}</span>;
        };

        // Calcular Totales Filtrados con Lógica de Adsets e Herencia (Concordancia Universal)
        const baseFiltered = (() => {
            const adsets = metaCampaigns.filter(s => s.entity_type === 'adset');
            const campaigns = metaCampaigns.filter(s => s.entity_type === 'campaign');

            const getAgendaForAdset = (adset) => {
                const directMap = metaMappings.find(m => m.meta_entity_id === adset.campaign_id);
                if (directMap) return directMap.agenda_id;
                const parentMap = metaMappings.find(m => m.meta_entity_id === adset.parent_id);
                if (parentMap) return parentMap.agenda_id;
                return null;
            };

            const matchesGeneralFilters = (c) => {
                const matchesStatus = metaStatusFilter === 'ALL' ||
                    c.status === metaStatusFilter ||
                    (metaStatusFilter === 'ACTIVE' && parseFloat(c.spend || 0) > 0);
                const matchesAccount = metaAccountFilter === 'ALL' || (Array.isArray(metaAccountFilter) && metaAccountFilter.includes(c.ad_account_id));
                return matchesStatus && matchesAccount;
            };

            let filteredAdsets = [];
            if (metaAgendaFilter === 'ALL') {
                filteredAdsets = adsets.filter(matchesGeneralFilters);
            } else {
                const targetId = parseInt(metaAgendaFilter);
                filteredAdsets = adsets.filter(a => getAgendaForAdset(a) === targetId && matchesGeneralFilters(a));
            }

            const resolvedCampsMap = {};
            filteredAdsets.forEach(a => {
                if (!resolvedCampsMap[a.parent_id]) {
                    const parent = campaigns.find(c => c.campaign_id === a.parent_id);
                    if (parent) {
                        resolvedCampsMap[a.parent_id] = {
                            ...parent,
                            spend: 0,
                            impressions: 0,
                            clicks: 0,
                            conversations_count: 0,
                            is_reconstructed: true
                        };
                    }
                }
                if (resolvedCampsMap[a.parent_id]) {
                    resolvedCampsMap[a.parent_id].spend += parseFloat(a.spend || 0);
                    resolvedCampsMap[a.parent_id].impressions += (a.impressions || 0);
                    resolvedCampsMap[a.parent_id].clicks += (a.clicks || 0);
                    resolvedCampsMap[a.parent_id].conversations_count += (a.conversations_count || 0);
                }
            });

            // Incluir campañas mapeadas directamente o que no se reconstruyeron pero pasan filtros
            if (metaAgendaFilter !== 'ALL') {
                const targetId = parseInt(metaAgendaFilter);
                metaMappings.filter(m => m.agenda_id === targetId).forEach(m => {
                    const camp = campaigns.find(c => c.campaign_id === m.meta_entity_id);
                    if (camp && !resolvedCampsMap[camp.campaign_id] && matchesGeneralFilters(camp)) {
                        resolvedCampsMap[camp.campaign_id] = { ...camp };
                    }
                });
            } else {
                campaigns.filter(matchesGeneralFilters).forEach(c => {
                    if (!resolvedCampsMap[c.campaign_id]) {
                        const hasAdsets = adsets.some(a => a.parent_id === c.campaign_id);
                        if (!hasAdsets) {
                            resolvedCampsMap[c.campaign_id] = { ...c };
                        }
                    }
                });
            }

            return Object.values(resolvedCampsMap);
        })();

        // Aplicar Ordenamiento
        const filteredCampaigns = [...baseFiltered].sort((a, b) => {
            const { key, direction } = metaSortConfig;
            let valA, valB;

            if (key === 'cpa') {
                valA = (a.conversations_count > 0) ? (a.spend / a.conversations_count) : 0;
                valB = (b.conversations_count > 0) ? (b.spend / b.conversations_count) : 0;
            } else if (key === 'mapeo') {
                valA = metaMappings.filter(m => m.meta_entity_id === a.campaign_id).length;
                valB = metaMappings.filter(m => m.meta_entity_id === b.campaign_id).length;
            } else {
                valA = a[key] || 0;
                valB = b[key] || 0;
            }

            if (direction === 'asc') return valA > valB ? 1 : -1;
            return valA < valB ? 1 : -1;
        });

        const totals = filteredCampaigns.reduce((acc, c) => ({
            spend: acc.spend + parseFloat(c.spend || 0),
            impressions: acc.impressions + parseInt(c.impressions || 0),
            clicks: acc.clicks + parseInt(c.clicks || 0),
            conversations: acc.conversations + parseInt(c.conversations_count || 0)
        }), { spend: 0, impressions: 0, clicks: 0, conversations: 0 });

        const cpa = totals.conversations > 0 ? (totals.spend / totals.conversations) : 0;

        const handleSaveView = () => {
            if (!newViewName.trim()) return alert("Ingresa un nombre para la vista");
            const view = {
                name: newViewName,
                accounts: metaAccountFilter,
                status: metaStatusFilter,
                start: metaStartDate,
                end: metaEndDate
            };
            const updated = [...savedViews, view];
            setSavedViews(updated);
            localStorage.setItem("meta_saved_views", JSON.stringify(updated));
            setNewViewName("");
        };

        const applyView = (v) => {
            setMetaAccountFilter(v.accounts);
            setMetaStatusFilter(v.status);
            setMetaStartDate(v.start);
            setMetaEndDate(v.end);
        };

        const deleteView = (name) => {
            const updated = savedViews.filter(v => v.name !== name);
            setSavedViews(updated);
            localStorage.setItem("meta_saved_views", JSON.stringify(updated));
        };

        // --- CALCULAR RENDIMIENTO POR AGENDA ---
        const agendaPerformance = agendas.map(ag => {
            const mappedCampaignIds = metaMappings
                .filter(m => m.agenda_id === ag.id && m.meta_entity_type === 'campaign')
                .map(m => m.meta_entity_id);

            const agCampaigns = filteredCampaigns.filter(c => mappedCampaignIds.includes(c.entity_id || c.campaign_id));

            return {
                agenda: ag,
                metrics: agCampaigns.reduce((sum, c) => ({
                    spend: sum.spend + parseFloat(c.spend || 0),
                    conversations: sum.conversations + (c.conversations_count || 0),
                    clicks: sum.clicks + (c.clicks || 0),
                    campaigns_count: sum.campaigns_count + 1
                }), { spend: 0, conversations: 0, clicks: 0, campaigns_count: 0 })
            };
        }).filter(p => p.metrics.campaigns_count > 0);

        return (
            <div className="admin-section fade-in">
                <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h3>📱 Meta Ads Intelligence</h3>
                        <p className="text-muted">Análisis de rendimiento y mapeo estratégico de campañas para agendas.</p>
                    </div>
                    <button
                        className="btn-secondary"
                        onClick={() => setShowMetaGuide(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 15px', background: 'rgba(var(--primary-rgb), 0.1)', border: '1px solid var(--primary)' }}
                    >
                        📖 Guía Setup
                    </button>
                </div>

                <div className="meta-dynamic-layout" style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                    {/* TOP ROW: CONFIG & ACCOUNTS (50/50) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px' }}>
                        <div className="card" style={{ padding: '25px', marginBottom: 0 }}>
                            <h4 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>🔑 Configuración Técnica</h4>
                            <form onSubmit={handleSaveMeta} className="premium-form-v">
                                <div className="form-group">
                                    <label>Token de Acceso</label>
                                    <input type="password" value={metaConfig.access_token} onChange={e => setMetaConfig({ ...metaConfig, access_token: e.target.value })} placeholder="EAA..." required />
                                </div>
                                <div className="form-group">
                                    <label>ID de Portafolio / Negocio</label>
                                    <input type="text" value={metaConfig.business_id} onChange={e => setMetaConfig({ ...metaConfig, business_id: e.target.value })} placeholder="1234567890..." />
                                </div>
                                <button type="submit" className="btn-process" disabled={savingMeta} style={{ width: '100%', marginBottom: '15px' }}>
                                    {savingMeta ? "Guardando..." : "💾 Guardar Manual"}
                                </button>
                                <div style={{ textAlign: 'center', position: 'relative', margin: '20px 0' }}>
                                    <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)' }} />
                                    <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--card-bg)', padding: '0 10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>O BIEN</span>
                                </div>
                                <button type="button" onClick={handleMetaLogin} className="btn-process" style={{ width: '100%', background: '#1877F2', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                    Conectar con Meta
                                </button>
                            </form>
                        </div>

                        <div className="card" style={{ padding: '25px', marginBottom: 0 }}>
                            <h4 style={{ marginBottom: '20px' }}>💳 Cuentas Activas</h4>
                            <div className="accounts-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {metaAccounts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px' }}>
                                        <p className="text-muted">No hay cuentas vinculadas.</p>
                                        <button className="btn-secondary" onClick={discoverAccounts}>🔍 Descubrir</button>
                                    </div>
                                ) : (
                                    metaAccounts.map(acc => (
                                        <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid var(--glass-border)' }}>
                                            <div>
                                                <strong style={{ fontSize: '0.85rem' }}>{acc.name || acc.ad_account_id}</strong>
                                                <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{acc.ad_account_id}</span>
                                            </div>
                                            <input type="checkbox" checked={acc.is_sync_enabled} onChange={() => toggleAccountSync(acc.id, acc.is_sync_enabled)} />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* BOTTOM ROW: PERFORMANCE DASHBOARD (100%) */}
                    <div className="card" style={{ padding: '25px', width: '100%' }}>
                        {/* ROW 1: HEADER & SYNC */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem' }}>📊 Dashboard de Rendimiento</h3>
                                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>Análisis métrico y mapeo de leads en tiempo real.</p>
                            </div>
                            <button type="button" className="btn-process" onClick={syncPerformance} disabled={savingMeta} style={{ padding: '10px 25px', borderRadius: '10px', boxShadow: '0 4px 15px rgba(var(--primary-rgb), 0.3)' }}>
                                {savingMeta ? "Sincronizando..." : "🔄 Sincronizar Ahora"}
                            </button>
                        </div>

                        {/* ROW 2: FILTERS */}
                        <div className="filters-row" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '25px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '15px', border: '1px solid var(--glass-border)' }}>
                            <div className="filter-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px 15px', borderRadius: '10px', border: '1px solid var(--glass-border)', flex: '1 1 250px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cuenta:</label>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <div
                                        onClick={() => setIsMultiSelectOpen(!isMultiSelectOpen)}
                                        style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '8px 15px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--glass-border)',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            minWidth: '200px'
                                        }}
                                    >
                                        <span>
                                            {metaAccountFilter === 'ALL'
                                                ? '🌍 Todas las Cuentas'
                                                : Array.isArray(metaAccountFilter) && metaAccountFilter.length > 0
                                                    ? `✅ ${metaAccountFilter.length} Cuenta ${metaAccountFilter.length > 1 ? 's' : ''}`
                                                    : '❌ Ninguna seleccionada'}
                                        </span>
                                        <span style={{ transition: 'transform 0.3s', transform: isMultiSelectOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                                    </div>

                                    {isMultiSelectOpen && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '110%',
                                            left: 0,
                                            right: 0,
                                            background: 'var(--glass-bg)',
                                            backdropFilter: 'blur(20px)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '12px',
                                            zIndex: 1000,
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                            padding: '10px',
                                            maxHeight: '300px',
                                            overflowY: 'auto'
                                        }}>
                                            <div
                                                onClick={() => {
                                                    setMetaAccountFilter('ALL');
                                                    setIsMultiSelectOpen(false);
                                                }}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    background: metaAccountFilter === 'ALL' ? 'rgba(var(--primary-rgb), 0.2)' : 'transparent',
                                                    marginBottom: '5px',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                🌍 Todas las Cuentas
                                            </div>
                                            {metaAccounts.map(acc => {
                                                const isSelected = Array.isArray(metaAccountFilter) && metaAccountFilter.includes(acc.ad_account_id);
                                                return (
                                                    <div
                                                        key={acc.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            let newList = Array.isArray(metaAccountFilter) ? [...metaAccountFilter] : [];
                                                            if (newList.includes(acc.ad_account_id)) {
                                                                newList = newList.filter(id => id !== acc.ad_account_id);
                                                            } else {
                                                                newList.push(acc.ad_account_id);
                                                            }
                                                            setMetaAccountFilter(newList.length === 0 ? [] : newList);
                                                        }}
                                                        style={{
                                                            padding: '8px 12px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '10px',
                                                            background: isSelected ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent',
                                                            marginBottom: '2px',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            readOnly
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        <span>{acc.name || acc.ad_account_id}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="filter-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '8px 15px', borderRadius: '10px', border: '1px solid var(--glass-border)', flex: '0 1 180px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Estado:</label>
                                <select
                                    value={metaStatusFilter}
                                    onChange={(e) => setMetaStatusFilter(e.target.value)}
                                    style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="ALL">Todos</option>
                                    <option value="ACTIVE">Activos</option>
                                    <option value="PAUSED">Pausados</option>
                                </select>
                            </div>

                            <div className="filter-group" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexDirection: 'row', flex: '1 1 200px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Agenda</label>
                                    <select
                                        value={metaAgendaFilter}
                                        onChange={(e) => setMetaAgendaFilter(e.target.value)}
                                        style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ccc', background: '#ffffff', color: '#333', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        <option value="ALL">🌍 Todas</option>
                                        {agendas.map(ag => (
                                            <option key={ag.id} value={ag.id}>📍 {ag.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="filter-group" style={{
                                flex: '1 1 300px',
                                background: 'rgba(255,255,255,0.05)',
                                padding: '10px 15px',
                                borderRadius: '12px',
                                border: '1px solid var(--glass-border)',
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr 1fr',
                                gap: '15px',
                                alignItems: 'center'
                            }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Periodo:</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <small style={{ fontSize: '0.65rem', opacity: 0.6 }}>Desde</small>
                                    <input type="date" value={metaStartDate} onChange={(e) => setMetaStartDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '0.85rem', outline: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <small style={{ fontSize: '0.65rem', opacity: 0.6 }}>Hasta</small>
                                    <input type="date" value={metaEndDate} onChange={(e) => setMetaEndDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '0.85rem', outline: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
                                </div>
                            </div>
                        </div>

                        {/* ROW 2.5: SAVED VIEWS */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '5px', background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <input
                                    type="text"
                                    placeholder="Nombre de la vista..."
                                    value={newViewName}
                                    onChange={e => setNewViewName(e.target.value)}
                                    style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem', outline: 'none', width: '150px' }}
                                />
                                <button className="btn-process" onClick={handleSaveView} style={{ padding: '5px 10px', fontSize: '0.75rem' }}>💾 Guardar</button>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                                {savedViews.map(v => (
                                    <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(var(--primary-rgb), 0.1)', padding: '5px 12px', borderRadius: '20px', border: '1px solid var(--primary)', cursor: 'pointer' }} onClick={() => applyView(v)}>
                                        <span style={{ fontSize: '0.8rem' }}>📌 {v.name}</span>
                                        <button onClick={(e) => { e.stopPropagation(); deleteView(v.name); }} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.9rem', cursor: 'pointer', paddingLeft: '5px' }}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ROW 3: TOTALS SUMMARY DASH */}
                        <div className="totals-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                            <div className="total-card" style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.2) 0%, rgba(var(--primary-rgb), 0.05) 100%)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(var(--primary-rgb), 0.3)', textAlign: 'center' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--primary)', marginBottom: '5px' }}>💰 Inversión Total</span>
                                <strong style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>{formatCOP(totals.spend)}</strong>
                            </div>
                            <div className="total-card" style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#10b981', marginBottom: '5px' }}>💬 Conversaciones</span>
                                <strong style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>{totals.conversations}</strong>
                            </div>
                            <div className="total-card" style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(245, 158, 11, 0.3)', textAlign: 'center' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#f59e0b', marginBottom: '5px' }}>📈 Costo por Conv.</span>
                                <strong style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>{cpa > 0 ? formatCOP(cpa) : '-'}</strong>
                            </div>
                            <div className="total-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '15px', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
                                <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>🖱️ Clics Totales</span>
                                <strong style={{ fontSize: '1.5rem', color: 'var(--text-main)' }}>{totals.clicks.toLocaleString('es-CO')}</strong>
                            </div>
                        </div>

                        <div className="mapping-container" style={{ width: '100%', overflowX: 'auto' }}>
                            <div style={{ minWidth: '950px' }}>
                                {/* Dashboard Header Labels */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 3fr) 130px 90px 100px 110px 100px 140px', gap: '15px', padding: '10px 15px', borderBottom: '2px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    <span onClick={() => handleSort('campaign_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>Campaña / Adset {renderSortIcon('campaign_name')}</span>
                                    <span onClick={() => handleSort('spend')} style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Inversión {renderSortIcon('spend')}</span>
                                    <span onClick={() => handleSort('conversations_count')} style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Conv. {renderSortIcon('conversations_count')}</span>
                                    <span onClick={() => handleSort('cpa')} style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Costo/Conv. {renderSortIcon('cpa')}</span>
                                    <span onClick={() => handleSort('clicks')} style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Clics {renderSortIcon('clicks')}</span>
                                    <span onClick={() => handleSort('status')} style={{ textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Estado {renderSortIcon('status')}</span>
                                    <span onClick={() => handleSort('mapeo')} style={{ textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Mapeo {renderSortIcon('mapeo')}</span>
                                </div>

                                {filteredCampaigns.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '80px', background: 'rgba(255,255,255,0.01)', borderRadius: '20px', marginTop: '20px' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🔍</div>
                                        <h4 style={{ color: 'var(--text-main)' }}>No se encontraron datos</h4>
                                        <p className="text-muted">Prueba ajustando los filtros de cuenta, estado o periodo.</p>
                                    </div>
                                ) : (
                                    filteredCampaigns.map(camp => {
                                        const adsets = metaCampaigns.filter(a => a.entity_type === 'adset' && a.parent_id === camp.campaign_id);
                                        const isExpanded = expandedCampaigns.has(camp.campaign_id);

                                        return (
                                            <div key={camp.campaign_id} className="campaign-row-v3" style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                                                {/* Campaign Main Row */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 3fr) 130px 90px 100px 110px 100px 140px', gap: '15px', padding: '15px', alignItems: 'center' }}>
                                                    <div
                                                        onClick={() => {
                                                            const newSet = new Set(expandedCampaigns);
                                                            if (isExpanded) newSet.delete(camp.campaign_id);
                                                            else newSet.add(camp.campaign_id);
                                                            setExpandedCampaigns(newSet);
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                                    >
                                                        <span style={{ fontSize: '1rem', width: '20px', transition: 'transform 0.3s' }}>{isExpanded ? '▼' : '▶'}</span>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <strong style={{ fontSize: '0.95rem' }}>📢 {camp.campaign_name}</strong>
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>ID: {camp.campaign_id}</span>
                                                        </div>
                                                    </div>
                                                    <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--success)' }}>{formatCOP(camp.spend)}</span>
                                                    <span style={{ textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{camp.conversations_count || 0}</span>
                                                    <span style={{ textAlign: 'center', fontSize: '0.85rem' }}>{(camp.conversations_count > 0) ? formatCOP(camp.spend / camp.conversations_count) : '-'}</span>
                                                    <span style={{ textAlign: 'center', fontSize: '0.85rem' }}>{parseInt(camp.clicks || 0).toLocaleString('es-CO')}</span>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <span className={`status-pill ${camp.status?.toLowerCase()}`} style={{ fontSize: '0.65rem' }}>
                                                            {camp.status === 'ACTIVE' ? '🟢 Activa' : '⚪ Pausada'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                        {agendas.map(ag => {
                                                            const isMapped = metaMappings.some(m => m.meta_entity_id === camp.campaign_id && m.agenda_id === ag.id);
                                                            return (
                                                                <button key={ag.id} onClick={() => toggleMapping(camp.campaign_id, ag.id)} className={`mapping-badge ${isMapped ? 'active' : ''}`} style={{
                                                                    padding: '2px 8px', fontSize: '0.65rem', borderRadius: '10px',
                                                                    border: '1px solid var(--glass-border)',
                                                                    background: isMapped ? 'var(--primary)' : 'transparent',
                                                                    color: isMapped ? 'white' : 'var(--text-muted)',
                                                                    cursor: 'pointer'
                                                                }}>
                                                                    {ag.name.substring(0, 3)}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Campaign Adsets (Accordion) */}
                                                {isExpanded && (
                                                    <div className="adsets-accordion animate-in" style={{ background: 'rgba(0,0,0,0.15)', borderTop: '1px solid var(--glass-border)' }}>
                                                        {adsets.map(adset => (
                                                            <div key={adset.campaign_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 3fr) 140px 120px 100px 120px 220px', gap: '15px', padding: '10px 15px 10px 60px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📦 {adset.campaign_name}</span>
                                                                <span style={{ textAlign: 'center', fontSize: '0.85rem' }}>{formatCOP(adset.spend)}</span>
                                                                <span style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.7 }}>{parseInt(adset.impressions || 0).toLocaleString('es-CO')}</span>
                                                                <span style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.7 }}>{parseInt(adset.clicks || 0).toLocaleString('es-CO')}</span>
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <span className={`status-pill ${adset.status?.toLowerCase()}`} style={{ fontSize: '0.55rem' }}>
                                                                        {adset.status === 'ACTIVE' ? '🟢' : '⚪'}
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                                    {agendas.map(ag => {
                                                                        const isMapped = metaMappings.some(m => m.meta_entity_id === adset.campaign_id && m.agenda_id === ag.id);
                                                                        return (
                                                                            <button key={ag.id} onClick={() => toggleMapping(adset.campaign_id, ag.id)} style={{
                                                                                padding: '2px 6px', fontSize: '0.6rem', borderRadius: '4px',
                                                                                border: '1px solid var(--glass-border)',
                                                                                background: isMapped ? 'var(--primary)' : 'transparent',
                                                                                color: isMapped ? 'white' : 'var(--text-muted)',
                                                                                cursor: 'pointer'
                                                                            }}>
                                                                                {ag.name}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* PERFORMANCE BY AGENDA SECTION */}
                    <div className="card" style={{ padding: '25px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--primary)' }}>📈 Rendimiento por Agenda</h3>
                                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Resumen financiero de las campañas vinculadas a cada agenda.</p>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                            {agendaPerformance.map(perf => (
                                <div key={perf.agenda.id} className="card-v4" style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '20px',
                                    padding: '20px',
                                    border: '1px solid var(--glass-border)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--primary)' }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                        <h4 style={{ margin: 0, fontSize: '1.1rem' }}>📅 {perf.agenda.name}</h4>
                                        <span className="pro-badge" style={{ fontSize: '0.65rem' }}>{perf.metrics.campaigns_count} Campañas</span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                                            <small style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Inversión</small>
                                            <strong style={{ fontSize: '1rem' }}>{formatCOP(perf.metrics.spend)}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                                            <small style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Leads / Conv.</small>
                                            <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{perf.metrics.conversations}</strong>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '15px', padding: '10px 15px', background: 'rgba(var(--primary-rgb), 0.1)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Costo por Lead:</span>
                                        <strong style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>
                                            {perf.metrics.conversations > 0 ? formatCOP(perf.metrics.spend / perf.metrics.conversations) : '-'}
                                        </strong>
                                    </div>
                                </div>
                            ))}
                            {agendaPerformance.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.01)', borderRadius: '15px', border: '1px dashed var(--glass-border)' }}>
                                    <p className="text-muted">No hay campañas vinculadas a agendas activas en este periodo.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderLogs = () => {
        if (loadingLogs) return <div style={{ textAlign: 'center', padding: '50px' }}>Cargando registros de envío...</div>;

        return (
            <div className="admin-section-card glass-panel" style={{ padding: '30px', borderRadius: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)' }}>📜 Monitoreo de Notificaciones</h3>
                    <button className="btn-secondary" onClick={fetchGlobalLogs} style={{ padding: '8px 15px' }}>🔄 Actualizar</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                    {/* SMS column */}
                    <div>
                        <h4 style={{ color: 'var(--accent)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            📲 Historial SMS (Últimos 50)
                        </h4>
                        <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {globalSmsLogs.length === 0 ? <p className="text-muted text-center" style={{ padding: '40px' }}>No hay registros de SMS</p> :
                                globalSmsLogs.map(log => (
                                    <div key={log.id} style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        padding: '15px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{
                                                color: log.status === 'success' ? 'var(--success)' : 'var(--danger)',
                                                fontWeight: 'bold',
                                                fontSize: '0.7rem',
                                                padding: '2px 8px',
                                                borderRadius: '20px',
                                                background: log.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                                            }}>
                                                {log.status === 'success' ? 'ENVIADO' : 'FALLIDO'}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', margin: '4px 0', color: 'var(--text-main)' }}><strong>{log.patient_name}</strong> ({log.patient_phone})</p>
                                        <p style={{ fontSize: '0.8rem', margin: '10px 0', opacity: 0.8, background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', color: 'var(--text-main)' }}>
                                            {log.message_content}
                                        </p>
                                        {log.status !== 'success' && (
                                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>❌ Error: {log.error_details}</span>
                                                <button
                                                    className="btn-process"
                                                    onClick={() => handleRetryGlobal(log, 'sms')}
                                                    disabled={retryingLog === log.id}
                                                    style={{ fontSize: '0.75rem', padding: '6px' }}
                                                >
                                                    {retryingLog === log.id ? 'Reenviando...' : '🔄 Reintentar Envío'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Email column */}
                    <div>
                        <h4 style={{ color: 'var(--accent)', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            📧 Historial Email (Últimos 50)
                        </h4>
                        <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {globalEmailLogs.length === 0 ? <p className="text-muted text-center" style={{ padding: '40px' }}>No hay registros de Email</p> :
                                globalEmailLogs.map(log => (
                                    <div key={log.id} style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        padding: '15px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span style={{
                                                color: log.status === 'success' ? 'var(--success)' : 'var(--danger)',
                                                fontWeight: 'bold',
                                                fontSize: '0.7rem',
                                                padding: '2px 8px',
                                                borderRadius: '20px',
                                                background: log.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                                            }}>
                                                {log.status === 'success' ? 'ENVIADO' : 'FALLIDO'}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', margin: '4px 0', color: 'var(--text-main)' }}><strong>{log.patient_name}</strong> ({log.patient_email})</p>
                                        <p style={{ fontSize: '0.85rem', margin: '4px 0', color: 'var(--text-main)' }}><strong>Asunto:</strong> {log.subject}</p>
                                        {log.status !== 'success' && (
                                            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>❌ Error: {log.error_details}</span>
                                                <button
                                                    className="btn-process"
                                                    onClick={() => handleRetryGlobal(log, 'email')}
                                                    disabled={retryingLog === log.id}
                                                    style={{ fontSize: '0.75rem', padding: '6px' }}
                                                >
                                                    {retryingLog === log.id ? 'Reenviando...' : '🔄 Reintentar Envío'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const handleUpdateMyPassword = async (e) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            return alert("Las contraseñas no coinciden");
        }
        if (passwordData.newPassword.length < 6) {
            return alert("La contraseña debe tener al menos 6 caracteres");
        }

        setUpdatingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: passwordData.newPassword
            });
            if (error) throw error;
            alert("✅ Contraseña actualizada correctamente.");
            setPasswordData({ newPassword: "", confirmPassword: "" });
        } catch (err) {
            console.error(err);
            alert("Error al actualizar: " + err.message);
        } finally {
            setUpdatingPassword(false);
        }
    };

    const renderSuperConfig = () => (
        <div className="admin-section fade-in">
            <div className="section-header">
                <h3>⚙️ Superconfiguración</h3>
                <p className="text-muted">Ajustes de seguridad y perfil personal.</p>
            </div>

            <div className="premium-card" style={{ maxWidth: '500px', margin: '0 auto' }}>
                <h4>🔑 Cambiar mi contraseña</h4>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '20px' }}>
                    Define una nueva clave de acceso para tu cuenta de administrador.
                </p>
                <form onSubmit={handleUpdateMyPassword} className="premium-form-v">
                    <div className="form-group">
                        <label>Nueva Contraseña</label>
                        <input
                            type="password"
                            value={passwordData.newPassword}
                            onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                            required
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>
                    <div className="form-group">
                        <label>Confirmar Nueva Contraseña</label>
                        <input
                            type="password"
                            value={passwordData.confirmPassword}
                            onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                            required
                            placeholder="Repite la contraseña"
                        />
                    </div>
                    <button type="submit" className="btn-process" disabled={updatingPassword} style={{ marginTop: '10px' }}>
                        {updatingPassword ? 'Actualizando...' : '💾 Actualizar mi clave'}
                    </button>
                </form>
            </div>

            <div className="premium-card" style={{ maxWidth: '500px', margin: '30px auto 0 auto', border: '1px solid var(--primary)', background: 'rgba(var(--primary-rgb), 0.05)' }}>
                <h4 style={{ color: 'var(--primary)' }}>🛡️ Cumplimiento Meta (Verification)</h4>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '15px' }}>
                    Meta requiere estas URLs para verificar tu aplicación. Copia y pega cada una en su campo correspondiente:
                </p>

                {/* Data Deletion */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>DATA DELETION URL:</label>
                    <div style={{ background: '#000', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', position: 'relative' }}>
                        <code style={{ color: '#0f0', fontSize: '0.75rem', wordBreak: 'break-all' }}>{window.location.origin}/#data-deletion</code>
                        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/#data-deletion`); alert("Copiado"); }} style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'var(--primary)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '0.6rem', padding: '2px 6px', cursor: 'pointer' }}>Copiar</button>
                    </div>
                </div>

                {/* Privacy Policy */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>PRIVACY POLICY URL:</label>
                    <div style={{ background: '#000', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', position: 'relative' }}>
                        <code style={{ color: '#0f0', fontSize: '0.75rem', wordBreak: 'break-all' }}>{window.location.origin}/#privacy-policy</code>
                        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/#privacy-policy`); alert("Copiado"); }} style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'var(--primary)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '0.6rem', padding: '2px 6px', cursor: 'pointer' }}>Copiar</button>
                    </div>
                </div>

                {/* Terms of Service */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>TERMS OF SERVICE URL:</label>
                    <div style={{ background: '#000', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', position: 'relative' }}>
                        <code style={{ color: '#0f0', fontSize: '0.75rem', wordBreak: 'break-all' }}>{window.location.origin}/#terms-of-service</code>
                        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/#terms-of-service`); alert("Copiado"); }} style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'var(--primary)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '0.6rem', padding: '2px 6px', cursor: 'pointer' }}>Copiar</button>
                    </div>
                </div>

                <p style={{ fontSize: '0.7rem', marginTop: '10px', opacity: 0.8 }}>
                    <strong>Nota:</strong> Estas páginas son generadas automáticamente por el CRM para cumplir con las políticas de Meta.
                </p>
            </div>
        </div>
    );

    return (
        <div className="admin-panel-premium">
            <button className="admin-close-modal-fixed" onClick={onBack} title="Cerrar Panel">×</button>
            <div className="admin-sidebar">
                <div className="sidebar-logo">
                    <h2>CRM Admin</h2>
                    <span>v2.1 Full Access</span>
                </div>
                <nav>
                    <button className={activeView === "agendas" ? "active" : ""} onClick={() => setActiveView("agendas")}>📅 <span className="sidebar-text">Agendas</span></button>
                    <button className={activeView === "users" ? "active" : ""} onClick={() => setActiveView("users")}>👥 <span className="sidebar-text">Personal</span></button>
                    <button className={activeView === "bloqueos" ? "active" : ""} onClick={() => setActiveView("bloqueos")}>🚫 <span className="sidebar-text">Bloqueos</span></button>
                    <button className={activeView === "alertas" ? "active" : ""} onClick={() => setActiveView("alertas")}>🔔 <span className="sidebar-text">Alertas</span></button>
                    <button className={activeView === "servicios" ? "active" : ""} onClick={() => setActiveView("servicios")}>🛒 <span className="sidebar-text">Servicios</span></button>
                    <button className={activeView === "horarios" ? "active" : ""} onClick={() => setActiveView("horarios")}>🕒 <span className="sidebar-text">Horarios</span></button>

                    {(userRole === "superuser" || userRole === "admin" || userRole === "owner") && (
                        <>
                            {(userRole === "superuser" || userRole === "owner") && (
                                <>
                                    <button className={activeView === "sms" ? "active" : ""} onClick={() => setActiveView("sms")}>📲 <span className="sidebar-text">SMS Automatizados</span></button>
                                    <button className={activeView === "email" ? "active" : ""} onClick={() => setActiveView("email")}>📧 <span className="sidebar-text">Email Automatizados</span></button>
                                    <button className={activeView === "ai_agent" ? "active" : ""} onClick={() => setActiveView("ai_agent")}>🤖 <span className="sidebar-text">Agente IA</span></button>
                                    <button className={activeView === "meta" ? "active" : ""} onClick={() => setActiveView("meta")}>📱 <span className="sidebar-text">Meta Ads</span></button>
                                </>
                            )}
                            <button className={activeView === "logs" ? "active" : ""} onClick={() => { setActiveView("logs"); fetchGlobalLogs(); }}>📜 <span className="sidebar-text">Monitoreo</span></button>
                            <button className={activeView === "superconfig" ? "active" : ""} onClick={() => setActiveView("superconfig")}>⚙️ <span className="sidebar-text">Superconfiguración</span></button>
                        </>
                    )}
                </nav>
                <button className="btn-back-sidebar" onClick={onBack}>← Volver Agenda</button>
            </div>

            <main className="admin-content" key={activeView}>
                <div className="admin-screen-wrapper">
                    {activeView === "agendas" && renderAgendas()}
                    {activeView === "users" && renderUsers()}
                    {activeView === "bloqueos" && renderBloqueos()}
                    {activeView === "alertas" && renderAlertas()}
                    {activeView === "servicios" && renderConfigServicios()}
                    {activeView === "horarios" && renderConfigHorarios()}
                    {activeView === "sms" && renderSMS()}
                    {activeView === "email" && renderEmail()}
                    {activeView === "ai_agent" && <AiAgentSection clinicId={clinicId} />}
                    {activeView === "meta" && renderMetaConfig()}
                    {activeView === "logs" && renderLogs()}
                    {activeView === "superconfig" && renderSuperConfig()}
                </div>
            </main>

            {/* MODAL: TEST EMAIL */}
            {showTestEmailModal && (
                <div className="modal-overlay" onClick={() => setShowTestEmailModal(false)}>
                    <div className="modal-content premium-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>🧪 Enviar Correo de Prueba</h2>
                            <button className="btn-close" onClick={() => setShowTestEmailModal(false)}>×</button>
                        </div>
                        <p className="text-muted" style={{ marginBottom: '20px' }}>
                            Ingresa un correo para verificar que la configuración de Amazon SES funciona.
                            <strong> Nota:</strong> Si estás en el Sandbox de SES, el destinatario también debe estar verificado.
                        </p>
                        <form onSubmit={handleSendTestEmail} className="premium-form-v">
                            <div className="form-group">
                                <label>Correo Destinatario</label>
                                <input
                                    type="email"
                                    value={testEmailRecipient}
                                    onChange={e => setTestEmailRecipient(e.target.value)}
                                    placeholder="ejemplo@correo.com"
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="submit" className="btn-process" style={{ flex: 1 }} disabled={sendingTestEmail}>
                                    {sendingTestEmail ? "Enviando..." : "🚀 Enviar Prueba ahora"}
                                </button>
                                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowTestEmailModal(false)}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: META SETUP GUIDE */}
            {showMetaGuide && createPortal(
                <div className="modal-overlay" onClick={() => setShowMetaGuide(false)}>
                    <div className="modal-content premium-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px' }}>
                            <h2 style={{ margin: 0 }}>🚀 Guía: Conectar Meta Ads Profesional</h2>
                            <button className="btn-close" onClick={() => setShowMetaGuide(false)}>×</button>
                        </div>

                        <div className="guide-steps" style={{ overflowY: 'auto', maxHeight: '70vh', paddingRight: '10px' }}>
                            <div className="guide-step" style={{ marginBottom: '30px' }}>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '10px' }}>Paso 1: Ir a Configuración del Negocio</h4>
                                <p>Entra a tu <strong>Meta Business Suite</strong> y ve a la sección de "Usuarios del Sistema".</p>
                                <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer" className="btn-secondary" style={{ display: 'inline-block', marginTop: '10px', fontSize: '0.8rem' }}>Abrir Meta Business Settings ↗</a>
                            </div>

                            <div className="guide-step" style={{ marginBottom: '30px' }}>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '10px' }}>Paso 2: Crear o Seleccionar Usuario</h4>
                                <p>Si no tienes uno, crea un nuevo <strong>Usuario del Sistema</strong> (nombre sugerido: CRM_INTEGRATOR). El rol debe ser "Administrador".</p>
                            </div>

                            <div className="guide-step" style={{ marginBottom: '30px' }}>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '10px' }}>Paso 3: Asignar Activos (Cuentas)</h4>
                                <p>Haz clic en <strong>Asignar activos</strong> y selecciona todas las <strong>Cuentas Publicitarias</strong> que quieres que el CRM pueda ver. Asegúrate de darles permiso de "Administrar cuenta de anuncios".</p>
                            </div>

                            <div className="guide-step" style={{ marginBottom: '30px' }}>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '10px' }}>Paso 4: Generar el Token</h4>
                                <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
                                    <li>Haz clic en <strong>Generar nuevo token</strong>.</li>
                                    <li>Selecciona tu Aplicación (si no tienes una, Meta te pedirá crear una básica).</li>
                                    <li><strong>IMPORTANTE:</strong> Marca los permisos <code>ads_read</code>, <code>ads_management</code> y <code>business_management</code>.</li>
                                    <li>Copia el código largo que empieza con <code>EAA...</code></li>
                                </ol>
                                <div style={{ background: 'rgba(var(--primary-rgb), 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid var(--primary)', marginTop: '10px' }}>
                                    <strong>💡 Nota:</strong> Este token es una "llave maestra" que no vence. No la compartas con nadie.
                                </div>
                            </div>

                            <div className="guide-step">
                                <h4 style={{ color: 'var(--primary)', marginBottom: '10px' }}>Paso 5: Pegar y Guardar</h4>
                                <p>Pega el token en el campo anterior en este panel y haz clic en <strong>💾 Guardar Portafolio</strong>.</p>
                            </div>
                        </div>

                        <div className="modal-footer" style={{ marginTop: '30px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px', textAlign: 'right' }}>
                            <button className="btn-process" onClick={() => setShowMetaGuide(false)}>¡Entendido, ir a configurar!</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Service Hour Modal */}
            {showServiceHoursModal && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: "500px" }}>
                        <h3>Horarios: {showServiceHoursModal.service_name}</h3>
                        <p className="text-muted">Si no defines ningún horario, el servicio sigue el horario general de la agenda. Si agregas al menos uno, SOLO estará disponible en estos rangos.</p>

                        <form className="premium-form-v" onSubmit={handleAddServiceHour} style={{ marginTop: '15px' }}>
                            <select name="dia_semana" required defaultValue={editingServiceHour?.dia_semana ?? ""}>
                                <option value="" disabled>-- Día --</option>
                                {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input name="hora_inicio" type="time" defaultValue={editingServiceHour?.hora_inicio || ""} required />
                                <input name="hora_fin" type="time" defaultValue={editingServiceHour?.hora_fin || ""} required />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="submit" className="btn-process" style={{ flex: 2 }}>{editingServiceHour ? "💾 Guardar" : "➕ Añadir Rango"}</button>
                                {editingServiceHour && <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditingServiceHour(null)}>Cancelar</button>}
                            </div>
                        </form>

                        <div className="mini-list" style={{ marginTop: '20px', maxHeight: '300px', overflowY: 'auto' }}>
                            {serviceHours.length === 0 ? <p className="text-muted text-center">Usa horario general</p> :
                                serviceHours.map(h => (
                                    <div key={h.id} className="mini-item-inline range-badge">
                                        <div style={{ flex: 1 }}>
                                            <strong>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][h.dia_semana]}</strong>: {h.hora_inicio} - {h.hora_fin}
                                        </div>
                                        <div className="mini-item-actions">
                                            <button className="btn-edit-tiny" onClick={() => setEditingServiceHour(h)}>✏️</button>
                                            <button className="btn-delete-tiny" onClick={async () => {
                                                const { error } = await supabase.from('horarios_servicios').delete().eq('id', h.id);
                                                if (!error) handleFetchServiceHours(showServiceHoursModal.agenda_id, showServiceHoursModal.service_id);
                                            }}>×</button>
                                        </div>
                                    </div>
                                ))}
                        </div>

                        <div className="modal-actions" style={{ marginTop: '20px', borderTop: '1px solid var(--glass-border)', paddingTop: '15px' }}>
                            <button className="btn-secondary" style={{ width: '100%' }} onClick={() => {
                                setShowServiceHoursModal(null);
                                setEditingServiceHour(null);
                            }}>Cerrar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Existing Modals */}
            {showAgentModal && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>Gestionar Agentes: {showAgentModal.name}</h3>
                        <p>Selecciona los agentes que tienen permiso para ver esta agenda.</p>
                        <div className="agent-list-scroll">
                            {users.filter(u => u.role !== 'superuser' && u.role !== 'owner').map(u => {
                                const isAssigned = agendas.find(a => a.id === showAgentModal.id)?.users?.some(au => au.id === u.id);
                                return (
                                    <div key={u.id} className="agent-item-row">
                                        <div className="agent-info">
                                            <strong>{u.full_name}</strong>
                                            <span>@{u.username}</span>
                                        </div>
                                        <button
                                            className={isAssigned ? "btn-delete" : "btn-process"}
                                            onClick={() => toggleAgentAssignment(u.id, showAgentModal.id, isAssigned)}
                                        >
                                            {isAssigned ? "Quitar" : "Asignar"}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowAgentModal(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: EDIT/NEW AGENDA */}
            {showEditAgenda && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>{showEditAgenda.id === 'new' ? 'Nueva Agenda' : 'Editar Agenda'}</h3>
                        <form onSubmit={showEditAgenda.id === 'new' ? handleCreateAgenda : handleUpdateAgenda} className="premium-form">
                            <div className="form-group">
                                <label>Nombre de la Agenda</label>
                                <input
                                    type="text"
                                    value={showEditAgenda.id === 'new' ? newAgenda.name : editingAgenda.name}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, name: e.target.value })
                                        : setEditingAgenda({ ...editingAgenda, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Descripción</label>
                                <textarea
                                    value={showEditAgenda.id === 'new' ? newAgenda.description : editingAgenda.description}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, description: e.target.value })
                                        : setEditingAgenda({ ...editingAgenda, description: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Cupos Disponibles por Hora</label>
                                <input
                                    type="number"
                                    value={showEditAgenda.id === 'new' ? newAgenda.slots_per_hour : editingAgenda.slots_per_hour}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, slots_per_hour: parseInt(e.target.value) })
                                        : setEditingAgenda({ ...editingAgenda, slots_per_hour: parseInt(e.target.value) })}
                                    min="1"
                                />
                            </div>
                            <div className="form-group">
                                <label>📍 Ciudad / Sucursal</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Bogotá, Medellín, Miami..."
                                    value={showEditAgenda.id === 'new' ? newAgenda.ciudad : editingAgenda.ciudad}
                                    onChange={e => showEditAgenda.id === 'new'
                                        ? setNewAgenda({ ...newAgenda, ciudad: e.target.value })
                                        : setEditingAgenda({ ...editingAgenda, ciudad: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowEditAgenda(null)}>Cancelar</button>
                                <button type="submit" className="btn-process">{showEditAgenda.id === 'new' ? 'Crear Agenda' : 'Guardar Cambios'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: NEW USER / EDIT USER */}
            {showUserModal && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content premium-modal">
                        <h3>{editingUser ? 'Editar Personal' : 'Crear Nuevo Usuario'}</h3>
                        <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="premium-form">
                            <div className="form-group">
                                <label>Nombre Completo</label>
                                <input type="text" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} required placeholder="Ej: Juan Pérez" />
                            </div>
                            <div className="form-group">
                                <label>Nombre de Usuario</label>
                                <input type="text" value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} required placeholder="ej: juan_p" />
                            </div>

                            <div className="form-group">
                                <label>Correo Electrónico {editingUser && <small>(Dejar igual para no cambiar)</small>}</label>
                                <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required placeholder="ej: admin@correo.com" />
                            </div>
                            <div className="form-group">
                                <label>Contraseña {editingUser && <small>(Llenar solo para cambiarla)</small>}</label>
                                <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required={!editingUser} placeholder={editingUser ? "Nueva clave..." : "Mínimo 6 caracteres"} minLength="6" />
                            </div>

                            <div className="form-group">
                                <label>Rol del Usuario</label>
                                {(userRole === 'superuser' || userRole === 'owner') ? (
                                    <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="custom-file-input">
                                        <option value="agent">Agente / Vendedor</option>
                                        <option value="admin">Administrador (Sede)</option>
                                        {(userRole === 'owner' || userRole === 'superuser') && <option value="superuser">SuperAdmin (Clínica)</option>}
                                    </select>
                                ) : (
                                    <div className="role-badge agent" style={{ padding: '10px', display: 'block', textAlign: 'center' }}>
                                        Rol: Agente (Solo puedes crear agentes)
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => { setShowUserModal(false); setEditingUser(null); setNewUser({ full_name: "", username: "", email: "", password: "", role: "agent" }); }}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? (editingUser ? "Guardando..." : "Creando...") : (editingUser ? "Guardar Cambios" : "Crear Usuario")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: DUPLICATE SCHEDULE */}
            {duplicateHorario && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content premium-modal" style={{ maxWidth: '450px' }}>
                        <h3>Duplicar Horario</h3>
                        <p style={{ marginBottom: '15px' }}>
                            Copiando rango <strong>{duplicateHorario.hora_inicio} - {duplicateHorario.hora_fin}</strong>
                            <br />
                            <small className="text-muted">De la agenda: {agendas.find(a => a.id === duplicateHorario.agenda_id)?.name}</small>
                        </p>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            setLoading(true);
                            if (!e.target.target_day.value) return;

                            const targetDay = parseInt(e.target.target_day.value);

                            const { error } = await supabase.from('horarios_atencion').insert({
                                agenda_id: duplicateHorario.agenda_id,
                                dia_semana: targetDay,
                                hora_inicio: duplicateHorario.hora_inicio,
                                hora_fin: duplicateHorario.hora_fin
                            });

                            if (!error) {
                                setDuplicateHorario(null);
                                fetchData();
                            } else {
                                alert("Error al duplicar: " + error.message);
                            }
                            setLoading(false);
                        }}>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label>Selecciona el Día Destino</label>
                                <select name="target_day" required className="custom-file-input">
                                    <option value="">-- Seleccionar Día --</option>
                                    {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => (
                                        <option key={i} value={i} disabled={i === duplicateHorario.dia_semana}>
                                            {d} {i === duplicateHorario.dia_semana ? '(Origen)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setDuplicateHorario(null)}>Cancelar</button>
                                <button type="submit" className="btn-process" disabled={loading}>
                                    {loading ? "Copiando..." : "Duplicar Ahora"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL: EDIT/NEW GLOBAL SERVICE */}
            {showServiceModal && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content premium-modal full-screen-modal">
                        <h3>{showServiceModal.id === 'new' ? 'Nuevo Servicio Global' : `Editar: ${showServiceModal.nombre}`}</h3>
                        <form onSubmit={handleSaveService} className="premium-form">
                            <div className="form-group">
                                <label>Nombre del Servicio</label>
                                <input
                                    type="text"
                                    value={editingService.nombre}
                                    onChange={e => setEditingService({ ...editingService, nombre: e.target.value })}
                                    required
                                    placeholder="Ej: Sueroterapia Pack x3"
                                />
                            </div>
                            <div className="form-group">
                                <label>Descripción / Detalles</label>
                                <textarea
                                    value={editingService.descripcion}
                                    onChange={e => setEditingService({ ...editingService, descripcion: e.target.value })}
                                    placeholder="Describe los beneficios o el contenido del pack..."
                                    rows="3"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Precio Base $</label>
                                    <input
                                        type="number"
                                        value={editingService.precio_base}
                                        onChange={e => setEditingService({ ...editingService, precio_base: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Precio Descuento $</label>
                                    <input
                                        type="number"
                                        value={editingService.precio_descuento}
                                        onChange={e => setEditingService({ ...editingService, precio_descuento: e.target.value })}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Duración (min)</label>
                                    <input
                                        type="number"
                                        value={editingService.duracion_minutos}
                                        onChange={e => setEditingService({ ...editingService, duracion_minutos: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Cupos Simultáneos</label>
                                    <input
                                        type="number"
                                        value={editingService.concurrency}
                                        onChange={e => setEditingService({ ...editingService, concurrency: e.target.value })}
                                        required
                                        min="1"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Total Sesiones (Paquete)</label>
                                    <input
                                        type="number"
                                        value={editingService.total_sesiones}
                                        onChange={e => setEditingService({ ...editingService, total_sesiones: e.target.value })}
                                        required
                                        min="1"
                                        placeholder="1 para cita única"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Imagen (Link URL)</label>
                                <input
                                    type="url"
                                    value={editingService.image_url}
                                    onChange={e => setEditingService({ ...editingService, image_url: e.target.value })}
                                    placeholder="https://ejemplo.com/imagen.jpg"
                                />
                                {editingService.image_url && (
                                    <div className="img-preview-tiny" style={{ backgroundImage: `url(${editingService.image_url})` }}></div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '15px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                <label className="checkbox-item" style={{ margin: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={editingService.es_paquete}
                                        onChange={e => setEditingService({ ...editingService, es_paquete: e.target.checked })}
                                    />
                                    <span>Es un Paquete / Promoción</span>
                                </label>

                                {editingService.es_paquete && (
                                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                        <select
                                            value={editingService.parent_id || ""}
                                            onChange={e => {
                                                const parentId = e.target.value;
                                                const parent = globalServices.find(gs => gs.id === parseInt(parentId));
                                                if (parent) {
                                                    setEditingService({
                                                        ...editingService,
                                                        parent_id: parentId,
                                                        descripcion: parent.descripcion || editingService.descripcion,
                                                        concurrency: parent.concurrency || editingService.concurrency,
                                                        informacion_ia: parent.informacion_ia || editingService.informacion_ia
                                                    });
                                                } else {
                                                    setEditingService({ ...editingService, parent_id: parentId });
                                                }
                                            }}
                                            className="custom-file-input"
                                            style={{ margin: 0 }}
                                        >
                                            <option value="">-- Seleccionar Producto Base --</option>
                                            {globalServices
                                                .filter(gs => !gs.es_paquete && gs.id !== showServiceModal.id)
                                                .map(gs => <option key={gs.id} value={gs.id}>{gs.nombre}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🧠 Información Experta para la IA
                                </label>
                                <textarea
                                    value={editingService.informacion_ia}
                                    onChange={e => setEditingService({ ...editingService, informacion_ia: e.target.value })}
                                    placeholder="Ingresa detalles que la IA debe conocer: Beneficios, ingredientes, contraindicaciones, por qué es mejor que la competencia, etc."
                                    rows="5"
                                    style={{ border: '1px solid var(--accent)', background: 'rgba(var(--accent-rgb), 0.05)' }}
                                />
                                <small className="text-muted">Esta información será usada por el agente para responder preguntas técnicas de los pacientes.</small>
                            </div>

                            <div className="form-group">
                                <label>Color Distintivo</label>
                                <div className="color-picker-container">
                                    <input
                                        type="color"
                                        value={editingService.color}
                                        className="service-color-input"
                                        onChange={e => setEditingService({ ...editingService, color: e.target.value })}
                                    />
                                    <span className="color-value-text">{editingService.color}</span>
                                </div>
                            </div>

                            {showServiceModal.id === 'new' && (
                                <div className="assign-checkboxes-modal">
                                    <label>Asignar automáticamente a:</label>
                                    <div className="checkbox-scroll">
                                        <label className="checkbox-item">
                                            <input type="checkbox" name="assign_to" value="-1" />
                                            <span>⭐ TODAS LAS AGENDAS</span>
                                        </label>
                                        {agendas.map(ag => (
                                            <label key={ag.id} className="checkbox-item">
                                                <input type="checkbox" name="assign_to" value={ag.id} />
                                                <span>{ag.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="modal-footer footer-between">
                                <button type="button" className="btn-secondary btn-cancel-service" onClick={() => setShowServiceModal(null)}>Cancelar</button>
                                <button type="submit" className="btn-process">{showServiceModal.id === 'new' ? 'Crear Servicio' : 'Guardar Cambios'}</button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            <MetaConnectModal
                isOpen={showMetaConnectModal}
                onClose={() => setShowMetaConnectModal(false)}
                accessToken={tempMetaToken}
                onSave={handleSaveMetaAssets}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                icon={confirmModal.icon}
                type={confirmModal.type}
            />
        </div>
    );
};

export default AdminPanel;
