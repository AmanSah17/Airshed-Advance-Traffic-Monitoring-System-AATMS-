from dash import Dash, html, dcc, dash_table
import plotly.express as px
import pandas as pd
from datetime import datetime

app = Dash(__name__, external_scripts=[
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
], external_stylesheets=['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'])
current_df = pd.DataFrame()

def update_dashboard(df):
    global current_df
    current_df = df

def run_dashboard():
    app.layout = html.Div([
        html.H1("Real-Time Vehicle Counting Dashboard"),
        
        # Scrollable DataFrame
        html.Div([
            html.H2("Vehicle Data"),
            dash_table.DataTable(
                id='table',
                columns=[{"name": i, "id": i} for i in ['Vehicle ID', 'Class', 'Latitude', 'Longitude', 'Timestamp Line 1', 'Timestamp Line 2', 'IN/OUT']],
                data=[],
                style_table={'overflowX': 'auto', 'overflowY': 'auto', 'maxHeight': '300px'},
                style_cell={'textAlign': 'left', 'minWidth': '100px'},
            )
        ]),
        
        # Bar Plot
        html.Div([
            html.H2("Vehicle Class Counts"),
            dcc.Graph(id='class-counts')
        ]),
        
        # Heatmap
        html.Div([
            html.H2("Vehicle Heatmap"),
            html.Div(id='map', style={'height': '400px', 'width': '100%'})
        ]),
        
        dcc.Interval(id='interval-component', interval=1000, n_intervals=0),  # Update every 1 second
        dcc.Store(id='df-store')
    ])

    from dash.dependencies import Input, Output

    @app.callback(
        [Output('table', 'data'),
         Output('class-counts', 'figure'),
         Output('map', 'children')],
        Input('interval-component', 'n_intervals')
    )
    def update_components(n):
        global current_df
        if current_df.empty:
            return [], {}, html.Div()
        
        # Scrollable table data
        table_data = current_df[['Vehicle ID', 'Class', 'Latitude', 'Longitude', 'Timestamp Line 1', 'Timestamp Line 2', 'IN/OUT']].to_dict('records')
        
        # Bar plot
        class_fig = px.bar(current_df, x='Class', title="Vehicle Count by Class",
                           labels={'Class': 'Vehicle Type', 'count': 'Count'})
        
        # Heatmap (using Leaflet.js via custom HTML/JS)
        heatmap_data = current_df[['Latitude', 'Longitude']].apply(lambda row: [row['Latitude'], row['Longitude']], axis=1).tolist()
        heatmap_html = html.Div([
            html.Div(id='leaflet-map', style={'height': '400px'}),
            html.Script(f"""
                var map = L.map('leaflet-map').setView([28.6139, 77.2090], 13);
                L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                }}).addTo(map);
                var heat = L.heatLayer({heatmap_data}, {{radius: 25}}).addTo(map);
            """)
        ])
        
        return table_data, class_fig, heatmap_html

    app.run_server(debug=False, use_reloader=False)