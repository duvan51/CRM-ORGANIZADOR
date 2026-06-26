import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import ConfirmModal from "./ConfirmModal";

const COLUMN_LABELS = {
  nombres_completos: "Nombres Completos *",
  celular: "Celular *",
  fecha: "Fecha",
  hora: "Hora",
  tipo_servicio: "Tipo de Servicio",
  documento: "Documento",
  observaciones: "Observaciones",
  recordatorio_fecha: "Fecha Recordatorio ⏰",
  recordatorio_texto: "Detalle Recordatorio ⏰"
};

const getColumnLabel = (field) => {
  if (COLUMN_LABELS[field]) return COLUMN_LABELS[field];
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
};

const getColumnInputType = (field) => {
  if (field === "fecha" || field === "recordatorio_fecha") return "date";
  if (field === "hora") return "time";
  return "text";
};

const getColumnPlaceholder = (field) => {
  if (field === "nombres_completos") return "Ej: Laura Pérez";
  if (field === "celular") return "3001234567";
  if (field === "tipo_servicio") return "Valoración, Estética...";
  if (field === "documento") return "ID / CC";
  if (field === "observaciones") return "Detalles adicionales...";
  if (field === "recordatorio_fecha") return "Selecciona fecha";
  if (field === "recordatorio_texto") return "Ej: Llamar por la tarde";
  return `${getColumnLabel(field)}...`;
};

const getColumnWidth = (field) => {
  if (field === "nombres_completos") return "200px";
  if (field === "celular") return "130px";
  if (field === "fecha") return "130px";
  if (field === "hora") return "90px";
  if (field === "tipo_servicio") return "150px";
  if (field === "documento") return "120px";
  if (field === "observaciones") return "220px";
  if (field === "recordatorio_fecha") return "150px";
  if (field === "recordatorio_texto") return "220px";
  return "150px";
};

