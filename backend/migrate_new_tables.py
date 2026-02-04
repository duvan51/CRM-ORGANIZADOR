import sqlite3
import os

db_path = 'data/db/agenda.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Crear Tabla global_services
cursor.execute('''
CREATE TABLE IF NOT EXISTS global_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR UNIQUE,
    duracion_minutos INTEGER DEFAULT 30,
    precio_base FLOAT DEFAULT 0.0,
    slots INTEGER DEFAULT 1,
    color VARCHAR DEFAULT "#3b82f6"
)
''')

# Crear Tabla agenda_services
cursor.execute('''
CREATE TABLE IF NOT EXISTS agenda_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_id INTEGER,
    service_id INTEGER,
    descuento_porcentaje FLOAT DEFAULT 0.0,
    precio_final FLOAT DEFAULT 0.0,
    activo INTEGER DEFAULT 1,
    FOREIGN KEY(agenda_id) REFERENCES agendas(id),
    FOREIGN KEY(service_id) REFERENCES global_services(id)
)
''')

conn.commit()
conn.close()
print("Tablas creadas exitosamente")

