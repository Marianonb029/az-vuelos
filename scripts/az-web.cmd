@echo off
rem La web (vite) en primer plano, con su registro. Igual que az-api.cmd: sin `start`, para que la tarea
rem programada "AZ Vuelos - web" quede viva mientras el servidor corre.
cd /d "%~dp0..\apps\web"
if not exist ..\..\data\local mkdir ..\..\data\local
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
echo ==== web %date% %time% >> ..\..\data\local\web.log
"%NODE%" node_modules\vite\bin\vite.js >> ..\..\data\local\web.log 2>&1
