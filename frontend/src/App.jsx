import { useState, useMemo, useEffect } from "react";
import "./index.css";
import CalendarView from "./components/CalendarView";
import AgendaForm from "./components/AgendaForm";
import Login from "./components/Login";
import AdminPanel from "./components/AdminPanel";

const FieldManager = ({ fields, newFieldName, setNewFieldName, addField, removeField }) => (
  <div style={{ marginBottom: "30px", padding: "20px", background: "rgba(255,255,255,0.02)", borderRadius: "16px", border: "1px solid var(--glass-border)" }}>
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
        style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--glass-border)", borderRadius: "8px", color: "white" }}
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
  const [refreshCalendar, setRefreshCalendar] = useState(0);
  const [activeAgenda, setActiveAgenda] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);



  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch("http://localhost:8000/users/me", {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setUser(data);
            if (data.agendas && data.agendas.length > 0) {
              setActiveAgenda(data.agendas[0]);
            }
          }
          else localStorage.removeItem("token");
        })

        .catch(() => localStorage.removeItem("token"));
    }
  }, []);

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
      await fetch("http://localhost:8000/clear", { method: "POST" });
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
      const resp = await fetch(`http://localhost:8000/upload?append=${append}`, { method: "POST", body: formData });
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
      const response = await fetch(`http://localhost:8000/process`, {
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

  if (!user) return <Login onLoginSuccess={setUser} />;

  return (
    <div className="container">
      <header className="header" style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, right: 0 }}>
          <button onClick={handleLogout} className="btn-secondary" style={{ padding: "5px 12px", fontSize: "0.8rem" }}>
            Salir ({user.username})
          </button>
        </div>
        <div style={{ position: "absolute", top: 0, left: 0 }}>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="btn-secondary"
            style={{ padding: "5px 12px", fontSize: "1.2rem", borderRadius: "50%", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}
            title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <h1>CRM Organizador</h1>

        <div className="nav-tabs">
          <div className={`nav-tab ${activeTab === "crm" ? "active" : ""}`} onClick={() => setActiveTab("crm")}>Procesador CRM</div>
          <div className={`nav-tab ${activeTab === "agenda" ? "active" : ""}`} onClick={() => setActiveTab("agenda")}>Agenda Multi-Agente</div>
          {(user.role === "superuser" || user.role === "admin") && (
            <div className={`nav-tab ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>Panel Control</div>
          )}

        </div>

        {activeTab === "agenda" && user.agendas?.length > 0 && (
          <div style={{ marginTop: "15px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Agenda activa:</span>
            <select
              value={activeAgenda?.id || ""}
              onChange={(e) => setActiveAgenda(user.agendas.find(a => a.id === parseInt(e.target.value)))}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--glass-border)", color: "white", padding: "5px 10px", borderRadius: "8px" }}
            >
              {user.agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {user.role === "superuser" && <span style={{ fontSize: "0.7rem", color: "var(--primary)" }}>(Viendo como Superusuario)</span>}
          </div>
        )}
      </header>

      {activeTab === "admin" && (user.role === "superuser" || user.role === "admin") && (
        <AdminPanel token={localStorage.getItem("token")} onBack={() => setActiveTab("agenda")} userRole={user.role} />
      )}


      {activeTab === "agenda" && (
        <div className="card">
          {activeAgenda ? (
            <>
              <CalendarView
                key={`${refreshCalendar}-${activeAgenda.id}`}
                onDateSelect={setSelectedDate}
                agendaId={activeAgenda.id}
                agendas={user.agendas}
                token={localStorage.getItem("token")}
                userRole={user.role}
              />

              {selectedDate && (
                <AgendaForm
                  selectedDate={selectedDate}
                  agendaId={activeAgenda.id}
                  token={localStorage.getItem("token")}
                  onCitaCreated={() => { setSelectedDate(null); setRefreshCalendar(ref => ref + 1); }}
                  onCancel={() => setSelectedDate(null)}
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


      {activeTab === "crm" && (
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
          {step === 3 && result && (
            <div>
              <input type="text" placeholder="Filtrar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="custom-file-input" style={{ marginBottom: 20 }} />
              <div className="table-container">
                <table>
                  <thead><tr>{result.columnas_reportadas?.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{filteredData.map((row, i) => <tr key={i}>{result.columnas_reportadas?.map(c => <td key={c}>{row[c]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