export default function ExcelGridEditor({ user, activeAgenda, fields, onSaveSuccess }) {
  const DEFAULT_FIELDS = ["nombres_completos", "fecha", "hora", "tipo_servicio", "celular", "documento"];
  const activeFields = fields && fields.length > 0 ? fields : DEFAULT_FIELDS;

  // Build a clean empty row object dynamically
  const createEmptyRow = (id) => {
    const row = { id };
    activeFields.forEach(field => {
      row[field] = "";
    });
    if (row.observaciones === undefined) {
      row.observaciones = "";
    }
    if (row.recordatorio_fecha === undefined) {
      row.recordatorio_fecha = "";
    }
    if (row.recordatorio_texto === undefined) {
      row.recordatorio_texto = "";
    }
    return row;
  };

  const [rows, setRows] = useState([
    createEmptyRow(1),
    createEmptyRow(2),
    createEmptyRow(3)
  ]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirmar",
    cancelText: "Cancelar",
    type: "confirm",
    icon: "❓",
    onConfirm: null
  });

  const showAlert = (message, title = "Aviso", icon = "ℹ️") => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: "Aceptar",
      cancelText: "",
      type: "alert",
      icon,
      onConfirm: null
    });
  };

  const showConfirm = (message, onConfirm, title = "Confirmar", icon = "❓", type = "confirm") => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: "Confirmar",
      cancelText: "Cancelar",
      type,
      icon,
      onConfirm
    });
  };

  // Sync fields when they update (if user adds a column in real-time, keep existing typed data)
  useEffect(() => {
    setRows(prev =>
      prev.map(row => {
        const updated = { ...row };
        activeFields.forEach(field => {
          if (updated[field] === undefined) {
            updated[field] = "";
          }
        });
        if (updated.observaciones === undefined) {
          updated.observaciones = "";
        }
        if (updated.recordatorio_fecha === undefined) {
          updated.recordatorio_fecha = "";
        }
        if (updated.recordatorio_texto === undefined) {
          updated.recordatorio_texto = "";
        }
        return updated;
      })
    );
  }, [fields]);

  const handleCellChange = (rowId, field, value) => {
    setRows(prev =>
      prev.map(row => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const addRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows(prev => [...prev, createEmptyRow(nextId)]);
  };

  const removeRow = (rowId) => {
    if (rows.length === 1) {
      setRows([createEmptyRow(1)]);
      return;
    }
    setRows(prev => prev.filter(row => row.id !== rowId));
  };

  const clearAll = () => {
    showConfirm("¿Seguro que deseas limpiar toda la tabla? Se perderán los datos actuales.", () => {
      setRows([
        createEmptyRow(1),
        createEmptyRow(2),
        createEmptyRow(3)
      ]);
      setFeedback(null);
    }, "Confirmar Acción", "🧹", "danger");
  };

  const handleSave = async () => {
    if (!activeAgenda || activeAgenda === "all") {
      showAlert("Por favor selecciona una Sede o Agenda específica en la barra superior antes de guardar.", "Selección Requerida", "⚠️");
      return;
    }

    // Filter out rows that are entirely empty
    const validRows = rows.filter(row =>
      activeFields.some(field => row[field] && row[field].toString().trim() !== "") ||
      (row.observaciones && row.observaciones.trim() !== "")
    );

    if (validRows.length === 0) {
      setFeedback({ type: "error", message: "❌ Por favor ingresa al menos una fila con datos." });
      return;
    }

    // Validate name and cellphone exists for entered rows
    const missingFields = validRows.some(
      r =>
        (r.nombres_completos === undefined || r.nombres_completos.trim() === "") ||
        (r.celular === undefined || r.celular.trim() === "")
    );

    if (missingFields) {
      setFeedback({ type: "error", message: "❌ Todas las filas completadas deben tener obligatoriamente 'Nombre' y 'Celular'." });
      return;
    }

    setLoading(true);
    setFeedback({ type: "info", message: "💾 Guardando prospectos en el CRM..." });

    try {
      const isManager = user.role === "superuser" || user.role === "owner" || user.role === "admin";
      const seller = isManager ? null : (user.full_name || user.username);

      const leadsToInsert = validRows.map(row => {
        // Standard SQL fields (only fields that natively exist as columns in crm_leads)
        const standardPayload = {
          vendedor_asignado: seller,
          estado: 'Nuevo',
          agenda_id: activeAgenda.id,
          nombres_completos: (row.nombres_completos || "").trim(),
          celular: (row.celular || "").trim().replace(/\D/g, ""), // clean non-numeric
          tipo_servicio: (row.tipo_servicio || "").trim() || null,
          documento: (row.documento || "").trim() || null
        };

        // Custom columns: append them dynamically to the observations text to prevent DB insert errors
        let finalObsText = (row.observaciones || "").trim();
        activeFields.forEach(field => {
          // Standard columns in the crm_leads table, plus our custom reminder columns
          const isStandard = [
            "nombres_completos", 
            "celular", 
            "tipo_servicio", 
            "documento", 
            "observaciones",
            "recordatorio_fecha",
            "recordatorio_texto"
          ].includes(field);
          
          if (!isStandard && row[field] && row[field].toString().trim() !== "") {
            const label = getColumnLabel(field);
            finalObsText += `${finalObsText ? " | " : ""}${label}: ${row[field].toString().trim()}`;
          }
        });

        // If either reminder date or text is set, structure observations as JSON
        const hasReminder = (row.recordatorio_fecha || "").trim() !== "" || (row.recordatorio_texto || "").trim() !== "";
        let finalObsVal = finalObsText;
        if (hasReminder) {
          finalObsVal = JSON.stringify({
            texto_original: finalObsText,
            notas: [],
            recordatorio_fecha: (row.recordatorio_fecha || "").trim(),
            recordatorio_texto: (row.recordatorio_texto || "").trim()
          });
        }

        standardPayload.observaciones = finalObsVal;
        return standardPayload;
      });

      const { error } = await supabase
          .from('crm_leads')
          .insert(leadsToInsert);

      if (error) throw error;

      setFeedback({ type: "success", message: `✅ ¡Se cargaron con éxito ${leadsToInsert.length} prospectos!` });
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
      }, 1500);

    } catch (err) {
      console.error("Error al guardar leads manuales:", err);
      setFeedback({ type: "error", message: `❌ Error al guardar datos: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Compile full columns array: activeFields + observaciones & reminders (if not already included)
  const displayFields = [...activeFields];
  if (!displayFields.includes("observaciones")) {
    displayFields.push("observaciones");
  }
  if (!displayFields.includes("recordatorio_fecha")) {
    displayFields.push("recordatorio_fecha");
  }
  if (!displayFields.includes("recordatorio_texto")) {
    displayFields.push("recordatorio_texto");
  }

  return (
    <div className="excel-grid-editor animate-in">
      <div className="excel-editor-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
        <div>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            ✍️ Editor Manual de Prospectos
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Rellena la cuadrícula tipo Excel. Los cambios se guardarán directo en la sede: <strong style={{ color: "var(--primary)" }}>{activeAgenda?.name || "Ninguna"}</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn-secondary" onClick={addRow} disabled={loading} style={{ padding: "8px 12px", fontSize: "0.85rem" }}>
            ➕ Añadir Fila
          </button>
          <button className="btn-secondary" onClick={clearAll} disabled={loading} style={{ padding: "8px 12px", fontSize: "0.85rem", color: "#f87171" }}>
            🧹 Limpiar Todo
          </button>
        </div>
      </div>

      {feedback && (
        <div style={{
          padding: "10px 15px",
          borderRadius: "8px",
          marginBottom: "15px",
          fontSize: "0.9rem",
          fontWeight: "500",
          backgroundColor: feedback.type === "error" ? "rgba(239, 68, 68, 0.1)" : feedback.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(59, 130, 246, 0.1)",
          color: feedback.type === "error" ? "#f87171" : feedback.type === "success" ? "#34d399" : "#60a5fa",
          border: `1px solid ${feedback.type === "error" ? "rgba(239, 68, 68, 0.2)" : feedback.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)"}`
        }}>
          {feedback.message}
        </div>
      )}

      <div className="table-responsive" style={{
        overflowX: "auto",
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "12px",
        marginBottom: "20px"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1000px" }}>
          <thead>
            <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid var(--glass-border)" }}>
              <th style={{ padding: "10px", width: "40px", textAlign: "center" }}>#</th>
              {displayFields.map(field => (
                <th key={field} style={{ padding: "10px", textAlign: "left", width: getColumnWidth(field) }}>
                  {getColumnLabel(field)}
                </th>
              ))}
              <th style={{ padding: "10px", width: "50px", textAlign: "center" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} className="table-row-hover" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                <td style={{ padding: "8px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {idx + 1}
                </td>
                {displayFields.map(field => (
                  <td key={field} style={{ padding: "4px" }}>
                    <input
                      type={getColumnInputType(field)}
                      value={row[field] || ""}
                      onChange={e => handleCellChange(row.id, field, e.target.value)}
                      placeholder={getColumnPlaceholder(field)}
                      className="grid-input"
                    />
                  </td>
                ))}
                <td style={{ padding: "4px", textAlign: "center" }}>
                  <button
                    onClick={() => removeRow(row.id)}
                    style={{
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#f87171",
                      border: "none",
                      width: "28px",
                      height: "28px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.85rem",
                      margin: "0 auto",
                      transition: "transform 0.1s"
                    }}
                    title="Eliminar fila"
                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button
          className="btn-process"
          onClick={handleSave}
          disabled={loading}
          style={{ padding: "10px 24px", minWidth: "150px" }}
        >
          {loading ? "🤖 Guardando..." : "💾 Guardar en Tablero"}
        </button>
      </div>

      <style>{`
        .grid-input {
          width: 100%;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          padding: 8px 10px;
          color: var(--text-main);
          font-size: 0.9rem;
          outline: none;
          transition: all 0.15s ease;
        }
        .grid-input:focus {
          background: rgba(255, 255, 255, 0.02);
          border-color: var(--primary);
          box-shadow: 0 0 0 1px var(--primary);
        }
        .table-row-hover:hover {
          background: rgba(255, 255, 255, 0.01);
        }
      `}</style>
      <ConfirmModal 
        {...confirmModal} 
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
      />
    </div>
  );
}
