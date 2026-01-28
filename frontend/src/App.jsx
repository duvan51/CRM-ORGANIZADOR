import { useState, useMemo } from "react";
import "./index.css";

// Mover FieldManager fuera para evitar que se recree en cada render del padre y pierda el foco
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
  const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Result

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
      const updatedFields = [...fields, cleanName];
      setFields(updatedFields);
      setNewFieldName("");

      // Si ya hay un análisis (estamos en el paso 2), sincronizar el mapeo
      if (analysis) {
        setMapping(prevMapping => {
          const newMapping = { ...prevMapping };
          analysis.files.forEach(f => {
            if (f.sheets) {
              if (!newMapping[f.filename]) newMapping[f.filename] = {};
              f.sheets.forEach(s => {
                if (!newMapping[f.filename][s.name]) newMapping[f.filename][s.name] = {};
                if (!newMapping[f.filename][s.name][cleanName]) {
                  newMapping[f.filename][s.name][cleanName] = autoSuggestForField(s.columns, cleanName);
                }
              });
            }
          });
          return newMapping;
        });
      }
    }
  };

  const removeField = (name) => {
    setFields(fields.filter(f => f !== name));
  };

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
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    try {
      const url = `http://localhost:8000/upload?append=${append}`;
      const response = await fetch(url, { method: "POST", body: formData });
      if (!response.ok && response.status !== 500) throw new Error("Error subiendo archivos");

      const data = await response.json();

      if (data.status === "error") {
        setError(`Error del Servidor: ${data.error}. Revisa la consola para más detalles.`);
        console.error("Backend Error Traceback:", data.traceback);
        return;
      }

      setAnalysis(data);

      const newSelection = { ...selection };
      const newMapping = { ...mapping };

      data.files.forEach(f => {
        if (f.sheets) {
          // Si es nuevo o no estaba seleccionado, seleccionar todo por defecto
          if (!newSelection[f.filename]) {
            newSelection[f.filename] = f.sheets.map(s => s.name);
          }

          if (!newMapping[f.filename]) newMapping[f.filename] = {};

          f.sheets.forEach(s => {
            if (!newMapping[f.filename][s.name]) {
              newMapping[f.filename][s.name] = {};
              fields.forEach(field => {
                newMapping[f.filename][s.name][field] = autoSuggestForField(s.columns, field);
              });
            }
          });
        }
      });
      setSelection(newSelection);
      setMapping(newMapping);
      setStep(2);
    } catch (err) {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDedupCol = (col) => {
    setDedupCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const processMapping = async () => {
    const finalMapping = {};

    Object.keys(selection).forEach(fname => {
      selection[fname].forEach(sname => {
        const m = mapping[fname]?.[sname] || {};
        // Ya no validamos allValid, permitimos vacíos
        if (!finalMapping[fname]) finalMapping[fname] = {};
        finalMapping[fname][sname] = m;
      });
    });

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:8000/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: finalMapping, unificar, dedup_cols: dedupCols }),
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

  const toggleSheet = (fname, sname) => {
    setSelection(prev => {
      const current = prev[fname] || [];
      const updated = current.includes(sname)
        ? current.filter(s => s !== sname)
        : [...current, sname];
      return { ...prev, [fname]: updated };
    });
  };

  const handleMapChange = (fname, sname, field, value) => {
    setMapping(prev => ({
      ...prev,
      [fname]: {
        ...prev[fname],
        [sname]: { ...prev[fname][sname], [field]: value }
      }
    }));
  };

  const filteredData = useMemo(() => {
    if (!result?.data_preview) return [];
    if (!searchTerm) return result.data_preview;
    const lowerSearch = searchTerm.toLowerCase();
    return result.data_preview.filter(row =>
      Object.values(row).some(val =>
        val.toString().toLowerCase().includes(lowerSearch)
      )
    );
  }, [result, searchTerm]);

  return (
    <div className="container">
      <header className="header">
        <h1>CRM Organizador</h1>
        <p style={{ color: "var(--text-muted)" }}>
          {step === 1 && "Paso 1: Configurar Campos y Cargar"}
          {step === 2 && "Paso 2: Mapear Columnas"}
          {step === 3 && "Paso 3: Resultados y Filtros"}
        </p>
      </header>

      <div className="card">
        {step === 1 && (
          <div>
            <FieldManager
              fields={fields}
              newFieldName={newFieldName}
              setNewFieldName={setNewFieldName}
              addField={addField}
              removeField={removeField}
            />
            <div className="upload-section">
              <div className="file-input-wrapper">
                <input type="file" multiple className="custom-file-input" accept=".xlsx,.xls" onChange={(e) => setFiles(e.target.files)} />
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
                <button className="btn-process" onClick={() => uploadFiles(false)} disabled={loading || !files}>
                  {loading && <div className="spinner" />} Analizar Documentos
                </button>
                <button className="btn-process" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid var(--glass-border)" }} onClick={() => uploadFiles(true)} disabled={loading || !files}>
                  + Añadir a los actuales
                </button>
                <button className="btn-process" style={{ background: "#ef4444", color: "white" }} onClick={clearAllFiles} disabled={loading}>
                  Limpiar Todo
                </button>
              </div>
            </div>
            {analysis && (
              <div style={{ marginTop: "20px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Archivos cargados actualmente: {analysis.files?.length}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <FieldManager
              fields={fields}
              newFieldName={newFieldName}
              setNewFieldName={setNewFieldName}
              addField={addField}
              removeField={removeField}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Mapeo de Columnas:</h3>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", background: "rgba(255,255,255,0.05)", padding: "10px 15px", borderRadius: "10px", border: "1px solid var(--glass-border)" }}>
                  <input type="checkbox" checked={unificar} onChange={(e) => setUnificar(e.target.checked)} />
                  <span style={{ fontSize: "0.9rem" }}>Unificar datos idénticos (Deduplicar)</span>
                </label>
              </div>

              {unificar && (
                <div style={{ background: "rgba(255,165,0,0.05)", padding: "15px", borderRadius: "12px", border: "1px solid rgba(255,165,0,0.2)" }}>
                  <p style={{ fontSize: "0.85rem", marginBottom: "10px", color: "rgba(255,255,255,0.7)" }}>Marca las columnas que deben coincidir para considerar un dato como duplicado:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
                    {fields.map(f => (
                      <label key={f} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.85rem" }}>
                        <input type="checkbox" checked={dedupCols.includes(f)} onChange={() => toggleDedupCol(f)} />
                        {f}
                      </label>
                    ))}
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.85rem" }}>
                      <input type="checkbox" checked={dedupCols.includes("ciudad")} onChange={() => toggleDedupCol("ciudad")} />
                      Hoja (Ciudad)
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: "25px" }}>
              {analysis.files.map((file, idx) => (
                <div key={idx} className="file-card" style={{ background: "rgba(255,255,255,0.03)", padding: "24px", borderRadius: "20px", border: "1px solid var(--glass-border)" }}>
                  <strong style={{ display: "block", marginBottom: 15, color: "var(--primary)" }}>📂 {file.filename}</strong>
                  <div style={{ display: "grid", gap: "15px" }}>
                    {file.sheets?.map(sheet => (
                      <div key={sheet.name} style={{ background: "rgba(255,255,255,0.02)", padding: "15px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: 12 }}>
                          <input
                            type="checkbox"
                            checked={selection[file.filename]?.includes(sheet.name)}
                            onChange={() => toggleSheet(file.filename, sheet.name)}
                          />
                          <span style={{ fontWeight: "600" }}>Hoja: {sheet.name}</span>
                        </div>

                        {selection[file.filename]?.includes(sheet.name) && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                            {fields.map(field => (
                              <div key={field}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "4px", textTransform: "capitalize" }}>{field}:</label>
                                <select value={mapping[file.filename]?.[sheet.name]?.[field] || ""} onChange={(e) => handleMapChange(file.filename, sheet.name, field, e.target.value)}
                                  style={{ width: "100%", padding: "7px", background: "#1e293b", color: "white", border: "1px solid var(--glass-border)", borderRadius: "6px", fontSize: "0.85rem" }}>
                                  <option value="">-- Seleccionar --</option>
                                  {sheet.columns?.map(col => <option key={col} value={col}>{col}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 30, display: "flex", gap: "15px" }}>
              <button className="btn-process" onClick={processMapping} disabled={loading}>
                {loading && <div className="spinner" />} Unificar Todo
              </button>
              <button className="btn-process" style={{ background: "transparent", border: "1px solid var(--glass-border)" }} onClick={() => setStep(1)}>Atrás</button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <div className="status-badge status-success" style={{ margin: 0 }}>✓ Procesado</div>
                <div style={{ marginTop: "10px", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                  Total: <strong>{filteredData.length}</strong> registros {searchTerm && "(filtrados)"}
                </div>
              </div>
              <input type="text" placeholder="🔍 Filtrar resultados..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--glass-border)", borderRadius: "20px", color: "white", width: "300px" }} />
            </div>

            <div className="table-container" style={{ maxHeight: "500px" }}>
              <table>
                <thead>
                  <tr>
                    {result.columnas_reportadas?.map(col => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr key={idx}>
                      {result.columnas_reportadas?.map(col => (
                        <td key={col}>
                          {col === "fecha" && row[col] ? new Date(row[col]).toLocaleDateString() : row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 30 }}>
              <button className="btn-process" onClick={() => { setStep(1); setResult(null); setSearchTerm(""); }}>Nueva unificación</button>
            </div>
          </div>
        )}

        {error && <div className="alert" style={{ marginTop: "20px" }}>{error}</div>}
      </div>
    </div>
  );
}

export default App;
