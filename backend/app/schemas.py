from pydantic import BaseModel
from typing import Optional, List

class AgendaBase(BaseModel):
    name: str
    description: Optional[str] = None
    slots_per_hour: Optional[int] = 1

class AgendaCreate(AgendaBase):
    pass

class BloqueoBase(BaseModel):
    agenda_id: int
    fecha_inicio: str
    fecha_fin: str
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    es_todo_el_dia: int = 0
    motivo: Optional[str] = None

class Bloqueo(BloqueoBase):
    id: int
    class Config:
        from_attributes = True

class AlertaBase(BaseModel):
    agenda_id: int
    mensaje: str
    tipo: str = "info"
    activa: int = 1

class Alerta(AlertaBase):
    id: int
    class Config:
        from_attributes = True

class HorarioAtencionBase(BaseModel):
    agenda_id: int
    dia_semana: int
    hora_inicio: str
    hora_fin: str

class HorarioAtencion(HorarioAtencionBase):
    id: int
    class Config:
        from_attributes = True

class ConfigServicioBase(BaseModel):
    agenda_id: int
    nombre: str
    duracion_minutos: int = 30
    slots: int = 1
    color: str = "#3b82f6"


class ConfigServicio(ConfigServicioBase):
    id: int
    class Config:
        from_attributes = True

class GlobalServiceBase(BaseModel):
    nombre: str
    duracion_minutos: int = 30
    precio_base: float = 0.0
    slots: int = 1
    color: str = "#3b82f6"

class GlobalServiceCreate(GlobalServiceBase):
    pass

class GlobalService(GlobalServiceBase):
    id: int
    class Config:
        from_attributes = True

class AgendaServiceBase(BaseModel):
    agenda_id: int
    service_id: int
    descuento_porcentaje: float = 0.0
    precio_final: float = 0.0
    activo: int = 1

class AgendaService(AgendaServiceBase):
    id: int
    service: GlobalService
    class Config:
        from_attributes = True


class Agenda(AgendaBase):
    id: int
    horarios_atencion: List[HorarioAtencion] = []
    config_servicios: List[ConfigServicio] = []
    agenda_services: List[AgendaService] = []
    class Config:
        from_attributes = True




class CitaBase(BaseModel):
    agenda_id: int
    mes: str
    cantidad: int
    dia: str
    fecha: str
    hora: str
    servicios: str
    tipo_servicio: str
    nombres_completos: str
    td: str
    documento: str
    celular: str
    email: Optional[str] = None
    observaciones: Optional[str] = None

    factura: Optional[str] = None
    confirmacion: Optional[str] = None
    vendedor: str
    otros: Optional[str] = None

class CitaCreate(CitaBase):
    pass

class Cita(CitaBase):
    id: int

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    full_name: Optional[str] = None
    role: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: int
    agendas: List[Agenda] = []

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

