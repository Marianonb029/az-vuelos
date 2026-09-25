@echo off
rem Reinicia los dos servidores. Hace falta despues de cambiar codigo del API: la web recarga sola, el API no.
rem `schtasks /end` termina la tarea pero deja vivo el node que escucha el puerto, y entonces la instancia nueva no
rem puede tomarlo: por eso primero se matan los procesos que tienen 3001 y 5173 y recien despues se arrancan las
rem tareas. Si las tareas no existen (otra maquina), levanta lo que falte con az-vuelos.cmd.
schtasks /query /tn "AZ Vuelos - api" >nul 2>&1
if errorlevel 1 (
  call "%~dp0az-vuelos.cmd" /sin-navegador
  goto :eof
)
schtasks /end /tn "AZ Vuelos - api" >nul 2>&1
schtasks /end /tn "AZ Vuelos - web" >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
ping -n 4 127.0.0.1 >nul
rem Start-ScheduledTask y no `schtasks /run`: lanzado desde dentro de un .cmd, `schtasks /run` deja los servidores
rem colgados de esta consola y se mueren con un ^C en cuanto el .cmd termina.
powershell -NoProfile -Command "Start-ScheduledTask -TaskName 'AZ Vuelos - api'; Start-ScheduledTask -TaskName 'AZ Vuelos - web'"
rem Espera a que los dos puertos respondan (hasta 30 s): vite tarda unos segundos en bindear.
powershell -NoProfile -Command "for ($i = 0; $i -lt 30; $i++) { if (@(Get-NetTCPConnection -LocalPort 3001,5173 -State Listen -ErrorAction SilentlyContinue).Count -ge 2) { 'Servidores reiniciados: http://localhost:5173'; exit } ; Start-Sleep 1 }; 'Algo no levanto: mira data\local\api.log y web.log'"
