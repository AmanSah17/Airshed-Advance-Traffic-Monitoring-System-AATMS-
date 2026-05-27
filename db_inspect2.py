import pandas as pd
from sqlalchemy import create_engine
engine = create_engine('postgresql://postgres:Amansah%401717@localhost:5432/aatms_db')
tables = ['video_jobs', 'camera_sources', 'crossing_events', 'regions']
print("--- COMPREHENSIVE SEARCH DATA ---")
for t in tables:
    df = pd.read_sql_table(t, engine)
    print(f'\n================ TABLE: {t} ================')
    print(df.head(3).to_markdown())
    print('\nMissing Values:')
    print(df.isnull().sum().to_markdown())
