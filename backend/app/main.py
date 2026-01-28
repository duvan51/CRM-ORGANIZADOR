from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import shutil

from app.etl import analizar_archivos, procesar_archivos

app = FastAPI()

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RAW_PATH = Path("data/raw")
RAW_PATH.mkdir(parents=True, exist_ok=True)

@app.post("/upload")
async def upload_files(files: list[UploadFile] = File(...), append: bool = False):
    try:
        # Limpiar archivos previos solo si no es una carga incremental
        if not append:
            for old_file in RAW_PATH.glob("*"):
                try:
                    if old_file.is_file():
                        old_file.unlink()
                except Exception as e:
                    print(f"No se pudo eliminar {old_file}: {e}")

        for file in files:
            if not file.filename:
                continue
            file_path = RAW_PATH / file.filename
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        # Devolver el análisis de las hojas encontradas
        return analizar_archivos()
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(error_trace)
        return {"status": "error", "error": str(e), "traceback": error_trace}

@app.post("/clear")
async def clear_files():
    try:
        for old_file in RAW_PATH.glob("*"):
            if old_file.is_file():
                old_file.unlink()
        return {"status": "success", "message": "Archivos limpiados"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

@app.post("/process")
async def process_selection(request: Request):
    try:
        data = await request.json()
        mapeo = data.get("selection")
        unificar = data.get("unificar", True) # Por defecto unifica
        dedup_cols = data.get("dedup_cols", []) # Columnas para deduplicar
        
        if not mapeo:
            return {"status": "error", "error": "No se recibió el mapeo de selección."}
            
        resultado = procesar_archivos(mapeo, unificar=unificar, dedup_cols=dedup_cols)
        return resultado
    except Exception as e:
        return {"status": "error", "error": str(e)}
