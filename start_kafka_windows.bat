@echo off
echo ====================================================
echo Starting Apache Kafka Environment (Native Windows)
echo ====================================================

set KAFKA_DIR=kafka_2.13-3.7.0

if not exist "%KAFKA_DIR%" (
    echo Error: Kafka directory not found. Please wait for the extraction to finish.
    pause
    exit /b 1
)

echo [1/2] Starting ZooKeeper...
start "ZooKeeper" cmd /c "%KAFKA_DIR%\bin\windows\zookeeper-server-start.bat %KAFKA_DIR%\config\zookeeper.properties"

echo Waiting for ZooKeeper to initialize (10 seconds)...
timeout /t 10 /nobreak > nul

echo [2/2] Starting Kafka Broker...
start "Kafka Broker" cmd /c "%KAFKA_DIR%\bin\windows\kafka-server-start.bat %KAFKA_DIR%\config\server.properties"

echo.
echo Kafka is now running in the background windows.
echo DO NOT CLOSE those two terminal windows.
echo To stop Kafka, simply close those terminal windows.
echo.
pause
