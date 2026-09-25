@echo off
rem El API en primer plano, con su registro. No usa `start`: el proceso se queda vivo dentro de esta consola, asi
rem la tarea programada "AZ Vuelos - api" sigue en estado "En ejecucion" mientras el servidor corre y Windows no
rem se lleva por delante el arbol de procesos cuando el .cmd termina (eso mataba los servidores: el registro
rem quedaba con ^C y la tarea con codigo 0xC000013A).
cd /d "%~dp0.."
if not exist data\local mkdir data\local
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
echo ==== api %date% %time% >> data\local\api.log
"%NODE%" node_modules\tsx\dist\cli.mjs apps\api\src\servidor.ts >> data\local\api.log 2>&1
