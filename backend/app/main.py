from fastapi import FastAPI, UploadFile, File, Request, WebSocket, WebSocketDisconnect
import datetime
from datetime import datetime as dt
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import shutil

from app.etl import analizar_archivos, procesar_archivos
from app.database import engine, get_db
from app import models, schemas, auth
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

# Crear tablas en la base de datos
models.Base.metadata.create_all(bind=engine)

# Función para inicializar la base de datos de forma segura
def init_db(db: Session):
    try:
        if not db.query(models.User).filter(models.User.username == "admin").first():
            print("Creando usuario superadministrador inicial...")
            hashed_pw = auth.get_password_hash("admin123")
            db_user = models.User(
                username="admin", 
                hashed_password=hashed_pw, 
                full_name="Super Administrador",
                role="superuser"
            )
            db.add(db_user)
            db.commit()
            print("Usuario 'admin' creado exitosamente.")
    except Exception as e:
        print(f"Error al inicializar la base de datos: {e}")

# Inyectar dtypes faltantes en main.py
# Gestión de WebSockets para tiempo real
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        print(f"NUEVA CONEXIÓN WEBSOCKET: {websocket.client}")
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                # Si una conexión falla, simplemente la ignoramos (se limpiará al desconectar)
                pass

manager = ConnectionManager()


app = FastAPI()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"REQUEST: {request.method} {request.url.path}")
    return await call_next(request)

@app.on_event("startup")
def startup_event():
    db = next(get_db())
    init_db(db)


# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mantener la conexión abierta esperando mensajes (opcional)
            data = await websocket.receive_text()
            # Podríamos procesar mensajes entrantes aquí si fuera necesario
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    from fastapi.responses import JSONResponse
    print(f"ERROR GLOBAL: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": traceback.format_exc()}
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
        # Notificar cambio en CRM/Datos
        await manager.broadcast({"type": "REFRESH_CRM", "data": resultado})
        return resultado
    except Exception as e:
        return {"status": "error", "error": str(e)}

# --- Usuarios y Permisos ---

@app.get("/users", response_model=list[schemas.User])
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    return db.query(models.User).all()

@app.post("/users", response_model=schemas.User)
async def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    hashed_pw = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_pw, full_name=user.full_name, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    await manager.broadcast({"type": "REFRESH_USERS"})
    return db_user

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="Permiso denegado")
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user: raise HTTPException(status_code=404)
    if db_user.username == "admin": raise HTTPException(status_code=400, detail="No se puede eliminar al admin principal")
    db.delete(db_user)
    db.commit()
    await manager.broadcast({"type": "REFRESH_USERS"})
    return {"status": "success"}

# --- Agendas (Administración) ---

