from app.database import SessionLocal
from app import models

db = SessionLocal()
admin = db.query(models.User).filter(models.User.username == "admin").first()
if admin:
    print(f"User admin found: {admin.username}, role: {admin.role}")
else:
    print("User admin NOT found")
db.close()
