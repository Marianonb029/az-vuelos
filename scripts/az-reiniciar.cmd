@echo off
rem Reinicia los dos servidores (tareas "AZ Vuelos - api" y "AZ Vuelos - web"). Hace falta despues de cambiar
rem codigo del API: la web recarga sola, el API no. Si las tareas no existen, levanta lo que falte con az-vuelos.cmd.
schtasks /query /tn "AZ Vuelos - api" >nul 2>&1
if errorlevel 1 (
  call "%~dp0az-vuelos.cmd" /sin-navegador
  goto :eof
)
for %%t in ("AZ Vuelos - api" "AZ Vuelos - web") do (
  schtasks /end /tn %%t >nul 2>&1
)
ping -n 4 127.0.0.1 >nul
for %%t in ("AZ Vuelos - api" "AZ Vuelos - web") do (
  schtasks /run /tn %%t >nul
)
echo Servidores reiniciados: http://localhost:5173
