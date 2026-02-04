import { useState, useMemo, useEffect } from "react";
import { API_URL } from "./config";
import "./index.css";
import "./confirmation_pro.css";
import "./sales.css";
import CalendarView from "./components/CalendarView";
import AgendaForm from "./components/AgendaForm";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";
import ConfirmationPanel from "./components/ConfirmationPanel";
import SalesCounter from "./components/SalesCounter";
import useWebSocket from "./hooks/useWebSocket";

const FieldManager = ({ fields, newFieldName, setNewFieldName, addField, removeField }) => (
  <div style={{ marginBottom: "30px", padding: "20px", background: "var(--input-bg)", borderRadius: "16px", border: "1px solid var(--glass-border)" }}>
    <h4 style={{ marginBottom: "15px" }}>Columnas a unificar:</h4>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "15px" }}>
      {fields.map(f => (
        <span key={f} style={{ background: "var(--primary)", padding: "5px 12px", borderRadius: "20px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
          {f} <button onClick={() => removeField(f)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontWeight: "bold" }}>×</button>
        </span>
      ))}
    </div>
    <div style={{ display: "flex", gap: "10px" }}>
      <input
        type="text"
        placeholder="Añadir columna (ej: correo, fono)"
        value={newFieldName}
        onChange={e => setNewFieldName(e.target.value)}
        style={{ flex: 1, padding: "8px 12px", background: "var(--input-bg)", border: "1px solid var(--glass-border)", borderRadius: "8px", color: "var(--text-main)" }}
      />
      <button className="btn-process" style={{ padding: "8px 20px", fontSize: "0.9rem" }} onClick={addField}>+ Añadir</button>
    </div>
  </div>
);

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("crm");
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
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


  const fetchUserProfile = async (token) => {
    try {
      const res = await fetch(`${API_URL}/users/me`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        // Autoseleccionar la primera agenda si no hay ninguna activa o la actual ya no está
        if (data.agendas && data.agendas.length > 0) {
          setActiveAgenda(prev => {
            if (!prev || !data.agendas.some(a => a.id === prev.id)) {
              return data.agendas[0];
            }
            return prev;
          });
        }
      } else {
        localStorage.removeItem("token");
        setUser(null);
      }
    } catch (err) {
      console.error("Error al cargar perfil:", err);
      localStorage.removeItem("token");
      setUser(null);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetchUserProfile(token);
      checkPendingConfirmations(token); // Initial check
    }
  }, []);

  const checkPendingConfirmations = async (token) => {
    try {
      const res = await fetch(`${API_URL}/citas/pending-confirmations/all`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Count ONLY urgent (days_until <= 1) and NOT confirmed
        const urgent = data.filter(c => c.days_until <= 1 && c.confirmacion !== "Confirmada").length;
        setPendingConfirmations(urgent);
      }
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
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
      await fetch(`${API_URL}/clear`, { method: "POST" });
      setAnalysis(null);
      setSelection({});
      setMapping({});
      setFiles(null);
    } catch (err) {
      setError("Error al limpiar archivos.");
    } finally {
      setLoading(false);
    }
  };

  const uploadFiles = async (append = false) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
    try {
      const resp = await fetch(`${API_URL}/upload?append=${append}`, { method: "POST", body: formData });
      const data = await resp.json();
      if (data.status === "error") throw new Error(data.error);
      setAnalysis(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const processMapping = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ selection: mapping, unificar, dedup_cols: dedupCols }),
      });
      const data = await response.json();
      setResult(data);
      setStep(3);
    } catch (err) {
      setError("Error procesando selección.");
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

  if (!user) return <Login onLoginSuccess={(userData) => {
    setUser(userData);
    if (userData.agendas?.length > 0) setActiveAgenda(userData.agendas[0]);
  }} />;

  const AppContent = () => (
    <div className="card">
      {step === 1 && (
        <>
          <FieldManager fields={fields} newFieldName={newFieldName} setNewFieldName={setNewFieldName} addField={addField} removeField={removeField} />
          <div className="upload-section">
            <input type="file" multiple accept=".xlsx,.xls" onChange={(e) => setFiles(e.target.files)} className="custom-file-input" />
            <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
              <button className="btn-process" onClick={() => uploadFiles(false)} disabled={loading || !files}>Analizar</button>
              <button className="btn-process" style={{ background: "#ef4444" }} onClick={clearAllFiles}>Limpiar</button>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {file.columns.map(col => {
                  const suggested = autoSuggestForField(fields, col);
                  return (
                    <div key={col} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{col}</span>
                      <select
                        value={mapping[col] || suggested || ""}
                        onChange={e => setMapping({ ...mapping, [col]: e.target.value })}
                        className="custom-file-input"
                        style={{ width: "50%" }}
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
      <header className="header" style={{ position: "relative" }}>

        {/* Theme Toggle (Top Left) */}
        <div style={{ position: "absolute", top: 10, left: 20 }}>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="btn-secondary"
            style={{ padding: "5px", fontSize: "1.2rem", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}
            title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {/* User Controls (Top Right) */}
        <div style={{ position: "absolute", top: 10, right: 20, display: "flex", alignItems: "center", gap: "10px" }}>
          {activeTab === "agenda" && <SalesCounter token={localStorage.getItem("token")} />}
          <button className="btn-logout" onClick={() => { localStorage.removeItem("token"); setUser(null); }}>
            Salir ({user.username})
          </button>
        </div>

        <h1>CRM Organizador</h1>

        <div className="nav-tabs">
          <div className={`nav-tab ${activeTab === "crm" ? "active" : ""}`} onClick={() => setActiveTab("crm")}>Procesador CRM</div>
          <div className={`nav-tab ${activeTab === "agenda" ? "active" : ""}`} onClick={() => setActiveTab("agenda")}>Agenda Multi-Agente</div>

          <div
            className={`nav-tab ${activeTab === "confirmaciones" ? "active" : ""}`}
            onClick={() => { setActiveTab("confirmaciones"); setPendingConfirmations(0); }}
            style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}
          >
            Confirmaciones
            <div className={`bell-icon ${pendingConfirmations > 0 ? "shaking" : ""}`} style={{ fontSize: '1.2rem' }}>
              🔔
              {pendingConfirmations > 0 && <span className="bell-badge" style={{ top: -5, right: -5, width: 16, height: 16, fontSize: '0.65rem' }}>{pendingConfirmations}</span>}
            </div>
          </div>

          {(user.role === "superuser" || user.role === "admin") && (
            <div className={`nav-tab ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>Panel Control</div>
          )}
        </div>

        {activeTab === "agenda" && user.agendas?.length > 0 && (
          <div className="agenda-tabs-container">
            <span className="tabs-label">Agenda:</span>
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
            {user.role === "superuser" && <span className="superuser-badge">(Superusuario)</span>}
          </div>
        )}
      </header>

      <div style={{ padding: "20px" }}>
        {activeTab === "crm" && <AppContent />}

        {activeTab === "confirmaciones" && <ConfirmationPanel token={localStorage.getItem("token")} />}

        {activeTab === "admin" && user.role === "superuser" && (
          <AdminPanel token={localStorage.getItem("token")} onBack={() => setActiveTab("agenda")} userRole={user.role} />
        )}

        {activeTab === "agenda" && (
          <div className="card">
            {activeAgenda ? (
              <>
                <CalendarView
                  key={`${refreshCalendar}-${activeAgenda.id}`}
                  onDateSelect={(date) => {
                    setEditingCita(null);
                    setSelectedDate(date);
                  }}
                  agendaId={activeAgenda.id}
                  agendas={user.agendas}
                  token={localStorage.getItem("token")}
                  userRole={user.role}
                  onEditCita={(cita) => {
                    setEditingCita(cita);
                    const [y, m, d] = cita.fecha.split('-').map(Number);
                    setSelectedDate(new Date(y, m - 1, d));
                  }}
                />

                {selectedDate && (
                  <AgendaForm
                    selectedDate={selectedDate}
                    initialData={editingCita}
                    currentUserName={user.full_name || user.username}
                    agendaId={activeAgenda.id}
                    token={localStorage.getItem("token")}
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
              </>
            ) : (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <p>No tienes agendas asignadas. Contacta al Súper Administrador.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div >
  );
}


export default App;
