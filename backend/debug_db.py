import sqlite3
import os

db_path = 'data/db/agenda.db'
if not os.path.exists(db_path):
    print(f"Base de datos no encontrada en {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [t[0] for t in cursor.fetchall()]
print(f"Tablas encontradas: {tables}")

for table in tables:
    print(f"\n--- Estructura de {table} ---")
    cursor.execute(f"PRAGMA table_info({table});")
    for col in cursor.fetchall():
        print(f"Columna: {col[1]}, Tipo: {col[2]}")

conn.close()