@app.get("/agendas", response_model=list[schemas.Agenda])
def list_agendas(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role == "superuser":
        return db.query(models.Agenda).all()
    return current_user.agendas

@app.post("/agendas", response_model=schemas.Agenda)
async def create_agenda(agenda: schemas.AgendaCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="Solo el superusuario puede crear agendas")
    db_agenda = models.Agenda(**agenda.dict())
    db.add(db_agenda)
    db.commit()
    db.refresh(db_agenda)
    await manager.broadcast({"type": "REFRESH_AGENDAS"})
    return db_agenda

@app.put("/agendas/{agenda_id}", response_model=schemas.Agenda)
async def update_agenda(agenda_id: int, agenda: schemas.AgendaCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="Permiso denegado")
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda: raise HTTPException(status_code=404)
    db_agenda.name = agenda.name
    db_agenda.description = agenda.description
    db_agenda.slots_per_hour = agenda.slots_per_hour
    db.commit()
    db.refresh(db_agenda)
    await manager.broadcast({"type": "REFRESH_AGENDAS"})
    return db_agenda

@app.delete("/agendas/{agenda_id}")
async def delete_agenda(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="Permiso denegado")
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    if not db_agenda: raise HTTPException(status_code=404)
    db.delete(db_agenda)
    db.commit()
    await manager.broadcast({"type": "REFRESH_AGENDAS"})
    return {"status": "success"}

@app.post("/agendas/{agenda_id}/assign/{user_id}")
async def assign_user_to_agenda(agenda_id: int, user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_agenda or not db_user:
        raise HTTPException(status_code=404, detail="Agenda o Usuario no encontrado")
    if db_agenda not in db_user.agendas:
        db_user.agendas.append(db_agenda)
        db.commit()
        await manager.broadcast({"type": "REFRESH_USERS"})
        await manager.broadcast({"type": "REFRESH_AGENDAS"})
    return {"status": "success"}

@app.delete("/agendas/{agenda_id}/unassign/{user_id}")
async def unassign_user_from_agenda(agenda_id: int, user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_agenda or not db_user:
        raise HTTPException(status_code=404, detail="Agenda o Usuario no encontrado")
    if db_agenda in db_user.agendas:
        db_user.agendas.remove(db_agenda)
        db.commit()
        await manager.broadcast({"type": "REFRESH_USERS"})
        await manager.broadcast({"type": "REFRESH_AGENDAS"})
    return {"status": "success"}

# --- Bloqueos (Indisponibilidad) ---

@app.get("/agendas/{agenda_id}/bloqueos", response_model=list[schemas.Bloqueo])
def list_bloqueos(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso (superuser o admin/agente asignado)
    if current_user.role != "superuser" and not any(a.id == agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin acceso a esta agenda")
    return db.query(models.Bloqueo).filter(models.Bloqueo.agenda_id == agenda_id).all()


@app.post("/bloqueos", response_model=schemas.Bloqueo)
async def create_bloqueo(bloqueo: schemas.BloqueoBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role not in ["superuser", "admin"]:
        raise HTTPException(status_code=403, detail="Solo admins pueden bloquear horarios")
    db_bloqueo = models.Bloqueo(**bloqueo.dict())
    db.add(db_bloqueo)
    db.commit()
    db.refresh(db_bloqueo)
    await manager.broadcast({"type": "REFRESH_BLOQUEOS", "agenda_id": db_bloqueo.agenda_id})
    return db_bloqueo

@app.delete("/bloqueos/{bloqueo_id}")
async def delete_bloqueo(bloqueo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_bloqueo = db.query(models.Bloqueo).filter(models.Bloqueo.id == bloqueo_id).first()
    if not db_bloqueo: raise HTTPException(status_code=404)
    agenda_id = db_bloqueo.agenda_id
    db.delete(db_bloqueo)
    db.commit()
    await manager.broadcast({"type": "REFRESH_BLOQUEOS", "agenda_id": agenda_id})
    return {"status": "success"}

# --- Alertas ---

@app.get("/agendas/{agenda_id}/alertas", response_model=list[schemas.Alerta])
def list_alertas(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso
    if current_user.role != "superuser" and not any(a.id == agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin acceso a esta agenda")
    return db.query(models.Alerta).filter(models.Alerta.agenda_id == agenda_id, models.Alerta.activa == 1).all()


@app.post("/alertas", response_model=schemas.Alerta)
async def create_alerta(alerta: schemas.AlertaBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso
    if current_user.role != "superuser" and not any(a.id == alerta.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin acceso a esta agenda")
    
    db_alerta = models.Alerta(**alerta.dict())
    db.add(db_alerta)
    db.commit()
    db.refresh(db_alerta)
    await manager.broadcast({"type": "REFRESH_ALERTAS", "agenda_id": db_alerta.agenda_id})
    return db_alerta

@app.delete("/alertas/{alerta_id}")
async def delete_alerta(alerta_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    alerta = db.query(models.Alerta).filter(models.Alerta.id == alerta_id).first()
    if not alerta: raise HTTPException(status_code=404, detail="No encontrada")
    agenda_id = alerta.agenda_id
    db.delete(alerta); db.commit()
    await manager.broadcast({"type": "REFRESH_ALERTAS", "agenda_id": agenda_id})
    return {"status": "ok"}

# --- Horarios de Atención ---
@app.post("/horarios", response_model=schemas.HorarioAtencion)
async def create_horario(horario: schemas.HorarioAtencionBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser" and not any(a.id == horario.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    db_horario = models.HorarioAtencion(**horario.model_dump())
    db.add(db_horario); db.commit(); db.refresh(db_horario)
    await manager.broadcast({"type": "REFRESH_HORARIOS", "agenda_id": db_horario.agenda_id})
    return db_horario

@app.get("/agendas/{agenda_id}/horarios", response_model=list[schemas.HorarioAtencion])
def list_horarios(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.HorarioAtencion).filter(models.HorarioAtencion.agenda_id == agenda_id).all()
@app.delete("/horarios/{horario_id}")
async def delete_horario(horario_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_h = db.query(models.HorarioAtencion).filter(models.HorarioAtencion.id == horario_id).first()
    if not db_h: raise HTTPException(status_code=404)
    if current_user.role != "superuser" and not any(a.id == db_h.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    agenda_id = db_h.agenda_id
    db.delete(db_h); db.commit()
    await manager.broadcast({"type": "REFRESH_HORARIOS", "agenda_id": agenda_id})
    return {"status": "ok"}

# --- Configuración de Servicios ---
@app.post("/config-servicios", response_model=schemas.ConfigServicio)
async def create_config_servicio(config: schemas.ConfigServicioBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser" and not any(a.id == config.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    db_config = models.ConfigServicio(**config.model_dump())
    db.add(db_config); db.commit(); db.refresh(db_config)
    await manager.broadcast({"type": "REFRESH_CONFIGS", "agenda_id": db_config.agenda_id})
    return db_config

@app.get("/agendas/{agenda_id}/config-servicios", response_model=list[schemas.ConfigServicio])
def list_config_servicios(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.ConfigServicio).filter(models.ConfigServicio.agenda_id == agenda_id).all()


# --- Servicios Globales (Catálogo Maestro) ---

@app.get("/global-services", response_model=List[schemas.GlobalService])
def list_global_services(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.GlobalService).all()

@app.post("/global-services", response_model=schemas.GlobalService)
async def create_global_service(service: schemas.GlobalServiceCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    # Extraer campos de asignación antes de crear el objeto DB
    assign_ids = service.assign_to_agendas
    data = service.dict()
    data.pop("assign_to_agendas", None)
    
    db_service = models.GlobalService(**data)
    db.add(db_service); db.commit(); db.refresh(db_service)

    # Si se solicitó asignar a agendas
    if assign_ids:
        # Si assign_ids contiene -1, es "todas las agendas"
        final_ids = []
        if -1 in assign_ids:
            final_ids = [a.id for a in db.query(models.Agenda).all()]
        else:
            final_ids = assign_ids
        
        for aid in final_ids:
            # Evitar duplicados
            exists = db.query(models.AgendaService).filter(
                models.AgendaService.agenda_id == aid, 
                models.AgendaService.service_id == db_service.id
            ).first()
            if not exists:
                db_assignment = models.AgendaService(
                    agenda_id=aid,
                    service_id=db_service.id,
                    precio_final=db_service.precio_base
                )
                db.add(db_assignment)
        db.commit()

    await manager.broadcast({"type": "REFRESH_GLOBAL_SERVICES"})
    await manager.broadcast({"type": "REFRESH_AGENDA_SERVICES"})
    return db_service

# --- Servicios por Agenda (Asignación y Descuentos) ---

@app.get("/agendas/{agenda_id}/services", response_model=List[schemas.AgendaService])
def list_agenda_services(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.AgendaService).filter(models.AgendaService.agenda_id == agenda_id).all()

@app.post("/agenda-services", response_model=schemas.AgendaService)
async def assign_service_to_agenda(assignment: schemas.AgendaServiceBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Validar permisos
    if current_user.role != "superuser" and not any(a.id == assignment.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    # Obtener el servicio global para calcular precio final si no se envía
    service_global = db.query(models.GlobalService).filter(models.GlobalService.id == assignment.service_id).first()
    if not service_global:
        raise HTTPException(status_code=404, detail="Servicio global no encontrado")
    
    price_final = assignment.precio_final
    if price_final == 0 and assignment.descuento_porcentaje > 0:
        price_final = service_global.precio_base * (1 - (assignment.descuento_porcentaje / 100))
    elif price_final == 0:
        price_final = service_global.precio_base

    db_assignment = models.AgendaService(
        agenda_id=assignment.agenda_id,
        service_id=assignment.service_id,
        descuento_porcentaje=assignment.descuento_porcentaje,
        precio_final=price_final,
        activo=assignment.activo
    )
    db.add(db_assignment); db.commit(); db.refresh(db_assignment)
    await manager.broadcast({"type": "REFRESH_AGENDA_SERVICES", "agenda_id": db_assignment.agenda_id})
    return db_assignment

@app.put("/agenda-services/{id}", response_model=schemas.AgendaService)
async def update_agenda_service(id: int, update: schemas.AgendaServiceUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_assignment = db.query(models.AgendaService).filter(models.AgendaService.id == id).first()
    if not db_assignment: raise HTTPException(status_code=404)
    
    # Validar permisos
    if current_user.role != "superuser" and not any(a.id == db_assignment.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    if update.descuento_porcentaje is not None:
        db_assignment.descuento_porcentaje = update.descuento_porcentaje
        # Recalcular precio final si se cambia descuento
        service_global = db.query(models.GlobalService).filter(models.GlobalService.id == db_assignment.service_id).first()
        db_assignment.precio_final = service_global.precio_base * (1 - (update.descuento_porcentaje / 100))
    
    if update.precio_final is not None:
        db_assignment.precio_final = update.precio_final
    
    if update.activo is not None:
        db_assignment.activo = update.activo
        
    db.commit(); db.refresh(db_assignment)
    await manager.broadcast({"type": "REFRESH_AGENDA_SERVICES", "agenda_id": db_assignment.agenda_id})
    return db_assignment

@app.delete("/agenda-services/{id}")
async def delete_agenda_service(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_assignment = db.query(models.AgendaService).filter(models.AgendaService.id == id).first()
    if not db_assignment: raise HTTPException(status_code=404)
    
    # Validar permisos
    if current_user.role != "superuser" and not any(a.id == db_assignment.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
        
    agenda_id = db_assignment.agenda_id
    db.delete(db_assignment); db.commit()
    await manager.broadcast({"type": "REFRESH_AGENDA_SERVICES", "agenda_id": agenda_id})
    return {"status": "ok"}

@app.delete("/agendas/{agenda_id}/horarios/dia/{dia_semana}")
async def clear_day_horarios(agenda_id: int, dia_semana: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser" and not any(a.id == agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    db.query(models.HorarioAtencion).filter(
        models.HorarioAtencion.agenda_id == agenda_id,
        models.HorarioAtencion.dia_semana == dia_semana
    ).delete()
    db.commit()
    await manager.broadcast({"type": "REFRESH_HORARIOS", "agenda_id": agenda_id})
    return {"status": "ok"}
    await manager.broadcast({"type": "REFRESH_HORARIOS", "agenda_id": agenda_id})
    return {"status": "ok"}

# --- Horarios Específicos por Servicio ---

@app.get("/agendas/{agenda_id}/horarios-servicios", response_model=List[schemas.HorarioServicio])
def list_horarios_servicios(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.HorarioServicio).filter(models.HorarioServicio.agenda_id == agenda_id).all()

@app.post("/horarios-servicios", response_model=schemas.HorarioServicio)
async def create_horario_servicio(horario: schemas.HorarioServicioBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser" and not any(a.id == horario.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    db_hs = models.HorarioServicio(**horario.dict())
    db.add(db_hs); db.commit(); db.refresh(db_hs)
    return db_hs

@app.delete("/horarios-servicios/{id}")
async def delete_horario_servicio(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_hs = db.query(models.HorarioServicio).filter(models.HorarioServicio.id == id).first()
    if not db_hs: raise HTTPException(status_code=404)
    
    if current_user.role != "superuser" and not any(a.id == db_hs.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
        
    db.delete(db_hs); db.commit()
    return {"status": "ok"}

@app.put("/global-services/{service_id}", response_model=schemas.GlobalService)
async def update_global_service(service_id: int, service: schemas.GlobalServiceCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    db_service = db.query(models.GlobalService).filter(models.GlobalService.id == service_id).first()
    if not db_service: raise HTTPException(status_code=404)
    
    db_service.nombre = service.nombre
    db_service.precio_base = service.precio_base
    db_service.duracion_minutos = service.duracion_minutos
    db_service.concurrency = service.concurrency
    db_service.color = service.color
    
    db.commit(); db.refresh(db_service)
    await manager.broadcast({"type": "REFRESH_GLOBAL_SERVICES"})
    return db_service

@app.get("/citas/{agenda_id}", response_model=list[schemas.Cita])

def read_citas(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso a la agenda
    if current_user.role != "superuser":
        if not any(a.id == agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")
    
    return db.query(models.Cita).filter(models.Cita.agenda_id == agenda_id).all()

@app.post("/citas", response_model=schemas.Cita)
async def create_cita(cita: schemas.CitaCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # 1. Verificar acceso
    if current_user.role != "superuser":
        if not any(a.id == cita.agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")
    
    # 2. Verificar Habilitaciones (Excepciones de apertura - tipo 2)
    habilitaciones = db.query(models.Bloqueo).filter(
        models.Bloqueo.agenda_id == cita.agenda_id,
        models.Bloqueo.tipo == 2, # Habilitación
        models.Bloqueo.fecha_inicio <= cita.fecha,
        models.Bloqueo.fecha_fin >= cita.fecha
    ).all()
    
    tiene_habilitacion = False
    for h in habilitaciones:
        aplica_a_cita = False
        if h.service_id:
            svc = db.query(models.GlobalService).filter(models.GlobalService.id == h.service_id).first()
            if svc and svc.nombre == cita.tipo_servicio: aplica_a_cita = True
        else: aplica_a_cita = True

        if aplica_a_cita:
            if h.es_todo_el_dia: tiene_habilitacion = True
            elif h.hora_inicio and h.hora_fin and h.hora_inicio <= cita.hora <= h.hora_fin:
                tiene_habilitacion = True
        if tiene_habilitacion: break

    # 3. Solo si NO tiene una habilitación explícita, verificamos Horarios y Bloqueos
    if not tiene_habilitacion:
        # 3a. Verificar Horario de Atención Regular
        fecha_dt = datetime.datetime.strptime(cita.fecha, "%Y-%m-%d")
        dia_semana = (fecha_dt.weekday()) # 0=Lunes, 6=Domingo
        
        horarios = db.query(models.HorarioAtencion).filter(
            models.HorarioAtencion.agenda_id == cita.agenda_id,
            models.HorarioAtencion.dia_semana == dia_semana
        ).all()
        
        if not horarios:
            raise HTTPException(status_code=400, detail=f"La agenda no atiende los días {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][dia_semana]}")
        
        en_rango = False
        for hr in horarios:
            if hr.hora_inicio <= cita.hora <= hr.hora_fin:
                en_rango = True
                break
        if not en_rango:
            raise HTTPException(status_code=400, detail=f"La hora {cita.hora} está fuera del horario de atención para este día")

        # 3a-2. Verificar Horario Específico del Servicio (Si existe)
        if cita.tipo_servicio:
            svc_global = db.query(models.GlobalService).filter(models.GlobalService.nombre == cita.tipo_servicio).first()
            if svc_global:
                horarios_servicio = db.query(models.HorarioServicio).filter(
                    models.HorarioServicio.agenda_id == cita.agenda_id,
                    models.HorarioServicio.service_id == svc_global.id,
                    models.HorarioServicio.dia_semana == dia_semana
                ).all()
                
                # Si hay horarios específicos definidos para este servicio en este día, DEBE cumplir uno de ellos
                if horarios_servicio:
                    en_rango_servicio = False
                    for hs in horarios_servicio:
                        if hs.hora_inicio <= cita.hora <= hs.hora_fin:
                            en_rango_servicio = True
                            break
                    if not en_rango_servicio:
                        raise HTTPException(status_code=400, detail=f"El servicio '{cita.tipo_servicio}' no está disponible a las {cita.hora} los {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][dia_semana]}")

        # 3b. Verificar Bloqueos (tipo 1)
        bloqueos = db.query(models.Bloqueo).filter(
            models.Bloqueo.agenda_id == cita.agenda_id,
            models.Bloqueo.tipo == 1, # Bloqueo
            models.Bloqueo.fecha_inicio <= cita.fecha,
            models.Bloqueo.fecha_fin >= cita.fecha
        ).all()
        
        for b in bloqueos:
            bloqueo_aplica_a_cita = False
            if b.service_id:
                svc_bloqueado = db.query(models.GlobalService).filter(models.GlobalService.id == b.service_id).first()
                if svc_bloqueado and svc_bloqueado.nombre == cita.tipo_servicio:
                    bloqueo_aplica_a_cita = True
            else:
                bloqueo_aplica_a_cita = True

            if bloqueo_aplica_a_cita:
                if b.es_todo_el_dia:
                    raise HTTPException(status_code=400, detail=f"El día (o el servicio '{cita.tipo_servicio}') está bloqueado")
                if b.hora_inicio and b.hora_fin:
                    if b.hora_inicio <= cita.hora <= b.hora_fin:
                        raise HTTPException(status_code=400, detail=f"El horario {cita.hora} está bloqueado para {cita.tipo_servicio if b.service_id else 'todo el sistema'}")

    # 4. Verificar Capacidad Global (slots_per_hour de la agenda)
    agenda = db.query(models.Agenda).filter(models.Agenda.id == cita.agenda_id).first()
    citas_existentes_total = db.query(models.Cita).filter(
        models.Cita.agenda_id == cita.agenda_id,
        models.Cita.fecha == cita.fecha,
        models.Cita.hora == cita.hora
    ).count()
    
    if citas_existentes_total >= agenda.slots_per_hour:
        raise HTTPException(status_code=400, detail=f"No hay cupos generales disponibles para las {cita.hora}. Máximo {agenda.slots_per_hour} personas.")

    # 5. Verificar Concurrencia por Servicio Específico
    servicio_global = db.query(models.GlobalService).filter(models.GlobalService.nombre == cita.tipo_servicio).first()
    if servicio_global:
        citas_mismo_servicio = db.query(models.Cita).filter(
            models.Cita.agenda_id == cita.agenda_id,
            models.Cita.fecha == cita.fecha,
            models.Cita.hora == cita.hora,
            models.Cita.tipo_servicio == cita.tipo_servicio
        ).count()
        if citas_mismo_servicio >= servicio_global.concurrency:
            raise HTTPException(status_code=400, detail=f"Límite alcanzado para el servicio '{cita.tipo_servicio}'. Máximo {servicio_global.concurrency} simultáneos.")

    db_cita = models.Cita(**cita.dict())
    db.add(db_cita)
    db.commit()
    db.refresh(db_cita)
    await manager.broadcast({"type": "REFRESH_CITAS", "agenda_id": db_cita.agenda_id})
    return db_cita


@app.get("/citas/pending-confirmations/all", response_model=list[dict])
def get_pending_confirmations(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # 1. Obtener mapa de agendas {id: nombre} a las que tiene acceso
    if current_user.role == "superuser":
        all_agendas = db.query(models.Agenda).all()
        agenda_map = {a.id: a.name for a in all_agendas}
    else:
        agenda_map = {a.id: a.name for a in current_user.agendas}
    
    agenda_ids = list(agenda_map.keys())
    
    # 2. Buscar citas
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    
    citas = db.query(models.Cita).filter(
        models.Cita.agenda_id.in_(agenda_ids),
        models.Cita.fecha >= today
    ).all()

    result = []
    today_date = datetime.datetime.now().date()

    for c in citas:
        try:
            # Calcular días restantes
            c_date = datetime.datetime.strptime(c.fecha, "%Y-%m-%d").date()
            days_until = (c_date - today_date).days
            
            result.append({
                "id": c.id,
                "agenda_id": c.agenda_id,
                "agenda_nombre": agenda_map.get(c.agenda_id, "Agenda Desconocida"),
                "fecha": c.fecha,
                "hora": c.hora,
                "nombres_completos": c.nombres_completos,
                "celular": c.celular,
                "tipo_servicio": c.tipo_servicio,
                "confirmacion": c.confirmacion,
                "days_until": days_until
            })
        except Exception as e:
            print(f"Error procesando cita {c.id}: {e}")
            continue
        
    return result


@app.get("/stats/agent-sales")
def get_agent_sales_stats(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # 1. Definir rango de fechas (Mes actual)
    today = datetime.datetime.now()
    start_of_month = today.replace(day=1).strftime("%Y-%m-%d")
    
    # 2. Filtrar citas del agente "Confirmadas" en este mes
    # El frontend manda user.full_name || user.username como vendedor. Verificamos ambos por si acaso.
    citas = db.query(models.Cita).filter(
        (models.Cita.vendedor == current_user.username) | (models.Cita.vendedor == current_user.full_name),
        models.Cita.fecha >= start_of_month,
        models.Cita.confirmacion == "Confirmada"
    ).all()
    
    total_sales = 0
    count = 0
    
    # Cache para precios de servicios para no hacer query por cada cita
    # Map: (agenda_id, service_name) -> price
    price_cache = {}

    for c in citas:
        price = 0
        cache_key = (c.agenda_id, c.tipo_servicio)
        
        if cache_key in price_cache:
            price = price_cache[cache_key]
        else:
            # Buscar precio
            # A. Buscar GlobalService por nombre para obtener ID
            g_svc = db.query(models.GlobalService).filter(models.GlobalService.nombre == c.tipo_servicio).first()
            if g_svc:
                # B. Buscar AgendaService (precio específico)
                a_svc = db.query(models.AgendaService).filter(
                    models.AgendaService.agenda_id == c.agenda_id,
                    models.AgendaService.service_id == g_svc.id
                ).first()
                if a_svc:
                    price = a_svc.precio_final
                else:
                    price = g_svc.precio_base
                
                price_cache[cache_key] = price
            else:
                price_cache[cache_key] = 0 # No encontrado

        total_sales += price
        count += 1
        
    return {"total": total_sales, "count": count, "month": today.strftime("%B")}

@app.put("/citas/{cita_id}", response_model=schemas.Cita)
async def update_cita(cita_id: int, cita_update: schemas.CitaUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_cita = db.query(models.Cita).filter(models.Cita.id == cita_id).first()
    if not db_cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # 1. Verificar acceso
    if current_user.role != "superuser":
        if not any(a.id == db_cita.agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")

    # 2. Actualizar campos
    update_data = cita_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cita, key, value)

    # 3. Validaciones de concurrencia (Opcional: podrías repetir las validaciones de create_cita aquí)
    # Por ahora permitimos la edición directa confiando en la validación del frontend y los límites previos.

    db.commit()
    db.refresh(db_cita)
    await manager.broadcast({"type": "REFRESH_CITAS", "agenda_id": db_cita.agenda_id})
    return db_cita


@app.delete("/citas/{cita_id}")
async def delete_cita(cita_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_cita = db.query(models.Cita).filter(models.Cita.id == cita_id).first()
    if not db_cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Restricción de tiempo: Agentes no pueden borrar citas pasadas
    if current_user.role not in ["superuser", "admin"]:
        try:
            cita_dt = dt.strptime(f"{db_cita.fecha} {db_cita.hora}", "%Y-%m-%d %H:%M")
            if cita_dt < dt.now():
                raise HTTPException(status_code=403, detail="No puedes eliminar citas pasadas. Contacta a un administrador.")
        except:
            pass

    if current_user.role != "superuser":
        if not any(a.id == db_cita.agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")
            
    agenda_id = db_cita.agenda_id
    db.delete(db_cita)
    db.commit()
    await manager.broadcast({"type": "REFRESH_CITAS", "agenda_id": agenda_id})
    return {"status": "success"}

# --- Autenticación ---

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


