import requests

url = "http://localhost:8000/token"
data = {"username": "admin", "password": "admin123"}
try:
    res = requests.post(url, data=data)
    print(f"Login Status: {res.status_code}")
    if res.status_code == 200:
        token = res.json()["access_token"]
        print(f"Token: {token[:20]}...")
        
        res_me = requests.get("http://localhost:8000/users/me", headers={"Authorization": f"Bearer {token}"})
        print(f"Users/me Status: {res_me.status_code}")
        if res_me.status_code == 200:
            print(f"User Data: {res_me.json()}")
        else:
            print(f"Error detail: {res_me.text}")
    else:
        print(f"Login failed: {res.text}")
except Exception as e:
    print(f"Request error: {e}")
