from fastapi import FastAPI, UploadFile, File, Request
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
from typing import List


app = FastAPI()

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
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    hashed_pw = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_pw, full_name=user.full_name, role=user.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Agendas (Administración) ---

@app.get("/agendas", response_model=list[schemas.Agenda])
def list_agendas(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role == "superuser":
        return db.query(models.Agenda).all()
    return current_user.agendas

@app.post("/agendas", response_model=schemas.Agenda)
def create_agenda(agenda: schemas.AgendaCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="Solo el superusuario puede crear agendas")
    db_agenda = models.Agenda(**agenda.dict())
    db.add(db_agenda)
    db.commit()
    db.refresh(db_agenda)
    return db_agenda

@app.post("/agendas/{agenda_id}/assign/{user_id}")
def assign_user_to_agenda(agenda_id: int, user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    db_agenda = db.query(models.Agenda).filter(models.Agenda.id == agenda_id).first()
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_agenda or not db_user:
        raise HTTPException(status_code=404, detail="Agenda o Usuario no encontrado")
    if db_agenda not in db_user.agendas:
        db_user.agendas.append(db_agenda)
        db.commit()
    return {"status": "success"}

# --- Bloqueos (Indisponibilidad) ---

@app.get("/agendas/{agenda_id}/bloqueos", response_model=list[schemas.Bloqueo])
def list_bloqueos(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso (superuser o admin/agente asignado)
    if current_user.role != "superuser" and not any(a.id == agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin acceso a esta agenda")
    return db.query(models.Bloqueo).filter(models.Bloqueo.agenda_id == agenda_id).all()


@app.post("/bloqueos", response_model=schemas.Bloqueo)
def create_bloqueo(bloqueo: schemas.BloqueoBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role not in ["superuser", "admin"]:
        raise HTTPException(status_code=403, detail="Solo admins pueden bloquear horarios")
    db_bloqueo = models.Bloqueo(**bloqueo.dict())
    db.add(db_bloqueo)
    db.commit()
    db.refresh(db_bloqueo)
    return db_bloqueo

@app.delete("/bloqueos/{bloqueo_id}")
def delete_bloqueo(bloqueo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_bloqueo = db.query(models.Bloqueo).filter(models.Bloqueo.id == bloqueo_id).first()
    if not db_bloqueo: raise HTTPException(status_code=404)
    db.delete(db_bloqueo)
    db.commit()
    return {"status": "success"}

# --- Alertas ---

@app.get("/agendas/{agenda_id}/alertas", response_model=list[schemas.Alerta])
def list_alertas(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso
    if current_user.role != "superuser" and not any(a.id == agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin acceso a esta agenda")
    return db.query(models.Alerta).filter(models.Alerta.agenda_id == agenda_id, models.Alerta.activa == 1).all()


@app.post("/alertas", response_model=schemas.Alerta)
def create_alerta(alerta: schemas.AlertaBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_alerta = models.Alerta(**alerta.dict())
    db.add(db_alerta)
    db.commit()
    db.refresh(db_alerta)
    return db_alerta

@app.delete("/alertas/{alerta_id}")
def delete_alerta(alerta_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    alerta = db.query(models.Alerta).filter(models.Alerta.id == alerta_id).first()
    if not alerta: raise HTTPException(status_code=404, detail="No encontrada")
    db.delete(alerta); db.commit()
    return {"status": "ok"}

# --- Horarios de Atención ---
@app.post("/horarios", response_model=schemas.HorarioAtencion)
def create_horario(horario: schemas.HorarioAtencionBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser" and not any(a.id == horario.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    db_horario = models.HorarioAtencion(**horario.model_dump())
    db.add(db_horario); db.commit(); db.refresh(db_horario)
    return db_horario

@app.get("/agendas/{agenda_id}/horarios", response_model=list[schemas.HorarioAtencion])
def list_horarios(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.HorarioAtencion).filter(models.HorarioAtencion.agenda_id == agenda_id).all()

# --- Configuración de Servicios ---
@app.post("/config-servicios", response_model=schemas.ConfigServicio)
def create_config_servicio(config: schemas.ConfigServicioBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser" and not any(a.id == config.agenda_id for a in current_user.agendas):
        raise HTTPException(status_code=403, detail="Sin permisos")
    db_config = models.ConfigServicio(**config.model_dump())
    db.add(db_config); db.commit(); db.refresh(db_config)
    return db_config

@app.get("/agendas/{agenda_id}/config-servicios", response_model=list[schemas.ConfigServicio])
def list_config_servicios(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.ConfigServicio).filter(models.ConfigServicio.agenda_id == agenda_id).all()


# --- Servicios Globales (Catálogo Maestro) ---

@app.get("/global-services", response_model=List[schemas.GlobalService])
def list_global_services(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.GlobalService).all()

@app.post("/global-services", response_model=schemas.GlobalService)
def create_global_service(service: schemas.GlobalServiceCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "superuser":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    db_service = models.GlobalService(**service.dict())
    db.add(db_service); db.commit(); db.refresh(db_service)
    return db_service

# --- Servicios por Agenda (Asignación y Descuentos) ---

@app.get("/agendas/{agenda_id}/services", response_model=List[schemas.AgendaService])
def list_agenda_services(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.AgendaService).filter(models.AgendaService.agenda_id == agenda_id).all()

@app.post("/agenda-services", response_model=schemas.AgendaService)
def assign_service_to_agenda(assignment: schemas.AgendaServiceBase, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
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
    return db_assignment

@app.get("/citas/{agenda_id}", response_model=list[schemas.Cita])

def read_citas(agenda_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Verificar acceso a la agenda
    if current_user.role != "superuser":
        if not any(a.id == agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")
    
    return db.query(models.Cita).filter(models.Cita.agenda_id == agenda_id).all()

@app.post("/citas", response_model=schemas.Cita)
def create_cita(cita: schemas.CitaCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    # 1. Verificar acceso
    if current_user.role != "superuser":
        if not any(a.id == cita.agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")
    
    # 2. Verificar Bloqueos
    bloqueos = db.query(models.Bloqueo).filter(
        models.Bloqueo.agenda_id == cita.agenda_id,
        models.Bloqueo.fecha_inicio <= cita.fecha,
        models.Bloqueo.fecha_fin >= cita.fecha
    ).all()
    
    for b in bloqueos:
        if b.es_todo_el_dia:
            raise HTTPException(status_code=400, detail="El día está bloqueado por el administrador")
        if b.hora_inicio and b.hora_fin:
            if b.hora_inicio <= cita.hora <= b.hora_fin:
                raise HTTPException(status_code=400, detail="Este horario está bloqueado")

    # 3. Verificar Capacidad (slots_per_hour)
    agenda = db.query(models.Agenda).filter(models.Agenda.id == cita.agenda_id).first()
    citas_existentes = db.query(models.Cita).filter(
        models.Cita.agenda_id == cita.agenda_id,
        models.Cita.fecha == cita.fecha,
        models.Cita.hora == cita.hora
    ).count()
    
    if citas_existentes >= agenda.slots_per_hour:
        raise HTTPException(status_code=400, detail=f"No hay cupos disponibles para las {cita.hora}. Máximo {agenda.slots_per_hour} personas.")

    db_cita = models.Cita(**cita.dict())
    db.add(db_cita)
    db.commit()
    db.refresh(db_cita)
    return db_cita


@app.delete("/citas/{cita_id}")
def delete_cita(cita_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_cita = db.query(models.Cita).filter(models.Cita.id == cita_id).first()
    if not db_cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    
    if current_user.role != "superuser":
        if not any(a.id == db_cita.agenda_id for a in current_user.agendas):
            raise HTTPException(status_code=403, detail="No tienes acceso a esta agenda")
            
    db.delete(db_cita)
    db.commit()
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


