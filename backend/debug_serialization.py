from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app import models, schemas
import json

def debug_user_serialization():
    db = SessionLocal()
    try:
        print("--- Iniciando diagnóstico de serialización ---")
        user = db.query(models.User).filter(models.User.username == "admin").first()
        if not user:
            print("ERROR: Usuario 'admin' no encontrado en la DB.")
            return

        print(f"Usuario encontrado: {user.username}")
        print("Intentando convertir a Pydantic (schemas.User)...")
        
        # Esto disparará el error si hay campos faltantes en la DB que Pydantic requiere
        user_pydantic = schemas.User.from_orm(user)
        print("Serialización exitosa!")
        print(user_pydantic.json(indent=2))

    except Exception as e:
        print(f"\n !!! ERROR DE SERIALIZACIÓN DETECTADO !!!")
        print(f"Tipo de error: {type(e).__name__}")
        print(f"Mensaje: {str(e)}")
        
        # Intentar diagnosticar qué relación falla
        print("\nRevisando agendas del usuario...")
        for agenda in user.agendas:
            print(f"  - Agenda: {agenda.name}")
            try:
                # Ver si fallan las sub-relaciones
                print(f"    - Horarios: {len(agenda.horarios_atencion)}")
                print(f"    - ConfigServicios: {len(agenda.config_servicios)}")
                print(f"    - AgendaServices: {len(agenda.agenda_services)}")
            except Exception as ree:
                print(f"    !!! Error en relación de agenda: {ree}")
    finally:
        db.close()

if __name__ == "__main__":
    debug_user_serialization()
