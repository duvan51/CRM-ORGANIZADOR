from sqlalchemy import Column, Integer, String, Text, ForeignKey, Table, Float
from sqlalchemy.orm import relationship
from .database import Base

# Tabla intermedia para permisos de usuarios en agendas
agenda_users = Table(
    "agenda_users",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("agenda_id", Integer, ForeignKey("agendas.id"), primary_key=True),
)

class Cita(Base):
    __tablename__ = "citas"

    id = Column(Integer, primary_key=True, index=True)
    mes = Column(String)
    cantidad = Column(Integer)
    dia = Column(String)
    fecha = Column(String) # Formato YYYY-MM-DD
    hora = Column(String)
    servicios = Column(String)
    tipo_servicio = Column(String)
    nombres_completos = Column(String)
    td = Column(String)
    documento = Column(String)
    celular = Column(String)
    email = Column(String, nullable=True)
    observaciones = Column(Text)
    factura = Column(String)
    confirmacion = Column(String)
    vendedor = Column(String)
    otros = Column(Text)
    agenda_id = Column(Integer, ForeignKey("agendas.id"), index=True)

    
    agenda = relationship("Agenda", back_populates="citas")

class Agenda(Base):
    __tablename__ = "agendas"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    slots_per_hour = Column(Integer, default=1) # Cuántas personas a la vez
    
    citas = relationship("Cita", back_populates="agenda")
    users = relationship("User", secondary=agenda_users, back_populates="agendas")
    bloqueos = relationship("Bloqueo", back_populates="agenda")
    alertas = relationship("Alerta", back_populates="agenda")
    horarios_atencion = relationship("HorarioAtencion", back_populates="agenda")
    config_servicios = relationship("ConfigServicio", back_populates="agenda")
    agenda_services = relationship("AgendaService", back_populates="agenda") # Nueva relación

class GlobalService(Base):
    __tablename__ = "global_services"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True)
    duracion_minutos = Column(Integer, default=30)
    precio_base = Column(Float, default=0.0)
    slots = Column(Integer, default=1)
    color = Column(String, default="#3b82f6")

    agendas = relationship("AgendaService", back_populates="service")

class AgendaService(Base):
    __tablename__ = "agenda_services"
    id = Column(Integer, primary_key=True, index=True)
    agenda_id = Column(Integer, ForeignKey("agendas.id"))
    service_id = Column(Integer, ForeignKey("global_services.id"))
    descuento_porcentaje = Column(Float, default=0.0)
    precio_final = Column(Float, default=0.0)
    activo = Column(Integer, default=1)

    agenda = relationship("Agenda", back_populates="agenda_services")
    service = relationship("GlobalService", back_populates="agendas")

class Bloqueo(Base):
    __tablename__ = "bloqueos"
    
    id = Column(Integer, primary_key=True, index=True)
    agenda_id = Column(Integer, ForeignKey("agendas.id"))
    fecha_inicio = Column(String) # YYYY-MM-DD
    fecha_fin = Column(String) # YYYY-MM-DD (para rangos)
    hora_inicio = Column(String, nullable=True) # HH:MM
    hora_fin = Column(String, nullable=True) # HH:MM
    es_todo_el_dia = Column(Integer, default=0) # 1 si es día completo
    motivo = Column(String, nullable=True)
    
    agenda = relationship("Agenda", back_populates="bloqueos")

class Alerta(Base):
    __tablename__ = "alertas"
    
    id = Column(Integer, primary_key=True, index=True)
    agenda_id = Column(Integer, ForeignKey("agendas.id"))
    mensaje = Column(String)
    tipo = Column(String) # warning, info
    activa = Column(Integer, default=1)
    
    agenda = relationship("Agenda", back_populates="alertas")

class HorarioAtencion(Base):
    __tablename__ = "horarios_atencion"
    id = Column(Integer, primary_key=True, index=True)
    agenda_id = Column(Integer, ForeignKey("agendas.id"))
    dia_semana = Column(Integer) # 0-6 (L-D)
    hora_inicio = Column(String) # "08:00"
    hora_fin = Column(String)    # "18:00"
    
    agenda = relationship("Agenda", back_populates="horarios_atencion")

class ConfigServicio(Base):
    __tablename__ = "config_servicios"
    id = Column(Integer, primary_key=True, index=True)
    agenda_id = Column(Integer, ForeignKey("agendas.id"))
    nombre = Column(String)
    duracion_minutos = Column(Integer, default=30) # Nueva columna
    slots = Column(Integer, default=1) # Cuantos cupos consume
    color = Column(String, default="#3b82f6")
    
    agenda = relationship("Agenda", back_populates="config_servicios")



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    role = Column(String, default="agent") # "superuser", "admin", "agent"
    is_active = Column(Integer, default=1)
    
    agendas = relationship("Agenda", secondary=agenda_users, back_populates="users")

