import pandas as pd
from pathlib import Path

RAW_PATH = Path("data/raw")
OUTPUT_PATH = Path("data/output")

COLUMNAS_REQUERIDAS = {"nombre", "fecha", "servicios"}

# Mapeo de sinónimos para detectar columnas automáticamente
SINONIMOS = {
    "nombre": ["paciente", "nombre", "cliente", "usuario", "nombre_completo", "nombre_y_apellido"],
    "fecha": ["fecha", "dia", "fec", "fecha_de_atencion", "fecha_atencion"],
    "servicios": ["concepto", "servicio", "servicios", "procedimiento", "descripcion"]
}


def detectar_columnas(columnas_reales):
    mapping = {}
    for req, sinonimos in SINONIMOS.items():
        for col in columnas_reales:
            if col in sinonimos or any(s in col for s in sinonimos):
                mapping[req] = col
                break
    return mapping


def analizar_archivos():
    """Analiza los archivos en RAW_PATH y devuelve sus nombres, hojas y columnas."""
    archivos = list(RAW_PATH.glob("*.xlsx")) + list(RAW_PATH.glob("*.xls"))
    if not archivos:
        return {"error": "No hay archivos cargados", "files": []}
    
    resultado = []
    for archivo in archivos:
        try:
            excel = pd.ExcelFile(archivo)
            file_info = {
                "filename": archivo.name,
                "sheets": []
            }
            for sheet_name in excel.sheet_names:
                try:
                    df_cols = pd.read_excel(archivo, sheet_name=sheet_name, nrows=0)
                    file_info["sheets"].append({
                        "name": sheet_name,
                        "columns": df_cols.columns.tolist()
                    })
                except Exception as e_sheet:
                    file_info["sheets"].append({
                        "name": sheet_name,
                        "error": f"No se pudieron leer columnas: {str(e_sheet)}"
                    })
            resultado.append(file_info)
        except Exception as e:
            resultado.append({
                "filename": archivo.name,
                "error": str(e)
            })
    return {"files": resultado}


def procesar_archivos(mapeo: dict = None, unificar: bool = True, dedup_cols: list = None):
    """
    Procesa archivos unificándolos usando un mapeo manual dinámico.
    mapeo: dict { "filename": { "sheetname": { "col_destino_1": "col_excel_1", ... } } }
    unificar: bool, si es True elimina duplicados
    dedup_cols: list, lista de columnas destino para usar en la deduplicación
    """
    archivos_disponibles = {f.name: f for f in (list(RAW_PATH.glob("*.xlsx")) + list(RAW_PATH.glob("*.xls")))}

    if not archivos_disponibles:
        return {"status": "error", "error": "No hay archivos para procesar", "registros_finales": 0}

    if not mapeo:
        return {"status": "error", "error": "No se proporcionó un mapeo de columnas."}

    # Determinar qué columnas estamos unificando a partir del primer mapeo disponible
    primer_archivo = next(iter(mapeo.values()), {})
    if not primer_archivo:
        return {"status": "error", "error": "Mapeo vacío."}
        
    primera_hoja = next(iter(primer_archivo.values()), {})
    columnas_destino = list(primera_hoja.keys())

    dfs = []
    errores = []

    for filename, hojas_mapping in mapeo.items():
        if filename not in archivos_disponibles:
            errores.append(f"Archivo no encontrado: {filename}")
            continue
            
        archivo_path = archivos_disponibles[filename]
        try:
            for hoja, columnas_mapping in hojas_mapping.items():
                try:
                    # Validar que todas las columnas destino tengan un mapeo
                    # Permitimos mapeos vacíos (None o "")
                    
                    # Leer el excel
                    df = pd.read_excel(archivo_path, sheet_name=hoja)
                    
                    # Renombrar según el mapeo: {col_excel: col_sistema}
                    # Invertimos el mapping: mapeo[destino] = excel -> mapping[excel] = destino
                    rename_map = {excel_col: dest_col for dest_col, excel_col in columnas_mapping.items() if excel_col}
                    df = df.rename(columns=rename_map)
                    
                    # Seleccionar solo las columnas mapeadas y presentes
                    present_cols = [c for c in columnas_destino if c in df.columns]
                    df = df[present_cols].copy()
                    
                    # Asegurar que todas las columnas destino existan (pueden venir vacías si no se mapearon)
                    for col in columnas_destino:
                        if col not in df.columns:
                            df[col] = ""

                    df = df.dropna(how="all")
                    
                    if df.empty: continue

                    df["ciudad"] = str(hoja).strip()
                    df["origen_archivo"] = Path(filename).stem
                    
                    # Limpieza estándar
                    for col in columnas_destino:
                        if col.lower() == "fecha":
                            df[col] = pd.to_datetime(df[col], errors="coerce")
                        else:
                            df[col] = df[col].apply(lambda x: str(x).strip() if pd.notnull(x) and str(x).strip().lower() != "nan" else "")
                    
                    # Filtrar filas vacías (solo si TODOS los campos mapeados están vacíos)
                    if columnas_destino:
                        df = df[df[columnas_destino].replace("", pd.NA).notnull().any(axis=1)]
                    
                    # Si hay columna fecha, eliminar nulas
                    if "fecha" in columnas_destino:
                        df = df.dropna(subset=["fecha"])

                    if not df.empty:
                        dfs.append(df)
                    
                except Exception as e:
                    errores.append(f"Error en '{filename}' [{hoja}]: {str(e)}")
                    
        except Exception as e:
            errores.append(f"Error leyendo '{filename}': {str(e)}")

    if not dfs:
        return {
            "status": "error",
            "error": "No se pudo procesar ningún dato válido.",
            "advertencias": errores,
            "registros_finales": 0
        }

    df_total = pd.concat(dfs, ignore_index=True)
    
    # Eliminación de duplicados opcional
    if unificar:
        if dedup_cols and len(dedup_cols) > 0:
            # Usar solo las columnas seleccionadas por el usuario
            subset_cols = [c for c in dedup_cols if c in df_total.columns]
            if subset_cols:
                df_total = df_total.drop_duplicates(subset=subset_cols, keep="last")
        else:
            # Comportamiento por defecto: usar todas las columnas de destino + ciudad
            subset_cols = columnas_destino + ["ciudad"]
            df_total = df_total.drop_duplicates(subset=subset_cols, keep="last")

    OUTPUT_PATH.mkdir(exist_ok=True, parents=True)
    output_file = OUTPUT_PATH / "audiencia.csv"
    df_total.to_csv(output_file, index=False, encoding="utf-8-sig")

    return {
        "status": "success" if not errores else "partial_success",
        "registros_finales": len(df_total),
        "archivo": str(output_file),
        "advertencias": errores,
        "data_preview": df_total.head(200).fillna("").to_dict(orient="records"),
        "columnas_reportadas": columnas_destino + ["ciudad", "origen_archivo"]
    }
