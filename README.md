

PS D:\Projects\POC\ideator> $env:APP_ROOT_DIR = (Get-Location).Path 
PS D:\Projects\POC\ideator> $env:PYTHONPATH = "backend"             
PS D:\Projects\POC\ideator> .venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

PS D:\Projects\POC\ideator\frontend> $env:VITE_API_PROXY="http://localhost:8000"; npm run dev