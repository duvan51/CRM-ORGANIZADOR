from app.database import engine
from app import models

print("Creating tables...")
models.Base.metadata.create_all(bind=engine)
print("Tables created (hopefully).")

from app.database import SessionLocal
from app import auth
db = SessionLocal()
if not db.query(models.User).filter(models.User.username == "admin").first():
    print("Creating admin user...")
    hashed_pw = auth.get_password_hash("admin123")
    admin = models.User(username="admin", hashed_password=hashed_pw, full_name="Admin", role="superuser")
    db.add(admin)
    db.commit()
    print("Admin created.")
db.close()

from sqlalchemy import inspect
inspector = inspect(engine)
print(f"Tables found: {inspector.get_table_names()}")

