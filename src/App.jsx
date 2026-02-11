import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabase";
import "./index.css";
import "./confirmation_pro.css";
import "./sales.css";
import CalendarView from "./components/CalendarView.jsx";
import AgendaForm from "./components/AgendaForm.jsx";
import Login from "./components/Login.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import ConfirmationPanel from "./components/ConfirmationPanel.jsx";
import SalesCounter from "./components/SalesCounter.jsx";
import AgentDashboard from "./components/AgentDashboard.jsx";
import useWebSocket from "./hooks/useWebSocket.js";
import PatientTracking from "./components/PatientTracking.jsx";
import MasterPanel from "./components/MasterPanel.jsx";
import SubscriptionManager from "./components/SubscriptionManager.jsx";
import QuickScheduleModal from "./components/QuickScheduleModal.jsx";
const FieldManager = ({ fields, newFieldName, setNewFieldName, addField, removeField }) => (
  <div className="field-manager-container">
    <h4 className="field-manager-title">Columnas a unificar:</h4>
    <div className="field-list">
      {fields.map(f => (
        <span key={f} className="field-badge">
          {f} <button onClick={() => removeField(f)} className="field-remove-btn">×</button>
        </span>
      ))}
    </div>
    <div className="field-add-control">
      <input
        type="text"
        placeholder="Añadir columna"
        value={newFieldName}
        onChange={e => setNewFieldName(e.target.value)}
        className="field-add-input"
      />
      <button className="btn-process btn-add-field" onClick={addField}>+ Añadir</button>
    </div>
  </div>
);

