import sqlite3
import os

db_path = 'data/db/agenda.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} no existe")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    for table in tables:
        name = table[0]
        cursor.execute(f"PRAGMA table_info({name})")
        cols = cursor.fetchall()
        print(f"\nTabla: {name}")
        print(f"Columnas: {[c[1] for c in cols]}")
    conn.close()

