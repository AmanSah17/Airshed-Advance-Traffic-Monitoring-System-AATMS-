import pandas as pd
from sqlalchemy import create_engine
engine = create_engine('postgresql://postgres:Amansah%401717@localhost:5432/aatms_db')
tables = pd.read_sql_query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'", engine)
print('Tables:', tables['table_name'].tolist())
for table in tables['table_name']:
    df = pd.read_sql_table(table, engine)
    print(f'\n--- Table: {table} ---')
    print('Shape:', df.shape)
    print('Columns:')
    for col in df.columns:
        print(f"  {col}: {df[col].dtype}, Nulls: {df[col].isnull().sum()}")