function App() {
  // VERIFICAR CONEXIÓN A BASE DE DATOS AL INICIAR
  // ELIMINADO EL HEALTH CHECK VIEJO DE EXPRESS

  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("crm");
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (user?.role === 'owner') {
      setActiveTab('master');
    }
  }, [user]);

  const [fields, setFields] = useState(["nombre", "fecha", "servicios"]);
  const [newFieldName, setNewFieldName] = useState("");
  const [selection, setSelection] = useState({});
  const [mapping, setMapping] = useState({});
  const [unificar, setUnificar] = useState(true);
  const [dedupCols, setDedupCols] = useState([]);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingCita, setEditingCita] = useState(null);
  const [refreshCalendar, setRefreshCalendar] = useState(0);
  const [activeAgenda, setActiveAgenda] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [pendingConfirmations, setPendingConfirmations] = useState(0); // For the bell
  const [pendingReschedule, setPendingReschedule] = useState(null);

  useEffect(() => {
    const checkPending = async () => {
      if (!user) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        let query = supabase
          .from('citas')
          .select('*', { count: 'exact', head: true })
          .neq('confirmacion', 'Confirmada')
          .neq('confirmacion', 'Cancelada')
          .gte('fecha', today)
          .lte('fecha', tomorrowStr);

        // Filter by user's allowed agendas (strict isolation)
        if (user.agendas && user.agendas.length > 0) {
          const agendaIds = user.agendas.map(a => a.id);
          query = query.in('agenda_id', agendaIds);
        } else {
          // If no agendas, no confirmations
          setPendingConfirmations(0);
          return;
        }

        if (user.role !== 'superuser' && user.role !== 'admin' && user.role !== 'owner') {
          const sellerName = user.full_name || user.username;
          query = query.ilike('vendedor', sellerName);
        }

        const { count, error } = await query;

        if (!error) setPendingConfirmations(count || 0);
      } catch (e) { console.error(e); }
    };

    checkPending();
    const interval = setInterval(checkPending, 60000); // Cada minuto
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Implementación de WebSockets para tiempo real
  useWebSocket((message) => {
    switch (message.type) {
      case "REFRESH_CITAS":
      case "REFRESH_BLOQUEOS":
        if (activeAgenda && message.agenda_id === activeAgenda.id) {
          setRefreshCalendar(prev => prev + 1);
        }
        break;
      case "REFRESH_USERS":
        const token = localStorage.getItem("token");
        if (token) fetchUserProfile(token);
        break;
      case "REFRESH_AGENDAS":
        // Recargar agendas si cambian
        break;
      case "REFRESH_CRM":
        if (message.data) setResult(message.data);
        break;
      case "REFRESH_ALERTAS":
        // Aquí podrías disparar un refresco de alertas globales si las tuvieras fuera del admin
        break;
      default:
        console.log("Evento no manejado:", message.type);
    }
  });


  const fetchUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
            *,
            agendas:agenda_users(
                agendas(*)
            )
        `)
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (!profile) {
        console.warn("⚠️ Perfil no encontrado para el usuario:", session.user.id);
        setUser({ id: session.user.id, username: session.user.email, full_name: "Usuario Nuevo", agendas: [] });
        return;
      }

      let userAgendas = [];

      // LOGIC: If SuperUser, fetch ALL agendas for their clinic.
      if (profile.role === 'superuser') {
        // Clinic ID for superuser is likely their own ID if they are the root, or specified in clinic_id
        const clinicId = profile.clinic_id || profile.id;
        const { data: allAgendas } = await supabase.from('agendas').select('*').eq('clinic_id', clinicId);
        userAgendas = allAgendas || [];
      } else {
        // For Admins/Agents, use the explicitly assigned agendas
        userAgendas = profile.agendas ? profile.agendas.map(a => a.agendas) : [];
      }

      const formattedUser = {
        ...profile,
        agendas: userAgendas
      };

      setUser(formattedUser);

      // Si el usuario no es superuser y está en la pestaña CRM, lo movemos a Agenda
      if (formattedUser.role !== 'superuser' && formattedUser.role !== 'owner' && activeTab === 'crm') {
        setActiveTab("agenda");
      }

      if (formattedUser.agendas?.length > 0) {
        setActiveAgenda(prev => prev || formattedUser.agendas[0]);
      }
    } catch (err) {
      console.error("Error al cargar perfil:", err);
      setUser(null);
    }
  };

  useEffect(() => {
    fetchUserProfile();
    checkPendingConfirmations();

    // Listen for auth state changes (Social Login / Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth Event:", event);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        fetchUserProfile();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkPendingConfirmations = async () => {
    if (!user) return;
    try {
      let query = supabase
        .from('citas')
        .select('*')
        .eq('confirmacion', 'Pendiente');

      if (user.agendas && user.agendas.length > 0) {
        query = query.in('agenda_id', user.agendas.map(a => a.id));
      } else {
        return; // No access to notifications
      }

      if (user.role !== 'superuser' && user.role !== 'admin' && user.role !== 'owner') {
        query = query.ilike('vendedor', user.full_name || user.username);
      }



      const { data, error } = await query;

      if (error) throw error;
      setPendingConfirmations(data.length);
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const SINONIMOS = {
    nombre: ["paciente", "nombre", "cliente", "usuario", "nombre_completo", "nombre_y_apellido"],
    fecha: ["fecha", "dia", "fec", "fecha_de_atencion", "fecha_atencion"],
    servicios: ["concepto", "servicio", "servicios", "procedimiento", "descripcion"],
    telefono: ["tel", "cel", "telefono", "celular", "movil"],
    id: ["id", "cedula", "documento", "identificacion", "nit"]
  };

  const autoSuggestForField = (cols, field) => {
    if (!cols) return "";
    const found = cols.find(col => {
      const c = col.toString().toLowerCase().trim();
      const keywords = SINONIMOS[field.toLowerCase()] || [field.toLowerCase()];
      return keywords.some(s => c.includes(s));
    });
    return found || "";
  };

  const addField = () => {
    const cleanName = newFieldName.trim().toLowerCase().replace(/\s+/g, "_");
    if (cleanName && !fields.includes(cleanName)) {
      setFields([...fields, cleanName]);
      setNewFieldName("");
    }
  };

  const removeField = (name) => setFields(fields.filter(f => f !== name));

  const clearAllFiles = async () => {
    setLoading(true);
    try {
      // Nota: La funcionalidad de 'clear' dependía del backend viejo. 
      // Si necesitas limpiar datos en Supabase, deberías borrar las filas de las tablas.
      setAnalysis(null);
      setSelection({});
      setMapping({});
      setFiles(null);
    } catch (err) {
      setError("Error al limpiar interfaz.");
    } finally {
      setLoading(false);
    }
  };

  const uploadFiles = async (append = false) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const allData = [];
      const fileAnalysis = [];
      const { read, utils } = await import("xlsx");

      for (const file of files) {
        const data = await file.arrayBuffer();
        const workbook = read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = utils.sheet_to_json(worksheet, { defval: "" });

        if (json.length > 0) {
          fileAnalysis.push({
            filename: file.name,
            columns: Object.keys(json[0])
          });
          allData.push(...json);
        }
      }

      setAnalysis(fileAnalysis);
      setStep(2);
      setResult({ data_preview: allData, columnas_reportadas: fileAnalysis[0]?.columns || [] });
    } catch (err) {
      console.error(err);
      setError("Error leyendo archivos: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processMapping = async () => {
    setLoading(true);
    setError(null);
    try {
      // PROCESAMIENTO EN LADO DEL CLIENTE (FRONTEND)
      const citasToInsert = result.data_preview.map(row => {
        const mappedRow = {};
        Object.keys(mapping).forEach(fileCol => {
          const appField = mapping[fileCol];
          if (appField) {
            mappedRow[appField] = row[fileCol];
          }
        });
        return {
          vendedor: user.full_name || user.username,
          ...mappedRow,
          agenda_id: activeAgenda.id
        };
      });

      const { data, error: sbError } = await supabase
        .from('citas')
        .insert(citasToInsert);

      if (sbError) throw sbError;

      alert(`✅ ${citasToInsert.length} citas cargadas exitosamente en la agenda ${activeAgenda.name}`);
      setStep(1);
      setResult(null);
      setFiles(null);
    } catch (err) {
      console.error(err);
      setError("Error subiendo datos a Supabase: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!result?.data_preview) return [];
    if (!searchTerm) return result.data_preview;
    const lowerSearch = searchTerm.toLowerCase();
    return result.data_preview.filter(row =>
      Object.values(row).some(val => val.toString().toLowerCase().includes(lowerSearch))
    );
  }, [result, searchTerm]);

  const handleScheduleNext = (cita) => {
    setPendingReschedule(cita);
    if (activeTab !== "agenda") setActiveTab("agenda");

    const targetAgenda = user.agendas.find(a => a.id === cita.agenda_id) || activeAgenda || user.agendas[0];
    setActiveAgenda(targetAgenda);
  };

  if (!user) return <Login onLoginSuccess={(userData) => {
    setUser(userData);
    if (userData.agendas?.length > 0) setActiveAgenda(userData.agendas[0]);
    if (userData.role !== 'superuser') setActiveTab("agenda");
  }} />;

  const AppContent = () => (
    <div className="card">
      {step === 1 && (
        <>
          <FieldManager fields={fields} newFieldName={newFieldName} setNewFieldName={setNewFieldName} addField={addField} removeField={removeField} />
          <div className="upload-section">
            <input type="file" multiple accept=".xlsx,.xls" onChange={(e) => setFiles(e.target.files)} className="custom-file-input" />
            <div className="crm-actions-wrapper">
              <button className="btn-process" onClick={() => uploadFiles(false)} disabled={loading || !files}>Analizar</button>
              <button className="btn-process" style={{ background: "rgba(239, 68, 68, 0.1)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.2)" }} onClick={clearAllFiles}>Limpiar</button>
            </div>
          </div>
        </>
      )}
      {step === 2 && analysis && (
        <>
          <h3>Mapeo de columnas por archivo</h3>
          {analysis.map((file, idx) => (
            <div key={idx} style={{ marginBottom: "20px", padding: "15px", border: "1px solid var(--glass-border)", borderRadius: "8px" }}>
              <h4>{file.filename}</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
                {file.columns.map(col => {
                  const suggested = autoSuggestForField(fields, col);
                  return (
                    <div key={col} className="mapping-row">
                      <span className="mapping-label">{col}</span>
                      <select
                        value={mapping[col] || suggested || ""}
                        onChange={e => setMapping({ ...mapping, [col]: e.target.value })}
                        className="custom-file-input mapping-select"
                      >
                        <option value="">-- Ignorar --</option>
                        {fields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ margin: "20px 0" }}>
            <label style={{ marginRight: "20px" }}>
              <input type="checkbox" checked={unificar} onChange={e => setUnificar(e.target.checked)} /> Unificar archivos traslape
            </label>
            <div style={{ marginTop: "10px" }}>
              <strong>Deduplicar por:</strong>
              <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                {fields.map(f => (
                  <label key={f} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <input
                      type="checkbox"
                      checked={dedupCols.includes(f)}
                      onChange={e => {
                        if (e.target.checked) setDedupCols([...dedupCols, f]);
                        else setDedupCols(dedupCols.filter(c => c !== f));
                      }}
                    />
                    {f}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button className="btn-process" onClick={processMapping} disabled={loading}>Procesar Archivos</button>
        </>
      )}
      {step === 3 && result && (
        <div>
          <input type="text" placeholder="Filtrar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="custom-file-input" style={{ marginBottom: 20 }} />
          <div className="table-container">
            <table>
              <thead><tr>{result.columnas_reportadas?.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{filteredData.map((row, i) => <tr key={i}>{result.columnas_reportadas?.map(c => <td key={c}>{row[c]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <button className="btn-process" onClick={() => { setStep(1); setFiles(null); setResult(null); }}>Volver al inicio</button>
        </div>
      )}
    </div>
  );


  return (
    <div className="container">
      <header className="header">
        <div className="header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/andocrm.svg" alt="AndoCRM Logo" style={{ width: '32px', height: '32px' }} />
            <h1 style={{ margin: 0 }}>AndoCRM</h1>
          </div>
          <div className="header-controls">
            {activeTab === "agenda" && <div className="hide-mobile"><SalesCounter user={user} /></div>}

            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="btn-secondary"
              style={{
                padding: "0",
                fontSize: "1.2rem",
                borderRadius: "12px",
                width: "40px",
                height: "40px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--btn-secondary-bg)",
                border: "1px solid var(--glass-border)",
                color: "var(--text-main)",
                cursor: "pointer"
              }}
              title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button className="btn-logout" onClick={() => { handleLogout(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="hide-mobile">Salir ({user.username})</span>
            </button>
          </div>
        </div>

        <div className="nav-tabs">
          {user.role === "owner" && (
            <div className={`nav-tab ${activeTab === "master" ? "active" : ""}`} onClick={() => setActiveTab("master")}>
              <span className="tab-icon">👑</span> <span className="tab-text">Maestro</span>
            </div>
          )}
          {user.role === "owner" && (
            <div className={`nav-tab ${activeTab === "planes" ? "active" : ""}`} onClick={() => setActiveTab("planes")}>
              <span className="tab-icon">💎</span> <span className="tab-text">Suscripciones</span>
            </div>
          )}

          {user.role !== "owner" && (
            <>
              {user.role === "superuser" && (
                <div className={`nav-tab ${activeTab === "crm" ? "active" : ""}`} onClick={() => setActiveTab("crm")}>
                  <span className="tab-icon">📊</span> <span className="tab-text">CRM</span>
                </div>
              )}
              <div className={`nav-tab ${activeTab === "agenda" ? "active" : ""}`} onClick={() => setActiveTab("agenda")}>
                <span className="tab-icon">📅</span> <span className="tab-text">Agenda</span>
              </div>

              <div className={`nav-tab ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
                <span className="tab-icon">📈</span> <span className="tab-text">Mi Dash</span>
              </div>

              <div
                className={`nav-tab ${activeTab === "confirmaciones" ? "active" : ""}`}
                onClick={() => { setActiveTab("confirmaciones"); setPendingConfirmations(0); }}
                style={{ position: "relative" }}
              >
                <span className="tab-icon">🔔</span> <span className="tab-text">Confirmar</span>
                {pendingConfirmations > 0 && <span className="bell-badge">{pendingConfirmations}</span>}
              </div>

              <div className={`nav-tab ${activeTab === "seguimientos" ? "active" : ""}`} onClick={() => setActiveTab("seguimientos")}>
                <span className="tab-icon">🤝</span> <span className="tab-text">Seguimientos</span>
              </div>

              {(user.role === "superuser" || user.role === "admin") && (
                <div className={`nav-tab ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>
                  <span className="tab-icon">⚙️</span> <span className="tab-text">Admin</span>
                </div>
              )}
            </>
          )}
        </div>

        {activeTab === "agenda" && user.agendas?.length > 0 && (
          <div className="agenda-tabs-container">
            <div className="agenda-tabs">
              {user.agendas.map(a => (
                <button
                  key={a.id}
                  className={`agenda-tab-btn ${activeAgenda?.id === a.id ? 'active' : ''}`}
                  onClick={() => setActiveAgenda(a)}
                >
                  {a.name}
                </button>
              ))}
            </div>
            {user.role === "superuser" && <span className="superuser-badge">Super</span>}
          </div>
        )}
      </header>

      <div style={{ padding: "20px" }}>
        {activeTab === "crm" && <AppContent />}

        {activeTab === "confirmaciones" && (
          <ConfirmationPanel
            user={user}
            token={localStorage.getItem("token")}
            onEditCita={(cita) => {
              setEditingCita(cita);
              const [y, m, d] = cita.fecha.split('-').map(Number);
              setSelectedDate(new Date(y, m - 1, d));
            }}
            onRefresh={() => setRefreshCalendar(ref => ref + 1)}
          />
        )}

        {activeTab === "seguimientos" && <PatientTracking user={user} onScheduleNext={handleScheduleNext} />}

        {activeTab === "master" && user.role === "owner" && <MasterPanel user={user} />}
        {activeTab === "planes" && user.role === "owner" && <SubscriptionManager user={user} />}

        {activeTab === "admin" && (user.role === "owner" || user.role === "superuser" || user.role === "admin") && (
          <AdminPanel onBack={() => setActiveTab("agenda")} userRole={user.role} />
        )}

        {activeTab === "dashboard" && (
          <AgentDashboard user={user} />
        )}

        {activeTab === "agenda" && (
          <div className="card">
            {activeAgenda ? (
              <CalendarView
                key={`${refreshCalendar}-${activeAgenda.id}`}
                onDateSelect={(date) => {
                  setEditingCita(null);
                  setSelectedDate(date);
                }}
                agendaId={activeAgenda.id}
                agendas={user.agendas}
                token={null}
                user={user}
                userRole={user.role}
                onEditCita={(cita) => {
                  setEditingCita(cita);
                  const [y, m, d] = cita.fecha.split('-').map(Number);
                  setSelectedDate(new Date(y, m - 1, d));
                }}
                onScheduleNext={handleScheduleNext}
              />
            ) : (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <p>No tienes agendas asignadas. Contacta al Súper Administrador.</p>
              </div>
            )}
          </div>
        )}

        {/* Global Modal for New Appointment */}
        {selectedDate && activeAgenda && (
          <AgendaForm
            selectedDate={selectedDate}
            initialData={editingCita}
            currentUserName={user.full_name || user.username}
            agendaId={activeAgenda.id}
            token={null}
            userRole={user.role}
            onCitaCreated={() => {
              setSelectedDate(null);
              setEditingCita(null);
              setRefreshCalendar(ref => ref + 1);
            }}
            onCancel={() => {
              setSelectedDate(null);
              setEditingCita(null);
            }}
          />
        )}
      </div>
      {/* Quick Schedule Modal */}
      {pendingReschedule && activeAgenda && (
        <QuickScheduleModal
          baseCita={pendingReschedule}
          agendaId={activeAgenda.id}
          onClose={() => setPendingReschedule(null)}
          onSelectSlot={(selectedDateStr, timeStr) => {
            const newCita = {
              ...pendingReschedule,
              id: null,
              fecha: selectedDateStr,
              hora: timeStr,
              confirmacion: "Pendiente",
              sesion_nro: (pendingReschedule.sesion_nro || 0) + 1,
              created_at: null
            };
            setEditingCita(newCita);
            const [y, m, d] = selectedDateStr.split('-').map(Number);
            setSelectedDate(new Date(y, m - 1, d));
            setPendingReschedule(null);
          }}
        />
      )}
    </div>
  );
}


export default App;
